/*
	***** BEGIN LICENSE BLOCK *****
    
	Copyright © 2021 Corporation for Digital Scholarship
					 Vienna, Virginia, USA
					 http://digitalscholar.org/
    
	This file is part of Zotero.
    
	Zotero is free software: you can redistribute it and/or modify
	it under the terms of the GNU Affero General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.
    
	Zotero is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
	GNU Affero General Public License for more details.
    
	You should have received a copy of the GNU Affero General Public License
	along with Zotero.  If not, see <http://www.gnu.org/licenses/>.
    
	***** END LICENSE BLOCK *****
*/
var { FilePicker } = ChromeUtils.importESModule('chrome://zotero/content/modules/filePicker.mjs');

const { BlockingObserver } = ChromeUtils.importESModule("chrome://zotero/content/BlockingObserver.mjs");

var { InlineSpellChecker } = ChromeUtils.importESModule("resource://gre/modules/InlineSpellChecker.sys.mjs");

Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/readerCacheUtils.js", globalThis);
const { hasRenderableVibeReaderCache } = globalThis.VibeReaderCacheUtils;

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_array_length
const ARRAYBUFFER_MAX_LENGTH = Services.appinfo.is64Bit ?
Math.pow(2, 33) :
Math.pow(2, 32) - 1;

class ReaderInstance {
  constructor(options) {
    this.stateFileName = '.zotero-reader-state';
    this.annotationItemIDs = [];
    this._item = options.item;
    this._instanceID = Zotero.Utilities.randomString();
    this._window = null;
    this._iframeWindow = null;
    this._title = '';
    this._isReaderInitialized = false;
    this._isNewOpen = false; // 标记是否是首次打开（而不是切换标签页）
    this._showContextPaneToggle = false;
    this._initPromise = new Promise((resolve, reject) => {
      this._resolveInitPromise = resolve;
      this._rejectInitPromise = reject;
    });
    this._pendingWriteStateTimeout = null;
    this._pendingWriteStateFunction = null;

    this._type = this._item.attachmentReaderType;
    if (!this._type) {
      throw new Error('Unsupported attachment type');
    }

    return new Proxy(this, {
      get(target, prop) {
        if (target[prop] === undefined &&
        target._internalReader &&
        target._internalReader[prop] !== undefined) {
          if (typeof target._internalReader[prop] === 'function') {
            return function (...args) {
              return target._internalReader[prop](...args);
            };
          }
          return target._internalReader[prop];
        }
        return target[prop];
      },
      set(originalTarget, prop, value) {
        let target = originalTarget;
        if (!originalTarget.hasOwnProperty(prop) &&
        originalTarget._internalReader &&
        target._internalReader[prop] !== undefined) {
          target = originalTarget._internalReader;
        }
        target[prop] = value;
        return true;
      }
    });
  }

  get type() {
    return this._type;
  }

  async focus() {
    await this._waitForReader();
    this._iframeWindow.focus();
    this._internalReader?.focus();
  }

  getSecondViewState() {
    let state = this._iframeWindow?.wrappedJSObject?.getSecondViewState?.();
    return state ? JSON.parse(JSON.stringify(state)) : undefined;
  }

  async migrateMendeleyColors(libraryID, annotations) {
    let colorMap = new Map();
    colorMap.set('#fff5ad', '#ffd400');
    colorMap.set('#ffb5b6', '#ff6666');
    colorMap.set('#bae2ff', '#2ea8e5');
    colorMap.set('#d3c2ff', '#a28ae5');
    colorMap.set('#dcffb0', '#5fb236');
    let updatedAnnotations = [];
    for (let annotation of annotations) {
      let color = colorMap.get(annotation.color);
      if (color) {
        annotation.color = color;
        updatedAnnotations.push(annotation);
      }
    }
    if (!updatedAnnotations.length) {
      return false;
    }
    Zotero.debug('Migrating Mendeley colors');
    let notifierQueue = new Zotero.Notifier.Queue();
    try {
      for (let annotation of updatedAnnotations) {
        let { id: key, color } = annotation;
        let item = Zotero.Items.getByLibraryAndKey(libraryID, key);
        if (item && item.isEditable()) {
          item.annotationColor = color;
          await item.saveTx({ skipDateModifiedUpdate: true, notifierQueue });
        }
      }
    } finally
    {
      await Zotero.Notifier.commit(notifierQueue);
    }
    return true;
  }

  displayError(error) {
    if (this._internalReader) {
      let errorMessage = `${Zotero.getString('general.error')}: '${error.message}'`;
      this._internalReader.setErrorMessage(errorMessage);
    }
  }

  async _open({ state, location, secondViewState, preview }) {
    // Set `ReaderTab` title as fast as possible
    this.updateTitle();

    await Zotero.SyncedSettings.loadAll(Zotero.Libraries.userLibraryID);

    let data = await this._getData();
    let annotationItems = this._item.getAnnotations();
    let annotations = (await Promise.all(annotationItems.map((x) => this._getAnnotation(x)))).filter((x) => x);

    // TODO: Remove after some time
    // Migrate Mendeley colors to Zotero PDF reader colors
    let migrated = await this.migrateMendeleyColors(this._item.libraryID, annotations);
    if (migrated) {
      annotationItems = this._item.getAnnotations();
      annotations = (await Promise.all(annotationItems.map((x) => this._getAnnotation(x)))).filter((x) => x);
    }

    this.annotationItemIDs = annotationItems.map((x) => x.id);
    state = state || (await this._getState());


    await this._waitForReader();

    // 标记这是一次新的打开（而不是切换到已存在的标签页）
    this._isNewOpen = true;

    this._iframeWindow.addEventListener('customEvent', (event) => {
      let data = event.detail.wrappedJSObject;
      let append = data.append;
      data.append = (...args) => {
        append(...Components.utils.cloneInto(args, this._iframeWindow, { wrapReflectors: true, cloneFunctions: true }));
      };
      data.reader = this;
      Zotero.Reader._dispatchEvent(data);
    });

    this._blockingObserver = new BlockingObserver({
      shouldBlock(uri) {
        return uri.scheme === 'http' || uri.scheme === 'https';
      }
    });
    try {
      this._blockingObserver.register(this._iframe);
    }
    catch {
      // Reader was closed before it could be initialized
      // No need to log this
      this._blockingObserver = null;
    }

    // Prepare Fluent data
    let ftl = [];
    try {
      ftl.push(Zotero.File.getContentsFromURL(`chrome://zotero/locale/zotero.ftl`));
    }
    catch (e) {
      Zotero.logError(e);
    }

    try {
      ftl.push(Zotero.File.getContentsFromURL(`chrome://zotero/locale/reader.ftl`));
    }
    catch (e) {
      Zotero.logError(e);
    }

    let readerOptions = Components.utils.cloneInto({
      type: this._type,
      data,
      annotations,
      primaryViewState: state,
      secondaryViewState: secondViewState,
      location,
      readOnly: this._isReadOnly(),
      preview,
      authorName: this._item.library.libraryType === 'group' ? Zotero.Users.getCurrentName() : '',
      showContextPaneToggle: this._showContextPaneToggle,
      sidebarWidth: this._sidebarWidth,
      sidebarOpen: this._sidebarOpen,
      bottomPlaceholderHeight: this._bottomPlaceholderHeight,
      contextPaneOpen: this._contextPaneOpen,
      rtl: Zotero.rtl,
      fontSize: Zotero.Prefs.get('fontSize'),
      sidebarFontScale: parseFloat(Zotero.Prefs.get('reader.sidebarFontScale', true)) || 1,
      ftl,
      showAnnotations: true,
      textSelectionAnnotationMode: Zotero.Prefs.get('reader.textSelectionAnnotationMode'),
      customThemes: Zotero.SyncedSettings.get(Zotero.Libraries.userLibraryID, 'readerCustomThemes') ?? [],
      lightTheme: Zotero.Prefs.get('reader.lightTheme'),
      darkTheme: Zotero.Prefs.get('reader.darkTheme'),
      fontFamily: Zotero.Prefs.get('reader.ebookFontFamily'),
      hyphenation: Zotero.Prefs.get('reader.ebookHyphenate'),
      autoDisableNoteTool: Zotero.Prefs.get('reader.autoDisableTool.note'),
      autoDisableTextTool: Zotero.Prefs.get('reader.autoDisableTool.text'),
      autoDisableImageTool: Zotero.Prefs.get('reader.autoDisableTool.image'),
      // LLM prompt 语言设置：根据用户设置的「VIBE 解析语言」偏好（常规设置 -> 外观和语言）
      llmPromptLanguage: Zotero.Prefs.get('extensions.zotero.vibeParseLanguage', true) || 'zh',
      onOpenContextMenu: () => {
        // Functions can only be passed over wrappedJSObject (we call back onClick for context menu items)
        this._openContextMenu(this._iframeWindow.wrappedJSObject.contextMenuParams);
      },
      onAddToNote: (annotations) => {
        this._addToNote(annotations);
      },
      onSaveAnnotations: async (annotations, callback) => {
        // Reader iframe will wait for this function to finish to make sure there
        // aren't simultaneous transaction waiting to modify the same annotation item.
        // Although simultaneous changes are still possible from different reader instances,
        // but unlikely to be a problem.
        // It's best to test that by running the code below in Run JavaScript tool:
        // await Zotero.DB.executeTransaction(async function () {
        //     await Zotero.Promise.delay(15000);
        // });
        let attachment = Zotero.Items.get(this.itemID);
        let notifierQueue = new Zotero.Notifier.Queue();
        try {
          for (let annotation of annotations) {
            annotation.key = annotation.id;
            let saveOptions = {
              notifierQueue,
              notifierData: {
                instanceID: this._instanceID
              }
            };

            if (annotation.onlyTextOrComment) {
              saveOptions.notifierData.autoSyncDelay = Zotero.Notes.AUTO_SYNC_DELAY;
            }

            let item = Zotero.Items.getByLibraryAndKey(attachment.libraryID, annotation.key);
            // If annotation isn't editable, only save image to cache.
            // This is the only case when saving can be triggered for non-editable annotation
            if (annotation.image && item && !item.isEditable()) {
              let blob = this._dataURLtoBlob(annotation.image);
              await Zotero.Annotations.saveCacheImage(item, blob);
            }
            // Save annotation, and save image to cache
            else {
              // Delete authorName to prevent setting annotationAuthorName unnecessarily
              delete annotation.authorName;
              let savedAnnotation = await Zotero.Annotations.saveFromJSON(attachment, annotation, saveOptions);
              if (annotation.image) {
                let blob = this._dataURLtoBlob(annotation.image);
                await Zotero.Annotations.saveCacheImage(savedAnnotation, blob);
              }
            }
          }
        }
        catch (e) {
          // Enter read-only mode if annotation saving fails
          this.displayError(e);
          this._internalReader.setReadOnly(true);
          throw e;
        } finally
        {
          // Reader iframe doesn't have permissions to wait for onSaveAnnotations
          // promise, therefore using callback to inform when saving finishes
          callback();
          await Zotero.Notifier.commit(notifierQueue);
        }
      },
      onDeleteAnnotations: async (ids) => {
        let keys = ids;
        let attachment = this._item;
        let libraryID = attachment.libraryID;
        let notifierQueue = new Zotero.Notifier.Queue();
        try {
          for (let key of keys) {
            let annotation = Zotero.Items.getByLibraryAndKey(libraryID, key);
            // Make sure the annotation actually belongs to the current PDF
            if (annotation && annotation.isAnnotation() && annotation.parentID === this._item.id) {
              this.annotationItemIDs = this.annotationItemIDs.filter((id) => id !== annotation.id);
              await annotation.eraseTx({ notifierQueue });
            }
          }
        }
        catch (e) {
          this.displayError(e);
          throw e;
        } finally
        {
          await Zotero.Notifier.commit(notifierQueue);
        }
      },
      onChangeViewState: async (state, primary) => {
        state = JSON.parse(JSON.stringify(state));
        if (primary) {
          await this._setState(state);
        } else
        if (this.tabID) {
          let win = Zotero.getMainWindow();
          if (win) {
            win.Zotero_Tabs.setSecondViewState(this.tabID, state);
          }
        }
      },
      onOpenTagsPopup: (id, x, y) => {
        let key = id;
        let attachment = Zotero.Items.get(this._item.id);
        let libraryID = attachment.libraryID;
        let annotation = Zotero.Items.getByLibraryAndKey(libraryID, key);
        if (annotation) {
          this._openTagsPopup(annotation, x, y);
        }
      },
      onClosePopup: () => {
        // Note: This currently only closes tags popup when annotations are
        // disappearing from pdf-reader sidebar
        for (let child of Array.from(this._popupset.children)) {
          if (child.classList.contains('tags-popup')) {
            child.hidePopup();
          }
        }
      },
      onOpenLink: (url) => {
        let win = Services.wm.getMostRecentWindow('navigator:browser');
        if (win) {
          win.ZoteroPane.loadURI(url);
        }
      },
      onToggleSidebar: (open) => {
        if (this._onToggleSidebarCallback) {
          this._onToggleSidebarCallback(open);
        }
      },
      onChangeSidebarWidth: (width) => {
        if (this._onChangeSidebarWidthCallback) {
          this._onChangeSidebarWidthCallback(width);
        }
      },
      onFocusContextPane: () => {
        if (this instanceof ReaderWindow || !this._window.ZoteroContextPane.focus()) {
          this.focusFirst();
        }
      },
      onSetDataTransferAnnotations: (dataTransfer, annotations, fromText) => {
        try {
          // A little hack to force serializeAnnotations to include image annotation
          // even if image isn't saved and imageAttachmentKey isn't available
          for (let annotation of annotations) {
            annotation.attachmentItemID = this._item.id;
          }
          dataTransfer.setData('zotero/annotation', JSON.stringify(annotations));
          // Don't set Markdown or HTML if copying or dragging text
          if (fromText) {
            return;
          }
          // annotations are wrapped in a temp note for translation
          let items = [Zotero.QuickCopy.annotationsToNote(annotations)];
          let format = Zotero.QuickCopy.getNoteFormat();
          Zotero.debug(`Copying/dragging (${annotations.length}) annotation(s) with ${format}`);
          format = Zotero.QuickCopy.unserializeSetting(format);
          // Basically the same code is used in itemTree.jsx onDragStart
          if (format.mode === 'export') {
            // If exporting with virtual "Markdown + Rich Text" translator, call Note Markdown
            // and Note HTML translators instead
            if (format.id === Zotero.Translators.TRANSLATOR_ID_MARKDOWN_AND_RICH_TEXT) {
              let markdownFormat = { mode: 'export', id: Zotero.Translators.TRANSLATOR_ID_NOTE_MARKDOWN, options: format.markdownOptions };
              let htmlFormat = { mode: 'export', id: Zotero.Translators.TRANSLATOR_ID_NOTE_HTML, options: format.htmlOptions };
              Zotero.QuickCopy.getContentFromItems(items, markdownFormat, (obj, worked) => {
                if (!worked) {
                  return;
                }
                Zotero.QuickCopy.getContentFromItems(items, htmlFormat, (obj2, worked) => {
                  if (!worked) {
                    return;
                  }
                  dataTransfer.setData('text/plain', obj.string.replace(/\r\n/g, '\n'));
                  dataTransfer.setData('text/html', obj2.string.replace(/\r\n/g, '\n'));
                });
              });
            } else
            {
              Zotero.QuickCopy.getContentFromItems(items, format, (obj, worked) => {
                if (!worked) {
                  return;
                }
                var text = obj.string.replace(/\r\n/g, '\n');
                // For Note HTML translator use body content only
                if (format.id === Zotero.Translators.TRANSLATOR_ID_NOTE_HTML) {
                  // Use body content only
                  let parser = new DOMParser();
                  let doc = parser.parseFromString(text, 'text/html');
                  text = doc.body.innerHTML;
                }
                dataTransfer.setData('text/plain', text);
              });
            }
          }
        }
        catch (e) {
          this.displayError(e);
          throw e;
        }
      },
      onConfirm: function (title, text, confirmationButtonTitle) {
        let ps = Services.prompt;
        let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
        let index = ps.confirmEx(null, title, text, buttonFlags,
        confirmationButtonTitle, null, null, null, {});
        return !index;
      },
      onCopyImage: async (dataURL) => {
        try {
          let parts = dataURL.split(',');
          if (!parts[0].includes('base64')) {
            return;
          }
          let mime = parts[0].match(/:(.*?);/)[1];
          let bstr = atob(parts[1]);
          let n = bstr.length;
          let u8arr = new Uint8Array(n);
          while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
          }
          let imgTools = Components.classes["@mozilla.org/image/tools;1"].getService(Components.interfaces.imgITools);
          let transferable = Components.classes['@mozilla.org/widget/transferable;1'].createInstance(Components.interfaces.nsITransferable);
          let clipboardService = Components.classes['@mozilla.org/widget/clipboard;1'].getService(Components.interfaces.nsIClipboard);
          let img = imgTools.decodeImageFromArrayBuffer(u8arr.buffer, mime);
          transferable.init(null);
          let kNativeImageMime = 'application/x-moz-nativeimage';
          transferable.addDataFlavor(kNativeImageMime);
          transferable.setTransferData(kNativeImageMime, img);
          clipboardService.setData(transferable, null, Components.interfaces.nsIClipboard.kGlobalClipboard);
        }
        catch (e) {
          this.displayError(e);
        }
      },
      onSaveImageAs: async (dataURL) => {
        try {
          let fp = new FilePicker();
          fp.init(this._iframeWindow, Zotero.getString('reader-save-image-as'), fp.modeSave);
          fp.appendFilter("PNG", "*.png");
          fp.defaultString = Zotero.getString('file-type-image').toLowerCase() + '.png';
          let rv = await fp.show();
          if (rv === fp.returnOK || rv === fp.returnReplace) {
            let outputPath = fp.file;
            let parts = dataURL.split(',');
            if (parts[0].includes('base64')) {
              let bstr = atob(parts[1]);
              let n = bstr.length;
              let u8arr = new Uint8Array(n);
              while (n--) {
                u8arr[n] = bstr.charCodeAt(n);
              }
              await OS.File.writeAtomic(outputPath, u8arr);
            }
          }
        }
        catch (e) {
          this.displayError(e);
          throw e;
        }
      },
      onRotatePages: async (pageIndexes, degrees) => {
        this._internalReader.freeze();
        try {
          await Zotero.PDFWorker.rotatePages(this._item.id, pageIndexes, degrees, true);
        }
        catch (e) {
          this.displayError(e);
        }
        await this.reload();
        this._internalReader.unfreeze();
      },
      onDeletePages: async (pageIndexes) => {
        if (this._promptToDeletePages(pageIndexes.length)) {
          this._internalReader.freeze();
          try {
            await Zotero.PDFWorker.deletePages(this._item.id, pageIndexes, true);
          }
          catch (e) {
            this.displayError(e);
          }
          await this.reload();
          this._internalReader.unfreeze();
        }
      },
      onToggleContextPane: () => {
        Zotero.debug('toggle context pane');
        let win = Zotero.getMainWindow();
        win.ZoteroContextPane.togglePane();
      },
      // onInsertVibeCardReference 在 readerOptions 中通过 Components.utils.exportFunction 导出（见下方 L1058）
      onToolbarShiftTab: () => {
        // Shift-tab from the toolbar focuses the sync button (if reader instance is opened in a tab)
        if (!this.tabID) return;
        let win = Zotero.getMainWindow();
        win.document.getElementById("zotero-tb-sync").focus();
      },
      onIframeTab: () => {
        // Tab after the last tabstop will focus the contextPane (if reader instance is opened in a tab)
        if (!this.tabID) return;
        let win = Zotero.getMainWindow();
        let focused = win.ZoteroContextPane.focus();
        // If context pane wasn't focused (e.g. it's collapsed), focus the tab bar
        if (!focused) {
          win.Zotero_Tabs.moveFocus("current");
        }
      },
      onSetZoom: (iframe, zoom) => {
        iframe.browsingContext.textZoom = 1;
        iframe.browsingContext.fullZoom = zoom;
      },
      onTextSelectionAnnotationModeChange: (mode) => {
        Zotero.Prefs.set('reader.textSelectionAnnotationMode', mode);
      },
      onBringReaderToFront: (bring) => {
        // Temporary bring reader iframe to front to make sure popups and context menus
        // aren't overlapped by contextPane, in Stacked View mode
        if (bring) {
          if (Zotero.Prefs.get('layout') === 'stacked') {
            this._iframe.parentElement.style.zIndex = 1;
          }
        } else
        {
          this._iframe.parentElement.style.zIndex = 'unset';
        }
      },
      onSaveCustomThemes: async (customThemes) => {
        // If a custom theme is deleted, clear the theme preference.
        // This ensures that the correct light/dark theme is auto-picked and also fixes #5070.
        const lightTheme = Zotero.Prefs.get('reader.lightTheme');
        const darkTheme = Zotero.Prefs.get('reader.darkTheme');

        if (lightTheme.startsWith('custom') && !customThemes?.some((theme) => theme.id === lightTheme)) {
          Zotero.Prefs.clear('reader.lightTheme');
        }

        if (darkTheme.startsWith('custom') && !customThemes?.some((theme) => theme.id === darkTheme)) {
          Zotero.Prefs.clear('reader.darkTheme');
        }

        if (customThemes?.length) {
          await Zotero.SyncedSettings.set(Zotero.Libraries.userLibraryID, 'readerCustomThemes', customThemes);
        } else
        {
          await Zotero.SyncedSettings.clear(Zotero.Libraries.userLibraryID, 'readerCustomThemes');
        }
      },
      onSetLightTheme: (themeName) => {
        Zotero.Prefs.set('reader.lightTheme', themeName || false);
      },
      onSetDarkTheme: (themeName) => {
        Zotero.Prefs.set('reader.darkTheme', themeName || false);
      },
      onChangeSidebarFontScale: (scale) => {
        Zotero.Prefs.set('reader.sidebarFontScale', String(scale), true);
      }
    }, this._iframeWindow, { cloneFunctions: true });

