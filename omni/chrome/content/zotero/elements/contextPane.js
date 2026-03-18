/*
	***** BEGIN LICENSE BLOCK *****
	
	Copyright © 2024 Corporation for Digital Scholarship
					 Vienna, Virginia, USA
					 https://www.zotero.org
	
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


{
  let { isPaneCollapsed, setPaneCollapsed } = ChromeUtils.importESModule(
    'chrome://zotero/content/elements/utils/collapsiblePane.mjs'
  );

  class ContextPane extends XULElementBase {
    content = MozXULElement.parseXULToFragment(`
			<deck id="zotero-context-pane-deck" flex="1" selectedIndex="0">
				<deck id="zotero-context-pane-item-deck"></deck>
				<deck id="zotero-context-pane-notes-deck" class="notes-pane-deck" flex="1"></deck>
				<deck id="zotero-context-pane-ai-chat-deck" class="ai-chat-pane-deck" flex="1"></deck>
				<deck id="zotero-context-pane-code-deck" class="code-pane-deck" flex="1"></deck>
			</deck>
		`);

    get sidenav() {
      return this._sidenav;
    }

    set sidenav(sidenav) {
      this._sidenav = sidenav;
      // TODO: decouple sidenav and contextPane
      sidenav.contextNotesPane = this._notesPaneDeck;
      sidenav.contextAIChatPane = this._aiChatPaneDeck;
      sidenav.contextCodePane = this._codePaneDeck;
    }

    get mode() {
      return ["item", "notes", "ai-chat", "code"][this._panesDeck.getAttribute('selectedIndex')];
    }

    set mode(mode) {
      let modeMap = {
        item: "0",
        notes: "1",
        "ai-chat": "2",
        "code": "3"
      };
      if (!(mode in modeMap)) {
        throw new Error(`ContextPane.mode must be one of ["item", "notes", "ai-chat", "code"], but got ${mode}`);
      }
      this._panesDeck.selectedIndex = modeMap[mode];
    }

    get activeEditor() {
      let currentContext = this._getCurrentNotesContext();
      return currentContext?._getCurrentEditor();
    }

    get collapsed() {
      return isPaneCollapsed(this);
    }

    set collapsed(val) {
      setPaneCollapsed(this, val);
    }

    init() {
      this._panesDeck = this.querySelector('#zotero-context-pane-deck');
      // Item pane deck
      this._itemPaneDeck = this.querySelector('#zotero-context-pane-item-deck');
      // Notes pane deck
      this._notesPaneDeck = this.querySelector('#zotero-context-pane-notes-deck');
      // AI Chat pane deck
      this._aiChatPaneDeck = this.querySelector('#zotero-context-pane-ai-chat-deck');
      // Code pane deck
      this._codePaneDeck = this.querySelector('#zotero-context-pane-code-deck');

      this._notifierIDs = [
      Zotero.Notifier.registerObserver(this, ['item'], 'contextPane'),
      // We want to be notified quickly about tab events
      Zotero.Notifier.registerObserver(this, ['tab'], 'contextPane', 20)];


      // 初始化 AI Chat API（包括截图功能）
      this._initAIChatAPI();
    }

    /**
     * 初始化 AI Chat 相关的全局 API
     * 这些 API 供 AI Chat iframe 调用
     */
    _initAIChatAPI() {
      if (!Zotero.AIChat) {
        Zotero.AIChat = {};
      }

      // 保存 this 引用
      const contextPane = this;

      // 截图功能 - 调用 Reader iframe 的截图 API
      Zotero.AIChat.startScreenshot = (callback) => {
        contextPane._startReaderScreenshot(callback);
      };

      // 监听 Reader 派发的字体缩放事件
      this._setupFontScaleListener();

      // console.log('[ContextPane] ✓ AI Chat API 已初始化 (Zotero.AIChat.startScreenshot)');
    }

    /**
     * 设置字体缩放监听器
     * 监听 Reader 派发的 ReaderUpdatePanelFontScale 事件，然后通知所有 AI Chat iframe
     */
    _setupFontScaleListener() {
      // 监听 Reader 派发的事件
      document.addEventListener('ReaderUpdatePanelFontScale', (event) => {
        const scale = event.detail.scale;
        console.log('[ContextPane] 收到 Reader 字体缩放事件:', scale);

        // 保存当前值供后续初始化的 iframe 使用
        Zotero._vibeCurrentFontScale = scale;

        // 通知所有已存在的 AI Chat iframe
        const aiChatIframes = this._aiChatPaneDeck.querySelectorAll('iframe');
        aiChatIframes.forEach((iframe) => {
          try {
            const iframeWindow = iframe.contentWindow.wrappedJSObject || iframe.contentWindow;
            // 设置 CSS 变量
            iframeWindow.document.documentElement.style.setProperty('--panel-font-scale', scale);
            console.log('[ContextPane] 已更新 AI Chat iframe 字体:', scale);
          } catch (e) {
            console.error('[ContextPane] 更新 AI Chat 字体失败:', e);
          }
        });

        // 同时也通知 Zotero._vibeFontScaleListeners 数组中的监听器（兼容 ai-chat 内部的监听机制）
        if (Zotero._vibeFontScaleListeners && Array.isArray(Zotero._vibeFontScaleListeners)) {
          Zotero._vibeFontScaleListeners.forEach((callback) => {
            try {
              callback(scale);
            } catch (e) {
              console.error('[ContextPane] 调用字体缩放回调失败:', e);
            }
          });
        }
      });

      console.log('[ContextPane] ✓ 字体缩放监听器已设置');
    }

    /**
     * 启动 Reader 截图模式
     * 获取当前 Reader iframe 并调用其截图 API
     * @param {Function} callback - 截图完成后的回调函数
     */
    _startReaderScreenshot(callback) {
      // console.log('[ContextPane] 启动 Reader 截图模式');

      try {
        // 获取当前活动的 Reader 实例
        const reader = Zotero.Reader.getByTabID(Zotero_Tabs.selectedID);
        if (!reader) {
          console.error('[ContextPane] 找不到当前 Reader 实例');
          if (callback) callback({ success: false, error: '找不到 Reader' });
          return;
        }

        // 获取 Reader iframe 的 window 对象
        const readerWindow = reader._iframeWindow;
        if (!readerWindow) {
          console.error('[ContextPane] 找不到 Reader iframe window');
          if (callback) callback({ success: false, error: '找不到 Reader 窗口' });
          return;
        }

        // 通过 wrappedJSObject 访问 iframe 内部对象（XPCOM 沙箱隔离）
        const wrappedWindow = readerWindow.wrappedJSObject || readerWindow;

        // 检查 Reader 是否暴露了截图 API
        if (!wrappedWindow.readerScreenshotAPI || !wrappedWindow.readerScreenshotAPI.startScreenshot) {
          console.error('[ContextPane] Reader 截图 API 不可用');
          // console.log('[ContextPane] wrappedWindow keys:', Object.keys(wrappedWindow).slice(0, 30));
          if (callback) callback({ success: false, error: 'Reader 截图 API 不可用' });
          return;
        }

        // 调用 Reader 的截图 API
        // 需要将 callback 导出到 content 作用域
        // console.log('[ContextPane] 调用 Reader 截图 API');
        const wrappedCallback = Components.utils.exportFunction((result) => {
          // 将结果从 content 作用域克隆回 chrome 作用域
          const clonedResult = result ? JSON.parse(JSON.stringify(result)) : result;
          callback(clonedResult);
        }, wrappedWindow);

        wrappedWindow.readerScreenshotAPI.startScreenshot(wrappedCallback);

      } catch (error) {
        console.error('[ContextPane] 启动截图失败:', error);
        if (callback) callback({ success: false, error: error.message });
      }
    }


    destroy() {
      for (let id of this._notifierIDs) {
        Zotero.Notifier.unregisterObserver(id);
      }
    }

    notify(action, type, ids, extraData) {
      if (type == 'item') {
        this._handleItemUpdate(action, type, ids, extraData);
        return;
      }
      if (type == 'tab' && action == 'add') {
        this._handleTabAdd(action, type, ids, extraData);
        return;
      }
      if (type == 'tab' && action == 'close') {
        this._handleTabClose(action, type, ids, extraData);
        return;
      }
      if (type == 'tab' && ["select", "load"].includes(action)) {
        this._handleTabSelect(action, type, ids, extraData);
      }
    }

    _handleItemUpdate(action, type, ids, extraData) {
      // Update, remove or re-create item panes
      if (action === 'modify') {
        for (let itemDetails of Array.from(this._itemPaneDeck.children)) {
          let tabID = itemDetails.tabID;
          let item = Zotero.Items.get(Zotero_Tabs._getTab(tabID)?.tab.data.itemID);
          if ((item.parentID || itemDetails.parentID) &&
          item.parentID !== itemDetails.parentID) {
            this._removeItemContext(tabID);
            this._addItemContext(tabID, item.itemID);
          }
        }
      }

      // Update notes lists for affected libraries
      if (['add', 'delete', 'modify'].includes(action)) {
        let libraryIDs = [];
        for (let id of ids) {
          let item = Zotero.Items.get(id);
          if (item && (item.isNote() || item.isRegularItem())) {
            libraryIDs.push(item.libraryID);
          } else
          if (action == 'delete') {
            libraryIDs.push(extraData[id].libraryID);
          }
        }
        for (let context of Array.from(this._notesPaneDeck.children)) {
          if (libraryIDs.includes(context.libraryID)) {
            context.affectedIDs = new Set([...context.affectedIDs, ...ids]);
            context.update();
          }
        }
      }
    }

    _handleTabAdd(_action, _type, _ids, _extraData) {}

    _handleTabClose(action, type, ids) {
      for (let id of ids) {
        this._removeItemContext(id);
      }
      if (Zotero_Tabs.deck.children.length == 1) {
        Array.from(this._notesPaneDeck.children).forEach((x) => x.notesList.expanded = false);
      }
      // Close tab specific notes if tab id no longer exists, but
      // do that only when unloaded tab is reloaded
      setTimeout(() => {
        let contextNodes = Array.from(this._notesPaneDeck.children);
        for (let contextNode of contextNodes) {
          let nodes = Array.from(contextNode.querySelector('.zotero-context-pane-tab-notes-deck').children);
          for (let node of nodes) {
            let tabID = node.getAttribute('data-tab-id');
            if (!document.getElementById(tabID)) {
              node.remove();
            }
          }
        }
        // For unknown reason fx102, unlike 60, sometimes doesn't automatically update selected index
        this._selectItemContext(Zotero_Tabs.selectedID);
      });
    }

    async _handleTabSelect(action, type, ids, extraData) {
      // TEMP: move these variables to ZoteroContextPane
      let _contextPaneSplitter = ZoteroContextPane.splitter;
      let _contextPane = document.getElementById('zotero-context-pane');
      let tabID = ids[0];
      let tabType = extraData[tabID].type;
      // It seems that changing `hidden` or `collapsed` values might
      // be related with significant slow down when there are too many
      // DOM nodes (i.e. 10k notes)
      if (tabType == 'library') {
        _contextPaneSplitter.setAttribute('hidden', true);
        _contextPane.setAttribute('collapsed', true);
        ZoteroContextPane.showLoadingMessage(false);
        this._sidenav.hidden = true;
      } else
      if (tabType == 'reader'
      // The reader tab load event is triggered asynchronously.
      // If the tab is no longer selected by the time the event is triggered,
      // we don't need to update the context pane, since it must already be
      // updated by another select tab event.
      && (action === 'select' ||
      action === 'load' && Zotero_Tabs.selectedID == tabID)) {
        this._handleReaderReady(tabID);
        this._setupNotesContext(tabID);
        this._setupAIChatContext(tabID);
        this._setupCodeContext(tabID);
        _contextPaneSplitter.setAttribute('hidden', false);

        _contextPane.setAttribute('collapsed', !(_contextPaneSplitter.getAttribute('state') != 'collapsed'));

        this._sidenav.hidden = false;

        let data = Zotero_Tabs._tabs.find((tab) => tab.id === ids[0]).data;
        await this._addItemContext(ids[0], data.itemID, data.type);

        this._selectItemContext(tabID);
      }

      ZoteroContextPane.update();
    }

    async _setupNotesContext(tabID) {
      let { tab } = Zotero_Tabs._getTab(tabID);
      if (!tab || !tab.data.itemID) return;
      let attachment = await Zotero.Items.getAsync(tab.data.itemID);
      if (attachment) {
        this._selectNotesContext(attachment.libraryID);
        let notesContext = this._getNotesContext(attachment.libraryID);
        notesContext.updateNotesListFromCache();
      }
      let currentNoteContext = this._getCurrentNotesContext();
      // Always switch to the current selected tab, since the selection might have changed
      currentNoteContext.switchToTab(Zotero_Tabs.selectedID);
    }

    async _setupAIChatContext(tabID) {
      let { tab } = Zotero_Tabs._getTab(tabID);
      if (!tab || !tab.data.itemID) return;
      // 使用 itemID 而不是 libraryID，确保每篇文章独立
      this._selectAIChatContext(tab.data.itemID);
    }

    async _handleReaderReady(tabID) {
      let reader = Zotero.Reader.getByTabID(tabID);
      if (!reader) {
        return;
      }
      // Focus reader pages view if context pane note editor is not selected
      if (Zotero_Tabs.selectedID == reader.tabID &&
      !Zotero_Tabs.tabsMenuPanel.visible && (
      !document.activeElement ||
      !document.activeElement.closest('.context-node iframe[id="editor-view"]'))) {
        if (!Zotero_Tabs.focusOptions?.keepTabFocused) {
          // Do not move focus to the reader during keyboard navigation
          setTimeout(() => {
            // Timeout to make sure focus does not stick to the tab
            // after click on windows
            reader.focus();
          });
        }
      }
    }

    _getCurrentNotesContext() {
      return this._notesPaneDeck.selectedPanel;
    }

    _getNotesContext(libraryID) {
      let context = Array.from(this._notesPaneDeck.children).find((x) => x.libraryID == libraryID);
      if (!context) {
        context = this._addNotesContext(libraryID);
      }
      return context;
    }

    _addNotesContext(libraryID) {
      let context = document.createXULElement("notes-context");
      this._notesPaneDeck.append(context);
      context.libraryID = libraryID;
      return context;
    }

    _selectNotesContext(libraryID) {
      let context = this._getNotesContext(libraryID);
      this._notesPaneDeck.selectedPanel = context;
    }

    _removeNotesContext(libraryID) {
      let context = Array.from(this._notesPaneDeck.children).find((x) => x.libraryID == libraryID);
      context?.remove();
    }

    _getCurrentAIChatContext() {
      const panel = this._aiChatPaneDeck.selectedPanel;
      // 如果是 React 组件容器，返回 React 实例
      if (panel && panel._reactInstance) {
        return panel._reactInstance;
      }
      // 否则返回原 XUL 元素
      return panel;
    }

    _getAIChatContext(itemID) {
      // 按 itemID 查找，确保每篇文章独立
      let context = Array.from(this._aiChatPaneDeck.children).find((x) => x.itemID == itemID);
      if (!context) {
        context = this._addAIChatContext(itemID);
      }
      return context;
    }

    _selectAIChatContext(itemID) {
      let context = this._getAIChatContext(itemID);
      this._aiChatPaneDeck.selectedPanel = context;
      // 确保外层主 deck 切换到 AI Chat 面板
      try {
        if (this.mode !== 'ai-chat') {
          this.mode = 'ai-chat';
        }
      } catch (e) {
        console.warn('[ContextPane] ⚠️ Failed to switch main deck to ai-chat:', e);
      }
      // 兼容性处理：确保选中项具备 deck-selected 样式，仅在选中时可见
      try {
        for (let child of Array.from(this._aiChatPaneDeck.children)) {
          child.classList?.remove('deck-selected');
          // 移除可能的强制隐藏
          if (child !== context) {
            child.setAttribute('hidden', 'true');
          } else {
            child.removeAttribute('hidden');
          }
        }
        context.classList?.add('deck-selected');
        // 仅对选中项确保可见（不再全局强制）
        context.style.removeProperty('visibility');
        context.style.removeProperty('display');
      } catch (e) {
        console.warn('[ContextPane] ⚠️ deck-selected compatibility handling failed:', e);
      }
      try {
        let cs = window.getComputedStyle(context);
      } catch (_) {}
    }

    _addAIChatContext(itemID) {

      // 使用 XUL 容器包裹 iframe，确保 deck 能正确管理可见性
      let container = document.createXULElement('vbox');
      container.flex = 1;
      container.setAttribute('flex', '1');
      container.style.width = '100%';
      container.style.height = '100%';
      container.itemID = itemID;

      // 创建 iframe
      let iframe = document.createElement('iframe');

      iframe.setAttribute('src', 'chrome://zotero/content/ai-chat-iframe.html');

      iframe.setAttribute('data-item-id', itemID);
      // // console.log(`[ContextPane] ✓ 创建 AI Chat iframe，itemID: ${itemID}`);

      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.style.background = 'transparent';

      // 在 container 上监听拖拽事件（拦截来自 Reader iframe 的 VibeCard 拖拽）
      container.addEventListener('dragover', (event) => {
        // 检查是否是 VibeCard 拖拽
        const types = event.dataTransfer.types;
        if (types.includes('application/x-zotero-vibecard-reference')) {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy';

          // 通知 iframe 内的 AI Chat 显示拖拽状态
          if (iframe.contentWindow && iframe.contentWindow.aiChatAPI) {
            iframe.contentWindow.aiChatAPI.setDragOverState(true, null);
          }
        }
      });

      container.addEventListener('dragleave', (event) => {
        // 检查是否真正离开了容器
        // relatedTarget 可能为 null（离开窗口）或者不在 container 内
        const isLeavingContainer = !event.relatedTarget || !container.contains(event.relatedTarget);

        if (isLeavingContainer) {
          if (iframe.contentWindow && iframe.contentWindow.aiChatAPI) {
            iframe.contentWindow.aiChatAPI.setDragOverState(false, null);
          }
        }
      });

      // 添加 dragend 监听，确保拖拽结束时一定关闭毛玻璃层
      container.addEventListener('dragend', (event) => {
        if (iframe.contentWindow && iframe.contentWindow.aiChatAPI) {
          iframe.contentWindow.aiChatAPI.setDragOverState(false, null);
        }
      });

      container.addEventListener('drop', (event) => {
        const vibeCardData = event.dataTransfer.getData('application/x-zotero-vibecard-reference');
        if (vibeCardData) {
          event.preventDefault();
          event.stopPropagation();

          try {
            const data = JSON.parse(vibeCardData);

            // 通知 iframe 内的 AI Chat 插入 VibeCard 引用
            // 注意：方法名是 insertVibeCardReference，不是 insertVibeCard
            if (iframe.contentWindow && iframe.contentWindow.aiChatAPI) {
              iframe.contentWindow.aiChatAPI.insertVibeCardReference(data.vibeCardId);
              iframe.contentWindow.aiChatAPI.setDragOverState(false, null);
            } else {
              console.warn('[ContextPane] AI Chat API not available for VibeCard insertion');
            }
          } catch (error) {
            console.error('[ContextPane] Error handling VibeCard drop:', error);
          }
        }
      });

      container.appendChild(iframe);
      this._aiChatPaneDeck.append(container);

      // 等待 iframe 加载完成
      iframe.addEventListener('load', () => {
        try {
          // 获取 iframe 中的 API
          const aiChatAPI = iframe.contentWindow.aiChatAPI;

          if (aiChatAPI) {
            // 保存 API 引用在 iframe 元素与容器上
            iframe._aiChatAPI = aiChatAPI;
            container._aiChatAPI = aiChatAPI;
            // console.log('[ContextPane] ✓ AI Chat iframe API 已连接');
          } else {
            console.warn('[ContextPane] ⚠️ AI Chat API not found in iframe');
            console.warn('[ContextPane] iframe.contentWindow keys:', Object.keys(iframe.contentWindow).slice(0, 20));
          }

          // 应用当前的字体缩放值
          if (Zotero._vibeCurrentFontScale) {
            try {
              const iframeWindow = iframe.contentWindow.wrappedJSObject || iframe.contentWindow;
              iframeWindow.document.documentElement.style.setProperty('--panel-font-scale', Zotero._vibeCurrentFontScale);
              console.log('[ContextPane] ✓ 已应用初始字体缩放:', Zotero._vibeCurrentFontScale);
            } catch (e) {
              console.error('[ContextPane] 应用初始字体缩放失败:', e);
            }
          }
        } catch (error) {
          console.error('[ContextPane] ❌ Error accessing iframe API:', error);
          console.error('[ContextPane] Error stack:', error.stack);
        }
      });

      // 错误处理
      iframe.addEventListener('error', (error) => {
        console.error('='.repeat(80));
        console.error('[ContextPane] ❌ AI Chat iframe ERROR:', error);
        console.error('[ContextPane] Error type:', error.type);
        console.error('[ContextPane] Error target:', error.target);
        console.error('='.repeat(80));
      });

      return container;
    }

    _removeAIChatContext(itemID) {
      let context = Array.from(this._aiChatPaneDeck.children).find((x) => x.itemID == itemID);
      if (context) {
        // 尝试从容器或内部 iframe 清理资源
        let api = context._aiChatAPI || context.querySelector('iframe')?._aiChatAPI;
        if (api && typeof api.clearMessages === 'function') {
          try {
            api.clearMessages();
          } catch (error) {
            console.error('[ContextPane] Failed to clean AI Chat iframe:', error);
          }
        }
        // 移除元素
        context.remove();
      }
    }

    // Code Pane 相关方法（按 itemID 独立管理，每篇文章独立）
    async _setupCodeContext(tabID) {
      let { tab } = Zotero_Tabs._getTab(tabID);
      if (!tab || !tab.data.itemID) return;
      // 使用 itemID 而不是 libraryID，确保每篇文章独立
      this._selectCodeContext(tab.data.itemID);
    }

    _getCurrentCodeContext() {
      return this._codePaneDeck.selectedPanel;
    }

    _getCodeContext(itemID) {
      // 按 itemID 查找，确保每篇文章独立
      let context = Array.from(this._codePaneDeck.children).find((x) => x.itemID == itemID);
      if (!context) {
        context = this._addCodeContext(itemID);
      }
      return context;
    }

    _selectCodeContext(itemID) {
      let context = this._getCodeContext(itemID);
      this._codePaneDeck.selectedPanel = context;
    }

    _addCodeContext(itemID) {
      // ========== 真正的 Overlay 覆盖方案 ==========
      // 使用 position: absolute 让顶部和底部浮在 browser 上面，遮住 DeepWiki 原生 UI

      // 检测系统主题
      const isDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

      // 主题颜色配置
      const theme = {
        // 背景色
        bg: isDarkMode ? '#1e1e1e' : '#ffffff',
        bgHover: isDarkMode ? '#2d2d2d' : '#f9fafb',
        bgSecondary: isDarkMode ? '#2d2d2d' : '#f3f4f6',
        // 文字颜色
        text: isDarkMode ? '#e5e5e5' : '#37352f',
        textSecondary: isDarkMode ? '#a0a0a0' : '#666666',
        textLink: isDarkMode ? '#60a5fa' : '#2563eb',
        textLinkHover: isDarkMode ? '#93c5fd' : '#1d4ed8',
        // 边框颜色
        border: isDarkMode ? '#404040' : '#e5e7eb',
        borderFocus: isDarkMode ? '#60a5fa' : '#2563eb',
        // 图标颜色
        icon: isDarkMode ? '#e5e5e5' : '#37352f',
        iconSecondary: isDarkMode ? '#a0a0a0' : '#666666',
        // 提示信息背景
        hintBg: isDarkMode ? '#1e3a5f' : '#eff6ff',
        hintText: isDarkMode ? '#60a5fa' : '#2563eb',
        hintBgSuccess: isDarkMode ? '#1e4d3a' : '#ecfdf5',
        hintTextSuccess: isDarkMode ? '#34d399' : '#059669',
        // 半透明背景（支持毛玻璃效果）
        bgTranslucent: isDarkMode ? 'rgba(30, 30, 30, 0.9)' : 'rgba(255, 255, 255, 0.9)'
      };

      // 外层容器：使用 HTML div 以支持 position: relative
      let container = document.createXULElement('vbox');
      container.flex = 1;
      container.setAttribute('flex', '1');
      container.style.cssText = `
				width: 100%;
				height: 100%;
				position: relative;
				background: ${theme.bg};
				overflow: hidden;
			`;
      container.itemID = itemID;

      // 保存状态
      container._currentRepoName = null;
      container._baseRepoName = null;
      container._chatHistory = [];
      container._isAsking = false;
      container._hasReceivedRepo = false; // 是否已接收过仓库信息

      // 高度常量（覆盖 DeepWiki 原生 UI）
      const TOP_HEIGHT = 100; // 顶部覆盖层高度
      const BOTTOM_HEIGHT = 130; // 底部覆盖层高度

      // ========== 0. 空状态提示：尚未发现代码仓库地址 ==========
      let emptyState = document.createXULElement('vbox');
      emptyState.setAttribute('align', 'center');
      emptyState.setAttribute('pack', 'center');
      emptyState.style.cssText = `
				position: absolute;
				top: ${TOP_HEIGHT}px;
				left: 0;
				width: 100%;
				height: calc(100% - ${TOP_HEIGHT}px);
				background: ${theme.bg};
				display: flex;
				flex-direction: column;
				align-items: center;
				justify-content: center;
				z-index: 500;
			`;

      // 空状态图标
      let emptyIcon = document.createXULElement('label');
      emptyIcon.setAttribute('value', '📦');
      emptyIcon.style.cssText = `
				font-size: 48px;
				margin-bottom: 16px;
			`;

      // 空状态文字
      let emptyText = document.createXULElement('label');
      emptyText.setAttribute('value', '尚未发现代码仓库地址');
      emptyText.style.cssText = `
				font-size: 14px;
				color: ${theme.text};
				margin-bottom: 8px;
			`;

      emptyState.appendChild(emptyIcon);
      emptyState.appendChild(emptyText);

      // ========== 1. Browser：占满整个容器，显示完整 DeepWiki 页面 ==========
      let browser = document.createXULElement('browser');
      browser.setAttribute('type', 'content');
      browser.setAttribute('remote', 'true');
      browser.setAttribute('flex', '1');
      browser.setAttribute('disableglobalhistory', 'true');
      browser.setAttribute('messagemanagergroup', 'browsers');
      browser.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				width: 100%;
				height: 100%;
				border: none;
				background: ${theme.bg};
				display: none;
			`;
      browser.setAttribute('src', 'about:blank');

      // ========== 2. 顶部 Overlay：Notion 风格标题栏 ==========
      let topOverlay = document.createXULElement('hbox');
      topOverlay.setAttribute('align', 'center');
      topOverlay.style.cssText = `
				position: absolute;
				top: 0;
				left: 0;
				right: 0;
				height: ${TOP_HEIGHT}px;
				background: ${theme.bgTranslucent};
				backdrop-filter: blur(10px);
				-webkit-backdrop-filter: blur(10px);
				padding: 0 5px;
				box-sizing: border-box;
				display: none;
				align-items: center;
				z-index: 1000;
				pointer-events: auto;
			`;

      // 可点击的标题区域（GitHub 图标 + 仓库名）
      let titleLink = document.createXULElement('hbox');
      titleLink.setAttribute('align', 'center');
      titleLink.style.cssText = `
				display: flex;
				align-items: center;
				gap: 12px;
				cursor: pointer;
				padding: 8px 0;
				transition: opacity 0.15s ease;
			`;

      // GitHub 图标 (SVG) - 更大更清晰，根据主题调整颜色
      let githubIcon = document.createXULElement('image');
      githubIcon.setAttribute('src', 'data:image/svg+xml,' + encodeURIComponent(`
				<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${theme.icon}">
					<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
				</svg>
			`));
      githubIcon.style.cssText = 'width: 28px; height: 28px; flex-shrink: 0;';

      // 仓库名标签 - 蓝色链接样式，根据主题调整
      let repoLabel = document.createXULElement('label');
      repoLabel.setAttribute('value', '尚未发现仓库'); // 初始状态提示
      repoLabel.style.cssText = `
				font-size: 18px;
				font-weight: 500;
				color: ${theme.textLink};
				text-decoration: underline;
				cursor: pointer;
				letter-spacing: -0.01em;
				line-height: 1.2;
			`;

      titleLink.appendChild(githubIcon);
      titleLink.appendChild(repoLabel);

      // 点击标题跳转到 GitHub
      titleLink.addEventListener('click', () => {
        if (container._currentRepoName) {
          const githubUrl = `https://github.com/${container._currentRepoName}`;
          if (typeof Zotero !== 'undefined' && Zotero.launchURL) {
            Zotero.launchURL(githubUrl);
          } else {
            window.open(githubUrl, '_blank');
          }
        }
      });

      // 鼠标悬停效果 - 链接变深蓝，根据主题调整
      titleLink.addEventListener('mouseenter', () => {
        repoLabel.style.color = theme.textLinkHover;
      });
      titleLink.addEventListener('mouseleave', () => {
        repoLabel.style.color = theme.textLink;
      });

      // ========== 新增：文字链接 "点击输入仓库地址" ==========
      let switchRepoLink = document.createXULElement('label');
      switchRepoLink.setAttribute('value', '点击输入仓库地址'); // 初始状态提示，有仓库后会更新
      switchRepoLink.style.cssText = `
				font-size: 11px;
				color: ${theme.textLink};
				text-decoration: underline;
				cursor: pointer;
				margin-top: 4px;
				margin-left: 40px;
				transition: color 0.15s ease;
			`;

      // 鼠标悬停效果
      switchRepoLink.addEventListener('mouseenter', () => {
        switchRepoLink.style.color = theme.textLinkHover;
      });
      switchRepoLink.addEventListener('mouseleave', () => {
        switchRepoLink.style.color = theme.textLink;
      });

      // ========== 仓库选择下拉菜单（保持原有逻辑，但触发方式改为点击文字链接）==========

      // 下拉菜单面板 - 使用 topOverlay 作为定位参考，左边框贴着 Code Pane 左侧，根据主题调整
      let dropdownPanel = document.createXULElement('vbox');
      dropdownPanel.style.cssText = `
				position: absolute;
				top: ${TOP_HEIGHT}px;
				left: 0;
				right: 0;
				max-height: 400px;
				background: ${theme.bg};
				border: 1px solid ${theme.border};
				border-top: none;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
				z-index: 2000;
				display: none;
				overflow: hidden;
			`;

      // 输入框容器
      let inputContainer = document.createXULElement('hbox');
      inputContainer.style.cssText = `
				padding: 12px;
				border-bottom: 1px solid ${theme.border};
			`;

      // 自定义输入框，根据主题调整
      let customInput = document.createElement('input');
      customInput.setAttribute('type', 'text');
      customInput.setAttribute('placeholder', '不是你要的代码库？填入 GitHub 链接');
      customInput.style.cssText = `
				flex: 1;
				padding: 8px 12px;
				border: 1px solid ${theme.border};
				border-radius: 6px;
				font-size: 13px;
				outline: none;
				transition: border-color 0.15s ease;
				background: ${theme.bg};
				color: ${theme.text};
			`;
      customInput.addEventListener('focus', () => {
        customInput.style.borderColor = theme.borderFocus;
      });
      customInput.addEventListener('blur', () => {
        customInput.style.borderColor = theme.border;
      });

      // 输入框回车事件 - 切换到用户输入的仓库
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && customInput.value.trim()) {
          const inputValue = customInput.value.trim();
          // 从 URL 或 owner/repo 格式提取仓库名
          let repoName = inputValue;
          const match = inputValue.match(/github\.com\/([^\/]+)\/([^\/\s\.#?]+)/);
          if (match) {
            repoName = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
          }
          // 切换仓库
          switchToRepo(repoName);
          customInput.value = '';
          dropdownPanel.style.display = 'none';
          isDropdownOpen = false;
        }
      });

      inputContainer.appendChild(customInput);

      // 仓库列表容器
      let repoListContainer = document.createXULElement('vbox');
      repoListContainer.style.cssText = `
				max-height: 320px;
				overflow-y: auto;
			`;

      dropdownPanel.appendChild(inputContainer);
      dropdownPanel.appendChild(repoListContainer);

      // 切换仓库的函数
      const switchToRepo = async (repoName) => {
        if (!repoName) return;

        container._currentRepoName = repoName;
        container._hasReceivedRepo = true; // 标记已有仓库
        repoLabel.setAttribute('value', repoName);
        // 更新副标题链接文案（有仓库时显示"不是你要的代码库？"）
        switchRepoLink.setAttribute('value', '不是你要的代码库？');

        // 显示主 UI（browser + bottomOverlay），隐藏空状态
        showMainUI(true);

        // 通知 iframe 设置仓库名（使用 container._inputIframe 引用）
        const iframe = container._inputIframe;
        if (iframe && iframe.contentWindow && iframe.contentWindow.deepwikiInputAPI) {
          iframe.contentWindow.deepwikiInputAPI.setRepoName(repoName);
        }

        // 加载 DeepWiki 页面
        const deepwikiUrl = `https://deepwiki.com/${repoName}`;
        // console.log(`[ContextPane] Code Pane: 切换到仓库: ${repoName}`);
        browser.setAttribute('src', deepwikiUrl);

        // 🐙 保存新选择的仓库到数据库
        const currentItemID = container.itemID;
        if (currentItemID && repoName) {
          const githubUrl = `https://github.com/${repoName}`;
          try {
            await Zotero.VibeDB.schemaUpdatePromise;
            await Zotero.VibeDB.Papers.updateGitHubUrl(currentItemID, githubUrl);
            // console.log(`[ContextPane] 🐙 GitHub URL 已保存到数据库: ${githubUrl}, itemID: ${currentItemID}`);
          } catch (e) {
            console.error('[ContextPane] 🐙 保存 GitHub URL 到数据库失败:', e);
          }
        }
      };

      // 渲染仓库列表（支持两种数据格式：GitHub API 返回的和搜索结果）
      const renderRepoList = (repos, isFromExtracted = false) => {
        // 清空列表
        while (repoListContainer.firstChild) {
          repoListContainer.removeChild(repoListContainer.firstChild);
        }

        // 如果是从论文中提取的 URL（没有搜索结果），显示提示信息
        if (isFromExtracted) {
          let hintLabel = document.createXULElement('label');
          hintLabel.setAttribute('value', '📄 此仓库来自论文中的链接');
          hintLabel.style.cssText = `
						padding: 12px 16px;
						color: ${theme.hintTextSuccess};
						font-size: 12px;
						background: ${theme.hintBgSuccess};
						border-bottom: 1px solid ${theme.border};
					`;
          repoListContainer.appendChild(hintLabel);
          return;
        }

        // 没有搜索结果时直接返回，不显示任何内容
        if (!repos || repos.length === 0) {
          return;
        }

        // 添加搜索结果提示
        let hintLabel = document.createXULElement('label');
        hintLabel.setAttribute('value', '🔍 根据论文标题搜索的相关仓库');
        hintLabel.style.cssText = `
					padding: 12px 16px;
					color: ${theme.hintText};
					font-size: 12px;
					background: ${theme.hintBg};
					border-bottom: 1px solid ${theme.border};
				`;
        repoListContainer.appendChild(hintLabel);

        repos.forEach((repo) => {
          let repoItem = document.createXULElement('hbox');
          repoItem.setAttribute('align', 'center');
          repoItem.style.cssText = `
						padding: 10px 12px;
						cursor: pointer;
						transition: background 0.15s ease;
						border-bottom: 1px solid ${theme.border};
					`;

          // 仓库信息
          let repoInfoBox = document.createXULElement('vbox');
          repoInfoBox.style.cssText = 'flex: 1; overflow: hidden;';

          // 支持两种数据格式：full_name (GitHub API) 或 name (搜索结果)
          const repoFullName = repo.full_name || repo.name;
          let repoNameLabel = document.createXULElement('label');
          repoNameLabel.setAttribute('value', repoFullName);
          repoNameLabel.style.cssText = `
						font-size: 13px;
						font-weight: 500;
						color: ${theme.textLink};
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
					`;

          let repoDesc = document.createXULElement('label');
          repoDesc.setAttribute('value', repo.description || '暂无描述');
          repoDesc.style.cssText = `
						font-size: 11px;
						color: ${theme.textSecondary};
						overflow: hidden;
						text-overflow: ellipsis;
						white-space: nowrap;
						margin-top: 2px;
					`;

          repoInfoBox.appendChild(repoNameLabel);
          repoInfoBox.appendChild(repoDesc);

          // Star 数（支持两种字段名：stargazers_count 或 stars）
          const starCount = repo.stargazers_count ?? repo.stars ?? 0;
          let starLabel = document.createXULElement('label');
          starLabel.setAttribute('value', `⭐ ${formatStars(starCount)}`);
          starLabel.style.cssText = `font-size: 11px; color: ${theme.textSecondary}; margin-left: 8px; flex-shrink: 0;`;

          repoItem.appendChild(repoInfoBox);
          repoItem.appendChild(starLabel);

          // 悬停效果
          repoItem.addEventListener('mouseenter', () => {
            repoItem.style.background = theme.bgHover;
          });
          repoItem.addEventListener('mouseleave', () => {
            repoItem.style.background = 'transparent';
          });

          // 点击选择仓库
          repoItem.addEventListener('click', () => {
            switchToRepo(repoFullName);
            dropdownPanel.style.display = 'none';
            isDropdownOpen = false;
          });

          repoListContainer.appendChild(repoItem);
        });
      };

      // 格式化 Star 数
      const formatStars = (count) => {
        if (!count) return '0';
        if (count >= 1000) {
          return (count / 1000).toFixed(1) + 'k';
        }
        return count.toString();
      };

      // 文字链接点击事件 - 切换下拉菜单
      let isDropdownOpen = false;
      switchRepoLink.addEventListener('click', async (e) => {
        e.stopPropagation();
        isDropdownOpen = !isDropdownOpen;
        dropdownPanel.style.display = isDropdownOpen ? 'flex' : 'none';

        if (isDropdownOpen) {
          // 根据仓库来源决定显示内容
          if (container._isExtractedFromPaper) {
            // 从论文中提取的 URL，只显示提示信息，不显示其他仓库
            renderRepoList(null, true);
          } else if (container._searchedRepos && container._searchedRepos.length > 0) {
            // 有搜索结果，显示搜索到的仓库列表
            renderRepoList(container._searchedRepos, false);
          } else {
            // 没有搜索结果，显示空状态
            renderRepoList([], false);
          }
        }
      });

      // 点击外部关闭下拉菜单
      document.addEventListener('click', (e) => {
        if (!switchRepoLink.contains(e.target) && !dropdownPanel.contains(e.target)) {
          dropdownPanel.style.display = 'none';
          isDropdownOpen = false;
        }
      });

      // 创建垂直布局容器，包含标题链接和文字链接
      let titleContainer = document.createXULElement('vbox');
      titleContainer.style.cssText = `
				display: flex;
				flex-direction: column;
				align-items: flex-start;
				flex: 1;
			`;
      titleContainer.appendChild(titleLink);
      titleContainer.appendChild(switchRepoLink);

      // 添加到 topOverlay
      topOverlay.appendChild(titleContainer);
      // 将 dropdownPanel 添加到 topOverlay（用于定位）
      topOverlay.appendChild(dropdownPanel);

      // ========== 3. 底部 Overlay：使用 iframe 加载输入框 ==========
      let bottomOverlay = document.createXULElement('vbox');
      bottomOverlay.style.cssText = `
				position: absolute;
				bottom: 0;
				left: 0;
				right: 0;
				height: ${BOTTOM_HEIGHT}px;
				background: ${theme.bgTranslucent};
				backdrop-filter: blur(10px);
				-webkit-backdrop-filter: blur(10px);
				z-index: 1000;
				display: none;
				pointer-events: auto;
			`;

      // 创建 iframe 加载输入框页面
      let inputIframe = document.createElement('iframe');
      inputIframe.setAttribute('src', 'chrome://zotero/content/deepwiki-input-iframe.html');
      inputIframe.style.cssText = `
				width: 100%;
				height: 100%;
				border: none;
				background: ${theme.bg};
			`;

      bottomOverlay.appendChild(inputIframe);

      // 保存 iframe 引用
      container._inputIframe = inputIframe;

      // ========== 辅助函数：显示/隐藏 UI 元素 ==========
      // 注意：topOverlay（Header）始终显示，让用户可以手动输入仓库地址
      const showMainUI = (show) => {
        // Header 始终显示
        topOverlay.style.display = 'flex';

        if (show) {
          // 隐藏空状态，显示主 UI（browser + bottomOverlay）
          emptyState.style.display = 'none';
          browser.style.display = 'block';
          bottomOverlay.style.display = 'block';
        } else {
          // 显示空状态，隐藏 browser 和 bottomOverlay
          emptyState.style.display = 'flex';
          browser.style.display = 'none';
          bottomOverlay.style.display = 'none';
        }
      };

      // ========== 监听 iframe 消息，处理 URL 跳转 ==========
      const messageHandler = (event) => {
        const { type, url } = event.data || {};

        // 只处理 deepwiki 相关的消息
        if (!type || !type.startsWith('deepwiki-')) {
          return;
        }

        if (type === 'deepwiki-open-url' && url) {
          // console.log('[ContextPane] Code Pane: ✓ 在 browser 中打开 URL:', url);
          browser.setAttribute('src', url);
        } else if (type === 'deepwiki-input-ready') {
          // console.log('[ContextPane] Code Pane: ✓ 输入框 iframe 已就绪');
          // iframe 就绪后，如果已有仓库名，通知 iframe
          if (container._currentRepoName) {
            setTimeout(() => {
              if (inputIframe.contentWindow && inputIframe.contentWindow.deepwikiInputAPI) {
                // console.log('[ContextPane] Code Pane: 通知 iframe 设置仓库名:', container._currentRepoName);
                inputIframe.contentWindow.deepwikiInputAPI.setRepoName(container._currentRepoName);
              }
            }, 100);
          }
        }
      };
      window.addEventListener('message', messageHandler);

      // 保存 handler 引用，便于清理
      container._messageHandler = messageHandler;

      // ========== 组装容器（顺序重要：browser 在底层，overlay 在上层）==========
      container.appendChild(emptyState); // 空状态
      container.appendChild(browser); // 底层：完整的 DeepWiki 页面
      container.appendChild(topOverlay); // 上层：覆盖顶部 header
      container.appendChild(bottomOverlay); // 上层：覆盖底部聊天框
      this._codePaneDeck.append(container);

      // 初始化显示状态：Header 始终显示，空状态显示，browser 和 bottomOverlay 隐藏
      showMainUI(false);

      // 保存引用
      container._browser = browser;
      container._topOverlay = topOverlay;
      container._bottomOverlay = bottomOverlay;
      container._repoLabel = repoLabel;
      container._emptyState = emptyState;
      container._showMainUI = showMainUI;

      // console.log(`[ContextPane] ✓ 创建 Code Pane (Overlay + iframe 输入框)，itemID: ${itemID}`);

      // ========== API ==========
      container._codeAPI = {
        // 设置 GitHub 仓库并加载 DeepWiki 页面
        // repoInfo 结构：{ name, url, stars, description, score }
        // 如果有 score 字段，说明是通过搜索找到的；没有 score 说明是从论文中提取的
        setGitHubRepo: (repoInfo) => {
          if (!repoInfo) {
            // console.log('[ContextPane] Code Pane: 清除仓库信息');
            browser.setAttribute('src', 'about:blank');
            container._currentRepoName = null;
            container._baseRepoName = null;
            container._hasReceivedRepo = false;
            container._isExtractedFromPaper = false;
            container._searchedRepos = null;
            // 恢复默认文案
            repoLabel.setAttribute('value', '尚未发现仓库');
            switchRepoLink.setAttribute('value', '点击输入仓库地址');
            // 显示空状态，隐藏主 UI（Header 仍然保留）
            showMainUI(false);
            // 通知 iframe 清空
            if (inputIframe.contentWindow && inputIframe.contentWindow.deepwikiInputAPI) {
              inputIframe.contentWindow.deepwikiInputAPI.setRepoName(null);
            }
            return;
          }

          // 标记已接收过仓库信息
          container._hasReceivedRepo = true;

          // 判断仓库来源：有 score 字段说明是搜索结果，没有说明是从论文中提取的
          const isFromSearch = repoInfo.score !== undefined && repoInfo.score !== null;
          container._isExtractedFromPaper = !isFromSearch;

          // console.log(`[ContextPane] Code Pane: 仓库来源 - ${isFromSearch ? '搜索结果' : '论文提取'}`);

          // 从 URL 或 name 提取 owner/repo
          let repoName = repoInfo.name;
          if (repoInfo.url) {
            const match = repoInfo.url.match(/github\.com\/([^\/]+)\/([^\/\s\.#?]+)/);
            if (match) {
              repoName = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
            }
          }

          if (!repoName) {
            console.warn('[ContextPane] Code Pane: 无法解析仓库名称');
            return;
          }

          // 避免重复加载相同仓库
          if (container._currentRepoName === repoName) {
            // console.log('[ContextPane] Code Pane: 仓库未变化，跳过加载');
            return;
          }

          container._currentRepoName = repoName;
          container._baseRepoName = repoName;

          // 更新顶部仓库名显示
          repoLabel.setAttribute('value', repoName);
          // 更新副标题链接文案（有仓库时显示"不是你要的代码库？"）
          switchRepoLink.setAttribute('value', '不是你要的代码库？');

          // 显示主 UI，隐藏空状态
          showMainUI(true);

          // 通知 iframe 设置仓库名
          if (inputIframe.contentWindow && inputIframe.contentWindow.deepwikiInputAPI) {
            inputIframe.contentWindow.deepwikiInputAPI.setRepoName(repoName);
          } else {
            // iframe 可能还没加载完，等待加载后再设置
            inputIframe.addEventListener('load', () => {
              if (inputIframe.contentWindow && inputIframe.contentWindow.deepwikiInputAPI) {
                inputIframe.contentWindow.deepwikiInputAPI.setRepoName(repoName);
              }
            }, { once: true });
          }

          // 构建 DeepWiki URL 并加载
          const deepwikiUrl = `https://deepwiki.com/${repoName}`;
          // console.log(`[ContextPane] Code Pane: 加载 DeepWiki 页面: ${deepwikiUrl}`);
          browser.setAttribute('src', deepwikiUrl);
        },

        // 设置搜索到的仓库列表（用于下拉菜单显示）
        setSearchedRepos: (repos) => {
          container._searchedRepos = repos;
          // console.log(`[ContextPane] Code Pane: 保存搜索结果，共 ${repos?.length || 0} 个仓库`);
        },

        // 刷新当前页面
        refresh: () => {
          if (container._currentRepoName) {
            browser.reload();
          }
        },

        // 获取当前 URL
        getCurrentUrl: () => {
          return browser.getAttribute('src');
        },

        // 清空问答历史
        clearHistory: () => {
          if (inputIframe.contentWindow && inputIframe.contentWindow.deepwikiInputAPI) {
            inputIframe.contentWindow.deepwikiInputAPI.clearHistory();
          }
        },

        // 检查是否已接收过仓库信息
        hasReceivedRepo: () => {
          return container._hasReceivedRepo;
        }
      };

      return container;
    }

    _removeCodeContext(itemID) {
      let context = Array.from(this._codePaneDeck.children).find((x) => x.itemID == itemID);
      context?.remove();
    }

    _getItemContext(tabID) {
      return this._itemPaneDeck.querySelector(`[data-tab-id="${tabID}"]`);
    }

    _removeItemContext(tabID) {
      this._itemPaneDeck.querySelector(`[data-tab-id="${tabID}"]`)?.remove();
    }

    _selectItemContext(tabID) {
      let previousContainer = this._sidenav.container;
      let selectedPanel = this._getItemContext(tabID);
      if (selectedPanel) {
        this._itemPaneDeck.selectedPanel = selectedPanel;
        selectedPanel.sidenav = this._sidenav;
        // Inherits previous pinned states
        if (previousContainer) selectedPanel.pinnedPane = previousContainer.pinnedPane;
        selectedPanel.render();
      }
    }

    async _addItemContext(tabID, itemID, _tabType = "") {
      if (this._getItemContext(tabID)) {
        return;
      }

      let { libraryID } = Zotero.Items.getLibraryAndKeyFromID(itemID);
      let library = Zotero.Libraries.get(libraryID);
      await library.waitForDataLoad('item');

      let item = Zotero.Items.get(itemID);
      if (!item) {
        return;
      }
      libraryID = item.libraryID;
      let parentID = item.parentID;

      let previousPinnedPane = this._sidenav.container?.pinnedPane || "";

      let targetItem = parentID ? Zotero.Items.get(parentID) : item;

      let editable = Zotero.Libraries.get(libraryID).editable
      // If the parent item or the attachment itself is in trash, itemPane is not editable
      && !item.deleted && !targetItem.deleted;

      let itemDetails = document.createXULElement('item-details');
      itemDetails.id = tabID + '-context';
      itemDetails.dataset.tabId = tabID;
      itemDetails.className = 'zotero-item-pane-content';
      this._itemPaneDeck.appendChild(itemDetails);

      itemDetails.editable = editable;
      itemDetails.tabID = tabID;
      itemDetails.tabType = "reader";
      itemDetails.item = targetItem;
      // Manually cache parentID
      itemDetails.parentID = parentID;
      itemDetails.sidenav = this._sidenav;
      if (previousPinnedPane) itemDetails.pinnedPane = previousPinnedPane;

      // Make sure that the context pane of the selected tab is rendered
      if (tabID == Zotero_Tabs.selectedID) {
        this._selectItemContext(tabID);
      }
    }

    handleFocus() {
      if (!this.collapsed) {
        if (this.mode == "item") {
          let header = this._itemPaneDeck.selectedPanel.querySelector("item-pane-header");
          // Focus the first focusable node after header
          Services.focus.moveFocus(window, header, Services.focus.MOVEFOCUS_FORWARD, 0);
          return true;
        } else
        if (this.mode == "notes") {
          return this._getCurrentNotesContext().focus();
        } else
        if (this.mode == "ai-chat") {
          return this._getCurrentAIChatContext().focus();
        } else
        if (this.mode == "code") {
          let codeContext = this._getCurrentCodeContext();
          if (codeContext) {
            let iframe = codeContext.querySelector('iframe');
            if (iframe) {
              iframe.focus();
              return true;
            }
          }
        }
      }
      return false;
    }
  }
  customElements.define("context-pane", ContextPane);
}