    // 每次 flow 开始时重新读取 VIBE 解析语言，确保修改设置后立即生效
    readerOptions.getLlmPromptLanguage = Components.utils.exportFunction(function () {
      return Zotero.Prefs.get('extensions.zotero.vibeParseLanguage', true) || 'zh';
    }, this._iframeWindow);

    // Wrap the privileged async implementation so that content receives a
    // Promise constructed in the content window (avoids Xray 'then' denial).
    const __resolvePDFFilePathPrivileged = async () => {
      try {
        let item = Zotero.Items.get(this._item.id);
        if (item && item.isFileAttachment()) {
          // console.log(`[Reader] Resolving path for item ${item.id} (library ${item.libraryID})`);
          let path = await item.getFilePathAsync();
          // console.log(`[Reader] Resolved path: ${path}`);
          return path || null;
        }
        // console.log('[Reader] Current item is not a file attachment');
        return null;
      }
      catch (e) {
        Zotero.logError(e);
        return null;
      }
    };

    const contentWin = this._iframeWindow;
    readerOptions.onResolvePDFFilePath = Components.utils.exportFunction(function () {
      // Return a content-side Promise that resolves with the string path
      return new contentWin.Promise((resolve, reject) => {
        __resolvePDFFilePathPrivileged().then(resolve, reject);
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // Privileged Flow processing function - 使用箭头函数保持this上下文
    const _parsePDFPrivileged = async () => {
      // Get the resolved PDF file path
      const filePath = await __resolvePDFFilePathPrivileged();
      if (!filePath) {
        throw new Error('无法获取PDF文件路径');
      }

      // Validate file exists
      let pdfFile = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
      pdfFile.initWithPath(filePath);
      if (!pdfFile.exists()) {
        throw new Error('PDF文件不存在: ' + filePath);
      }

      try {
        // JIT load pdfParsing module
        if (typeof Zotero.pdfParser === 'undefined') {
          try {
            Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/pdfParser.js", Zotero);
          } catch (e) {
            Zotero.logError(e, 'Error loading pdfParser.js');
            const detail = e && e.message ? e.message : String(e);
            throw new Error(`pdfParser模块加载失败: ${detail}`);
          }
        }

        const pdfProcessResult = await Zotero.pdfParser.processFile(filePath);

        // 检查 MinerU 解析结果
        if (!pdfProcessResult.success) {
          // MinerU 返回失败，抛出异常让外层 catch 处理
          const errorMsg = pdfProcessResult.error || pdfProcessResult.message || 'PDF解析失败';
          throw new Error(errorMsg);
        }

        // 返回处理结果
        return {
          success: true,
          filePath: filePath,
          pdfProcessResult: pdfProcessResult,
          message: 'PDF处理完成',
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        console.error('[Reader] API调用失败:', error);

        // 根据错误类型提供不同的用户友好提示
        let userMessage = 'PDF处理失败';
        const detail = error && error.message ? error.message : String(error);
        if (detail.includes('API Token')) {
          userMessage = '请先在代码中设置正确的MinerU API Token';
        } else if (detail.includes('文件过大')) {
          userMessage = 'PDF文件过大，请选择较小的文件';
        } else if (detail.includes('网络')) {
          userMessage = '网络连接失败，请检查网络连接';
        } else if (detail.includes('超时')) {
          userMessage = 'API处理超时，请稍后重试';
        }

        const combinedMessage =
          detail && detail !== userMessage
            ? `${userMessage}\n${detail}`
            : userMessage;

        return {
          success: false,
          filePath: filePath,
          error: detail,
          message: combinedMessage,
          timestamp: new Date().toISOString(),
          // 提供简化的配置指导
          configHelp: detail.includes('API Token') ? {
            step1: '访问 https://mineru.net/apiManage/docs 申请API Token',
            step2: '在代码中找到 const API_TOKEN = \'YOUR_API_TOKEN_HERE\';',
            step3: '将YOUR_API_TOKEN_HERE替换为申请到的实际Token'
          } : null
        };
      }
    };

    // Export Flow callback that returns a content-side Promise
    const iframeWindow = this._iframeWindow;
    readerOptions._parsePDF = Components.utils.exportFunction(function () {
      // Return a content-side Promise that resolves with the processing result
      return new contentWin.Promise((resolve, reject) => {
        _parsePDFPrivileged().
        then((result) => {
          try {
            const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          }
          catch (e) {
            // 克隆失败时，创建内容层的错误对象
            const errorMessage = e && e.message ? e.message : String(e);
            reject(new contentWin.Error(errorMessage));
          }
        }).
        catch((error) => {
          // 原始错误对象无法跨域传递，需要提取 message 创建新的 Error
          const errorMessage = error && error.message ? error.message : String(error);
          reject(new contentWin.Error(errorMessage));
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // Export LLM API callback
    async function _callLLMAPIPrivileged(prompt) {
      try {
        if (typeof Zotero.pdfParser === 'undefined') {
          try {
            Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/pdfParser.js", Zotero);
          }
          catch (e) {
            Zotero.logError(e, 'Error loading pdfParser.js for LLM request');
            const detail = e && e.message ? e.message : String(e);
            throw new Error(`pdfParser模块加载失败: ${detail}`);
          }
        }
        if (typeof prompt !== 'string') {
          throw new Error('LLM 请求参数必须是字符串');
        }
        // 使用 Cloudflare Worker 代理（隐藏 API Key）
        const llmResult = await Zotero.pdfParser.llmRequest(prompt);
        return llmResult;
      }
      catch (error) {
        console.error('[Reader] LLM API 调用失败:', error);
        throw error;
      }
    }

    readerOptions._call_llm_api = Components.utils.exportFunction(function (prompt) {
      return new contentWin.Promise((resolve, reject) => {
        _callLLMAPIPrivileged(prompt).
        then((result) => {
          try {
            const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          }
          catch (e) {
            reject(e);
          }
        }).
        catch((error) => {
          // 原始错误对象无法跨域传递，需要提取 message 创建新的 Error
          const errorMessage = error && error.message ? error.message : String(error);
          const crossDomainError = new contentWin.Error(errorMessage);
          reject(crossDomainError);
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // Export Gemini API callback（英文版 LLM 调用）
    // 已切换为通过阿里云 Supabase 调用火山引擎
    async function _callGeminiAPIPrivileged(prompt) {
      try {
        // ========== 阿里云 Supabase 火山引擎代理 (当前使用) ==========
        const HUOSHAN_PROXY_URL = 'https://spb-wz98bgf6x7f3zs9b.supabase.opentrust.net/functions/v1/ai-summary-proxy-huoshan';
        const HUOSHAN_MODEL = 'ep-20260119112406-4c4rb'; // 火山引擎 DeepSeek endpoint ID

        if (typeof prompt !== 'string') {
          throw new Error('LLM API 请求参数必须是字符串');
        }

        // 构建请求体（火山引擎格式）
        const requestBody = {
          model: HUOSHAN_MODEL,
          stream: true, // 开启流式传输避免超时
          temperature: 1.0,
          top_p: 0.95,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: prompt }]
        };

        const headers = {
          'Content-Type': 'application/json'
        };

        // 发送请求到代理
        const response = await fetch(HUOSHAN_PROXY_URL, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(`火山引擎 API 请求失败: ${response.status} ${response.statusText}. 详情: ${JSON.stringify(errorData)}`);
        }

        // 处理流式响应
        const reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let fullContent = "";
        let done = false;

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          if (readerDone) {done = true;break;}
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const jsonStr = line.substring(6).trim();
              if (jsonStr === "[DONE]") continue;
              try {
                const data = JSON.parse(jsonStr);
                if (data.choices?.[0]?.delta?.content) {
                  fullContent += data.choices[0].delta.content;
                }
              } catch (e) {/* 忽略解析错误 */}
            }
          }
        }

        return fullContent;

        // ========== 原 Gemini 实现 (已注释) ==========
        // const GEMINI_PROXY_URL = 'https://ai-summary-proxy.yuc430060.workers.dev';
        // const GEMINI_MODEL = 'gemini-2.5-flash';
        // const requestBody = { model: GEMINI_MODEL, prompt: prompt, temperature: 0.7 };
        // const response = await fetch(GEMINI_PROXY_URL, {
        // 	method: 'POST',
        // 	headers: { 'Content-Type': 'application/json', 'X-API-Provider': 'gemini' },
        // 	body: JSON.stringify(requestBody)
        // });
        // if (!response.ok) { ... }
        // const data = await response.json();
        // const responseText = data.text || data.choices?.[0]?.message?.content || '';
        // return responseText;
      }
      catch (error) {
        console.error('[Reader] LLM API 调用失败:', error);
        throw error;
      }
    }

    readerOptions._call_gemini_api = Components.utils.exportFunction(function (prompt) {
      return new contentWin.Promise((resolve, reject) => {
        _callGeminiAPIPrivileged(prompt).
        then((result) => {
          try {
            const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          }
          catch (e) {
            reject(e);
          }
        }).
        catch((error) => {
          const errorMessage = error && error.message ? error.message : String(error);
          const crossDomainError = new contentWin.Error(errorMessage);
          reject(crossDomainError);
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 读取目录中的 .md 文件
    async function _readMarkdownFilePrivileged(resultDir) {
      try {
        // 扫描目录，查找以 .md 结尾的文件
        const iterator = new OS.File.DirectoryIterator(resultDir);
        let mdFilePath = null;

        try {
          await iterator.forEach((entry) => {
            if (!entry.isDir && entry.name.endsWith('.md')) {
              mdFilePath = entry.path;
              // 找到第一个 .md 文件后停止遍历
              return iterator.close();
            }
          });
        } finally {
          iterator.close();
        }

        // 检查是否找到 .md 文件
        if (!mdFilePath) {
          throw new Error(`目录中不存在 .md 文件: ${resultDir}`);
        }

        // console.log(`[xpcom/reader.js] 找到 markdown 文件: ${mdFilePath}`);

        // 读取文件内容
        const bytes = await OS.File.read(mdFilePath);
        const decoder = new TextDecoder('utf-8');
        const content = decoder.decode(bytes);

        return content;

      } catch (error) {
        console.error('[xpcom/reader.js] 读取 .md 文件失败:', error);
        throw error;
      }
    }

    readerOptions._resetTokenUsage = Components.utils.exportFunction(function () {
      if (typeof Zotero !== 'undefined') {
        Zotero._vibeTokenCounter = { prompt: 0, completion: 0, total: 0 };
      }
    }, contentWin, { allowCrossOriginArguments: true });

    readerOptions._printTotalTokenUsage = Components.utils.exportFunction(function () {
      if (typeof Zotero !== 'undefined' && Zotero._vibeTokenCounter) {

        // console.log(`\n========================================================\n[VibeZotero] 🎉 本次全流程 PDF 解析 Token 总消耗统计:\n  🔹 Prompt Tokens输入: ${Zotero._vibeTokenCounter.prompt}\n  🔹 Completion Tokens输出: ${Zotero._vibeTokenCounter.completion}\n  🔥 Total Tokens总计: ${Zotero._vibeTokenCounter.total}\n========================================================\n`);
      }}, contentWin, { allowCrossOriginArguments: true });

    readerOptions._readMarkdownFile = Components.utils.exportFunction(function (resultDir) {
      return new contentWin.Promise((resolve, reject) => {
        _readMarkdownFilePrivileged(resultDir).
        then((result) => {
          try {
            const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          }
          catch (e) {
            reject(e);
          }
        }).
        catch(reject);
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 调用 LLM 生成全文总结（接收 simplifiedContentList）
    async function _articleSumRequestPrivileged(simplifiedContentList) {
      try {
        // 直接加载并使用 LLM API（避免 pdfParser.llmRequest 的数组化解析约束）
        if (typeof callZhipuAI === 'undefined') {
          try {
            Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/LLMApi/llmapi.js");
          } catch (e) {
            Zotero.logError(e, 'Error loading llmapi.js for article summary');
            throw new Error('llmapi模块加载失败');
          }
        }

        // 检查输入类型
        if (!Array.isArray(simplifiedContentList)) {
          throw new Error('全文总结请求参数必须是 simplifiedContentList 数组');
        }

        // 将 simplifiedContentList 转换为易读的文本格式
        const contentText = simplifiedContentList.map((item) => {
          return `[${item.mineruIndex}] (${item.type}, page ${item.page_idx}): ${item.content}`;
        }).join('\n\n');

        // 构建 prompt（要求严格的 JSON 输出）
        const prompt = `你将收到一篇学术论文的简化段落列表，每行格式为：[索引] (类型, 页码): 内容

请输出一个 JSON 对象，包含以下两个字段：

1) articleSummary: 字符串类型。你需要用 MARKDOWN 语法撰写对论文的全面且结构化的中文总结，结构建议包含：
- 论文标题
- 研究背景
- 核心问题
- 方法与创新
- 实验结果
- 结论与影响

**索引标注要求（核心规则）**：
为确保总结内容可溯源、可跳转，你必须在总结中标注原文页码：

A. 页面索引标注（使用[Page-n]格式）- **重要：保持克制**：
- **仅在每个一级小节（如"研究背景"、"方法与创新"、"实验结果"等）的末尾标注1-3个最关键的页码**
- **绝对禁止在段落中间、句子中间插入页码索引**
- **不要在每个段落后都加索引，只在整个小节结束时统一标注**
- 标注位置示例（正确做法）：
  "## 研究背景
   本文针对深度学习中的点云处理问题，提出了一种新的架构。传统方法需要将点云转换为规则结构，导致信息丢失。[Page-5][Page-28]
   
   ## 方法与创新
   PointNet采用对称函数处理无序点集，通过最大池化层学习全局特征。网络包含三个关键模块：对齐网络、特征提取和分类头。[Page-40][Page-42]"
- 多个页码索引连续标注，不要用括号或逗号分隔，如 [Page-3][Page-5]
- 每个小节的页码索引数量控制在1-3个，选择最能代表该小节核心内容的页面

B. 图片索引标注（使用 [Figure-n] 格式）：
- 当总结中提及图片时，使用图片在原文所有图片中的顺序（从0开始），格式为 [Figure-0]、[Figure-1] 等
- 与论文主题强相关的图（如模型架构图、核心流程图等），在相关小节中标注一次
- 图片索引也应放在小节末尾或提及图片的句子末尾，不要在句子中间插入

C. 表格索引标注（使用 [Table-n] 格式）：
- 当提及表格时，使用表格在原文所有表格中的顺序（从0开始），格式为 [Table-0]、[Table-2] 等
- 与论文主题强相关的表格（如核心实验结果表等），在相关小节中标注一次
- 表格索引也应放在小节末尾或提及表格的句子末尾

**重要约束**：
- **页面索引必须极度克制：每个一级小节（如"研究背景"、"方法与创新"）只在末尾标注1个页码**
- **绝对不要在每个段落、每句话后都加页码索引**
- 所有索引都放在小节末尾或句子末尾，不要在句子中间插入
- 每个索引号必须对应原文实际存在的页面/图片/表格，严禁杜撰不存在的索引
- 每个图表在总结中最多出现一次，优先在最相关的位置插入
2) outline: 数组类型。用于表示全文标题的分层结构，使用树形结构数组，每个节点必须包含：
- number: 标题编号（如 "1", "2", "2.1", "2.2.1"）
- title: 标题文本
- type: 标题类型（整数，0 或 1）
  * 0: 全局性介绍章节（如 Abstract、Introduction、Related Work、Background、Conclusion、Discussion、Future Work、Conclusion 等）
  * 1: 具体方法/论点章节（如 Methods、Methodology、Model、Architecture、Approach、Experiments、Results、Implementation、Algorithm 等）
- children: 子标题数组（同结构，若无则为空数组）

输出格式（严格 JSON，不要包含多余文本或解释）：
{
"articleSummary": "...Markdown 字符串...",
"outline": [
	{ "number": "1", "title": "...", "type": 0, "children": [] },
	{ "number": "2", "title": "...", "type": 1, "children": [
	{ "number": "2.1", "title": "...", "type": 1, "children": [] },
	{ "number": "2.2", "title": "...", "type": 1, "children": [] }
	]}
]
}

以下是论文内容：
${contentText}

请仅返回 JSON 对象，若无法从文本中识别标题编号，请以自然顺序编号（例如 "1", "2", "3", 子级以 "2.1" 形式推断）。`;

        const response = await callZhipuAI(prompt);

        // 解析 LLM 响应（稳健提取 JSON，支持 fenced code）
        let payloadText = null;
        try {
          const content = response?.choices?.[0]?.message?.content || '';
          // 去掉 ```json ... ``` 包裹
          const fencedMatch = content.match(/```json\s*([\s\S]*?)\s*```/i);
          payloadText = fencedMatch ? fencedMatch[1] : content;
        } catch (e) {
          console.warn('[xpcom/reader.js] 提取 LLM 文本内容失败，将尝试原样解析');
        }

        let resultObj = null;
        try {
          // 宽松匹配第一个 JSON 对象
          const objMatch = (payloadText || '').match(/\{[\s\S]*\}/);
          if (objMatch) {
            resultObj = JSON.parse(objMatch[0]);
          }
        } catch (e) {
          console.error('[xpcom/reader.js] 解析 JSON 失败:', e);
        }

        // 校验并归一化返回结构
        if (!resultObj || typeof resultObj !== 'object') {
          resultObj = { articleSummary: '', outline: [] };
        }
        if (typeof resultObj.articleSummary !== 'string') {
          resultObj.articleSummary = String(resultObj.articleSummary || '');
        }
        if (!Array.isArray(resultObj.outline)) {
          resultObj.outline = [];
        }

        // console.log('[xpcom/reader.js] 全文总结生成完成:', resultObj);
        return resultObj;

      } catch (error) {
        console.error('[xpcom/reader.js] 全文总结生成失败:', error);
        throw error;
      }
    }

    readerOptions._articleSumRequest = Components.utils.exportFunction(function (simplifiedContentList) {
      return new contentWin.Promise((resolve, reject) => {
        _articleSumRequestPrivileged(simplifiedContentList).
        then((result) => {
          try {
            const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          }
          catch (e) {
            reject(e);
          }
        }).
        catch(reject);
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 读取本地图片并转为 Base64 Data URL（特权函数）
    async function _getImageAsDataURLPrivileged(imagePath) {
      try {
        // 检查文件是否存在
        if (!(await OS.File.exists(imagePath))) {
          throw new Error(`图片文件不存在: ${imagePath}`);
        }

        // 使用 OS.File.read 读取二进制数据（和读取 markdown 一样的方式）
        const bytes = await OS.File.read(imagePath);

        // 转换为 base64（使用 btoa + Uint8Array，分块处理避免栈溢出）
        const uint8Array = new Uint8Array(bytes);
        let binary = '';
        const chunkSize = 8192; // 每次处理 8KB
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
          binary += String.fromCharCode.apply(null, chunk);
        }
        const base64 = btoa(binary);

        // 根据文件扩展名确定 MIME 类型
        let mimeType = 'image/jpeg';
        if (imagePath.endsWith('.png')) mimeType = 'image/png';else
        if (imagePath.endsWith('.gif')) mimeType = 'image/gif';else
        if (imagePath.endsWith('.webp')) mimeType = 'image/webp';else
        if (imagePath.endsWith('.svg')) mimeType = 'image/svg+xml';

        const dataURL = `data:${mimeType};base64,${base64}`;
        return dataURL;
      }
      catch (e) {
        console.error('[xpcom/reader.js] 读取图片失败:', imagePath, e);
        Zotero.logError(`Failed to read image as data URL: ${imagePath}`);
        Zotero.logError(e);
        return null;
      }
    }

    readerOptions.onGetImageAsDataURL = Components.utils.exportFunction(function (imagePath) {
      return new contentWin.Promise((resolve, reject) => {
        _getImageAsDataURLPrivileged(imagePath).
        then((result) => {
          resolve(result);
        }).
        catch((error) => {
          console.error('[xpcom/reader.js] onGetImageAsDataURL 失败:', error);
          reject(error);
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 通过 minerUid 获取 paragraph 和 points 数据的特权函数
    async function _getParagraphAndPointsPrivileged(minerUid) {
      try {
        // 确保数据库已初始化
        await Zotero.VibeDB.schemaUpdatePromise;

        // 获取当前附件的 itemID
        const itemID = this._item.id;
        if (!itemID) {
          throw new Error('无法获取当前附件的 itemID');
        }

        // 1. 使用 VibeDB.Papers.get 获取 paper 记录
        const paper = await Zotero.VibeDB.Papers.get(itemID);
        if (!paper) {
          console.warn('[xpcom/reader.js] 未找到 itemID 对应的 paper:', itemID);
          return null;
        }
        const paperID = paper.paper_id;

        // 2. 通过 minerUid 在 paragraphs 表中查找对应的段落
        // 使用 onRow 回调模式获取数据（与 VibeDB 其他方法保持一致）
        const paragraphSQL = `
					SELECT paragraph_id, paragraph_summary, page_idx, paragraph_idx
					FROM paragraphs
					WHERE paper_id = ? AND minerU_id = ?
					LIMIT 1
				`;

        let paragraphRow = null;
        await Zotero.VibeDB.getConnection().queryAsync(paragraphSQL, [paperID, minerUid], {
          onRow: function (row) {
            paragraphRow = {
              paragraph_id: row.getResultByName('paragraph_id'),
              paragraph_summary: row.getResultByName('paragraph_summary'),
              page_idx: row.getResultByName('page_idx'),
              paragraph_idx: row.getResultByName('paragraph_idx')
            };
          }
        });

        if (!paragraphRow) {
          // console.warn('[xpcom/reader.js] 未找到 minerUid 对应的段落:', minerUid, 'paper_id:', paperID);
          return null;
        }

        const paragraphID = paragraphRow.paragraph_id;
        const paragraphSummary = paragraphRow.paragraph_summary;
        const pageIndex = paragraphRow.page_idx;
        const paragraphIndex = paragraphRow.paragraph_idx;

        // 2. 通过 paragraph_id 在 points 表中查找对应的要点
        const pointsSQL = `
					SELECT point_idx, point_summary, point_translation, sentence_indices, char_mapping, rects
					FROM points
					WHERE paragraph_id = ?
					ORDER BY point_idx
				`;

        const points = [];
        await Zotero.VibeDB.getConnection().queryAsync(pointsSQL, [paragraphID], {
          onRow: function (row) {
            points.push({
              point_idx: row.getResultByName('point_idx'),
              point_summary: row.getResultByName('point_summary'),
              point_translation: row.getResultByName('point_translation'),
              sentence_indices: row.getResultByName('sentence_indices'),
              char_mapping: row.getResultByName('char_mapping'),
              rects: row.getResultByName('rects')
            });
          }
        });

        // 3. 返回结构化数据
        return {
          paragraph_id: paragraphID,
          paragraph_summary: paragraphSummary,
          points_summary: points,
          page_idx: pageIndex,
          paragraph_idx: paragraphIndex
        };

      } catch (error) {
        console.error('[xpcom/reader.js] ❌ 获取 minerUid 数据失败:', error);
        throw error;
      }
    }

    // 导出获取 paragraph 和 points 数据的回调给 iframe
    readerOptions.onGetParagraphAndPoints = Components.utils.exportFunction((minerUid) => {
      // 返回 contentWin.Promise 以避免跨域 Promise 访问问题
      return new contentWin.Promise((resolve, reject) => {
        _getParagraphAndPointsPrivileged.call(this, minerUid).
        then((result) => {
          if (result) {
            // 使用 cloneInto 确保可以跨域传递
            const clonedResult = Components.utils.cloneInto(result, contentWin, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          } else {
            resolve(null);
          }
        }).
        catch((error) => {
          console.error('[xpcom/reader.js] onGetParagraphAndPoints 失败:', error);
          reject(new contentWin.Error(error.message || String(error)));
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 保存 PDF 解析结果到 VibeDB（特权函数）
    const _saveParsedDataToVibeDBPrivileged = async (parsedData) => {
      // 保存 SummaryCard 的辅助方法
      const saveSummaryCard = async (paperID, paragraphID, card) => {
        const sql = `
				INSERT INTO summary_cards (
					paper_id, page_idx, paragraph_id, summarycard_name, position_rects
				)
				VALUES (?, ?, ?, ?, ?)
				ON CONFLICT DO NOTHING
			`;

        await Zotero.VibeDB.getConnection().queryAsync(sql, [
        paperID,
        card.position.pageIndex,
        paragraphID,
        card.name || null,
        card.position.rects ? JSON.stringify(card.position.rects) : null]
        );

        // 查询刚插入（或已存在）的 summarycard_id，用于回写到内存对象
        const dbId = await Zotero.VibeDB.getConnection().valueQueryAsync(
          'SELECT summarycard_id FROM summary_cards WHERE paper_id = ? AND paragraph_id = ?',
          [paperID, paragraphID]
        );
        return dbId || null;
      };

      // 保存 FlashCard 的辅助方法
      const saveFlashCard = async (paperID, paragraphID, card) => {
        // 构建 messages 数组（FlashCard 的问答对话历史）
        let messages = [];

        // 优先利用已有的 messages 历史 (防止重解析丢失对话记录)
        if (Array.isArray(card.messages) && card.messages.length > 0) {
          messages = card.messages;
        } else {
          // 兼容旧逻辑：从 question/answer 构建
          if (card.question || card.userText) {
            messages.push({
              role: 'user',
              content: card.question || card.userText,
              timestamp: card.dateCreated || new Date().toISOString()
            });
          }
          if (card.answer || card.aiText) {
            messages.push({
              role: 'assistant',
              content: card.answer || card.aiText,
              timestamp: card.dateModified || new Date().toISOString()
            });
          }
        }

        const messagesStr = messages.length > 0 ? JSON.stringify(messages) : '[]';
        const rectsStr = card.position.rects ? JSON.stringify(card.position.rects) : null;

        // 关键修复：检查是否存在 dbId (数据库 ID)
        // deleteParsingResultsOnly 会保留 FlashCards (ON DELETE SET NULL)
        // 因此这里必须尝试更新现有的卡片，重新关联 paragraphID，而不是插入新卡片造成重复
        let exists = false;
        if (card.dbId) {
          const checkSql = "SELECT 1 FROM flash_cards WHERE flashcard_id = ?";
          const res = await Zotero.VibeDB.getConnection().valueQueryAsync(checkSql, [card.dbId]);
          if (res) exists = true;
        }

        if (exists) {
          // 更新现有卡片 (重新关联到新生成的 paragraph_id)
          const updateSql = `
						UPDATE flash_cards
						SET paragraph_id = ?, messages = ?, position_rects = ?, updated_at = strftime('%s', 'now')
						WHERE flashcard_id = ?
					`;
          await Zotero.VibeDB.getConnection().queryAsync(updateSql, [
          paragraphID,
          messagesStr,
          rectsStr,
          card.dbId]
          );
          // console.log(`[xpcom/reader.js] FlashCard 已重新关联: id=${card.dbId}, paragraph=${paragraphID}`);
        } else {
          // 插入新卡片
          const sql = `
					INSERT INTO flash_cards (
						paper_id, page_idx, paragraph_id, messages, position_rects
					)
					VALUES (?, ?, ?, ?, ?)
				`;

          await Zotero.VibeDB.getConnection().queryAsync(sql, [
          paperID,
          card.position.pageIndex,
          paragraphID,
          messagesStr,
          rectsStr]
          );
        }
      };

      try {
        // console.log('[xpcom/reader.js] 开始保存解析结果到 VibeDB...');
        // item_id: PDF attachment 的 itemID (数字)
        // 可以通过 Zotero.Items.get(itemID) 获取完整 item 对象（包含 key、parentItemID 等）
        const itemID = this._item.id;
        // console.log("[xpcom/reader.js] 保存论文数据: itemID =", itemID);
        await Zotero.VibeDB.schemaUpdatePromise;
        // 1. 保存论文基础信息（markdown、summary、outline）
        // console.log('[xpcom/reader.js] 步骤6: 准备保存到 Papers 表', parsedData);

        // 提取其中的 articleSummary 字符串字段
        let articleSummaryStr = null;
        if (parsedData.articleSummary) {
          if (typeof parsedData.articleSummary === 'object' && parsedData.articleSummary.articleSummary) {
            // 如果是对象，提取 articleSummary 字段
            articleSummaryStr = parsedData.articleSummary.articleSummary;
          } else if (typeof parsedData.articleSummary === 'string') {
            // 如果已经是字符串，直接使用
            articleSummaryStr = parsedData.articleSummary;
          } else {
            // 其他情况，序列化整个对象
            articleSummaryStr = JSON.stringify(parsedData.articleSummary);
          }
        }

        // ✅ 转换 resultDir 为相对路径（相对于 Zotero 数据目录）
        let relativeResultDir = null;
        if (parsedData.resultDir) {
          const dataDir = Zotero.DataDirectory.dir;
          const absoluteResultDir = parsedData.resultDir;

          // 如果 resultDir 在 Zotero 数据目录下，转换为相对路径
          if (absoluteResultDir.startsWith(dataDir)) {
            relativeResultDir = absoluteResultDir.substring(dataDir.length);
            // 移除开头的路径分隔符
            if (relativeResultDir.startsWith('/') || relativeResultDir.startsWith('\\')) {
              relativeResultDir = relativeResultDir.substring(1);
            }
          } else {
            // 如果不在数据目录下，保存绝对路径（兜底）
            relativeResultDir = absoluteResultDir;
            console.warn('[xpcom/reader.js] resultDir 不在 Zotero 数据目录下，保存绝对路径');
          }
        }

        await Zotero.VibeDB.Papers.save(itemID, {
          resultDir: relativeResultDir || null, // ✅ 保存相对路径
          markdownContent: parsedData.markdownContent || null,
          articleSummary: articleSummaryStr || null,
          blockMapping: parsedData.blockMapping || null
        });
        // console.log('[xpcom/reader.js] ✓ 论文基础信息已保存（resultDir:', relativeResultDir, '）');

        // 2. 获取 paper_id（验证保存结果）
        const paper = await Zotero.VibeDB.Papers.get(itemID);
        if (!paper) {
          throw new Error('Failed to get paper after saving');
        }
        const paperID = paper.paper_id;
        // console.log('[xpcom/reader.js] ✓ 获取 paper_id:', paperID);


        // 3. 保存段落数据
        const hierarchicalData = parsedData.hierarchicalData || [];
        const paragraphsToSave = [];

        for (const page of hierarchicalData) {
          const pageIndex = page.pageIndex;
          const paragraphs = page.paragraphs || [];

          for (const para of paragraphs) {
            const paragraphData = {
              page_idx: pageIndex,
              paragraph_idx: para.paragraphIndex,
              minerU_id: para.minerUid || null,
              paragraph_type: para.paragraphType || 'text',
              paragraph_text: para.paragraphText || null,
              paragraph_summary: para.paragraphSummary || null,
              importance_level: para.importance_level || null,
              bbox: para.bbox || null, // vibeDB.js 会处理序列化
              rects: para.rects || null // vibeDB.js 会处理序列化
            };
            paragraphsToSave.push(paragraphData);
          }
        }

        // 批量保存段落（传递 paperID 避免重复查询）
        if (paragraphsToSave.length > 0) {
          await Zotero.VibeDB.Paragraphs.saveBatch(itemID, paragraphsToSave, paperID);
          // console.log(`[xpcom/reader.js] ✓ 已保存 ${paragraphsToSave.length} 个段落`);
        }

        // 4. 获取保存后的段落（带 paragraph_id）并保存 points
        // 传递 paperID 避免重复查询 Papers 表
        const savedParagraphs = await Zotero.VibeDB.Paragraphs.getByItemID(itemID, paperID);
        const paragraphIDMap = {}; // { "pageIdx_paraIdx": paragraph_id }
        for (const para of savedParagraphs) {
          const key = `${para.page_idx}_${para.paragraph_idx}`;
          paragraphIDMap[key] = para.paragraph_id;
        }

        // 4.5. 保存 sentences (在points之前)
        // console.log('[xpcom/reader.js] 开始保存 sentences...');
        for (const page of hierarchicalData) {
          const pageIndex = page.pageIndex;
          const paragraphs = page.paragraphs || [];

          for (const para of paragraphs) {
            const key = `${pageIndex}_${para.paragraphIndex}`;
            const paragraphID = paragraphIDMap[key];
            if (!paragraphID) continue;

            const sentences = para.sentences || [];
            if (sentences.length > 0) {
              const sentencesToSave = sentences.map((sentence, idx) => ({
                sentence_idx: idx,
                sentence_text: sentence.text || '',
                char_mapping: sentence.charMapping || null,
                start_char_offset: sentence.startCharIndex?.offset || null,
                end_char_offset: sentence.endCharIndex?.offset || null,
                rects: sentence.rects || null
              }));

              await Zotero.VibeDB.Sentences.saveBatch(paragraphID, sentencesToSave);
            }
          }
        }
        // console.log('[xpcom/reader.js] ✓ Sentences 数据已保存');

        // 保存 points
        for (const page of hierarchicalData) {
          const pageIndex = page.pageIndex;
          const paragraphs = page.paragraphs || [];

          for (const para of paragraphs) {
            const key = `${pageIndex}_${para.paragraphIndex}`;
            const paragraphID = paragraphIDMap[key];
            if (!paragraphID) continue;

            const points = para.points || [];
            if (points.length > 0) {
              const pointsToSave = points.map((point, idx) => ({
                point_idx: idx,
                point_summary: point.summary || null,
                point_translation: point.translation || null,
                sentence_indices: point.sentenceIndices || null, // vibeDB.js 会处理序列化
                char_mapping: point.charMapping || null, // vibeDB.js 会处理序列化
                rects: point.rects || null, // vibeDB.js 会处理序列化
                importance_level: point.importance_level || 1 // 默认为 1
              }));

              await Zotero.VibeDB.Points.saveBatch(paragraphID, pointsToSave);
            }
          }
        }
        // console.log('[xpcom/reader.js] ✓ Points 数据已保存');

        // 5. 保存 SummaryCards，并收集 vibecard_id → dbId 映射
        const summaryCards = parsedData.summaryCards || [];
        const summaryCardIdMap = {}; // vibecard_id → summarycard_id（数据库主键）
        const summaryCardParagraphIdMap = {}; // vibecard_id → paragraph_id（数据库段落ID）
        for (const card of summaryCards) {
          const key = `${card.position.pageIndex}_${card.name.split('_').pop()}`;
          let paragraphID = paragraphIDMap[key];
          if (!paragraphID) {
            console.warn(`[xpcom/reader.js] SummaryCard 找不到对应段落: ${key}, card.name=${card.name}`);
            // 尝试通过 card.id 解析 pageIndex 和 paragraphIndex
            const match = card.id.match(/vibecard_(\d+)_(\d+)/);
            if (match) {
              const altKey = `${match[1]}_${match[2]}`;
              const altParagraphID = paragraphIDMap[altKey];
              if (altParagraphID) {
                const dbId = await saveSummaryCard(paperID, altParagraphID, card);
                if (card.id) {
                  if (dbId) summaryCardIdMap[card.id] = dbId;
                  summaryCardParagraphIdMap[card.id] = altParagraphID;
                }
                continue;
              }
            }
            continue;
          }
          const dbId = await saveSummaryCard(paperID, paragraphID, card);
          if (card.id) {
            if (dbId) summaryCardIdMap[card.id] = dbId;
            summaryCardParagraphIdMap[card.id] = paragraphID;
          }
        }
        if (summaryCards.length > 0) {

          // console.log(`[xpcom/reader.js] ✓ 已保存 ${summaryCards.length} 个 SummaryCards`);
        }
        // 8. 保存 FlashCards
        const flashCards = parsedData.flashCards || [];
        for (const card of flashCards) {
          const pageIndex = card.position.pageIndex;
          // FlashCard 不一定关联到段落，paragraph_id 可为 NULL
          let paragraphID = null;
          // 尝试从 card.name 解析 paragraph_idx（如果有的话）
          const match = card.name.match(/flashcard_p(\d+)_/);
          if (match && card.vibeCardRefs && card.vibeCardRefs.length > 0) {
            // 如果有 vibeCardRefs，尝试找到第一个引用的段落
            const firstRef = card.vibeCardRefs[0];
            const refMatch = firstRef.match(/vibecard_(\d+)_(\d+)/);
            if (refMatch) {
              const key = `${refMatch[1]}_${refMatch[2]}`;
              paragraphID = paragraphIDMap[key] || null;
            }
          }
          await saveFlashCard(paperID, paragraphID, card);
        }
        if (flashCards.length > 0) {

          // console.log(`[xpcom/reader.js] ✓ 已保存 ${flashCards.length} 个 FlashCards`);
        }
        // 9. 保存 article_summary 数据
        if (parsedData.articleSummary && Array.isArray(parsedData.articleSummary)) {
          const articleSummariesToSave = parsedData.articleSummary.map((item, index) => ({
            title: item.title || `章节 ${index + 1}`,
            // 新格式：核心创新点和实验结果使用 points 数组，其他使用 content 字符串
            content: item.points ? item.points : Array.isArray(item.content) ? item.content : [item.content],
            // block_ids 可能在 item 级别或 points 内部
            block_ids: item.block_ids || [],
            sort_order: index
          }));

          if (articleSummariesToSave.length > 0) {
            await Zotero.VibeDB.ArticleSummary.saveBatch(paperID, articleSummariesToSave);
            // console.log(`[xpcom/reader.js] ✓ 已保存 ${articleSummariesToSave.length} 个 article_summary 记录`);
          }
        }

        // 10. 保存 sections 数据（如果有）
        if (parsedData.sections && typeof parsedData.sections === 'object') {
          await Zotero.VibeDB.Sections.saveBatch(paperID, parsedData.sections);
          // console.log('[xpcom/reader.js] ✓ 已保存 sections 数据');
        }

        // console.log('[xpcom/reader.js] ✅ 全部数据已保存到 VibeDB');
        return { success: true, summaryCardIdMap: summaryCardIdMap, summaryCardParagraphIdMap: summaryCardParagraphIdMap };
      }
      catch (error) {
        console.error('[xpcom/reader.js] ❌ 保存到 VibeDB 失败:', error);
        Zotero.logError(error);
        throw error;
      }
    };

    // 从 VibeDB 加载解析数据（特权函数）
	    const _loadParsedDataFromVibeDBPrivileged = async () => {
	      try {
	        // console.log('[xpcom/reader.js] 开始从 VibeDB 加载解析数据...');
	        const itemID = this._item.id;
	        await Zotero.VibeDB.schemaUpdatePromise;

        // 1. 查询 paper 记录
        const paper = await Zotero.VibeDB.Papers.get(itemID);
        if (!paper) {
          // console.log('[xpcom/reader.js] 数据库中没有找到该论文的数据');
          return null;
        }

        // console.log('[xpcom/reader.js] 找到 paper 记录:', paper.paper_id);
        const paperID = paper.paper_id;

	        // 2. 加载段落数据（包含 points）
	        const paragraphs = await Zotero.VibeDB.Paragraphs.getByItemID(itemID, paperID);
	        // console.log(`[xpcom/reader.js] 加载了 ${paragraphs.length} 个段落`);

	        // 3. 先判断是否存在可渲染的缓存，避免只有 paper 壳记录时误触发灰屏渲染流程
	        const articleSummaryData = await Zotero.VibeDB.ArticleSummary.getByPaperID(paperID);
	        const sectionsData = await Zotero.VibeDB.Sections.getByPaperID(paperID);
	        if (!hasRenderableVibeReaderCache({
	          paragraphs,
	          articleSummary: articleSummaryData,
	          sections: sectionsData
	        })) {
	          return null;
	        }

	        // 构建 paragraphIDMap 用于后续查询
	        const paragraphIDMap = {};
	        for (const para of paragraphs) {
	          const key = `${para.page_idx}_${para.paragraph_idx}`;
	          paragraphIDMap[key] = para.paragraph_id;
	        }

        // 3. 为每个段落加载 points 和 sentences
        for (const para of paragraphs) {
          const points = await Zotero.VibeDB.Points.getByParagraphID(para.paragraph_id);
          para.points = points;

          // ✅ 新增: 加载 sentences
          const sentences = await Zotero.VibeDB.Sentences.getByParagraphID(para.paragraph_id);
          para.sentences = sentences;
        }

        // 4. 构建 hierarchicalData（按页面分组）
        const pageMap = {};
        for (const para of paragraphs) {
          if (!pageMap[para.page_idx]) {
            pageMap[para.page_idx] = {
              pageIndex: para.page_idx,
              paragraphs: []
            };
          }

          // 将数据库字段映射到 hierarchicalData 格式
          pageMap[para.page_idx].paragraphs.push({
            pageIndex: para.page_idx, // ✅ 添加 pageIndex，使数据自包含
            paragraphIndex: para.paragraph_idx,
            paragraphType: para.paragraph_type,
            paragraphText: para.paragraph_text,
            paragraphSummary: para.paragraph_summary,
            minerUid: para.minerU_id, // ✅ 添加 minerUid 字段，用于 block_id 到 SummaryCard 的映射
            importance_level: para.importance_level,
            bbox: para.bbox,
            rects: para.rects,
            // ✅ 使用真实的 sentences 数据(从数据库加载)
            sentences: para.sentences.map((sentence) => ({
              id: `${para.page_idx}_${para.paragraph_idx}_${sentence.sentence_idx}`,
              sentenceIndex: sentence.sentence_idx,
              text: sentence.sentence_text,
              charMapping: sentence.char_mapping,
              startCharIndex: sentence.start_char_offset !== null ? { offset: sentence.start_char_offset } : null,
              endCharIndex: sentence.end_char_offset !== null ? { offset: sentence.end_char_offset } : null,
              rects: sentence.rects
            })),
            points: para.points.map((point) => ({
              id: `${para.page_idx}_${para.paragraph_idx}_point_${point.point_idx}`, // ✅ 添加 id 字段
              pointIndex: point.point_idx, // ✅ 添加 pointIndex 字段
              sentenceIndices: point.sentence_indices,
              summary: point.point_summary,
              translation: point.point_translation,
              charMapping: point.char_mapping,
              rects: point.rects,
              importance_level: point.importance_level || 1 // ✅ 添加 importance_level 字段（Requirements: 3.1, 3.2）
            }))
          });
        }

        const hierarchicalData = Object.values(pageMap).sort((a, b) => a.pageIndex - b.pageIndex);

        // 7. 加载 SummaryCards并补充完整数据
        const summaryCardRows = await Zotero.VibeDB.SummaryCards.getByItemID(itemID);
        const summaryCards = summaryCardRows.map((row) => {
          // 从 paragraph_id 反向查找 pageIndex 和 paragraphIndex
          const para = paragraphs.find((p) => p.paragraph_id === row.paragraph_id);
          if (!para) {
            console.warn('[xpcom/reader.js] 找不到summarycard对应的paragraph:', row.paragraph_id);
            return null;
          }

          // ✅ 从 hierarchicalData 中找到对应的段落数据
          const pageData = hierarchicalData.find((p) => p.pageIndex === para.page_idx);
          const paragraphData = pageData?.paragraphs?.find((p) => p.paragraphIndex === para.paragraph_idx);

          if (!paragraphData) {
            console.warn('[xpcom/reader.js] 在hierarchicalData中找不到paragraph:', para.page_idx, para.paragraph_idx);
            return null;
          }

          // ✅ 构建完整的vibeCard文本
          let vibeCardText = '';
          if (paragraphData.paragraphSummary?.trim()) {
            vibeCardText = paragraphData.paragraphSummary;
          }

          // 添加points
          if (paragraphData.points?.length > 0) {
            const pointSummaries = paragraphData.points.
            filter((p) => p.summary?.trim()).
            map((p) => `• ${p.summary}`).
            join('\n');

            if (pointSummaries) {
              vibeCardText = vibeCardText ? vibeCardText + '\n' + pointSummaries : pointSummaries;
            }
          }

          // ✅ 返回完整的summarycard数据
          return {
            id: `vibecard_${para.page_idx}_${para.paragraph_idx}`,
            name: row.summarycard_name || `vibecard_${para.paragraph_idx}`,
            type: 'vibecard',
            vibeCardType: 'summarycard',
            color: '#4ECDC4',
            text: vibeCardText, // ✅ 关键字段
            position: {
              pageIndex: row.page_idx,
              rects: row.position_rects
            },
            sortIndex: row.page_idx * 10000 + (row.position_rects?.[0]?.[1] || 0),
            tags: ['AI生成', 'Summary'],
            pageLabel: `第${row.page_idx + 1}页`,
            priority: 'medium',
            authorName: 'AI Summary',
            maxWidth: 280,
            wordWrap: true,
            paragraphRef: {
              pageIndex: para.page_idx,
              paragraphIndex: para.paragraph_idx,
              paragraphType: para.paragraph_type
            },
            // 为后续更新段落内容使用
            paragraphId: para.paragraph_id,
            paragraphSummary: paragraphData.paragraphSummary, // ✅ 关键字段
            points: paragraphData.points || [], // ✅ 关键字段
            importance_level: paragraphData.importance_level,
            // ✅ 记录数据库主键，后续更新 SummaryCard 时使用
            dbId: row.summarycard_id
          };
        }).filter((card) => card !== null); // 过滤掉null值

        // 8. 加载 FlashCards
        const flashCardRows = await Zotero.VibeDB.FlashCards.getByItemID(itemID);
        const flashCards = flashCardRows.map((row) => {
          const para = row.paragraph_id ? paragraphs.find((p) => p.paragraph_id === row.paragraph_id) : null;
          // row.messages 在 VibeDB.FlashCards.getByItemID 中已经从 JSON 解析为数组
          const messages = Array.isArray(row.messages) ? row.messages : [];
          const userMessage = messages.find((m) => m && m.role === 'user');
          const assistantMessage = messages.find((m) => m && m.role === 'assistant');
          return {
            id: `flashcard_${row.page_idx}_${row.flashcard_id}`,
            name: `flashcard_p${para?.paragraph_idx || 'none'}_${row.flashcard_id}`,
            type: 'vibecard', // ✅ 必须显式声明为 vibecard，拖拽逻辑依赖该字段
            vibeCardType: 'flashcard', // 子类型为 flashcard
            // 保留完整的对话历史
            messages,
            // 从 messages 中还原 question/answer，供 FlashCard 组件渲染
            question: userMessage ? userMessage.content || '' : '',
            answer: assistantMessage ? assistantMessage.content || '' : '',
            position: {
              pageIndex: row.page_idx,
              rects: row.position_rects
            },
            vibeCardRefs: para ? [`vibecard_${para.page_idx}_${para.paragraph_idx}`] : [],
            // 记录数据库主键，后续更新 FlashCard 时使用
            dbId: row.flashcard_id
          };
        });

        // 9. outline 已经在 Papers.get 中解析过了，直接使用
        const outline = paper.outline || [];

	        // 10. ArticleSummary / Sections 已在可渲染性检查阶段加载
	        // console.log(`[xpcom/reader.js] 加载了 ${articleSummaryData.length} 个 article_summary 条目`);
	        // console.log(`[xpcom/reader.js] 加载了 sections 数据:`, sectionsData);

        // 12. 构建完整的数据结构
        // ✅ 将相对路径转换回绝对路径
        let absoluteResultDir = null;
        if (paper.result_dir) {
          const dataDir = Zotero.DataDirectory.dir;
          // 如果是相对路径，拼接数据目录
          if (!paper.result_dir.startsWith('/') && !paper.result_dir.match(/^[a-zA-Z]:/)) {
            const separator = dataDir.includes('\\') ? '\\' : '/';
            const cleanDataDir = dataDir.endsWith(separator) ? dataDir : dataDir + separator;
            absoluteResultDir = cleanDataDir + paper.result_dir;
            // console.log('[xpcom/reader.js] 相对路径转绝对路径:', absoluteResultDir);
          } else {
            // 已经是绝对路径，直接使用
            absoluteResultDir = paper.result_dir;
            // console.log('[xpcom/reader.js] 使用绝对路径:', absoluteResultDir);
          }
        }

        const loadedData = {
          resultDir: absoluteResultDir, // ✅ 返回绝对路径
          markdownContent: paper.markdown_content,
          blockMapping: paper.block_mapping, // ✅ 新增：block_mapping 数据
          articleSummary: articleSummaryData, // ✅ 更新：使用完整的 article_summary 数据
          sections: sectionsData, // ✅ 新增：sections 数据
          outline: outline || [],
          hierarchicalData: hierarchicalData,
          summaryCards: summaryCards,
          flashCards: flashCards
        };

        return loadedData;
      }
      catch (error) {
        console.error('[xpcom/reader.js] ❌ 从 VibeDB 加载失败:', error);
        Zotero.logError(error);
        return null;
      }
    };

    // 导出加载函数给 iframe
    readerOptions.onLoadParsedDataFromVibeDB = Components.utils.exportFunction(function () {
      return new contentWin.Promise((resolve, reject) => {
        _loadParsedDataFromVibeDBPrivileged.call(this).
        then((result) => {
          if (result) {
            // 序列化为 JSON 字符串传递给 iframe
            const resultJSON = JSON.stringify(result);
            resolve(resultJSON);
          } else {
            resolve(null);
          }
        }).
        catch((error) => {
          console.error('[xpcom/reader.js] 加载失败:', error);
          const errorMessage = error.message || String(error);
          reject(new contentWin.Error(errorMessage));
        });
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 导出删除论文所有数据的函数给 iframe
    readerOptions.onDeleteParsedDataFromVibeDB = Components.utils.exportFunction(function () {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 开始删除论文所有数据');
            const itemID = this._item.id;

            // 等待数据库初始化完成
            await Zotero.VibeDB.schemaUpdatePromise;

            // 删除论文解析数据（保留 FlashCards 和 AIChats）
            const success = await Zotero.VibeDB.Papers.deleteParsingResultsOnly(itemID);

            // console.log('[xpcom/reader.js] ✅ 论文数据删除完成:', success);
            resolve(success);
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 删除论文数据失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    readerOptions.onSaveParsedDataToVibeDB = Components.utils.exportFunction(function (parsedDataJSON) {
      return new contentWin.Promise((resolve, reject) => {
        // parsedDataJSON 是从 iframe 传来的 JSON 字符串（而不是复杂对象）
        // 这样可以避免 WrappedNative 问题
        try {
          // console.log('[xpcom/reader.js] 步骤4: 接收到 parsedDataJSON', parsedDataJSON);

          // 类型检查：确保传入的是字符串
          if (typeof parsedDataJSON !== 'string') {
            throw new Error('parsedDataJSON 必须是字符串类型，实际类型: ' + typeof parsedDataJSON);
          }

          // 反序列化为特权层的原生对象
          const parsedData = JSON.parse(parsedDataJSON);
          // console.log('[xpcom/reader.js] 步骤5: JSON 解析成功');
          // console.log('[xpcom/reader.js]   - parsedData:', parsedData);

          // 调用特权函数保存
          _saveParsedDataToVibeDBPrivileged.call(this, parsedData).
          then((result) => {
            const clonedResult = Components.utils.cloneInto(result, contentWin);
            resolve(clonedResult);
          }).
          catch((error) => {
            console.error('[xpcom/reader.js] 保存失败:', error);
            const errorMessage = error.message || String(error);
            reject(new contentWin.Error(errorMessage));
          });
        } catch (e) {
          console.error('[xpcom/reader.js] 解析 parsedDataJSON 失败:', e);
          reject(new contentWin.Error('Failed to parse parsedDataJSON: ' + e.message));
        }
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // VibeCard 数据库操作回调
    readerOptions.onSaveFlashCardToDB = Components.utils.exportFunction(function (flashCardData) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 保存 FlashCard 到数据库:', flashCardData);
            // flashCardData 来自 content，需要转换或直接使用（如果是 JSON 对象，xpcom 可能看到的是 wrapper）
            // 建议先深拷贝或确保是原生对象，但这里直接传给 save 应该没问题，因为 save 内部只取属性
            // 为了安全，可以先 JSON.parse(JSON.stringify(flashCardData)) 或者 cloneInto
            // 但考虑到性能，先直接尝试。如果报错再处理。
            // 之前的错误是 "Permission denied to access property 'then'"，这是因为返回的是 chrome Promise。

            const itemID = this._item.id;
            await Zotero.VibeDB.schemaUpdatePromise;

            const result = await Zotero.VibeDB.FlashCards.save(itemID, flashCardData);
            // console.log('[xpcom/reader.js] ✅ FlashCard 保存成功, flashcard_id:', result);
            resolve(result);
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 保存 FlashCard 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 更新 FlashCard
    readerOptions.onUpdateFlashCardInDB = Components.utils.exportFunction(function (updateData) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 更新 FlashCard 到数据库:', updateData);
            await Zotero.VibeDB.schemaUpdatePromise;

            await Zotero.VibeDB.FlashCards.update(updateData.flashcard_id, {
              messages: updateData.messages,
              position_rects: updateData.position_rects
            });
            // console.log('[xpcom/reader.js] ✅ FlashCard 更新成功');
            resolve(Components.utils.cloneInto({ success: true }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 更新 FlashCard 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 删除 FlashCard
    readerOptions.onDeleteFlashCardInDB = Components.utils.exportFunction(function (flashCardID) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 删除 FlashCard 从数据库, flashCardID:', flashCardID);
            // console.log('[xpcom/reader.js] flashCardID 类型:', typeof flashCardID);
            await Zotero.VibeDB.schemaUpdatePromise;

            // console.log('[xpcom/reader.js] 调用 Zotero.VibeDB.FlashCards.delete');
            await Zotero.VibeDB.FlashCards.delete(flashCardID);
            // console.log('[xpcom/reader.js] ✅ FlashCard 删除成功, flashCardID:', flashCardID);

            // 注意：删除验证需要 itemID，但在这个上下文中无法直接获取
            // 删除操作本身已经成功，验证可以省略或通过其他方式实现

            resolve(Components.utils.cloneInto({ success: true }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 删除 FlashCard 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 更新 SummaryCard  
    readerOptions.onUpdateSummaryCardInDB = Components.utils.exportFunction(function (updateData) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            console.log('[xpcom/reader.js] 更新 SummaryCard 到数据库，收到数据:', JSON.stringify({
              summarycard_id: updateData.summarycard_id,
              paragraph_id: updateData.paragraph_id,
              paragraphSummary: updateData.paragraphSummary,
              pointsCount: updateData.points?.length
            }, null, 2));

            await Zotero.VibeDB.schemaUpdatePromise;

            // 检查是否有 summarycard_id
            if (!updateData.summarycard_id) {
              console.warn('[xpcom/reader.js] ⚠️ SummaryCard 没有 summarycard_id，这是新创建的卡片，需要先保存');
              resolve(Components.utils.cloneInto({ success: false, reason: 'no_dbId' }, contentWin));
              return;
            }

            // 1) 更新 summary_cards 表
            const dbUpdates = {};
            if (updateData.summarycard_name !== undefined) {
              dbUpdates.summarycard_name = updateData.summarycard_name;
            }
            if (updateData.position_rects !== undefined) {
              dbUpdates.position_rects = updateData.position_rects;
            }

            if (Object.keys(dbUpdates).length > 0) {
              await Zotero.VibeDB.SummaryCards.update(updateData.summarycard_id, dbUpdates);
              console.log('[xpcom/reader.js] ✅ SummaryCard 表更新成功');
            }

            // 2) 如果提供了段落信息，则同步更新 paragraphs 表中的摘要
            if (updateData.paragraph_id && typeof updateData.paragraphSummary === 'string') {
              console.log('[xpcom/reader.js] 更新段落摘要：paragraph_id=', updateData.paragraph_id);
              await Zotero.VibeDB.Paragraphs.updateSummary(updateData.paragraph_id, updateData.paragraphSummary);
              console.log('[xpcom/reader.js] ✅ Paragraphs 摘要更新成功');
            } else {
              console.warn('[xpcom/reader.js] ⚠️ 缺少 paragraph_id 或 paragraphSummary，跳过段落更新。paragraph_id=', updateData.paragraph_id, 'paragraphSummary=', typeof updateData.paragraphSummary);
            }

            // 3) 如果提供了 points 信息，则同步更新 points 表
            if (updateData.paragraph_id && updateData.points && Array.isArray(updateData.points)) {
              console.log('[xpcom/reader.js] 更新 Points：paragraph_id=', updateData.paragraph_id, '数量=', updateData.points.length);
              // 将 points 转换为数据库格式（point_idx, point_summary 等）
              const pointsData = updateData.points.map((point, idx) => ({
                point_idx: idx,
                point_summary: point.summary || null,
                point_translation: point.translation || null,
                sentence_indices: point.sentenceIndices || [],
                char_mapping: point.charMapping || [],
                rects: point.rects || [],
                importance_level: point.importance_level || 1 // 默认为 1
              }));

              // console.log('[xpcom/reader.js] Points 数据转换完成，第一个point:', JSON.stringify(pointsData[0], null, 2));
              await Zotero.VibeDB.Points.saveBatch(updateData.paragraph_id, pointsData);
              console.log('[xpcom/reader.js] ✅ Points 保存成功，共', pointsData.length, '个');
            } else {
              console.warn('[xpcom/reader.js] ⚠️ 缺少 paragraph_id 或 points，跳过 points 更新。paragraph_id=', updateData.paragraph_id, 'hasPoints=', !!updateData.points?.length);
            }

            console.log('[xpcom/reader.js] ✅ SummaryCard 完整更新成功');
            resolve(Components.utils.cloneInto({ success: true }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 更新 SummaryCard 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 删除 SummaryCard
    readerOptions.onDeleteSummaryCardInDB = Components.utils.exportFunction(function (summaryCardID) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 删除 SummaryCard 从数据库, summaryCardID:', summaryCardID);
            await Zotero.VibeDB.schemaUpdatePromise;
            await Zotero.VibeDB.SummaryCards.delete(summaryCardID);
            // console.log('[xpcom/reader.js] ✅ SummaryCard 删除成功');
            resolve(Components.utils.cloneInto({ success: true }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 删除 SummaryCard 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 更新段落 importance_level 回调
    readerOptions.onUpdateParagraphImportance = Components.utils.exportFunction(function (paragraphID, importanceLevel) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 更新段落 importance_level:', paragraphID, importanceLevel);
            await Zotero.VibeDB.schemaUpdatePromise;
            await Zotero.VibeDB.Paragraphs.updateImportanceLevel(paragraphID, importanceLevel);
            // console.log('[xpcom/reader.js] ✅ 段落 importance_level 更新成功');
            resolve(Components.utils.cloneInto({ success: true }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 更新段落 importance_level 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 更新 point importance_level 回调
    readerOptions.onUpdatePointImportance = Components.utils.exportFunction(function (pointID, importanceLevel) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 更新 point importance_level:', pointID, importanceLevel);
            await Zotero.VibeDB.schemaUpdatePromise;
            await Zotero.VibeDB.Points.updateImportanceLevel(pointID, importanceLevel);
            // console.log('[xpcom/reader.js] ✅ Point importance_level 更新成功');
            resolve(Components.utils.cloneInto({ success: true }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 更新 point importance_level 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 更新 ArticleSummary 回调（用于侧边栏编辑功能）
    readerOptions.onUpdateArticleSummary = Components.utils.exportFunction(function (summaryID, updatesJSON) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 更新 ArticleSummary:', summaryID, updatesJSON);
            await Zotero.VibeDB.schemaUpdatePromise;

            // 解析 JSON 字符串（从 iframe 传来）
            const updates = typeof updatesJSON === 'string' ? JSON.parse(updatesJSON) : updatesJSON;

            const success = await Zotero.VibeDB.ArticleSummary.update(summaryID, updates);
            // console.log('[xpcom/reader.js] ✅ ArticleSummary 更新成功');
            resolve(Components.utils.cloneInto({ success }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 更新 ArticleSummary 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // 更新段落和 Points 回调（用于单页重新解析/单卡片重生成）
    readerOptions.onUpdateParagraphAndPointsInDB = Components.utils.exportFunction(function (updateData) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            // console.log('[xpcom/reader.js] 更新段落和 Points:', updateData);
            await Zotero.VibeDB.schemaUpdatePromise;

            const itemID = this._item.id;
            if (!itemID) {
              throw new Error('无法获取当前附件的 itemID');
            }

            // 获取 paper 记录
            const paper = await Zotero.VibeDB.Papers.get(itemID);
            if (!paper) {
              throw new Error('未找到论文记录，无法更新段落');
            }
            const paperID = paper.paper_id;

            // 先加载段落列表，后续按 minerUid / page+idx 匹配目标段落
            const paragraphs = await Zotero.VibeDB.Paragraphs.getByItemID(itemID, paperID);
            const minerUid = updateData.minerUid;
            const targetParagraph = paragraphs.find((p) => {
              // 优先使用 minerU_id 精确匹配（兼容数字和字符串）
              if (minerUid !== undefined && minerUid !== null && p.minerU_id !== undefined && p.minerU_id !== null) {
                if (String(p.minerU_id) === String(minerUid)) {
                  return true;
                }
              }
              // 兜底使用 page_idx + paragraph_idx 匹配
              if (typeof updateData.page_idx === 'number' && typeof updateData.paragraph_idx === 'number') {
                return p.page_idx === updateData.page_idx && p.paragraph_idx === updateData.paragraph_idx;
              }
              return false;
            });

            if (!targetParagraph) {
              throw new Error(`未找到段落: minerUid=${minerUid}, page=${updateData.page_idx}, paragraph=${updateData.paragraph_idx}`);
            }

            const paragraphID = targetParagraph.paragraph_id;

            // 1. 更新段落摘要和 importance_level
            if (updateData.paragraph_summary !== undefined) {
              await Zotero.VibeDB.Paragraphs.updateSummary(paragraphID, updateData.paragraph_summary);
            }
            if (updateData.importance_level !== undefined) {
              await Zotero.VibeDB.Paragraphs.updateImportanceLevel(paragraphID, updateData.importance_level);
            }

            // 2. 更新 Points（先删后插）
            if (updateData.point_split && Array.isArray(updateData.point_split)) {
              await Zotero.VibeDB.Points.deleteByParagraphID(paragraphID);

              const pointSummaries = updateData.point_summaries || [];
              const pointTranslations = updateData.point_translations || [];
              const pointCharMappings = updateData.point_char_mappings || [];
              const pointRects = updateData.point_rects || [];

              const pointsData = updateData.point_split.map((sentenceIndices, idx) => ({
                point_idx: idx,
                point_summary: pointSummaries[idx] || null,
                point_translation: pointTranslations[idx] || null,
                sentence_indices: sentenceIndices || [],
                char_mapping: Array.isArray(pointCharMappings[idx]) ? pointCharMappings[idx] : null,
                rects: Array.isArray(pointRects[idx]) ? pointRects[idx] : null,
                importance_level: 1
              }));

              if (pointsData.length > 0) {
                await Zotero.VibeDB.Points.saveBatch(paragraphID, pointsData);
              }
            }

            // console.log('[xpcom/reader.js] ✅ 段落和 Points 更新成功');
            resolve(Components.utils.cloneInto({
              success: true,
              paragraphID: paragraphID
            }, contentWin));
          }
          catch (error) {
            console.error('[xpcom/reader.js] ❌ 更新段落和 Points 失败:', error);
            Zotero.logError(error);
            reject(new contentWin.Error(error.message || String(error)));
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // Privileged JSON file loading function
    async function _loadJsonFilePrivileged(filename) {
      try {
        // 构建JSON文件路径
        const extensionDir = Zotero.getZoteroDirectory().path;
        const jsonFilePath = OS.Path.join(extensionDir, "temp_json", filename);
        // 检查文件是否存在
        if (!(await OS.File.exists(jsonFilePath))) {
          throw new Error(`JSON文件不存在: ${jsonFilePath} `);
        }

        // 确保JSONUtils已加载
        if (typeof Zotero.JSONUtils === 'undefined') {
          Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/pdfParsing/jsonUtils.js", Zotero);
        }

        // 使用JSONUtils读取JSON文件
        const data = await Zotero.JSONUtils.readJSONFile(jsonFilePath);
        if (!data) {
          throw new Error("无法读取JSON文件");
        }
        return data;

      } catch (error) {
        console.error(`[xpcom / reader.js] Error loading JSON file ${filename}: `, error);
        throw error;
      }
    }

    // Export JSON loading callback
    readerOptions._loadJsonFile = Components.utils.exportFunction(function (filename) {
      return new contentWin.Promise((resolve, reject) => {
        _loadJsonFilePrivileged(filename).
        then((result) => {
          try {
            const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
              cloneFunctions: true
            });
            resolve(clonedResult);
          }
          catch (e) {
            // Clone error object for cross-compartment communication
            const errorMessage = e.message || String(e);
            reject(new contentWin.Error(errorMessage));
          }
        }).
        catch((error) => {
          // Clone error object for cross-compartment communication
          const errorMessage = error.message || String(error);
          reject(new contentWin.Error(errorMessage));
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // Export VibeCard reference insertion callback
    readerOptions.onInsertReference = Components.utils.exportFunction(function (vibeCardData) {
      try {
        // 获取主窗口的 context-pane-inner 元素
        const win = Zotero.getMainWindow();
        const contextPaneInner = win.document.getElementById('zotero-context-pane-inner');

        if (!contextPaneInner) {
          return false;
        }

        // 获取当前 reader 的 itemID
        let currentItemID = null;
        try {
          let reader = Zotero.Reader.getByTabID(win.Zotero_Tabs.selectedID);
          if (reader) {
            currentItemID = reader.itemID;
          }
        } catch (e) {
          console.warn('[xpcom/reader.js] 无法获取当前 itemID:', e);
        }

        // 按 itemID 查找对应的 AI Chat 容器
        let aiChatContainer = null;
        if (currentItemID && contextPaneInner._aiChatPaneDeck) {
          aiChatContainer = Array.from(contextPaneInner._aiChatPaneDeck.children).find((x) => x.itemID == currentItemID);
        }
        // 如果没找到，使用当前选中的面板
        if (!aiChatContainer) {
          aiChatContainer = contextPaneInner._aiChatPaneDeck?.selectedPanel;
        }
        // 如果还没有，尝试获取第一个子元素
        if (!aiChatContainer && contextPaneInner._aiChatPaneDeck?.children.length > 0) {
          aiChatContainer = contextPaneInner._aiChatPaneDeck.children[0];
        }

        if (!aiChatContainer) {
          return false;
        }

        // 从容器上获取保存的 API 引用
        let aiChatAPI = aiChatContainer._aiChatAPI;

        // 如果容器上没有，尝试从 iframe 中直接获取
        if (!aiChatAPI) {
          const iframe = aiChatContainer.querySelector('iframe');
          if (iframe && iframe.contentWindow) {
            aiChatAPI = iframe.contentWindow.aiChatAPI;
            // 保存到容器上供下次使用
            if (aiChatAPI) {
              aiChatContainer._aiChatAPI = aiChatAPI;
            }
          }
        }

        if (aiChatAPI && typeof aiChatAPI.insertVibeCardReference === 'function') {
          aiChatAPI.insertVibeCardReference(vibeCardData);
          return true;
        }

        return false;
      } catch (error) {
        console.error('[xpcom/reader.js] Error inserting VibeCard reference:', error);
        return false;
      }
    }, contentWin, { allowCrossOriginArguments: true });

    // GitHub 仓库搜索（在特权层执行，避免 CORS 限制）
    // 优化排序算法，返回最佳匹配的仓库和完整搜索结果列表
    async function _searchPaperGitHubRepoPrivileged(paperTitleParam) {
      try {
        // 跨域传递的参数可能是 WrappedNative 对象，需要转换为原生字符串
        const paperTitle = String(paperTitleParam);
        // console.log(`[xpcom/reader.js] 🐙 开始搜索论文 "${paperTitle}" 的 GitHub 仓库...`);

        // 调用 GitHub Search API，获取前 20 个结果
        const query = `"${paperTitle}" in:name,description,readme`;
        const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=20`;

        const response = await fetch(url, {
          headers: {
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
          }
        });

        if (!response.ok) {
          console.warn('[xpcom/reader.js] 🐙 GitHub API 请求失败:', response.status);
          return null;
        }

        const data = await response.json();
        // console.log("[_searchPaperGitHubRepoPrivileged] 🐙 GitHub API 返回数据:", data);

        // 优化排序算法：结合多个因素
        const titleWords = paperTitle.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
        const results = (data.items || []).map((repo) => {
          const repoName = repo.name.toLowerCase();
          const description = (repo.description || '').toLowerCase();
          const readme = ''; // GitHub API 不直接返回 README，但可以通过匹配 in:readme

          let matchedWords = 0;
          let score = 0;

          // 1. 计算词语匹配度
          titleWords.forEach((word) => {
            if (repoName.includes(word)) {
              matchedWords++;
              score += 5; // 名称匹配权重最高
            }
            if (description.includes(word)) {
              matchedWords++;
              score += 2; // 描述匹配权重中等
            }
          });

          // 2. 精确匹配加分
          if (repoName === paperTitle.toLowerCase().replace(/\s+/g, '-')) {
            score += 10; // 完全匹配名称大幅加分
          }

          // 3. Stars 权重（使用对数避免影响过大）
          const starsScore = Math.log10(repo.stargazers_count + 1) * 3;
          score += starsScore;

          // 4. Fork 和 Watchers 权重（次要指标）
          const popularityScore = Math.log10(repo.forks_count + 1) + Math.log10(repo.watchers_count + 1);
          score += popularityScore * 0.5;

          // 5. 最近更新加分（活跃项目更可能是官方）
          const updatedAt = new Date(repo.updated_at);
          const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceUpdate < 365) {
            score += 2; // 一年内有更新加分
          }

          const matchRatio = matchedWords / (titleWords.length * 2);

          return {
            name: repo.full_name,
            url: repo.html_url,
            description: repo.description,
            stars: repo.stargazers_count,
            forks: repo.forks_count,
            matchRatio,
            score,
            updatedAt: repo.updated_at
          };
        }).filter((r) => r.matchRatio > 0.15) // 降低阈值，避免过滤掉好的结果
        .sort((a, b) => {
          // 按综合分数排序
          return b.score - a.score;
        });

        if (results.length === 0) {
          // console.log(`[xpcom/reader.js] 🐙 未找到论文 "${paperTitle}" 的相关 GitHub 仓库`);
          return null;
        }

        // 返回最佳匹配的仓库和完整搜索结果列表
        const bestMatch = results[0];
        // console.log(`[xpcom/reader.js] 🐙 找到最佳匹配仓库: ${bestMatch.name} (⭐${bestMatch.stars}, 分数: ${bestMatch.score.toFixed(2)})`);
        // console.log(`[xpcom/reader.js] 🐙 共找到 ${results.length} 个相关仓库`);

        // 返回包含最佳匹配和完整列表的对象
        return {
          bestMatch: bestMatch,
          allResults: results
        };

      } catch (error) {
        console.error('[xpcom/reader.js] 🐙 GitHub 搜索失败:', error);
        return null;
      }
    }

    readerOptions.onSearchPaperGitHubRepo = Components.utils.exportFunction(function (paperTitle) {
      return new contentWin.Promise((resolve, reject) => {
        _searchPaperGitHubRepoPrivileged(paperTitle).
        then((result) => {
          if (result) {
            // 使用 JSON 序列化传递复杂嵌套对象，避免 cloneInto 深度克隆问题
            const jsonString = JSON.stringify(result);
            resolve(jsonString);
          } else {
            resolve(null);
          }
        }).
        catch((error) => {
          const errorMessage = error && error.message ? error.message : String(error);
          reject(new contentWin.Error(errorMessage));
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // DeepWiki API 代理（在特权层执行，避免 CORS 限制）
    async function _callDeepWikiAPIPrivileged(requestBodyJSON) {
      try {
        const requestBody = typeof requestBodyJSON === 'string' ? JSON.parse(requestBodyJSON) : requestBodyJSON;
        // console.log('[xpcom/reader.js] 🐙 调用 DeepWiki API:', requestBody.model);

        const DEEPWIKI_API_URL = 'https://api.deepwiki.com/chat/completions';

        const response = await fetch(DEEPWIKI_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`DeepWiki API 错误 (${response.status}): ${errorText}`);
        }

        // 如果是流式响应，需要特殊处理
        if (requestBody.stream) {
          // 流式响应需要逐块读取并返回
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          const chunks = [];
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmedLine = line.trim();
              if (trimmedLine && trimmedLine.startsWith('data: ')) {
                const data = trimmedLine.slice(6);
                if (data !== '[DONE]') {
                  chunks.push(data);
                }
              }
            }
          }

          // 返回所有块，让前端处理
          return { stream: true, chunks };
        } else {
          // 非流式响应，直接返回 JSON
          const data = await response.json();
          return { stream: false, data };
        }
      } catch (error) {
        console.error('[xpcom/reader.js] 🐙 DeepWiki API 调用失败:', error);
        throw error;
      }
    }

    readerOptions.onCallDeepWikiAPI = Components.utils.exportFunction(function (requestBodyJSON) {
      return new contentWin.Promise((resolve, reject) => {
        _callDeepWikiAPIPrivileged(requestBodyJSON).
        then((result) => {
          // 使用 cloneInto 传递结果
          const clonedResult = Components.utils.cloneInto(result, iframeWindow, {
            cloneFunctions: true
          });
          resolve(clonedResult);
        }).
        catch((error) => {
          const errorMessage = error && error.message ? error.message : String(error);
          reject(new contentWin.Error(errorMessage));
        });
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 从数据库获取 GitHub URL 的回调
    readerOptions.onGetGitHubUrlFromDB = Components.utils.exportFunction(function () {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            const itemID = this._item.id;
            await Zotero.VibeDB.schemaUpdatePromise;
            const githubUrl = await Zotero.VibeDB.Papers.getGitHubUrl(itemID);
            // console.log('[xpcom/reader.js] 🐙 从数据库获取 GitHub URL:', githubUrl);
            resolve(githubUrl);
          } catch (error) {
            console.error('[xpcom/reader.js] 🐙 获取 GitHub URL 失败:', error);
            resolve(null); // 失败时返回 null，不抛出错误
          }
        })();
      });
    }.bind(this), contentWin, { allowCrossOriginArguments: true });

    // Export GitHub repo notification callback (通知 AI Chat 和 Code Pane 设置 GitHub 仓库)
    // repoInfo 现在只接收单个仓库对象，allResults 是完整的搜索结果列表（可选）
    // ✅ 在导出前捕获 itemID，避免 exportFunction 导出后 this 不可用
    const readerItemID = this._item.id;
    readerOptions.onSetGitHubRepo = Components.utils.exportFunction(function (repoInfo, allResults) {
      try {
        // console.log('[xpcom/reader.js] 🐙 onSetGitHubRepo 收到数据:', repoInfo, '类型:', typeof repoInfo);
        // if (allResults) {
        // 	console.log('[xpcom/reader.js] 🐙 同时收到搜索结果列表，共', allResults.length, '个仓库');
        // }

        // 获取主窗口的 context-pane-inner 元素
        const win = Zotero.getMainWindow();
        const contextPaneInner = win.document.getElementById('zotero-context-pane-inner');

        if (!contextPaneInner) {
          console.warn('[xpcom/reader.js] 🐙 contextPaneInner not found');
          return false;
        }

        // 验证仓库数据格式
        if (!repoInfo || typeof repoInfo !== 'object' || !repoInfo.name && !repoInfo.url) {
          console.warn('[xpcom/reader.js] 🐙 无效的仓库数据:', repoInfo);
          return false;
        }

        // 1. 通知 AI Chat iframe 设置仓库（按 itemID 查找对应的 AI Chat）
        // ✅ 使用发起请求的 reader 实例的 itemID，而不是当前选中 Tab 的 itemID
        // 这样即使用户在异步搜索期间切换了 Tab，GitHub URL 也会保存到正确的论文
        const currentItemID = readerItemID;

        // 🐙 保存 GitHub URL 到数据库（异步执行，不阻塞主流程）
        if (currentItemID && repoInfo.url) {
          (async () => {
            try {
              await Zotero.VibeDB.schemaUpdatePromise;
              await Zotero.VibeDB.Papers.updateGitHubUrl(currentItemID, repoInfo.url);
              // console.log('[xpcom/reader.js] 🐙 GitHub URL 已保存到数据库:', repoInfo.url);
            } catch (e) {
              console.error('[xpcom/reader.js] 🐙 保存 GitHub URL 到数据库失败:', e);
            }
          })();
        }

        // 按 itemID 查找对应的 AI Chat
        let aiChatContainer = null;
        if (currentItemID && contextPaneInner._aiChatPaneDeck) {
          aiChatContainer = Array.from(contextPaneInner._aiChatPaneDeck.children).find((x) => x.itemID == currentItemID);
        }
        // 如果没找到，使用当前选中的
        if (!aiChatContainer) {
          aiChatContainer = contextPaneInner._aiChatPaneDeck?.selectedPanel;
        }
        if (!aiChatContainer && contextPaneInner._aiChatPaneDeck?.children.length > 0) {
          aiChatContainer = contextPaneInner._aiChatPaneDeck.children[0];
        }

        if (aiChatContainer) {
          let aiChatAPI = aiChatContainer._aiChatAPI;
          if (!aiChatAPI) {
            const iframe = aiChatContainer.querySelector('iframe');
            if (iframe && iframe.contentWindow) {
              aiChatAPI = iframe.contentWindow.aiChatAPI;
              if (aiChatAPI) {
                aiChatContainer._aiChatAPI = aiChatAPI;
              }
            }
          }

          if (aiChatAPI) {
            // 设置 DeepWiki API 代理函数（优先设置，避免 CORS）
            if (typeof aiChatAPI.setDeepWikiAPIProxy === 'function') {
              aiChatAPI.setDeepWikiAPIProxy(readerOptions.onCallDeepWikiAPI);
              // console.log('[xpcom/reader.js] 🐙 已设置 DeepWiki API 代理函数');
            }

            if (typeof aiChatAPI.setGitHubRepo === 'function') {
              aiChatAPI.setGitHubRepo(repoInfo); // 直接传递单个对象
              // console.log('[xpcom/reader.js] 🐙 已通知 AI Chat 设置 GitHub 仓库:', repoInfo.name);
            }
          }
        }

        // 2. 通知 Code Pane 设置仓库链接（按 itemID 查找对应的 Code Pane）
        // 按 itemID 查找对应的 Code Pane（复用上面获取的 currentItemID）
        let codeContainer = null;
        if (currentItemID && contextPaneInner._codePaneDeck) {
          codeContainer = Array.from(contextPaneInner._codePaneDeck.children).find((x) => x.itemID == currentItemID);
        }
        // 如果没找到，使用当前选中的
        if (!codeContainer) {
          codeContainer = contextPaneInner._codePaneDeck?.selectedPanel;
        }

        if (codeContainer) {
          // 如果有 Code Pane 的 API，调用它
          if (codeContainer._codeAPI && typeof codeContainer._codeAPI.setGitHubRepo === 'function') {
            codeContainer._codeAPI.setGitHubRepo(repoInfo);
            // console.log('[xpcom/reader.js] 🐙 已通知 Code Pane 设置 GitHub 仓库:', repoInfo.name, 'itemID:', currentItemID);

            // 如果有搜索结果列表，也传递给 Code Pane
            if (allResults && allResults.length > 0 && typeof codeContainer._codeAPI.setSearchedRepos === 'function') {
              codeContainer._codeAPI.setSearchedRepos(allResults);
              // console.log('[xpcom/reader.js] 🐙 已传递搜索结果列表给 Code Pane，共', allResults.length, '个仓库');
            }
          }
          // 或者直接更新 iframe src
          else {
            const iframe = codeContainer.querySelector('iframe');
            if (iframe && repoInfo.url) {
              iframe.src = repoInfo.url;
              // console.log('[xpcom/reader.js] 🐙 已更新 Code Pane iframe src:', repoInfo.url);
            }
          }
        }

        return true;
      } catch (error) {
        console.error('[xpcom/reader.js] 🐙 Error setting GitHub repo:', error);
        return false;
      }
    }, contentWin, { allowCrossOriginArguments: true });

    function _readJSONPref(prefName) {
      try {
        if (!Zotero || !Zotero.Prefs) {
          return null;
        }
        const rawValue = Zotero.Prefs.get(prefName, true);
        if (!rawValue) {
          return null;
        }
        return typeof rawValue === 'string' ? JSON.parse(rawValue) : rawValue;
      } catch (e) {
        return null;
      }
    }

    function _ensureAIProvidersRegistry() {
      try {
        if (!Zotero) {
          return null;
        }
        if (!Zotero.AIProviders && typeof Services !== 'undefined' && Services.scriptloader) {
          Services.scriptloader.loadSubScript("chrome://zotero/content/xpcom/aiProviders.js", Zotero);
        }
        return Zotero.AIProviders || null;
      } catch (e) {
        console.error('[xpcom/reader.js] 加载 AIProviders registry 失败:', e);
        return null;
      }
    }

    function _isAIWorkflowAccountBypassed() {
      return true;
    }

    readerOptions.checkLoginStatus = Components.utils.exportFunction(function () {
      try {
        return _isAIWorkflowAccountBypassed();
      } catch (e) {
        console.error('[xpcom/reader.js] 检查登录状态失败:', e);
        return true;
      }
    }, contentWin, { allowCrossOriginArguments: true });

    readerOptions.hasCustomProviderConfig = Components.utils.exportFunction(function () {
      try {
        return !!_ensureAIProvidersRegistry()?.getDefaultProvider?.();
      } catch (e) {
        return false;
      }
    }, contentWin, { allowCrossOriginArguments: true });

    readerOptions.getUserBalance = Components.utils.exportFunction(function () {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            resolve(Components.utils.cloneInto({
              credits: null,
              credits_used: 0,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              aiWorkflowBypass: true
            }, contentWin));
          } catch (e) {
            console.error('[xpcom/reader.js] 获取余额失败:', e);
            resolve(Components.utils.cloneInto({ credits: null, aiWorkflowBypass: true }, contentWin));
          }
        })();
      });
    }, contentWin, { allowCrossOriginArguments: true });

    readerOptions.openLoginPanel = Components.utils.exportFunction(function () {
      return false;
    }, contentWin, { allowCrossOriginArguments: true });

    readerOptions.deductCredits = Components.utils.exportFunction(function (amount) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            resolve(true);
          } catch (e) {
            console.error('[xpcom/reader.js] 扣减Credits失败:', e);
            resolve(true);
          }
        })();
      });
    }, contentWin, { allowCrossOriginArguments: true });

    readerOptions._logUsage = Components.utils.exportFunction(function (pageCount) {
      return new contentWin.Promise((resolve, reject) => {
        (async () => {
          try {
            resolve(true);
          } catch (e) {
            console.error('[xpcom/reader.js] 记录使用量失败:', e);
            resolve(true);
          }
        })();
      });
    }, contentWin, { allowCrossOriginArguments: true });

    // 获取单价配置
    readerOptions.getPricing = Components.utils.exportFunction(function () {
      try {
        if (Zotero.VibeDBSync && Zotero.VibeDBSync.PRICING) {
          // 使用 cloneInto 传递对象
          return Components.utils.cloneInto(Zotero.VibeDBSync.PRICING, contentWin);
        }
        // 默认 fallback
        return Components.utils.cloneInto({ PAGE: 4, CHAT: 1 }, contentWin);
      } catch (e) {
        console.error('[xpcom/reader.js] 获取单价配置失败:', e);
        return Components.utils.cloneInto({ PAGE: 4, CHAT: 1 }, contentWin);
      }
    }, contentWin, { allowCrossOriginArguments: true });

    this._internalReader = this._iframeWindow.wrappedJSObject.createReader(readerOptions);

    this._resolveInitPromise();
    // Set title once again, because `ReaderWindow` isn't loaded the first time
    this.updateTitle();

    // 自动检测并加载 VibeDB 数据（如果存在且是首次打开）
    // 在 _internalReader 创建后立即执行，不阻塞后续流程
    if (this._isNewOpen) {
      this._autoLoadVibeDBData();
      this._isNewOpen = false; // 重置标志位
    }

    this._prefObserverIDs = [
    Zotero.Prefs.registerObserver('fontSize', this._handleFontSizeChange),
    Zotero.Prefs.registerObserver('tabs.title.reader', this._handleTabTitlePrefChange),
    Zotero.Prefs.registerObserver('reader.textSelectionAnnotationMode', this._handleTextSelectionAnnotationModeChange),
    Zotero.Prefs.registerObserver('reader.lightTheme', this._handleLightThemeChange),
    Zotero.Prefs.registerObserver('reader.darkTheme', this._handleDarkThemeChange),
    Zotero.Prefs.registerObserver('reader.ebookFontFamily', this._handleEbookPrefChange),
    Zotero.Prefs.registerObserver('reader.ebookHyphenate', this._handleEbookPrefChange),
    Zotero.Prefs.registerObserver('reader.autoDisableTool.note', this._handleAutoDisableToolPrefChange),
    Zotero.Prefs.registerObserver('reader.autoDisableTool.text', this._handleAutoDisableToolPrefChange),
    Zotero.Prefs.registerObserver('reader.autoDisableTool.image', this._handleAutoDisableToolPrefChange)];


    return true;
  }

  /**
   * 自动检测并加载 VibeDB 数据（首次打开时）
   */
  async _autoLoadVibeDBData() {
    try {
      // console.log('[Reader] 开始自动检测 VibeDB 数据...');

      // 等待数据库初始化完成
      await Zotero.VibeDB.schemaUpdatePromise;

      // 检查是否有解析数据
      const itemID = this._item.id;
      const paper = await Zotero.VibeDB.Papers.get(itemID);

      if (!paper) {
        // console.log('[Reader] 数据库中没有找到解析数据，跳过自动加载');
        return;
      }

      // console.log('[Reader] ✓ 检测到解析数据，开始自动加载...');

      // 等待 Reader 完全初始化
      await this._initPromise;

      // 通过 _internalReader 访问 Reader iframe 中的方法
      const reader = this._internalReader;

      if (!reader || !reader._autoLoadFromVibeDB) {
        console.warn('[Reader] Reader 对象或自动加载方法不可用');
        return;
      }

      // ✅ 直接调用 iframe 内部的自动加载方法
      // 这个方法会在 iframe 内部完成所有操作：
      // 1. 调用 _onLoadParsedDataFromVibeDB() 从特权层加载数据
      // 2. 调用 _loadCachedDataAndRender() 渲染数据
      // 3. 显示进度条
      await reader._autoLoadFromVibeDB();

      // console.log('[Reader] ✅ 自动加载完成');
    }
    catch (error) {
      console.error('[Reader] ❌ 自动加载失败:', error);
      Zotero.logError(error);
    }
  }

  async _getData() {
    let item = Zotero.Items.get(this._item.id);
    let path = await item.getFilePathAsync();
    // Check file size, otherwise we get uncatchable error:
    // JavaScript error: resource://gre/modules/osfile/osfile_native.jsm, line 60: RangeError: invalid array length
    // See more https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Invalid_array_length
    let fileSize = (await OS.File.stat(path)).size;
    if (fileSize > ARRAYBUFFER_MAX_LENGTH) {
      throw new Error(`The file "${path}" is too large`);
    }
    return {
      url: `zotero://attachment/${Zotero.API.getLibraryPrefix(item.libraryID)}/items/${item.key}/`,
      importedFromURL: this._item.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL ?
      this._item.getField('url') :
      undefined
    };
  }

  uninit() {
    if (this._prefObserverIDs) {
      this._prefObserverIDs.forEach((id) => Zotero.Prefs.unregisterObserver(id));
    }
    this._flushState();
    if (this._blockingObserver && this._iframe) {
      this._blockingObserver.unregister(this._iframe);
    }
  }

  get itemID() {
    return this._item.id;
  }

  async updateTitle() {
    this._title = await this._item.getTabTitle();
    this._setTitleValue(this._title);
  }

  async setAnnotations(items) {
    let annotations = [];
    for (let item of items) {
      let annotation = await this._getAnnotation(item);
      if (annotation) {
        annotations.push(annotation);
      }
    }
    if (annotations.length) {
      this._internalReader.setAnnotations(Components.utils.cloneInto(annotations, this._iframeWindow));
    }
  }

  unsetAnnotations(keys) {
    this._internalReader.unsetAnnotations(Components.utils.cloneInto(keys, this._iframeWindow));
  }

  async navigate(location) {
    this._internalReader.navigate(Components.utils.cloneInto(location, this._iframeWindow));
  }

  async enableAddToNote(enable) {
    await this._initPromise;
    this._internalReader.enableAddToNote(enable);
  }

  focusLastToolbarButton() {
    this._iframeWindow.focus();
    // this._postMessage({ action: 'focusLastToolbarButton' });
  }

  tabToolbar(_reverse) {
    // this._postMessage({ action: 'tabToolbar', reverse });
    // Avoid toolbar find button being focused for a short moment
    setTimeout(() => this._iframeWindow.focus());
  }

  focusFirst() {
    // this._postMessage({ action: 'focusFirst' });
    setTimeout(() => this._iframeWindow.focus());
  }

  async setContextPaneOpen(open) {
    await this._initPromise;
    this._internalReader.setContextPaneOpen(open);
  }

  async setBottomPlaceholderHeight(height) {
    await this._initPromise;
    this._internalReader.setBottomPlaceholderHeight(height);
  }

  async setToolbarPlaceholderWidth(width) {
    await this._initPromise;
    this._internalReader.setToolbarPlaceholderWidth(width);
  }

  promptToTransferAnnotations() {
    let ps = Services.prompt;
    let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
    ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
    let index = ps.confirmEx(
      null,
      Zotero.ftl.formatValueSync('reader-prompt-transfer-from-pdf-title'),
      Zotero.ftl.formatValueSync('reader-prompt-transfer-from-pdf-text', { target: Zotero.appName }),
      buttonFlags,
      Zotero.getString('general.continue'),
      null, null, null, {}
    );
    return !index;
  }

  _promptToDeletePages(num) {
    let ps = Services.prompt;
    let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
    ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
    let index = ps.confirmEx(
      null,
      Zotero.ftl.formatValueSync('reader-prompt-delete-pages-title'),
      Zotero.ftl.formatValueSync('reader-prompt-delete-pages-text', { count: num }),
      buttonFlags,
      Zotero.getString('general.continue'),
      null, null, null, {}
    );
    return !index;
  }

  async reload() {
    let data = await this._getData();
    this._internalReader.reload(Components.utils.cloneInto(data, this._iframeWindow));
  }

  async transferFromPDF() {
    if (this.promptToTransferAnnotations(true)) {
      try {
        await Zotero.PDFWorker.import(this._item.id, true, '', true);
      }
      catch (e) {
        if (e.name === 'PasswordException') {
          Zotero.alert(null, Zotero.getString('general.error'),
          Zotero.getString('reader-prompt-password-protected'));
        }
        throw e;
      }
    }
  }

  /**
   * @param {string} [path] For tests: used instead of getFilePathAsync()
   * @returns {Promise<void>}
   */
  async importFromEPUB(path = null) {
    let getKOReaderInput = async (path) => {
      // KOReader metadata is never embedded, so we just need to check
      // ./[basename-without-.epub].sdr/metadata.epub.lua
      if (path.endsWith('.epub')) {
        path = PathUtils.join(path.slice(0, -5) + '.sdr', 'metadata.epub.lua');
      } else
      if (!path.endsWith('.lua')) {
        return null;
      }
      if (!(await IOUtils.exists(path))) {
        return null;
      }
      return Cu.cloneInto(await IOUtils.read(path), this._iframeWindow);
    };

    let getCalibreInput = async (path) => {
      let externalPath = PathUtils.filename(path).endsWith('.opf') ?
      path :
      PathUtils.join(PathUtils.parent(path), 'metadata.opf');
      if (await IOUtils.exists(externalPath)) {
        return Zotero.File.getContentsAsync(externalPath);
      }
      if (!path.endsWith('.epub')) {
        return null;
      }

      let epubZip;
      try {
        epubZip = new ZipReader(Zotero.File.pathToFile(path));
      }
      catch (e) {
        Zotero.logError(e);
        return null;
      }

      try {
        const CALIBRE_BOOKMARKS_PATH = 'META-INF/calibre_bookmarks.txt';
        if (!epubZip.hasEntry(CALIBRE_BOOKMARKS_PATH)) {
          return null;
        }
        // Await before returning for the try-finally
        return await Zotero.File.getContentsAsync(epubZip.getInputStream(CALIBRE_BOOKMARKS_PATH));
      } finally
      {
        epubZip.close();
      }
    };

    let selectFile = async () => {
      let fp = new FilePicker();
      fp.init(this._window, Zotero.ftl.formatValueSync('reader-import-from-epub-prompt-title'), fp.modeOpen);
      fp.appendFilter('EPUB Data', '*.epub; *.lua; *.opf');
      if ((await fp.show()) !== fp.returnOK) {
        return null;
      }
      return fp.file;
    };

    path ??= await this._item.getFilePathAsync();
    let isOpenFile = true;
    if (!path) {
      path = await selectFile();
      isOpenFile = false;
    }
    while (path) {
      let koReaderInput;
      try {
        koReaderInput = await getKOReaderInput(path);
      }
      catch (e) {
        Zotero.logError(e);
      }

      let calibreInput;
      try {
        calibreInput = await getCalibreInput(path);
      }
      catch (e) {
        Zotero.logError(e);
      }

      let koReaderStats = koReaderInput && this._internalReader.getKOReaderAnnotationStats(koReaderInput);
      let calibreStats = calibreInput && this._internalReader.getCalibreAnnotationStats(calibreInput);
      let stats = koReaderStats || calibreStats || { count: 0 };

      if (stats.count) {
        let ps = Services.prompt;
        let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL +
        ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING;
        let index = ps.confirmEx(
          this._window,
          Zotero.ftl.formatValueSync('reader-import-from-epub-prompt-title'),
          Zotero.ftl.formatValueSync('reader-import-from-epub-prompt-text', {
            count: stats.count,
            lastModifiedRelative: Zotero.Date.toRelativeDate(stats.lastModified),
            tool: stats === koReaderStats ? 'KOReader' : 'Calibre'
          }),
          buttonFlags,
          Zotero.getString('general.import'),
          '',
          Zotero.ftl.formatValueSync('reader-import-from-epub-select-other'),
          '', {}
        );
        if (index === 0) {
          try {
            if (stats === koReaderStats) {
              this._internalReader.importAnnotationsFromKOReaderMetadata(koReaderInput);
            } else
            {
              this._internalReader.importAnnotationsFromCalibreMetadata(calibreInput);
            }
          }
          catch (e) {
            Zotero.alert(this._window, Zotero.getString('general.error'), e.message);
          }
          break;
        } else
        if (index === 1) {
          break;
        }
      } else
      {
        let ps = Services.prompt;
        let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;

        let message = isOpenFile ?
        Zotero.ftl.formatValueSync('reader-import-from-epub-no-annotations-current-file') :
        Zotero.ftl.formatValueSync('reader-import-from-epub-no-annotations-other-file', {
          filename: PathUtils.filename(path)
        });
        let index = ps.confirmEx(
          this._window,
          Zotero.ftl.formatValueSync('reader-import-from-epub-prompt-title'),
          message,
          buttonFlags,
          Zotero.ftl.formatValueSync('reader-import-from-epub-select-other'),
          '', '', '', {}
        );
        if (index === 1) {
          break;
        }
      }

      path = await selectFile();
      isOpenFile = false;
    }
  }

  export() {
    let zp = Zotero.getActiveZoteroPane();
    zp.exportPDF(this._item.id);
  }

  showInLibrary() {
    let win = Zotero.getMainWindow();
    if (win) {
      let item = Zotero.Items.get(this._item.id);
      let id = item.parentID || item.id;
      win.ZoteroPane.selectItems([id]);
      win.focus();
    }
  }

  async _setState(state) {
    let item = Zotero.Items.get(this._item.id);
    if (item) {
      if (this._type === 'pdf') {
        item.setAttachmentLastPageIndex(state.pageIndex);
      } else
      if (this._type === 'epub') {
        item.setAttachmentLastPageIndex(state.cfi);
      } else
      if (this._type === 'snapshot') {
        item.setAttachmentLastPageIndex(state.scrollYPercent);
      }
      let file = Zotero.Attachments.getStorageDirectory(item);
      if (!(await OS.File.exists(file.path))) {
        await Zotero.Attachments.createDirectoryForItem(item);
      }
      file.append(this.stateFileName);

      // Write the new state to disk
      let path = file.path;

      // State updates can be frequent (every scroll) and we need to debounce actually writing them to disk.
      // We flush the debounced write operation when Zotero shuts down or the window/tab is closed.
      if (this._pendingWriteStateTimeout) {
        clearTimeout(this._pendingWriteStateTimeout);
      }
      this._pendingWriteStateFunction = async () => {
        if (this._pendingWriteStateTimeout) {
          clearTimeout(this._pendingWriteStateTimeout);
        }
        this._pendingWriteStateFunction = null;
        this._pendingWriteStateTimeout = null;

        Zotero.debug('Writing reader state to ' + path);
        // Using atomic `writeJSON` instead of `putContentsAsync` to avoid using temp file that causes conflicts
        // on simultaneous writes (on slow systems)
        await IOUtils.writeJSON(path, state);
      };
      this._pendingWriteStateTimeout = setTimeout(this._pendingWriteStateFunction, 5000);
    }
  }

  async _flushState() {
    if (this._pendingWriteStateFunction) {
      await this._pendingWriteStateFunction();
    }
  }

  async _getState() {
    let state;
    let item = Zotero.Items.get(this._item.id);
    let directory = Zotero.Attachments.getStorageDirectory(item);
    let file = directory.clone();
    file.append(this.stateFileName);
    try {
      if (await OS.File.exists(file.path)) {
        state = JSON.parse(await Zotero.File.getContentsAsync(file.path));
      }
    }
    catch (e) {
      Zotero.logError(e);
    }
    // Try to fall back to the older .zotero-pdf-state file
    if (!state && this._type === 'pdf') {
      let file = directory.clone();
      file.append('.zotero-pdf-state');
      try {
        if (await OS.File.exists(file.path)) {
          state = JSON.parse(await Zotero.File.getContentsAsync(file.path));
        }
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    if (this._type === 'pdf') {
      let pageIndex = item.getAttachmentLastPageIndex();
      if (state) {
        if (Number.isInteger(pageIndex) && state.pageIndex !== pageIndex) {
          state.pageIndex = pageIndex;
          delete state.top;
          delete state.left;
        }
        return state;
      } else
      if (Number.isInteger(pageIndex)) {
        return { pageIndex };
      }
    } else
    if (this._type === 'epub') {
      let cfi = item.getAttachmentLastPageIndex();
      if (state) {
        state.cfi = cfi;
        return state;
      } else
      {
        return { cfi };
      }
    } else
    if (this._type === 'snapshot') {
      let scrollYPercent = item.getAttachmentLastPageIndex();
      if (state) {
        state.scrollYPercent = scrollYPercent;
        return state;
      } else
      {
        return { scrollYPercent };
      }
    }
    return null;
  }

  _isReadOnly() {
    let item = Zotero.Items.get(this._item.id);
    return !item.isEditable() ||
    item.deleted ||
    item.parentItem && item.parentItem.deleted;
  }

  _handleFontSizeChange = () => {
    this._internalReader.setFontSize(Zotero.Prefs.get('fontSize'));
  };

  _handleTabTitlePrefChange = async () => {
    await this.updateTitle();
  };

  _handleTextSelectionAnnotationModeChange = () => {
    this._internalReader.setTextSelectionAnnotationMode(Zotero.Prefs.get('reader.textSelectionAnnotationMode'));
  };

  _handleLightThemeChange = () => {
    this._internalReader.setLightTheme(Zotero.Prefs.get('reader.lightTheme'));
  };

  _handleDarkThemeChange = () => {
    this._internalReader.setDarkTheme(Zotero.Prefs.get('reader.darkTheme'));
  };

  _handleEbookPrefChange = () => {
    this._internalReader.setFontFamily(Zotero.Prefs.get('reader.ebookFontFamily'));
    this._internalReader.setHyphenate(Zotero.Prefs.get('reader.ebookHyphenate'));
  };

  _handleAutoDisableToolPrefChange = () => {
    this._internalReader.setAutoDisableNoteTool(Zotero.Prefs.get('reader.autoDisableTool.note'));
    this._internalReader.setAutoDisableTextTool(Zotero.Prefs.get('reader.autoDisableTool.text'));
    this._internalReader.setAutoDisableImageTool(Zotero.Prefs.get('reader.autoDisableTool.image'));
  };

  _dataURLtoBlob(dataurl) {
    let parts = dataurl.split(',');
    let mime = parts[0].match(/:(.*?);/)[1];
    if (parts[0].indexOf('base64') !== -1) {
      let bstr = atob(parts[1]);
      let n = bstr.length;
      let u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new this._iframeWindow.Blob([u8arr], { type: mime });
    }
    return undefined;
  }

  _getColorIcon(color, selected) {
    let stroke = selected ? '%23555' : 'transparent';
    let fill = '%23' + color.slice(1);
    return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><rect shape-rendering="geometricPrecision" fill="${fill}" stroke-width="2" x="2" y="2" stroke="${stroke}" width="12" height="12" rx="3"/></svg>`;
  }

  _openTagsPopup(item, x, y) {
    let tagsPopup = this._window.document.createXULElement('panel');
    tagsPopup.className = 'tags-popup';
    let tagsbox = this._window.document.createXULElement('tags-box');
    tagsPopup.appendChild(tagsbox);
    tagsbox.setAttribute('flex', '1');
    this._popupset.appendChild(tagsPopup);
    tagsbox.editable = true;
    tagsbox.item = item;
    tagsbox.render();
    // remove unnecessary tabstop from the section header
    tagsbox.querySelector(".head").removeAttribute("tabindex");

    // <panel> completely takes over Escape keydown event, by attaching a capturing keydown
    // listener to document which just closes the popup. It leads to unwanted edits being saved.
    // Attach our own listener to this._window.document to properly handle Escape on edited tags
    let handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      let focusedTag = tagsPopup.querySelector("editable-text.focused");
      if (focusedTag) {
        if (focusedTag.closest("[isNew]")) {
          // remove newly added tag
          focusedTag.closest(".row").remove();
        } else
        {
          // or reset to initial value if the tag is not new
          focusedTag.value = focusedTag.initialValue;
        }
      }
      // now that all tags values are reset, close the popup
      tagsPopup.hidePopup();
    };
    this._window.document.addEventListener("keydown", handleKeyDown, true);

    tagsPopup.addEventListener("popupshown", () => {
      // Ensure tagsbox is open
      tagsbox.open = true;
      if (tagsbox.count == 0) {
        tagsbox.newTag();
      } else
      {
        // Focus + button
        Services.focus.setFocus(tagsbox.querySelector("toolbarbutton"), Services.focus.FLAG_NOSHOWRING);
      }
      tagsbox.collapsible = false;
    });

    tagsPopup.addEventListener("popuphidden", (event) => {
      if (event.target !== tagsPopup) {
        return;
      }
      this._window.document.removeEventListener("keydown", handleKeyDown, true);
      tagsPopup.remove();
    });

    let rect = this._iframe.getBoundingClientRect();
    x += rect.left;
    y += rect.top;
    tagsPopup.openPopup(null, 'before_start', x, y, true);
  }

  async _openContextMenu({ x, y, itemGroups }) {
    let popup = this._window.document.createXULElement('menupopup');
    this._popupset.appendChild(popup);
    popup.addEventListener('popuphidden', function () {
      popup.remove();
    });
    let appendItems = (parentNode, itemGroups) => {
      for (let itemGroup of itemGroups) {
        for (let item of itemGroup) {
          if (item.groups) {
            let menu = parentNode.ownerDocument.createXULElement('menu');
            menu.setAttribute('label', item.label);
            let menupopup = parentNode.ownerDocument.createXULElement('menupopup');
            menu.append(menupopup);
            appendItems(menupopup, item.groups);
            parentNode.appendChild(menu);
          } else
          {
            let menuitem = parentNode.ownerDocument.createXULElement('menuitem');
            menuitem.setAttribute('label', item.label);
            menuitem.setAttribute('disabled', item.disabled);
            if (item.color) {
              menuitem.className = 'menuitem-iconic';
              menuitem.setAttribute('image', this._getColorIcon(item.color, item.checked));
            } else
            if (item.checked) {
              menuitem.setAttribute('type', 'checkbox');
              menuitem.setAttribute('checked', item.checked);
            }
            menuitem.addEventListener('command', () => item.onCommand());
            parentNode.appendChild(menuitem);
          }
        }
        if (itemGroups.indexOf(itemGroup) !== itemGroups.length - 1) {
          let separator = parentNode.ownerDocument.createXULElement('menuseparator');
          parentNode.appendChild(separator);
        }
      }
    };
    appendItems(popup, itemGroups);
    let rect = this._iframe.getBoundingClientRect();
    rect = this._window.windowUtils.toScreenRectInCSSUnits(rect.x + x, rect.y + y, 0, 0);
    setTimeout(() => popup.openPopupAtScreen(rect.x, rect.y, true));
  }

  _handleReaderTextboxContextMenuOpen = (event) => {
    this._window.goUpdateGlobalEditMenuItems(true);

    function isEditableTextBox(node) {
      return (
        node.nodeName === 'TEXTAREA' ||
        node.nodeName === 'INPUT' && node.type === 'text' && !node.disabled && !node.readOnly ||
        node.isContentEditable === true);

    }

    if (
    !event.target ||
    !((event.view === this._iframeWindow || this._type === 'pdf') &&
    isEditableTextBox(event.target)))
    {
      return;
    }

    let iframeWindow = event.target.ownerGlobal;

    this._window.MozXULElement.insertFTLIfNeeded("toolkit/global/textActions.ftl");
    this._window.MozXULElement.insertFTLIfNeeded("browser/menubar.ftl");

    let popup = this._window.document.createXULElement('menupopup');
    this._popupset.appendChild(popup);

    popup.addEventListener('popuphidden', (event) => {
      if (event.target !== popup) {
        return;
      }
      popup.remove();
    });

    popup.appendChild(
      this._window.MozXULElement.parseXULToFragment(`
			  <menuitem data-l10n-id="text-action-undo" command="cmd_undo" data-action="undo"></menuitem>
			  <menuitem data-l10n-id="text-action-redo" command="cmd_redo" data-action="redo"></menuitem>
			  <menuseparator></menuseparator>
			  <menuitem data-l10n-id="text-action-cut" command="cmd_cut" data-action="cut"></menuitem>
			  <menuitem data-l10n-id="text-action-copy" command="cmd_copy" data-action="copy"></menuitem>
			  <menuitem data-l10n-id="text-action-paste" command="cmd_paste" data-action="paste"></menuitem>
			  <menuitem data-l10n-id="text-action-delete" command="cmd_delete" data-action="delete"></menuitem>
			  <menuitem data-l10n-id="text-action-select-all" command="cmd_selectAll" data-action="selectAll"></menuitem>
			  <menuseparator></menuseparator>
			  <menuitem data-l10n-id="menu-edit-bidi-switch-text-direction" command="cmd_switchTextDirection" data-action="switchTextDirection"></menuitem>
			`)
    );

    let menuitemSwitchTextDirection = popup.querySelector("[command='cmd_switchTextDirection']");
    let showSwitchTextDirection = Services.prefs.getBoolPref("bidi.browser.ui", false);
    menuitemSwitchTextDirection.hidden = !showSwitchTextDirection;
    menuitemSwitchTextDirection.previousElementSibling.hidden = !showSwitchTextDirection;

    let selection = event.target.ownerGlobal.getSelection();
    if (!selection || !selection.anchorNode) {
      return;
    }
    let node = selection.anchorNode.nodeType === Node.ELEMENT_NODE ?
    selection.anchorNode :
    selection.anchorNode.parentElement;

    let insideContentEditable = node && node.closest('[contenteditable]') !== null;
    if (insideContentEditable) {
      let editingSession = iframeWindow.docShell.editingSession;
      let spellChecker = new InlineSpellChecker(
        editingSession.getEditorForWindow(iframeWindow)
      );

      // Separator
      var separator = popup.ownerDocument.createXULElement('menuseparator');
      popup.appendChild(separator);
      // Check Spelling
      var menuitem = popup.ownerDocument.createXULElement('menuitem');
      menuitem.setAttribute('data-l10n-id', 'text-action-spell-check-toggle');
      menuitem.setAttribute('checked', !!Zotero.Prefs.get('layout.spellcheckDefault', true));
      menuitem.setAttribute('type', 'checkbox');
      menuitem.addEventListener('command', () => {
        spellChecker.toggleEnabled();
        // Possible values: 0 - off, 1 - only multi-line, 2 - multi and single line input boxes
        Zotero.Prefs.set('layout.spellcheckDefault', !!Zotero.Prefs.get('layout.spellcheckDefault', true) ? 0 : 1, true);
      });
      popup.append(menuitem);

      if (spellChecker.enabled) {
        // Languages menu
        var menu = popup.ownerDocument.createXULElement('menu');
        menu.setAttribute('data-l10n-id', 'text-action-spell-dictionaries');
        popup.append(menu);
        // Languages menu popup
        var menupopup = popup.ownerDocument.createXULElement('menupopup');
        menu.append(menupopup);

        spellChecker.addDictionaryListToMenu(menupopup, null);

        // The menu is prepopulated with names from InlineSpellChecker::getDictionaryDisplayName(),
        // which will be in English, so swap in native locale names where we have them
        for (var menuitem of menupopup.children) {
          // 'spell-check-dictionary-en-US'
          let locale = menuitem.id.slice(23);
          let label = Zotero.Dictionaries.getBestDictionaryName(locale);
          if (label && label != locale) {
            menuitem.setAttribute('label', label);
          }
        }

        // Separator
        var separator = popup.ownerDocument.createXULElement('menuseparator');
        menupopup.appendChild(separator);
        // Add Dictionaries
        var menuitem = popup.ownerDocument.createXULElement('menuitem');
        menuitem.setAttribute('data-l10n-id', 'text-action-spell-add-dictionaries');
        menuitem.addEventListener('command', () => {
          Services.ww.openWindow(null, "chrome://zotero/content/dictionaryManager.xhtml",
          "dictionary-manager", "chrome,centerscreen", {});
        });
        menupopup.append(menuitem);

        let selection = iframeWindow.getSelection();
        if (selection) {
          spellChecker.initFromEvent(selection.anchorNode, selection.anchorOffset);
        }

        let firstElementChild = popup.firstElementChild;
        let showSeparator = false;
        let suggestionCount = spellChecker.addSuggestionsToMenuOnParent(popup, firstElementChild, 5);
        if (suggestionCount) {
          showSeparator = true;
        }

        if (spellChecker.overMisspelling) {
          let addToDictionary = popup.ownerDocument.createXULElement('menuitem');
          addToDictionary.setAttribute('data-l10n-id', 'text-action-spell-add-to-dictionary');
          addToDictionary.addEventListener('command', () => {
            spellChecker.addToDictionary();
          });
          popup.insertBefore(addToDictionary, firstElementChild);
          showSeparator = true;
        }
        if (spellChecker.canUndo()) {
          let undo = popup.ownerDocument.createXULElement('menuitem');
          undo.setAttribute('data-l10n-id', 'text-action-spell-undo-add-to-dictionary');
          undo.addEventListener('command', () => {
            spellChecker.undoAddToDictionary();
          });
          popup.insertBefore(undo, firstElementChild);
          showSeparator = true;
        }

        if (showSeparator) {
          let separator = popup.ownerDocument.createXULElement('menuseparator');
          popup.insertBefore(separator, firstElementChild);
        }
      }
    }
    popup.openPopupAtScreen(event.screenX, event.screenY, true);
  };

  _updateSecondViewState() {
    if (this.tabID) {
      let win = Zotero.getMainWindow();
      if (win) {
        win.Zotero_Tabs.setSecondViewState(this.tabID, this.getSecondViewState());
      }
    }
  }

  async _waitForReader() {
    if (this._isReaderInitialized) {
      return;
    }
    let n = 0;
    while (!this._iframeWindow) {
      if (n >= 1000) {
        throw new Error('Waiting for reader failed');
      }
      await Zotero.Promise.delay(10);
      n++;
    }
    this._isReaderInitialized = true;
  }

  /**
   * Return item JSON in the pdf-reader ready format
   *
   * @param {Zotero.Item} item
   * @returns {Object|null}
   */
  async _getAnnotation(item) {
    try {
      if (!item || !item.isAnnotation()) {
        return null;
      }
      let json = await Zotero.Annotations.toJSON(item);
      json.id = item.key;
      delete json.key;
      for (let key in json) {
        json[key] = json[key] || '';
      }
      json.tags = json.tags || [];
      return json;
    }
    catch (e) {
      Zotero.logError(e);
      return null;
    }
  }

  /**
   * 确保字符串是正确的UTF-8编码
   * @param {string} str - 输入字符串
   * @returns {string} 处理后的字符串
   */
  _ensureUTF8String(str) {
    if (!str || typeof str !== 'string') {
      return '';
    }

    try {
      // 尝试检测和修复编码问题
      // 如果字符串包含乱码，尝试重新编码
      const encoder = new TextEncoder();
      const decoder = new TextDecoder('utf-8', { fatal: false });

      // 编码为字节数组再解码，这可以修复一些编码问题
      const bytes = encoder.encode(str);
      const decoded = decoder.decode(bytes);

      return decoded;
    } catch (error) {
      // console.warn('[Reader] 字符编码处理失败:', error);
      return str; // 返回原始字符串
    }
  }

  /**
   * 生成注释的排序索引
   * @param {number} pageIndex - 页面索引
   * @param {number} y - Y坐标
   * @returns {string} 排序索引字符串
   */
  _generateSortIndex(pageIndex, y) {
    // 生成类似 "00001|00500|00000" 的排序索引
    // 格式: 页面索引|Y坐标(反向)|随机数
    const pageStr = String(pageIndex).padStart(5, '0');
    const yStr = String(Math.floor(1000 - y)).padStart(5, '0'); // 反向Y坐标，使顶部注释排在前面
    const randomStr = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
    return `${pageStr}|${yStr}|${randomStr}`;
  }
}

class ReaderTab extends ReaderInstance {
  constructor(options) {
    super(options);
    this._sidebarWidth = options.sidebarWidth;
    this._sidebarOpen = options.sidebarOpen;
    this._contextPaneOpen = options.contextPaneOpen;
    this._bottomPlaceholderHeight = options.bottomPlaceholderHeight;
    this._showContextPaneToggle = true;
    this._onToggleSidebarCallback = options.onToggleSidebar;
    this._onChangeSidebarWidthCallback = options.onChangeSidebarWidth;
    this._window = Services.wm.getMostRecentWindow('navigator:browser');
    let existingTabID = options.tabID;
    // If an unloaded tab for this item already exists, load the reader in it.
    // Otherwise, create a new tab
    if (existingTabID) {
      this.tabID = existingTabID;
      this._tabContainer = this._window.document.getElementById(existingTabID);
    } else
    {
      let { id, container } = this._window.Zotero_Tabs.add({
        id: options.tabID,
        type: 'reader',
        title: options.title || '',
        index: options.index,
        data: {
          itemID: this._item.id
        },
        select: !options.background,
        preventJumpback: options.preventJumpback
      });
      this.tabID = id;
      this._tabContainer = container;
    }

    this._iframe = this._window.document.createXULElement('browser');
    this._iframe.setAttribute('class', 'reader');
    this._iframe.setAttribute('flex', '1');
    this._iframe.setAttribute('type', 'content');
    this._iframe.setAttribute('transparent', 'true');
    this._iframe.setAttribute('src', 'resource://zotero/reader/reader.html');
    this._tabContainer.appendChild(this._iframe);
    this._iframe.docShell.windowDraggingAllowed = true;

    this._popupset = this._window.document.createXULElement('popupset');
    this._tabContainer.appendChild(this._popupset);

    this._window.addEventListener('DOMContentLoaded', this._handleLoad);
    this._window.addEventListener('pointerdown', this._handlePointerDown);
    this._window.addEventListener('pointerup', this._handlePointerUp);

    this._iframe.setAttribute('tooltip', 'html-tooltip');

    this._open({ location: options.location, secondViewState: options.secondViewState });
  }

  close() {
    this._window.removeEventListener('DOMContentLoaded', this._handleLoad);
    this._window.removeEventListener('pointerdown', this._handlePointerDown);
    this._window.removeEventListener('pointerup', this._handlePointerUp);
    if (this.tabID) {
      this._window.Zotero_Tabs.close(this.tabID);
    }
  }

  _handleLoad = (event) => {
    if (this._iframe && this._iframe.contentWindow && this._iframe.contentWindow.document === event.target) {
      this._window.removeEventListener('DOMContentLoaded', this._handleLoad);
      this._iframeWindow = this._iframe.contentWindow;
      this._iframeWindow.addEventListener('error', (event) => Zotero.logError(event.error));
      this._iframe.addEventListener('contextmenu', this._handleReaderTextboxContextMenuOpen);
    }
  };

  // We don't want to send fake pointerup event, if pointerdown and pointerup was in the same iframe
  _handlePointerDown = (event) => {
    if (this._window.Zotero_Tabs.selectedID === this.tabID &&
    event.target.closest('#outerContainer')) {
      this._pointerDownWindow = event.target.ownerDocument.defaultView;
    }
  };

  // This is a nonsense work-around to trigger mouseup and pointerup
  // events in PDF reader iframe when mouse up happens over another iframe
  // i.e. note-editor. There should be a better way to solve this
  _handlePointerUp = (event) => {
    try {
      var _window = event.target.ownerDocument.defaultView;
      if (this._window.Zotero_Tabs.selectedID === this.tabID
      // If the event isn't inside a reader PDF.js iframe, or isn't the same iframe (if using split view)
      && (!event.target.closest('#outerContainer') || this._pointerDownWindow !== _window) &&
      this._pointerDownWindow)
      {
        let evt = new this._internalReader._primaryView._iframeWindow.MouseEvent('mouseup', { ...event, bubbles: false });
        this._internalReader._primaryView._iframeWindow.dispatchEvent(evt);
        this._internalReader._secondaryView?._iframeWindow.dispatchEvent(evt);
        if (evt.defaultPrevented) {
          event.preventDefault();
          return;
        }
        if (evt.clickEventPrevented && evt.clickEventPrevented()) {
          event.preventClickEvent();
        }
        evt = new this._internalReader._primaryView._iframeWindow.PointerEvent('pointerup', { ...event, bubbles: false });
        this._internalReader._primaryView._iframeWindow.dispatchEvent(evt);
        this._internalReader._secondaryView?._iframeWindow.dispatchEvent(evt);
        if (evt.defaultPrevented) {
          event.preventDefault();
        }
      }
      this._pointerDownWindow = null;
    }
    catch (e) {
      if (!e.message.includes("can't access dead object")) {
        Zotero.logError(e);
      }
    }
  };

  _setTitleValue() {}

  _addToNote(annotations) {
    annotations = annotations.map((x) => ({ ...x, attachmentItemID: this._item.id }));
    if (!this._window.ZoteroContextPane) {
      return;
    }
    let noteEditor = this._window.ZoteroContextPane.activeEditor;
    if (!noteEditor) {
      return;
    }
    let editorInstance = noteEditor.getCurrentInstance();
    if (editorInstance) {
      editorInstance.focus();
      editorInstance.insertAnnotations(annotations);
    }
  }
}


class ReaderWindow extends ReaderInstance {
  constructor(options) {
    super(options);
    this._sidebarWidth = options.sidebarWidth;
    this._sidebarOpen = options.sidebarOpen;
    this._contextPaneOpen = true;
    this._bottomPlaceholderHeight = 0;
    this._onClose = options.onClose;

    let win = Services.wm.getMostRecentWindow('navigator:browser');
    if (!win) return;

    this._window = win.open(
      'chrome://zotero/content/reader.xhtml', '', 'chrome,resizable'
    );

    this._window.addEventListener('DOMContentLoaded', (event) => {
      if (event.target === this._window.document) {
        this._popupset = this._window.document.getElementById('zotero-reader-popupset');
        this._window.onFileMenuOpen = this._onFileMenuOpen.bind(this);
        this._window.onEditMenuOpen = this._onEditMenuOpen.bind(this);
        this._window.onGoMenuOpen = this._onGoMenuOpen.bind(this);
        this._window.onViewMenuOpen = this._onViewMenuOpen.bind(this);
        this._window.onWindowMenuOpen = this._onWindowMenuOpen.bind(this);
        this._window.reader = this;
        this._iframe = this._window.document.getElementById('reader');
        this._iframe.docShell.windowDraggingAllowed = true;
      }

      if (this._iframe.contentWindow && this._iframe.contentWindow.document === event.target) {
        this._iframeWindow = this._window.document.getElementById('reader').contentWindow;
        this._iframeWindow.addEventListener('error', (event) => Zotero.logError(event.error));
        this._iframe.addEventListener('contextmenu', this._handleReaderTextboxContextMenuOpen);
      }

      this._switchReaderSubtype(this._type);
    });

    this._open({ state: options.state, location: options.location, secondViewState: options.secondViewState });
  }

  _switchReaderSubtype(subtype) {
    // Do the same as in standalone.js
    this._window.document.querySelectorAll(
      '.menu-type-reader.pdf, .menu-type-reader.epub, .menu-type-reader.snapshot'
    ).forEach((el) => el.hidden = true);
    this._window.document.querySelectorAll('.menu-type-reader.' + subtype).forEach((el) => el.hidden = false);
  }

  close() {
    this.uninit();
    this._window.close();
    this._onClose();
  }

  _setTitleValue(title) {
    // Tab titles render Citeproc.js markup. There's no good way
    // to show rich text in a window title, but we can at least
    // strip the markup.
    this._window.document.title = Zotero.Utilities.Internal.renderItemTitle(title);
  }

  _onFileMenuOpen(event, popup) {
    if (event.target !== popup) {
      return;
    }
    let item = Zotero.Items.get(this._item.id);
    let library = Zotero.Libraries.get(item.libraryID);

    let transferFromPDFMenuitem = this._window.document.getElementById('menu_transferFromPDF');
    let importFromEPUBMenuitem = this._window.document.getElementById('menu_importFromEPUB');

    if (item &&
    library.filesEditable &&
    library.editable &&
    !(item.deleted || item.parentItem && item.parentItem.deleted)) {
      let annotations = item.getAnnotations();
      let canTransferFromPDF = annotations.find((x) => x.annotationIsExternal);
      transferFromPDFMenuitem.setAttribute('disabled', !canTransferFromPDF);
      importFromEPUBMenuitem.setAttribute('disabled', false);
    } else
    {
      transferFromPDFMenuitem.setAttribute('disabled', true);
      importFromEPUBMenuitem.setAttribute('disabled', true);
    }

    this.onUpdateCustomMenus(event, 'file', popup);
  }

  _onEditMenuOpen(event, popup) {
    if (event.target !== popup) {
      return;
    }
    this._window.goUpdateGlobalEditMenuItems(true);

    this.onUpdateCustomMenus(event, 'edit', popup);
  }

  _onViewMenuOpen(event, popup) {
    if (event.target !== popup) {
      return;
    }
    if (this._type === 'pdf' || this._type === 'epub') {
      this._window.document.getElementById('view-menuitem-no-spreads').setAttribute('checked', this._internalReader.spreadMode === 0);
      this._window.document.getElementById('view-menuitem-odd-spreads').setAttribute('checked', this._internalReader.spreadMode === 1);
      this._window.document.getElementById('view-menuitem-even-spreads').setAttribute('checked', this._internalReader.spreadMode === 2);
    }
    if (this._type === 'pdf') {
      this._window.document.getElementById('view-menuitem-vertical-scrolling').setAttribute('checked', this._internalReader.scrollMode === 0);
      this._window.document.getElementById('view-menuitem-horizontal-scrolling').setAttribute('checked', this._internalReader.scrollMode === 1);
      this._window.document.getElementById('view-menuitem-wrapped-scrolling').setAttribute('checked', this._internalReader.scrollMode === 2);
      this._window.document.getElementById('view-menuitem-hand-tool').setAttribute('checked', this._internalReader.toolType === 'hand');
      this._window.document.getElementById('view-menuitem-zoom-auto').setAttribute('checked', this._internalReader.zoomAutoEnabled);
      this._window.document.getElementById('view-menuitem-zoom-page-width').setAttribute('checked', this._internalReader.zoomPageWidthEnabled);
      this._window.document.getElementById('view-menuitem-zoom-page-height').setAttribute('checked', this._internalReader.zoomPageHeightEnabled);
    } else
    if (this._type === 'epub') {
      this._window.document.getElementById('view-menuitem-scrolled').setAttribute('checked', this._internalReader.flowMode === 'scrolled');
      this._window.document.getElementById('view-menuitem-paginated').setAttribute('checked', this._internalReader.flowMode === 'paginated');
    }
    this._window.document.getElementById('view-menuitem-split-vertically').setAttribute('checked', this._internalReader.splitType === 'vertical');
    this._window.document.getElementById('view-menuitem-split-horizontally').setAttribute('checked', this._internalReader.splitType === 'horizontal');

    this.onUpdateCustomMenus(event, 'view', popup);
  }

  _onGoMenuOpen(event, popup) {
    if (event.target !== popup) {
      return;
    }
    let keyBack = this._window.document.getElementById('key_back');
    let keyForward = this._window.document.getElementById('key_forward');

    if (Zotero.isMac) {
      keyBack.setAttribute('key', '[');
      keyBack.setAttribute('modifiers', 'meta');
      keyForward.setAttribute('key', ']');
      keyForward.setAttribute('modifiers', 'meta');
    } else
    {
      keyBack.setAttribute('keycode', 'VK_LEFT');
      keyBack.setAttribute('modifiers', 'alt');
      keyForward.setAttribute('keycode', 'VK_RIGHT');
      keyForward.setAttribute('modifiers', 'alt');
    }

    let menuItemBack = this._window.document.getElementById('go-menuitem-back');
    let menuItemForward = this._window.document.getElementById('go-menuitem-forward');
    menuItemBack.setAttribute('key', 'key_back');
    menuItemForward.setAttribute('key', 'key_forward');

    if (['pdf', 'epub'].includes(this._type)) {
      this._window.document.getElementById('go-menuitem-first-page').setAttribute('disabled', !this._internalReader.canNavigateToFirstPage);
      this._window.document.getElementById('go-menuitem-last-page').setAttribute('disabled', !this._internalReader.canNavigateToLastPage);
    }
    this._window.document.getElementById('go-menuitem-back').setAttribute('disabled', !this._internalReader.canNavigateBack);
    this._window.document.getElementById('go-menuitem-forward').setAttribute('disabled', !this._internalReader.canNavigateForward);

    this.onUpdateCustomMenus(event, 'go', popup);
  }

  _onWindowMenuOpen(event, popup) {
    if (event.target !== popup) {
      return;
    }

    this.onUpdateCustomMenus(event, 'window', popup);
  }

  onUpdateCustomMenus = function (event, type, popup) {
    let tabType = "reader";
    let tabSubType = this._type;
    Zotero.MenuManager.updateMenuPopup(popup, `reader/menubar/${type}`, {
      event,
      tabType,
      tabSubType,
      tabID: undefined,
      getContext: () => ({
        items: this._item ? [this._item] : [],
        tabType,
        tabSubType
      })
    });
  };
}


class ReaderPreview extends ReaderInstance {
  // TODO: implement these inside reader after redesign is done there
  static CSS = {
    global: `
		#split-view, .split-view {
			top: 0 !important;
			inset-inline-start: 0 !important;
		}
		#reader-ui {
			display: none !important;
		}`,
    pdf: `
		#mainContainer {
			/* Hide left-side vertical line */
			margin-inline-start: -1px;
		}
		#viewerContainer {
			overflow: hidden;
		}
		.pdfViewer {
			padding: 6px 0px;
		}
		.pdfViewer .page {
			border-radius: 5px;
			box-shadow: none;
		}
		.pdfViewer .page::before {
			content: "";
			position: absolute;
			height: 100%;
			width: 100%;
			border-radius: 5px;
		}
		@media (prefers-color-scheme: light) {
			body #viewerContainer {
				background-color: #f2f2f2 !important;
			}
			.pdfViewer .page::before {
				box-shadow: inset 0 0 0px 1px #0000001a;
			}
		}
		@media (prefers-color-scheme: dark) {
			body #viewerContainer {
				background-color: #303030 !important;
			}
			.pdfViewer .page::before {
				box-shadow: inset 0 0 0px 1px #ffffff1f;
			}
		}`,
    epub: `
		body.flow-mode-paginated {
			margin: 8px !important;
		}
		body.flow-mode-paginated > .sections {
			min-height: calc(100vh - 16px);
			max-height: calc(100vh - 16px);
		}
		body.flow-mode-paginated > .sections.spread-mode-odd {
			column-width: calc(50vw - 16px);
		}
		body.flow-mode-paginated replaced-body img, body.flow-mode-paginated replaced-body svg,
		body.flow-mode-paginated replaced-body audio, body.flow-mode-paginated replaced-body video {
			max-width: calc(50vw - 16px) !important;
			max-height: calc(100vh - 16px) !important;
		}
		body.flow-mode-paginated replaced-body .table-like {
			max-height: calc(100vh - 16px);
		}
		`,
    snapshot: `
		html {
			pointer-events: none !important;
			user-select: none !important;
			min-width: 1024px;
			transform: scale(var(--win-scale));
			transform-origin: 0 0;
			overflow-x: hidden;
		}
		
		body {
			overflow-y: visible;
		}`
  };

  constructor(options) {
    super(options);
    this._iframe = options.iframe;
    this._iframeWindow = this._iframe.contentWindow;
    this._iframeWindow.addEventListener('error', (event) => Zotero.logError(event.error));
  }

  async _open({ state, location, secondViewState }) {
    let success;
    try {
      success = await super._open({ state, location, secondViewState, preview: true });

      this._injectCSS(this._iframeWindow.document, ReaderPreview.CSS.global);

      let ready = await this._waitForInternalReader();
      if (!ready) {
        return false;
      }

      let win = this._internalReader._primaryView._iframeWindow;
      if (this._type === "snapshot") {
        win.addEventListener(
          "resize", this.updateSnapshotAttr);
        this.updateSnapshotAttr();
      } else
      if (this._type === "pdf") {
        let viewer = win?.PDFViewerApplication?.pdfViewer;
        let t = 0;
        while (!viewer?.firstPagePromise && t < 100) {
          t++;
          await Zotero.Promise.delay(10);
          viewer = win?.PDFViewerApplication?.pdfViewer;
        }
        await viewer?.firstPagePromise;
        win.addEventListener("resize", this.updatePDFAttr);
        this.updatePDFAttr();
      } else
      if (this._type === "epub") {
        this.updateEPUBAttr();
      }

      this._injectCSS(
        win.document,
        ReaderPreview.CSS[this._type]
      );

      return success;
    }
    catch (e) {
      Zotero.warn(`Failed to load preview for attachment ${this._item?.libraryID}/${this._item?.key}: ${String(e)}`);
      this._item = null;
      return false;
    }
  }

  uninit() {
    if (this._type === "snapshot") {
      this._internalReader?._primaryView?._iframeWindow.removeEventListener(
        "resize", this.updateSnapshotAttr);
    } else
    if (this._type === "pdf") {
      this._internalReader?._primaryView?._iframeWindow.removeEventListener(
        "resize", this.updatePDFAttr);
    }
    super.uninit();
  }

  /**
   * Goto previous/next page
   * @param {"prev" | "next"} type goto previous or next page
   * @returns {void}
   */
  goto(type) {
    if (type === "prev") {
      this._internalReader.navigateToPreviousPage();
    } else
    {
      this._internalReader.navigateToNextPage();
    }
  }

  /**
   * Check if can goto previous/next page
   * @param {"prev" | "next"} type goto previous or next page
   * @returns {boolean}
   */
  canGoto(type) {
    if (type === "prev") {
      return this._internalReader?._state?.primaryViewStats?.canNavigateToPreviousPage;
    } else
    {
      return this._internalReader?._state?.primaryViewStats?.canNavigateToNextPage;
    }
  }

  _isReadOnly() {
    return true;
  }

  async _getState() {
    if (this._type === "pdf") {
      return { pageIndex: 0, scale: "page-height", scrollMode: 0, spreadMode: 0 };
    } else
    if (this._type === "epub") {
      return Object.assign(await super._getState(), {
        scale: 1,
        flowMode: "paginated",
        spreadMode: 0
      });
    } else
    if (this._type === "snapshot") {
      return { scale: 1, scrollYPercent: 0 };
    }
    return super._getState();
  }

  async _setState() {}

  updateTitle() {}

  _injectCSS(doc, content) {
    if (!content) {
      return;
    }
    let style = doc.createElement("style");
    style.textContent = content;
    doc.head.appendChild(style);
  }

  updateSnapshotAttr = () => {
    let win = this._internalReader?._primaryView?._iframeWindow;
    let root = win?.document?.documentElement;
    root?.style.setProperty('--win-scale', String(this._iframe.getBoundingClientRect().width / 1024));
  };

  updateEPUBAttr() {
    let view = this._internalReader?._primaryView;
    let currentSize = parseFloat(
      view._iframeWindow?.getComputedStyle(view?._iframeDocument?.documentElement).fontSize);
    let scale = 12 / currentSize;
    view?._setScale(scale);
  }

  updatePDFAttr = () => {
    this._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer.currentScaleValue = 'page-height';
    this._internalReader._primaryView._iframeWindow.PDFViewerApplication.pdfViewer.scrollMode = 3;
  };

  getPageWidthHeightRatio() {
    if (this._type !== 'pdf') {
      return NaN;
    }
    try {
      let viewport = this._internalReader?._primaryView?._iframeWindow?.
      PDFViewerApplication?.pdfViewer._pages[0].viewport;
      return viewport?.width / viewport?.height;
    }
    catch (e) {
      return NaN;
    }
  }

  async _waitForInternalReader() {
    let n = 0;
    try {
      while (!this._internalReader?._primaryView?._iframeWindow) {
        if (n >= 500) {
          return false;
        }
        await Zotero.Promise.delay(10);
        n++;
      }
      await this._internalReader._primaryView.initializedPromise;
      return true;
    }
    catch (e) {
      return false;
    }
  }
}


class Reader {
  constructor() {
    this._sidebarWidth = 240;
    this._sidebarOpen = false;
    this._contextPaneOpen = true;
    this._bottomPlaceholderHeight = 0;
    this._readers = [];
    this._notifierID = Zotero.Notifier.registerObserver(this, ['item', 'setting', 'tab'], 'reader');
    this._registeredListeners = [];
    this.onChangeSidebarWidth = null;
    this.onToggleSidebar = null;

    this._debounceSidebarWidthUpdate = Zotero.Utilities.debounce(() => {
      let readers = this._readers.filter((r) => r instanceof ReaderTab);
      for (let reader of readers) {
        reader.setSidebarWidth(this._sidebarWidth);
      }
      this._setSidebarState();
    }, 500);

    Zotero.Plugins.addObserver({
      shutdown: ({ id: pluginID }) => {
        this._unregisterEventListenerByPluginID(pluginID);
      }
    });
  }

  _dispatchEvent(event) {
    for (let listener of this._registeredListeners) {
      if (listener.type === event.type) {
        listener.handler(event);
      }
    }
  }

  /**
   * Inject DOM nodes to reader UI parts:
   * - renderTextSelectionPopup
   * - renderSidebarAnnotationHeader
   * - renderToolbar
   *
   * Zotero.Reader.registerEventListener('renderTextSelectionPopup', (event) => {
   * 	let { reader, doc, params, append } = event;
   * 	let container = doc.createElement('div');
   * 	container.append('Loading…');
   * 	append(container);
   * 	setTimeout(() => container.replaceChildren('Translated text: ' + params.annotation.text), 1000);
   * });
   *
   *
   * Add options to context menus:
   * - createColorContextMenu
   * - createViewContextMenu
   * - createAnnotationContextMenu
   * - createThumbnailContextMenu
   * - createSelectorContextMenu
   *
   * Zotero.Reader.registerEventListener('createAnnotationContextMenu', (event) => {
   * 	let { reader, params, append } = event;
   * 	append({
   * 		label: 'Test',
   * 		onCommand(){ reader._iframeWindow.alert('Selected annotations: ' + params.ids.join(', ')); }
   * 	});
   * });
   */
  registerEventListener(type, handler, pluginID = undefined) {
    this._registeredListeners.push({ pluginID, type, handler });
  }

  unregisterEventListener(type, handler) {
    this._registeredListeners = this._registeredListeners.filter((x) => x.type === type && x.handler === handler);
  }

  _unregisterEventListenerByPluginID(pluginID) {
    this._registeredListeners = this._registeredListeners.filter((x) => x.pluginID !== pluginID);
  }

  getSidebarWidth() {
    return this._sidebarWidth;
  }

  async init() {
    await Zotero.uiReadyPromise;
    Zotero.Session.state.windows.
    filter((x) => x.type == 'reader' && Zotero.Items.exists(x.itemID)).
    forEach((x) => this.open(x.itemID, null, { title: x.title, openInWindow: true, secondViewState: x.secondViewState }));
  }

  _loadSidebarState() {
    let win = Zotero.getMainWindow();
    if (win) {
      let pane = win.document.getElementById('zotero-reader-sidebar-pane');
      this._sidebarOpen = pane.getAttribute('collapsed') == 'false';
      let width = pane.getAttribute('width');
      if (width) {
        this._sidebarWidth = parseInt(width);
      }
    }
  }

  _setSidebarState() {
    let win = Zotero.getMainWindow();
    if (win) {
      let pane = win.document.getElementById('zotero-reader-sidebar-pane');
      pane.setAttribute('collapsed', this._sidebarOpen ? 'false' : 'true');
      pane.setAttribute('width', this._sidebarWidth);
    }
  }

  getSidebarOpen() {
    return this._sidebarOpen;
  }

  setSidebarWidth(width) {
    this._sidebarWidth = width;
    let readers = this._readers.filter((r) => r instanceof ReaderTab);
    for (let reader of readers) {
      reader.setSidebarWidth(width);
    }
    this._setSidebarState();
  }

  toggleSidebar(open) {
    this._sidebarOpen = open;
    let readers = this._readers.filter((r) => r instanceof ReaderTab);
    for (let reader of readers) {
      reader.toggleSidebar(open);
    }
    this._setSidebarState();
  }

  setContextPaneOpen(open) {
    this._contextPaneOpen = open;
    let readers = this._readers.filter((r) => r instanceof ReaderTab);
    for (let reader of readers) {
      reader.setContextPaneOpen(open);
    }
  }

  setBottomPlaceholderHeight(height) {
    this._bottomPlaceholderHeight = height;
    let readers = this._readers.filter((r) => r instanceof ReaderTab);
    for (let reader of readers) {
      reader.setBottomPlaceholderHeight(height);
    }
  }

  notify(event, type, ids, extraData) {
    if (type === 'tab') {
      if (event === 'close') {
        for (let id of ids) {
          let reader = Zotero.Reader.getByTabID(id);
          if (reader) {
            reader.uninit();
            this._readers.splice(this._readers.indexOf(reader), 1);
          }
        }
      } else
      if (event === 'select') {
        for (let reader of this._readers) {
          if (reader instanceof ReaderTab) {
            reader._iframe.docShellIsActive = false;
          }
        }

        let reader = Zotero.Reader.getByTabID(ids[0]);
        if (reader) {
          reader._iframe.docShellIsActive = true;
          this.triggerAnnotationsImportCheck(reader.itemID);
        }
      }

      if (event === 'add' || event === 'close') {
        Zotero.Session.debounceSave();
      }
    }
    // Listen for parent item, PDF attachment and its annotations updates
    else if (type === 'item') {
      for (let reader of this._readers.slice()) {
        if (event === 'delete' && ids.includes(reader.itemID)) {
          reader.close();
        }

        // Ignore other notifications if the attachment no longer exists
        let item = Zotero.Items.get(reader.itemID);
        if (item) {
          if (event === 'trash' && (ids.includes(item.id) || ids.includes(item.parentItemID))) {
            reader.close();
          } else
          if (event === 'delete') {
            let disappearedIDs = reader.annotationItemIDs.filter((x) => ids.includes(x));
            if (disappearedIDs.length) {
              let keys = disappearedIDs.map((id) => extraData[id].key);
              reader.unsetAnnotations(keys);
            }
          } else
          {
            if (['add', 'modify'].includes(event)) {
              let annotationItems = item.getAnnotations();
              reader.annotationItemIDs = annotationItems.map((x) => x.id);
              let affectedAnnotations = annotationItems.filter(({ id }) =>
              ids.includes(id) &&
              !(extraData && extraData[id] && extraData[id].instanceID === reader._instanceID)
              );
              if (affectedAnnotations.length) {
                reader.setAnnotations(affectedAnnotations);
              }
            }
            // Update title if the PDF attachment or the parent item changes
            if (ids.includes(reader.itemID) || ids.includes(item.parentItemID)) {
              reader.updateTitle();
            }
          }
        }
      }
    } else
    if (type === 'setting') {
      let id = ids[0];
      if (id === `${Zotero.Libraries.userLibraryID}/readerCustomThemes`) {
        let newCustomThemes = Zotero.SyncedSettings.get(Zotero.Libraries.userLibraryID, 'readerCustomThemes') ?? [];
        this._readers.forEach((reader) => {
          reader._internalReader.setCustomThemes(
            Components.utils.cloneInto(newCustomThemes, reader._iframeWindow)
          );
        });
      }
    }
  }

  getByTabID(tabID) {
    return this._readers.find((r) => r instanceof ReaderTab && r.tabID === tabID);
  }

  getWindowStates() {
    return this._readers.
    filter((r) => r instanceof ReaderWindow).
    map((r) => ({
      type: 'reader',
      itemID: r.itemID,
      title: r._title,
      secondViewState: r.getSecondViewState()
    }));
  }

  async openURI(itemURI, location, options) {
    let item = await Zotero.URI.getURIItem(itemURI);
    if (!item) return;
    await this.open(item.id, location, options);
  }

  /**
   * 打开一个阅读器实例
   * @param {number} itemID - 要打开的条目ID
   * @param {string} location - 打开位置
   * @param {Object} options - 配置选项
   */
  async open(itemID, location, { title, tabIndex, tabID, openInBackground, openInWindow, allowDuplicate, secondViewState, preventJumpback } = {}) {
    // 获取库ID和库实例
    let { libraryID } = Zotero.Items.getLibraryAndKeyFromID(itemID);
    let library = Zotero.Libraries.get(libraryID);
    let win = Zotero.getMainWindow();

    // 等待库数据加载完成
    await library.waitForDataLoad('item');

    // 获取条目对象
    let item = Zotero.Items.get(itemID);
    if (!item) {
      throw new Error('Item does not exist');
    }

    // 加载侧边栏状态并检查注释导入
    this._loadSidebarState();
    this.triggerAnnotationsImportCheck(itemID);
    let reader;

    // If duplicating is not allowed, and no reader instance is loaded for itemID,
    // try to find an unloaded tab and select it. Zotero.Reader.open will then be called again
    if (!allowDuplicate && !this._readers.find((r) => r.itemID === itemID)) {
      if (win) {
        let existingTabID = win.Zotero_Tabs.getTabIDByItemID(itemID);
        if (existingTabID) {
          win.Zotero_Tabs.select(existingTabID, false, { location });
          return undefined;
        }
      }
    }

    // 查找现有的阅读器实例
    if (openInWindow) {
      reader = this._readers.find((r) => r.itemID === itemID && r instanceof ReaderWindow);
    } else
    if (!allowDuplicate) {
      reader = this._readers.find((r) => r.itemID === itemID);
    }

    // 如果找到现有实例，则使用它
    if (reader) {
      if (reader instanceof ReaderTab) {
        reader._window.Zotero_Tabs.select(reader.tabID, true);
      }

      if (location) {
        reader.navigate(location);
      }
    }
    // 如果需要在新窗口中打开
    else if (openInWindow) {
      reader = new ReaderWindow({
        item,
        location,
        secondViewState,
        sidebarWidth: this._sidebarWidth,
        sidebarOpen: this._sidebarOpen,
        bottomPlaceholderHeight: this._bottomPlaceholderHeight,
        onClose: () => {
          this._readers.splice(this._readers.indexOf(reader), 1);
          Zotero.Session.debounceSave();
        }
      });
      this._readers.push(reader);
      Zotero.Session.debounceSave();
    }
    // 在标签页中打开
    else {
      reader = new ReaderTab({
        item,
        location,
        secondViewState,
        title,
        index: tabIndex,
        tabID,
        background: openInBackground,
        sidebarWidth: this._sidebarWidth,
        sidebarOpen: this._sidebarOpen,
        contextPaneOpen: this._contextPaneOpen,
        bottomPlaceholderHeight: this._bottomPlaceholderHeight,
        preventJumpback: preventJumpback,
        onToggleSidebar: (open) => {
          this._sidebarOpen = open;
          this.toggleSidebar(open);
          if (this.onToggleSidebar) {
            this.onToggleSidebar(open);
          }
        },
        onChangeSidebarWidth: (width) => {
          this._sidebarWidth = width;
          this._debounceSidebarWidthUpdate();
          if (this.onChangeSidebarWidth) {
            this.onChangeSidebarWidth(width);
          }
        }
      });
      this._readers.push(reader);
      // Change tab's type from "reader-unloaded" to "reader" after reader loaded
      win.Zotero_Tabs.markAsLoaded(tabID);
    }

    // 设置焦点
    if (!openInBackground &&
    !win.Zotero_Tabs.focusOptions.keepTabFocused) {
      // Do not change focus when tabs are traversed/selected using a keyboard
      reader.focus();
    }
    return reader;
  }

  /**
   * 打开预览模式的阅读器
   * @param {number} itemID - 要预览的条目ID 
   * @param {HTMLIFrameElement} iframe - 用于显示预览的iframe元素
   */
  async openPreview(itemID, iframe) {
    // 获取库ID和库实例
    let { libraryID } = Zotero.Items.getLibraryAndKeyFromID(itemID);
    let library = Zotero.Libraries.get(libraryID);
    await library.waitForDataLoad('item');

    // 获取条目对象
    let item = Zotero.Items.get(itemID);
    if (!item) {
      throw new Error('Item does not exist');
    }

    // 创建预览阅读器实例
    let reader = new ReaderPreview({
      item,
      sidebarWidth: 0,
      sidebarOpen: false,
      bottomPlaceholderHeight: 0,
      iframe
    });
    return reader;
  }

  /**
   * Trigger annotations import
   *
   * @param {Integer} itemID Attachment item id
   * @returns {Promise}
   */
  async triggerAnnotationsImportCheck(itemID) {
    let item = await Zotero.Items.getAsync(itemID);
    if (!item.isPDFAttachment() ||
    !item.isEditable() ||
    item.deleted ||
    item.parentItem && item.parentItem.deleted)
    {
      return;
    }
    let mtime = await item.attachmentModificationTime;
    if (item.attachmentLastProcessedModificationTime < Math.floor(mtime / 1000)) {
      await Zotero.PDFWorker.import(itemID, true);
    }
  }

  async flushAllReaderStates() {
    for (let reader of this._readers) {
      try {
        await reader._flushState();
      }
      catch (e) {
        Zotero.logError(e);
      }
    }
  }
}

Zotero.Reader = new Reader();
Zotero.addShutdownListener(() => Zotero.Reader.flushAllReaderStates());

/**
 * VibeCard API - 用于 AI Chat 获取 VibeCard 内容和论文 Markdown
 */
Zotero.VibeCard = {
  /**
   * 根据 VibeCard ID 获取内容
   * @param {string} vibeCardId - VibeCard ID，格式：vibecard_pageIndex_paragraphIndex
   * @param {number} itemID - 可选的 itemID，用于直接定位 Reader
   * @returns {Promise<string>} - VibeCard 的文本内容
   */
  getContent: async function (vibeCardId, itemID = null) {
    try {
      // 解析 vibeCardId: vibecard_pageIndex_paragraphIndex
      const match = vibeCardId.match(/vibecard_(\d+)_(\d+)/);
      if (!match) {
        Zotero.debug(`[VibeCard] Invalid vibeCardId format: ${vibeCardId}`);
        return null;
      }

      const pageIndex = parseInt(match[1]);
      const paragraphIndex = parseInt(match[2]);

      let targetReader = null;

      // 优先通过 itemID 查找对应的 Reader
      if (itemID) {
        Zotero.debug(`[VibeCard] Searching for reader with itemID: ${itemID}`);
        targetReader = Zotero.Reader._readers.find((r) => r._item && r._item.id === itemID);
        if (targetReader) {
          Zotero.debug(`[VibeCard] Found reader by itemID: ${itemID}`);
        }
      }

      // 如果没有通过 itemID 找到，则遍历所有 reader
      if (!targetReader) {
        Zotero.debug(`[VibeCard] Searching all readers for ${vibeCardId}`);
        for (let reader of Zotero.Reader._readers) {
          if (reader._summaryManager) {
            const hierarchicalData = reader._summaryManager.getHierarchicalData();
            const pageData = hierarchicalData.find((p) => p.pageIndex === pageIndex);
            if (pageData) {
              const paragraphData = pageData.paragraphs.find((p) => p.paragraphIndex === paragraphIndex);
              if (paragraphData) {
                targetReader = reader;
                break;
              }
            }
          }
        }
      }

      if (!targetReader) {
        Zotero.debug(`[VibeCard] No reader found containing ${vibeCardId}`);
        return null;
      }

      // 获取 SummaryManager
      const summaryManager = targetReader._summaryManager;
      if (!summaryManager) {
        Zotero.debug(`[VibeCard] No summaryManager found`);
        return null;
      }

      // 从 hierarchicalData 中查找对应的段落
      const hierarchicalData = summaryManager.getHierarchicalData();
      const pageData = hierarchicalData.find((p) => p.pageIndex === pageIndex);
      if (!pageData) {
        Zotero.debug(`[VibeCard] Page ${pageIndex} not found in hierarchicalData`);
        return null;
      }

      const paragraphData = pageData.paragraphs.find((p) => p.paragraphIndex === paragraphIndex);
      if (!paragraphData) {
        Zotero.debug(`[VibeCard] Paragraph ${paragraphIndex} not found on page ${pageIndex}`);
        return null;
      }

      // 返回段落文本内容
      const content = paragraphData.paragraphText || '';
      Zotero.debug(`[VibeCard] Found content for ${vibeCardId}: ${content.substring(0, 100)}...`);
      return content;

    } catch (error) {
      Zotero.logError(`[VibeCard] Error getting content for ${vibeCardId}: ${error}`);
      return null;
    }
  },

  /**
   * 获取论文的 Markdown 内容
   * @param {number} itemID - Zotero item ID
   * @returns {Promise<string|null>} - 论文的 Markdown 内容
   */
  getMarkdownContent: async function (itemID) {
    try {
      Zotero.debug(`[VibeCard] Getting markdown content for itemID: ${itemID}`);

      // 等待数据库初始化完成
      await Zotero.VibeDB.schemaUpdatePromise;

      // 从 VibeDB 获取论文记录
      const paper = await Zotero.VibeDB.Papers.get(itemID);
      if (!paper) {
        Zotero.debug(`[VibeCard] No paper found in VibeDB for itemID: ${itemID}`);
        return null;
      }

      // 返回 markdown_content
      const markdown = paper.markdown_content || '';
      Zotero.debug(`[VibeCard] Found markdown content (length: ${markdown.length})`);
      return markdown;

    } catch (error) {
      Zotero.logError(`[VibeCard] Error getting markdown content for itemID ${itemID}: ${error}`);
      return null;
    }
  }
};
