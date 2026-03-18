/*
	***** BEGIN LICENSE BLOCK *****
    
	Copyright © 2009 Center for History and New Media
					 George Mason University, Fairfax, Virginia, USA
					 http://zotero.org
    
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

const { BluebirdShimPromise } = ChromeUtils.importESModule('chrome://zotero/content/xpcom/bluebirdShim.mjs');
const { ZOTERO_CONFIG } = ChromeUtils.importESModule('resource://zotero/config.mjs');

// Commonly used imports accessible anywhere
Components.utils.importGlobalProperties(["XMLHttpRequest"]);
var { OS } = ChromeUtils.importESModule("chrome://zotero/content/osfile.mjs");

ChromeUtils.defineESModuleGetters(globalThis, {
  AsyncShutdown: "resource://gre/modules/AsyncShutdown.sys.mjs",
  AppConstants: "resource://gre/modules/AppConstants.sys.mjs"
});
const { CommandLineOptions } = ChromeUtils.importESModule("chrome://zotero/content/modules/commandLineOptions.mjs");

/*
 * Core functions
 */
(function () {
  // Privileged (public) methods
  this.getStorageDirectory = getStorageDirectory;
  this.debug = debug;
  this.setFontSize = setFontSize;
  this.flattenArguments = flattenArguments;
  this.getAncestorByTagName = getAncestorByTagName;
  this.reinit = reinit; // defined in zotero-service.js

  // Public properties
  this.initialized = false;
  this.skipLoading = false;
  this.startupError;
  Object.defineProperty(this, 'startupErrorHandler', {
    get: () => _startupErrorHandler,
    enumerable: true,
    configurable: true
  });
  Object.defineProperty(this, 'resourcesDir', {
    get: () => {
      // AChrome is app/chrome
      return FileUtils.getDir('AChrom', []).parent.parent.path;
    },
    enumerable: true,
    configurable: true
  });
  this.version;
  this.platform;
  this.locale;
  this.dir; // locale direction: 'ltr' or 'rtl'
  this.isMac;
  this.isWin;
  this.initialURL; // used by Schema to show the changelog on upgrades
  this.Promise = BluebirdShimPromise;

  this.getMainWindow = function () {
    return Services.wm.getMostRecentWindow("navigator:browser");
  };

  /**
   * @return {ChromeWindow[]} - An array of open windows
   */
  this.getMainWindows = function () {
    var enumerator = Services.wm.getEnumerator("navigator:browser");
    var windows = [];
    while (enumerator.hasMoreElements()) {
      windows.push(enumerator.getNext());
    }
    return windows;
  };

  this.getActiveZoteroPane = function () {
    var win = Services.wm.getMostRecentWindow("navigator:browser");
    return win ? win.ZoteroPane : null;
  };

  this.getZoteroPanes = function () {
    var enumerator = Services.wm.getEnumerator("navigator:browser");
    var zps = [];
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (!win.ZoteroPane) continue;
      zps.push(win.ZoteroPane);
    }
    return zps;
  };

  /**
   * @property	{Boolean}	locked		Whether all Zotero panes are locked
   *										with an overlay
   */
  Object.defineProperty(
    this,
    'locked',
    {
      get: () => _locked,
      set: (lock) => {
        var wasLocked = _locked;
        _locked = lock;

        if (!wasLocked && lock) {
          this.unlockDeferred = Zotero.Promise.defer();
          this.unlockPromise = this.unlockDeferred.promise;
        } else
        if (wasLocked && !lock) {
          Zotero.debug("Running unlock callbacks");
          this.unlockDeferred.resolve();
        }
      },
      enumerable: true,
      configurable: true
    }
  );

  /**
   * @property {Boolean} crashed - True if the application needs to be restarted
   */
  this.crashed = false;

  /**
   * @property	{Boolean}	closing		True if the application is closing.
   */
  this.closing = false;

  this.unlockDeferred;
  this.unlockPromise;
  this.initializationDeferred;
  this.initializationPromise;

  this.hiDPISuffix = "";

  var _startupErrorHandler;
  var _localizedStringBundle;

  var _locked = false;
  var _shutdownListeners = [];
  var _progressMessage;
  var _progressMeters;
  var _progressPopup;
  var _lastPercentage;

  // whether we are waiting for another Zotero process to release its DB lock
  var _waitingForDBLock = false;

  /**
   * Maintains nsITimers to be used when Zotero.wait() completes (to reduce performance penalty
   * of initializing new objects)
   */
  var _waitTimers = [];

  /**
   * Maintains nsITimerCallbacks to be used when Zotero.wait() completes
   */
  var _waitTimerCallbacks = [];

  /**
   * Maintains running nsITimers in global scope, so that they don't disappear randomly
   */
  var _runningTimers = new Map();

  var _startupTime = new Date();
  // Errors that were in the console at startup
  var _startupErrors = [];
  // Number of errors to maintain in the recent errors buffer
  const ERROR_BUFFER_SIZE = 25;
  // A rolling buffer of the last ERROR_BUFFER_SIZE errors
  var _recentErrors = [];

  /**
   * Initialize the extension
   *
   * @return {Promise<Boolean>}
   */
  this.init = async function (options) {
    if (this.initialized || this.skipLoading) {
      return false;
    }

    this.locked = true;
    this.initializationDeferred = Zotero.Promise.defer();
    this.initializationPromise = this.initializationDeferred.promise;
    this.uiReadyDeferred = Zotero.Promise.defer();
    this.uiReadyPromise = this.uiReadyDeferred.promise;
    this.uiReadyPromise.then(() => {
      Zotero.debug("User interface ready in " + (new Date() - _startupTime) + " ms");
    });

    if (options) {
      let opts = [
      'openPane',
      'test',
      'automatedTest',
      'skipBundledFiles'];

      opts.filter((opt) => options[opt]).forEach((opt) => this[opt] = true);

      this.forceDataDir = options.forceDataDir;
    }

    this.mainThread = Services.tm.mainThread;

    this.clientName = ZOTERO_CONFIG.CLIENT_NAME;

    this.platformVersion = Services.appinfo.platformVersion;
    this.platformMajorVersion = parseInt(this.platformVersion.match(/^[0-9]+/)[0]);
    this.isFx = true;
    this.isClient = true;
    this.isStandalone = true;

    this.version = Services.appinfo.version;
    this.isBetaBuild = Zotero.version.includes('-beta');
    this.isDevBuild = Zotero.version.includes('-dev');
    this.isSourceBuild = Zotero.version.includes('SOURCE');

    // OS platform
    var os = Services.appinfo.OS;
    this.isMac = os == 'Darwin';
    this.isWin = os == 'WINNT';
    this.isLinux = os == 'Linux';

    // aarch64, x86_64, x86
    this.arch = Services.appinfo.XPCOMABI.split('-')[0];

    // Browser
    Zotero.browser = "g";

    // TEMP: Disable automatic safe mode until we can figure out why some shutdowns are
    // counting as crashes
    var branch = Services.prefs.getBranch("toolkit.startup.");
    if (branch.getIntPref('recent_crashes', 0) > 2) {
      branch.clearUserPref('recent_crashes');
    }

    Zotero.Intl.init();
    if (this.restarting) return;

    await Zotero.Prefs.init();
    Zotero.Debug.init(options && options.forceDebugLog);

    // Make sure that Zotero isn't running as root
    if (!Zotero.isWin) _checkRoot();

    if (!_checkExecutableLocation()) {
      return;
    }

    try {
      await Zotero.DataDirectory.init();
      if (this.restarting) {
        return;
      }
      var dataDir = Zotero.DataDirectory.dir;
    }
    catch (e) {
      // Zotero dir not found
      if (e.name == 'NotFoundError') {
        let foundInDefault = false;
        try {
          foundInDefault = (await OS.File.exists(Zotero.DataDirectory.defaultDir)) && (
          await OS.File.exists(
            OS.Path.join(
              Zotero.DataDirectory.defaultDir,
              Zotero.DataDirectory.getDatabaseFilename()
            )
          ));
        }
        catch (e) {
          Zotero.logError(e);
        }

        let previousDir = Zotero.Prefs.get('lastDataDir') ||
        Zotero.Prefs.get('dataDir') ||
        e.dataDir;
        Zotero.startupError = foundInDefault ?
        Zotero.getString(
          'dataDir.notFound.defaultFound',
          [
          Zotero.clientName,
          previousDir,
          Zotero.DataDirectory.defaultDir]

        ) :
        Zotero.getString('dataDir.notFound', Zotero.clientName);
        _startupErrorHandler = async function () {
          var ps = Services.prompt;
          var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
          ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING +
          ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING;
          // TEMP: lastDataDir can be removed once old persistent descriptors have been
          // converted, which they are in getZoteroDirectory() in 5.0
          if (foundInDefault) {
            let index = ps.confirmEx(null,
            Zotero.getString('general.error'),
            Zotero.startupError,
            buttonFlags,
            Zotero.getString('dataDir.useNewLocation'),
            Zotero.getString('general.quit'),
            Zotero.getString('general.locate'),
            null, {}
            );
            // Revert to home directory
            if (index == 0) {
              Zotero.DataDirectory.set(Zotero.DataDirectory.defaultDir);
              Zotero.Utilities.Internal.quit(true);
              return;
            }
            // Locate data directory
            else if (index == 2) {
              await Zotero.DataDirectory.choose(true);
            }

          } else
          {
            let index = ps.confirmEx(null,
            Zotero.getString('general.error'),
            Zotero.startupError + (
            previousDir ?
            '\n\n' + Zotero.getString('dataDir.previousDir') + ' ' + previousDir :
            ''),
            buttonFlags,
            Zotero.getString('general.quit'),
            Zotero.getString('dataDir.useDefaultLocation'),
            Zotero.getString('general.locate'),
            null, {}
            );
            // Revert to home directory
            if (index == 1) {
              Zotero.DataDirectory.set(Zotero.DataDirectory.defaultDir);
              Zotero.Utilities.Internal.quit(true);
              return;
            }
            // Locate data directory
            else if (index == 2) {
              await Zotero.DataDirectory.choose(true);
            }
          }
        };
        return;
      }
      // DEBUG: handle more startup errors
      else {
        throw e;
      }
    }

    if (!this.forceDataDir) {
      await Zotero.DataDirectory.checkForMigration(
        dataDir, Zotero.DataDirectory.defaultDir
      );
      if (this.skipLoading) {
        return;
      }

      await Zotero.DataDirectory.checkForLostLegacy();
      if (this.restarting) {
        return;
      }
    }

    // Make sure data directory isn't in Dropbox, etc.
    await Zotero.DataDirectory.checkForUnsafeLocation(dataDir);

    Services.obs.addObserver({
      observe: function () {
        Zotero.Session.save();
      }
    }, "quit-application-granted", false);

    // Register shutdown handler to call Zotero.shutdown()
    var _shutdownObserver = { observe: function () {Zotero.shutdown();} };
    Services.obs.addObserver(_shutdownObserver, "quit-application", false);

    // Get startup errors
    try {
      let messages = Services.console.getMessageArray();
      _startupErrors = messages.filter((msg) => _shouldKeepError(msg));
    } catch (e) {
      Zotero.logError(e);
    }
    // Register error observer
    Services.console.registerListener(ConsoleListener);

    // Add shutdown listener to remove quit-application observer and console listener
    this.addShutdownListener(function () {
      Services.obs.removeObserver(_shutdownObserver, "quit-application", false);
      Services.console.unregisterListener(ConsoleListener);
    });

    var success = await _initFull();
    if (!success) {
      return false;
    }

    Zotero.Standalone.init();
    await Zotero.initComplete();
    // Ingest command line arguments that were not handled due to late command line handler registration.
    Zotero.CommandLineIngester.ingest();
  };

  /**
   * Triggers events when initialization finishes
   */
  this.initComplete = async function () {
    if (Zotero.initialized) return;

    Zotero.debug("Running initialization callbacks");
    delete this.startupError;
    this.initialized = true;
    this.initializationDeferred.resolve();

    // 同步 VibeZotero 版本号（从 defaults/preferences/zotero.js 到运行时 Prefs）
    // 这确保更新后版本号正确显示

    // 同步 VibeZotero 版本号
    // 优先从打包的 vibeZotero.version 文件读取，这是最权威的源
    try {
      // 1. 尝试读取版本文件 (resource://zotero/ 映射到 omni.ja 根目录)
      let versionFile = "resource://zotero/vibeZotero.version";
      let response = await fetch(versionFile);
      if (response.ok) {
        let fileVersion = (await response.text()).trim();
        if (fileVersion) {
          // console.log(`[Vibero] 从文件读取版本号: ${fileVersion}`);
          let currentPrefVersion = Services.prefs.getCharPref('extensions.zotero.vibeZotero.version', '');

          if (fileVersion !== currentPrefVersion) {
            // console.log(`[Vibero] 同步版本号到 Prefs: ${currentPrefVersion} -> ${fileVersion}`);
            Services.prefs.setCharPref('extensions.zotero.vibeZotero.version', fileVersion);

            // 优化点2: 检查是否是更新完成，清理待安装标记
            let pendingUpdate = Services.prefs.getCharPref('extensions.zotero.vibeZotero.pendingUpdate', '');
            if (pendingUpdate && fileVersion === pendingUpdate) {
              // console.log(`[Vibero] 更新到 ${fileVersion} 成功，清理待安装标记`);
              Services.prefs.clearUserPref('extensions.zotero.vibeZotero.pendingUpdate');
              Services.prefs.clearUserPref('extensions.zotero.vibeZotero.pendingUpdateFile');
            }
          }

          // 优化点1: 启动时清理孤儿 MAR 包
          await Zotero._cleanupOldUpdates();

          return; // 成功从文件读取，跳过后续逻辑
        }
      }
    } catch (e) {

      // console.warn('[Vibero] 无法读取版本文件，尝试回退到 Default Prefs:', e);
    }
    // 2. 回退方案：尝试从 Default Branch 读取
    try {
      let defaultBranch = Services.prefs.getDefaultBranch('extensions.zotero.vibeZotero.');
      let defaultVersion = defaultBranch.getCharPref('version', '1.0.0');

      // 获取当前运行时版本号
      let currentVersion = Services.prefs.getCharPref('extensions.zotero.vibeZotero.version', '');

      // 如果默认版本号不同，说明应用已更新，同步版本号
      // 注意：这里简单的比较可能在开发环境不准确，但在生产环境 omni.ja 更新后是有效的
      if (defaultVersion !== '1.0.0' && defaultVersion !== currentVersion) {
        // console.log(`[Vibero] 从 Default Prefs 同步版本号: ${currentVersion} -> ${defaultVersion}`);
        Services.prefs.setCharPref('extensions.zotero.vibeZotero.version', defaultVersion);

        // 优化点2: 检查是否是更新完成，清理待安装标记
        let pendingUpdate = Services.prefs.getCharPref('extensions.zotero.vibeZotero.pendingUpdate', '');
        if (pendingUpdate && defaultVersion === pendingUpdate) {
          // console.log(`[Vibero] 更新到 ${defaultVersion} 成功，清理待安装标记`);
          Services.prefs.clearUserPref('extensions.zotero.vibeZotero.pendingUpdate');
          Services.prefs.clearUserPref('extensions.zotero.vibeZotero.pendingUpdateFile');
        }
      }

      // 优化点1: 启动时清理孤儿 MAR 包
      await Zotero._cleanupOldUpdates();

    } catch (e) {
      Zotero.logError(e);
      // console.error('[Vibero] 同步版本号失败:', e);
    }

    if (!Zotero.isFirstLoadThisSession) {
      // trigger zotero-reloaded event
      Zotero.debug('Triggering "zotero-reloaded" event');
      Services.obs.notifyObservers(Zotero, "zotero-reloaded", null);
    }

    Zotero.debug('Triggering "zotero-loaded" event');
    Services.obs.notifyObservers(Zotero, "zotero-loaded", null);

    Zotero.debug('Initializing Word Processor plugins');
    Zotero.Integration.init();
    await Zotero.Plugins.init();

    // VibeZotero: 启动时自动检查更新（延迟5秒，不影响启动速度）
    setTimeout(() => {
      try {
        // console.log('[Vibero] 启动自动检查更新...');
        Zotero.checkVibeZoteroUpdates(true); // true = silent mode
      } catch (e) {

        // console.error('[Vibero] 自动检查更新失败:', e);
      }}, 3000);
  };


  this.uiIsReady = function () {
    this.uiReadyDeferred.resolve();
  };


  /**
   * Initialization function to be called only if Zotero is in full mode
   *
   * @return {Promise:Boolean}
   */
  var _initFull = async function () {
    if (!(await _initDB())) return false;

    Zotero.VersionHeader.init();

    // Check for data reset/restore
    var dataDir = Zotero.DataDirectory.dir;
    var restoreFile = OS.Path.join(dataDir, 'restore-from-server');
    var resetDataDirFile = OS.Path.join(dataDir, 'reset-data-directory');

    var result = await Promise.all([OS.File.exists(restoreFile), OS.File.exists(resetDataDirFile)]);
    if (result.some((r) => r)) {
      [Zotero.restoreFromServer, Zotero.resetDataDir] = result;
      try {
        await Zotero.DB.closeDatabase();

        // TODO: better error handling

        // TODO: prompt for location
        // TODO: Back up database
        // TODO: Reset translators and styles



        if (Zotero.restoreFromServer) {
          let dbfile = Zotero.DataDirectory.getDatabase();
          Zotero.debug("Deleting " + dbfile);
          await OS.File.remove(dbfile, { ignoreAbsent: true });
          let storageDir = OS.Path.join(dataDir, 'storage');
          Zotero.debug("Deleting " + storageDir.path);
          OS.File.removeDir(storageDir, { ignoreAbsent: true }),
          await OS.File.remove(restoreFile);
          Zotero.restoreFromServer = true;
        } else
        if (Zotero.resetDataDir) {
          Zotero.initAutoSync = true;

          // Clear some user prefs
          [
          'sync.server.username',
          'sync.storage.username'].
          forEach((p) => Zotero.Prefs.clear(p));

          // Clear data directory
          Zotero.debug("Deleting data directory files");
          let lastError;
          // Delete all files in directory rather than removing directory, in case it's
          // a symlink
          await Zotero.File.iterateDirectory(dataDir, async function (entry) {
            // Don't delete some files
            if (entry.name == 'pipes') {
              return;
            }
            Zotero.debug("Deleting " + entry.path);
            try {
              if (entry.isDir) {
                await OS.File.removeDir(entry.path);
              } else
              {
                await OS.File.remove(entry.path);
              }
            }
            // Keep trying to delete as much as we can
            catch (e) {
              lastError = e;
              Zotero.logError(e);
            }
          });
          if (lastError) {
            throw lastError;
          }
        }
        Zotero.debug("Done with reset");

        if (!(await _initDB())) return false;
      }
      catch (e) {
        // Restore from backup?
        alert(e);
        return false;
      }
    }

    Zotero.HTTP.triggerProxyAuth();

    // Add notifier queue callbacks to the DB layer
    Zotero.DB.addCallback('begin', (id) => Zotero.Notifier.begin(id));
    Zotero.DB.addCallback('commit', (id) => Zotero.Notifier.commit(null, id));
    Zotero.DB.addCallback('rollback', (id) => Zotero.Notifier.reset(id));

    try {
      // Require >=2.1b3 database to ensure proper locking
      let dbSystemVersion = await Zotero.Schema.getDBVersion('system');
      if (dbSystemVersion > 0 && dbSystemVersion < 31) {
        let ps = Services.prompt;
        var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_2_DEFAULT;
        var index = ps.confirmEx(
          null,
          Zotero.getString('dataDir.incompatibleDbVersion.title'),
          Zotero.getString('dataDir.incompatibleDbVersion.text', Zotero.appName),
          buttonFlags,
          Zotero.getString('general.useDefault'),
          Zotero.getString('dataDir.chooseNewDataDirectory'),
          Zotero.getString('general.quit'),
          null,
          {}
        );

        var quit = false;

        // Default location
        if (index == 0) {
          Zotero.Prefs.set("useDataDir", false);

          Services.startup.quit(
            Components.interfaces.nsIAppStartup.eAttemptQuit |
            Components.interfaces.nsIAppStartup.eRestart
          );
        }
        // Select new data directory
        else if (index == 1) {
          let dir = await Zotero.DataDirectory.choose(true);
          if (!dir) {
            quit = true;
          }
        } else
        {
          quit = true;
        }

        if (quit) {
          Services.startup.quit(Components.interfaces.nsIAppStartup.eAttemptQuit);
        }

        throw true;
      }

      try {
        var updated = await Zotero.Schema.updateSchema({
          onBeforeUpdate: (options = {}) => {
            if (options.minor) return;
            try {
              Zotero.showZoteroPaneProgressMeter(
                Zotero.getString('upgrade.status')
              );
            }
            catch (e) {
              Zotero.logError(e);
            }
          }
        });
      }
      catch (e) {
        Zotero.logError(e);

        if (e instanceof Zotero.DB.IncompatibleVersionException) {
          let kbURL = "https://www.zotero.org/support/kb/newer_db_version";
          let msg = (e.dbClientVersion ?
          Zotero.getString('startupError.incompatibleDBVersion',
          [Zotero.clientName, e.dbClientVersion]) :
          Zotero.getString('startupError.zoteroVersionIsOlder')) + "\n\n" +
          Zotero.getString('startupError.zoteroVersionIsOlder.current', Zotero.version) +
          "\n\n" +
          Zotero.getString('startupError.zoteroVersionIsOlder.upgrade',
          ZOTERO_CONFIG.DOMAIN_NAME);
          Zotero.startupError = msg;
          _startupErrorHandler = function () {
            var ps = Services.prompt;
            var buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
            ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL +
            ps.BUTTON_POS_2 * ps.BUTTON_TITLE_IS_STRING +
            ps.BUTTON_POS_0_DEFAULT;

            var index = ps.confirmEx(
              null,
              Zotero.getString('general.error'),
              Zotero.startupError,
              buttonFlags,
              Zotero.getString('general.checkForUpdates'),
              null,
              Zotero.getString('general.moreInformation'),
              null,
              {}
            );

            // "Check for Update" button
            if (index === 0) {
              Zotero.openCheckForUpdatesWindow({ modal: true });
            }
            // Load More Info page
            else if (index == 2) {
              let uri = Services.io.newURI(kbURL, null, null);
              let handler = Components.classes['@mozilla.org/uriloader/external-protocol-service;1'].
              getService(Components.interfaces.nsIExternalProtocolService).
              getProtocolHandlerInfo('http');
              handler.preferredAction = Components.interfaces.nsIHandlerInfo.useSystemDefault;
              handler.launchWithURI(uri, null);
            }
          };
          throw e;
        }

        let stack = e.stack ? Zotero.Utilities.Internal.filterStack(e.stack) : null;
        Zotero.startupError = Zotero.getString('startupError.databaseUpgradeError') +
        "\n\n" + (
        stack || e);
        throw e;
      }

      const { ZoteroProtocolHandler } = ChromeUtils.importESModule(
        `chrome://zotero/content/ZoteroProtocolHandler.mjs`
      );
      ZoteroProtocolHandler.init();

      const { ZoteroAutoComplete } = ChromeUtils.importESModule(
        `chrome://zotero/content/zotero-autocomplete.mjs`
      );
      ZoteroAutoComplete.init();

      // 先初始化核心数据类型（必须在 VibeDB 之前，确保 ItemTypes 等数据已加载）
      await Zotero.Users.init();
      await Zotero.Libraries.init();

      await Zotero.ID.init();
      await Zotero.ItemTypes.init();
      await Zotero.ItemFields.init();
      await Zotero.CreatorTypes.init();
      await Zotero.FileTypes.init();
      await Zotero.CharacterSets.init();
      await Zotero.RelationPredicates.init();

      // ===== 初始化 VibeDB（在核心数据加载之后）=====
      try {
        console.log('[Zotero] ===== 开始初始化 VibeDB =====');
        Zotero.debug('[Zotero] Initializing VibeDB');
        await Zotero.VibeDB.init();
        console.log('[Zotero] ✅ VibeDB initialized successfully');
        Zotero.debug('[Zotero] VibeDB initialized successfully');

        // 初始化 VibeDB 同步管理器
        console.log('[Zotero] Initializing VibeDB Sync');
        Zotero.debug('[Zotero] Initializing VibeDB Sync');
        await Zotero.VibeDBSync.init();
        console.log('[Zotero] ✅ VibeDB Sync initialized successfully');
        Zotero.debug('[Zotero] VibeDB Sync initialized successfully');

        // 初始化 VibeDB 云同步模块
        console.log('[Zotero] Initializing VibeDB Cloud Sync');
        Zotero.debug('[Zotero] Initializing VibeDB Cloud Sync');
        await Zotero.VibeDBCloudSync.init();
        console.log('[Zotero] ✅ VibeDB Cloud Sync initialized successfully');
        Zotero.debug('[Zotero] VibeDB Cloud Sync initialized successfully');

        // 如果用户已登录，启动自动同步
        if (Zotero.VibeDBSync.isLoggedIn()) {
          console.log('[Zotero] 用户已登录');
          Zotero.VibeDBCloudSync.startAutoSync();
          // 延迟 5 秒后执行首次同步（让其他初始化完成）
          setTimeout(() => {
            console.log('[Zotero] 执行启动后首次同步');
            Zotero.VibeDBCloudSync.syncAll();
          }, 5000);
        }

        // 添加 shutdown listener
        Zotero.addShutdownListener(() => {
          console.log('[Zotero] Closing VibeDB connection');
          return Zotero.VibeDB.close();
        });
      }
      catch (e) {
        console.error('[Zotero] ❌ Failed to initialize VibeDB:', e);
        Zotero.logError('[Zotero] Failed to initialize VibeDB:', e);
        Zotero.debug('[Zotero] Continuing without VibeDB');
      }
      // ===== VibeDB 初始化完成 =====

      await Zotero.Session.init();

      Zotero.locked = false;

      // Initialize various services
      if (Zotero.Prefs.get("httpServer.enabled")) {
        Zotero.Server.init();
      }

      await Zotero.Fulltext.init();

      Zotero.Notifier.registerObserver(Zotero.Tags, 'setting', 'tags');

      await Zotero.Sync.Data.Local.init();
      await Zotero.Sync.Data.Utilities.init();
      Zotero.Sync.Storage.Local.init();
      Zotero.Sync.Runner = new Zotero.Sync.Runner_Module();
      Zotero.Sync.EventListeners.init();
      Zotero.Streamer = new Zotero.Streamer_Module();
      Zotero.Streamer.init();

      Zotero.MIMETypeHandler.init();
      Zotero.CookieSandbox.init();
      await Zotero.Proxies.init();

      // Initialize keyboard shortcuts
      Zotero.Keys.init();

      Zotero.Date.init();
      Zotero.LocateManager.init();
      await Zotero.Collections.init();
      await Zotero.Items.init();
      await Zotero.Searches.init();
      await Zotero.Tags.init();
      await Zotero.Creators.init();
      await Zotero.Groups.init();
      await Zotero.Relations.init();
      await Zotero.Retractions.init();
      await Zotero.Dictionaries.init();
      Zotero.Reader.init();

      // Load all library data except for items, which are loaded when libraries are first
      // clicked on or if otherwise necessary
      await Array.fromAsync(Zotero.Libraries.getAll(), async (library) => {
        await Zotero.SyncedSettings.loadAll(library.libraryID);
        if (library.libraryType != 'feed') {
          await Zotero.Collections.loadAll(library.libraryID);
          await Zotero.Searches.loadAll(library.libraryID);
        }
      });

      // Migrate fields from Extra that can be moved to item fields after a schema update
      await Zotero.Schema.migrateExtraFields();

      Zotero.Items.startEmptyTrashTimer();

      await Zotero.QuickCopy.init();
      Zotero.addShutdownListener(() => Zotero.QuickCopy.uninit());

      Zotero.Feeds.init();
      Zotero.addShutdownListener(() => Zotero.Feeds.uninit());

      Zotero.Schema.schemaUpdatePromise.then(Zotero.purgeDataObjects.bind(Zotero));

      return true;
    }
    catch (e) {
      Zotero.logError(e);
      if (!Zotero.startupError) {
        Zotero.startupError = Zotero.getString('startupError', Zotero.appName) + "\n\n" +
        Zotero.getString('db.integrityCheck.reportInForums') + "\n\n" +
        e.message ? e.message + "\n\n" + e.stack : e;
      }
      return false;
    }
  };

  /**
   * Initializes the DB connection
   */
  var _initDB = async function (haveReleasedLock) {
    // Initialize main database connection
    Zotero.DB = new Zotero.DBConnection('zotero');

    try {
      // Test read access
      await Zotero.DB.test();

      let dbfile = Zotero.DataDirectory.getDatabase();

      // Test write access on Zotero data directory
      if (!Zotero.File.pathToFile(PathUtils.parent(dbfile)).isWritable()) {
        var msg = 'Cannot write to ' + PathUtils.parent(dbfile) + '/';
      }
      // Test write access on Zotero database
      else if (!Zotero.File.pathToFile(dbfile).isWritable()) {
        var msg = 'Cannot write to ' + dbfile;
      } else
      {
        var msg = false;
      }

      if (msg) {
        var e = {
          name: 'NS_ERROR_FILE_ACCESS_DENIED',
          message: msg,
          toString: function () {return this.message;}
        };
        throw e;
      }
    }
    catch (e) {
      if (_checkDataDirAccessError(e)) {}
      // Storage busy
      else if (e.message.includes('2153971713')) {
        Zotero.startupError = Zotero.getString('startupError.databaseInUse');
      } else
      {
        let stack = e.stack ? Zotero.Utilities.Internal.filterStack(e.stack) : null;
        Zotero.startupError = Zotero.getString('startupError', Zotero.appName) + "\n\n" +
        Zotero.getString('db.integrityCheck.reportInForums') + "\n\n" + (
        stack || e);
      }

      Zotero.debug(e.toString(), 1);
      Components.utils.reportError(e); // DEBUG: doesn't always work
      Zotero.skipLoading = true;
      return false;
    }

    return true;
  };


  function _checkDataDirAccessError(e) {
    if (e.name != 'NS_ERROR_FILE_ACCESS_DENIED' && !e.message.includes('2152857621')) {
      return false;
    }

    var msg = Zotero.getString('dataDir.databaseCannotBeOpened', Zotero.clientName) +
    "\n\n" +
    Zotero.getString('dataDir.checkPermissions', Zotero.clientName);
    // If already using default directory, just show it
    if (Zotero.DataDirectory.dir == Zotero.DataDirectory.defaultDir) {
      msg += "\n\n" + Zotero.getString('dataDir.location', Zotero.DataDirectory.dir);
    }
    // Otherwise suggest moving to default, since there's a good chance this is due to security
    // software preventing Zotero from accessing the selected directory (particularly if it's
    // a Firefox profile)
    else {
      msg += "\n\n" +
      Zotero.getString('dataDir.moveToDefaultLocation', Zotero.clientName) +
      "\n\n" +
      Zotero.getString(
        'dataDir.migration.failure.full.current', Zotero.DataDirectory.dir
      ) +
      "\n" +
      Zotero.getString(
        'dataDir.migration.failure.full.recommended', Zotero.DataDirectory.defaultDir
      );
    }
    Zotero.startupError = msg;
    return true;
  }


  this.shutdown = async function () {
    Zotero.debug("Shutting down Zotero");

    try {
      // set closing to true
      Zotero.closing = true;

      // run shutdown listener
      let shutdownPromises = [];
      for (let listener of _shutdownListeners) {
        try {
          shutdownPromises.push(listener());
        }
        catch (e) {
          Zotero.logError(e);
        }
      }
      await Promise.all(shutdownPromises);

      if (Zotero.DB) {
        // close DB
        await Zotero.DB.closeDatabase(true);
      }
    } catch (e) {
      Zotero.logError(e);
    }
  };


  this.getProfileDirectory = function () {
    Zotero.warn("Zotero.getProfileDirectory() is deprecated -- use Zotero.Profile.dir");
    return Zotero.File.pathToFile(Zotero.Profile.dir);
  };

  this.getZoteroDirectory = function () {
    Zotero.warn("Zotero.getZoteroDirectory() is deprecated -- use Zotero.DataDirectory.dir");
    return Zotero.File.pathToFile(Zotero.DataDirectory.dir);
  };

  this.getZoteroDatabase = function (name, ext) {
    Zotero.warn("Zotero.getZoteroDatabase() is deprecated -- use Zotero.DataDirectory.getDatabase()");
    return Zotero.File.pathToFile(Zotero.DataDirectory.getDatabase(name, ext));
  };

  function getStorageDirectory() {
    return Zotero.File.pathToFile(Zotero.DataDirectory.getSubdirectory('storage', true));
  }

  this.getStylesDirectory = function () {
    return Zotero.File.pathToFile(Zotero.DataDirectory.getSubdirectory('styles', true));
  };

  this.getTranslatorsDirectory = function () {
    return Zotero.File.pathToFile(Zotero.DataDirectory.getSubdirectory('translators', true));
  };

  var _tmpDir;
  this.getTempDirectory = function () {
    if (_tmpDir) {
      return Zotero.File.pathToFile(_tmpDir);
    }
    var dir;
    try {
      dir = Services.dirsvc.get("TmpD", Ci.nsIFile);
      let relDir;
      if (Zotero.isWin) {
        relDir = 'Zotero';
      } else
      if (Zotero.isMac) {
        relDir = 'org.zotero.zotero';
      } else
      {
        relDir = 'zotero';
      }
      dir.append(relDir);
      Zotero.File.createDirectoryIfMissing(dir);
    }
    // If we can't use the system temp dir, fall back to 'tmp' in the data dir
    catch (e) {
      Zotero.warn(e);
      dir = Zotero.File.pathToFile(Zotero.DataDirectory.getSubdirectory('tmp', true));
    }

    AsyncShutdown.profileBeforeChange.addBlocker(
      "Zotero: Removing temp directory",
      () => this.removeTempDirectory()
    );

    _tmpDir = dir.path;
    return dir;
  };

  this.removeTempDirectory = async function () {
    if (!_tmpDir) return;
    try {
      Zotero.debug("Removing " + _tmpDir);
      return IOUtils.remove(_tmpDir, { recursive: true });
    }
    catch (e) {
      Zotero.logError(e);
    }
  };


  this.openMainWindow = function () {
    var chromeURI = AppConstants.BROWSER_CHROME_URL;
    var flags = "chrome,all,dialog=no,resizable=yes";
    var ww = Components.classes['@mozilla.org/embedcomp/window-watcher;1'].
    getService(Components.interfaces.nsIWindowWatcher);
    ww.openWindow(null, chromeURI, '_blank', flags, null);
  };


  this.openCheckForUpdatesWindow = function ({ modal } = {}) {
    let win = Services.wm.getMostRecentWindow('Update:Wizard');
    if (win) {
      win.focus();
    } else
    {
      let flags = 'chrome,centerscreen';
      if (modal) {
        flags += ',modal';
      }
      Services.ww.openWindow(null, 'chrome://zotero/content/update/updates.xhtml',
      'updateChecker', flags, null);
    }
  };


  /**
   * 清理旧的更新包（启动时调用）
   * 优化点1: 如果没有待安装的更新，清理所有 MAR 包和临时文件
   */
  this._cleanupOldUpdates = async function () {
    try {
      let dataDir = Zotero.DataDirectory.dir;
      let updateDir = OS.Path.join(dataDir, 'updates');

      // 检查更新目录是否存在
      let exists = await IOUtils.exists(updateDir);
      if (!exists) {
        return;
      }

      // 检查是否有待安装的更新
      let pendingUpdate = Services.prefs.getCharPref(
        'extensions.zotero.vibeZotero.pendingUpdate', ''
      );

      if (!pendingUpdate) {
        // 没有待安装的更新，清理所有 MAR 包和临时文件
        // console.log('[Vibero] 清理旧的更新文件...');

        let files = await IOUtils.getChildren(updateDir);
        let cleanedCount = 0;

        for (let file of files) {
          let fileName = OS.Path.basename(file);

          // 清理 MAR 包
          if (fileName.endsWith('.mar')) {
            // console.log(`[Vibero] 删除旧的 MAR 包: ${fileName}`);
            await IOUtils.remove(file);
            cleanedCount++;
          }
          // 清理解压目录
          else if (fileName === 'extract') {
            // console.log(`[Vibero] 删除旧的解压目录: ${fileName}`);
            await IOUtils.remove(file, { recursive: true });
            cleanedCount++;
          }
          // 清理更新脚本
          else if (fileName.endsWith('.sh')) {
            // console.log(`[Vibero] 删除旧的更新脚本: ${fileName}`);
            await IOUtils.remove(file);
            cleanedCount++;
          }
        }

        if (cleanedCount > 0) {

          // console.log(`[Vibero] 已清理 ${cleanedCount} 个旧更新文件`);
        }} else {

        // console.log(`[Vibero] 检测到待安装的更新 (${pendingUpdate})，保留更新文件`);
      }} catch (e) {
      // 忽略错误，不影响应用启动
      console.warn('[Vibero] 清理旧更新文件时出错:', e);
    }
  };


  /**
   * 打开VibeZotero版本窗口
   */
  this.openVibeZoteroVersionWindow = function () {
    let win = Services.wm.getMostRecentWindow('vibezotero-version');
    if (win) {
      win.focus();
    } else {
      Services.ww.openWindow(null, 'chrome://zotero/content/vibezoteroVersion.xhtml',
      'vibezotero-version', 'chrome,centerscreen,modal', null);
    }
  };

  /**
   * 检查VibeZotero更新
   * @param {boolean} silent - 是否静默检查（仅在有更新时提示）
   */
  this.checkVibeZoteroUpdates = async function (silent = false) {
    try {
      // 版本号比较函数
      function compareVersions(v1, v2) {
        // 将版本号分割成数组，例如 "1.0.5" -> [1, 0, 5]
        let parts1 = v1.split('.').map(Number);
        let parts2 = v2.split('.').map(Number);

        // 补齐长度（例如 "1.0" 和 "1.0.5" 比较时）
        let maxLen = Math.max(parts1.length, parts2.length);
        while (parts1.length < maxLen) parts1.push(0);
        while (parts2.length < maxLen) parts2.push(0);

        // 逐位比较
        for (let i = 0; i < maxLen; i++) {
          if (parts1[i] > parts2[i]) return 1; // v1 > v2
          if (parts1[i] < parts2[i]) return -1; // v1 < v2
        }
        return 0; // v1 == v2
      }

      // 获取当前VibeZotero版本
      let currentVersion = Services.prefs.getCharPref('extensions.zotero.vibeZotero.version', '1.0.0');
      let updateUrl = Services.prefs.getCharPref('extensions.zotero.vibeZotero.updateUrl', '');

      console.log(`[Vibero更新] 当前版本: ${currentVersion}`);

      if (!updateUrl) {
        console.log('[Vibero更新] 错误: 更新服务未配置');
        if (!silent) Zotero.alert(null, 'VibeZotero更新', '更新服务未配置');
        return;
      }

      // console.log(`[Vibero更新] 更新URL模板: ${updateUrl}`);

      // 动态检测平台
      let platform = 'mac';
      if (Zotero.isWin) {
        platform = 'win';
      } else if (Zotero.isLinux) {
        platform = 'linux';
      }

      console.log(`[Vibero更新] 检测到平台: ${platform}`);
      // console.log(`[Vibero更新] 更新URL: ${updateUrl}`);


      // 获取更新清单（禁用缓存，确保获取最新版本）
      console.log('[Vibero更新] 开始获取更新清单...');
      let response = await fetch(updateUrl, {
        cache: 'no-cache', // 强制绕过缓存
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache'
        }
      });

      console.log(`[Vibero更新] 响应状态: ${response.status} ${response.statusText}`);

      if (!response.ok) {
        console.log(`[Vibero更新] 错误: HTTP ${response.status}`);
        if (!silent) Zotero.alert(null, 'VibeZotero更新', `无法获取更新信息 (HTTP ${response.status})`);
        return;
      }

      let manifest = await response.json();
      // console.log(`[Vibero更新] 清单内容: ${JSON.stringify(manifest)}`);

      // 检查是否有新版本
      let hasUpdate = false;
      let newVersion = null;
      let updateInfo = null;

      for (let version in manifest) {
        // console.log(`[Vibero更新] 检查版本: ${version}`);

        // 获取当前平台的更新信息
        let versionData = manifest[version];
        if (!versionData.updates || !versionData.updates[platform]) {
          // console.log(`[Vibero更新] 该版本没有 ${platform} 平台的更新`);
          continue;
        }

        let platformUpdates = versionData.updates[platform];
        if (!Array.isArray(platformUpdates) || platformUpdates.length === 0) {
          // console.log(`[Vibero更新] ${platform} 平台更新列表为空`);
          continue;
        }

        let update = platformUpdates[0];
        // console.log(`[Vibero更新] 更新信息: ${JSON.stringify(update)}`);

        // 兼容新旧字段名：viberoVersion (新) 和 vibeZoteroVersion (旧)
        let updateVersion = update.viberoVersion || update.vibeZoteroVersion;
        if (updateVersion) {
          // 使用版本比较函数，只有当新版本 > 当前版本时才提示更新
          let comparison = compareVersions(updateVersion, currentVersion);
          // console.log(`[Vibero更新] 版本比较: ${updateVersion} vs ${currentVersion} = ${comparison}`);

          if (comparison > 0) {
            hasUpdate = true;
            newVersion = updateVersion;
            updateInfo = update;

            // 尝试获取更新说明 (优先从 update 对象获取，其次从 versionData 获取)
            updateInfo.releaseNotes = update.releaseNotes || versionData.releaseNotes;

            console.log(`[Vibero更新] ✅ 发现新版本: ${newVersion} (大于当前版本 ${currentVersion})`);
            break;
          } else if (comparison === 0) {

            // console.log(`[Vibero更新] 版本相同，无需更新`);
          } else {
            // console.log(`[Vibero更新] 清单中的版本 ${updateVersion} 小于当前版本 ${currentVersion}，跳过`);
          }}
      }

      if (hasUpdate) {
        let title = 'Vibero更新可用';
        let message = `发现新版本: ${newVersion}\n当前版本: ${currentVersion}`;

        if (updateInfo.releaseNotes) {
          message += `\n\n更新内容:\n${updateInfo.releaseNotes}`;
        }

        message += `\n\n是否立即下载?`;
        let result = Services.prompt.confirm(null, title, message);

        if (result) {
          // 下载更新包
          await Zotero._downloadAndInstallUpdate(updateInfo, newVersion, platform);
        }
      } else {
        console.log(`[Vibero更新] 已是最新版本`);
        if (!silent) Zotero.alert(null, 'Vibero更新', `Vibero已是最新版本 (${currentVersion})`);
      }
    } catch (e) {
      Zotero.logError(e);
      // console.log(`[Vibero更新] 异常: ${e.message}`);
      if (!silent) Zotero.alert(null, 'Vibero更新', '检查更新时出错: ' + e.message);
    }
  };


  /**
   * 下载Vibero更新包
   * 
   * macOS: 自动安装（保持原有逻辑）
   * Windows: 下载到应用目录上一层，提示用户手动解压替换
   * 
   * @param {Object} updateInfo - 更新信息对象
   * @param {string} newVersion - 新版本号
   * @param {string} platform - 平台标识 ('mac', 'win', 'linux')
   */
  this._downloadAndInstallUpdate = async function (updateInfo, newVersion, platform) {
    try {
      console.log(`[Vibero更新] 开始处理更新`);
      // console.log('[Vibero更新] updateInfo:', JSON.stringify(updateInfo));
      // console.log(`[Vibero更新] 平台: ${platform}`);

      if (!updateInfo.url) {
        // console.log('[Vibero更新] 错误: 无法获取更新包下载地址');
        Zotero.alert(null, 'Vibero更新', '无法获取更新包下载地址');
        return;
      }

      // console.log(`[Vibero更新] 下载URL: ${updateInfo.url}`);

      // 根据平台选择不同的处理方式
      let isWindows = platform === 'win';

      if (isWindows) {
        // Windows: 直接打开浏览器下载
        // console.log('[Vibero更新] Windows 平台：打开浏览器下载');

        let message = `发现新版本 ${newVersion}！\n\n` +
        `点击"下载"将自动在浏览器中打开下载链接。\n` +
        `下载完成后，请按以下步骤手动更新：\n\n` +
        `1. 下载链接中的zip压缩包\n` +
        `2. 解压得到一个新的Vibero_win-x64文件夹\n` +
        `3. 启动新文件夹中的vibero.exe即可（旧版本的Vibero_win-x64文件夹可直接删除）`;

        let ps = Services.prompt;
        let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
        let index = ps.confirmEx(
          null,
          'Vibero更新',
          message,
          buttonFlags,
          '下载', // 按钮 0
          null,
          null,
          null,
          {}
        );

        if (index === 0) {
          // console.log('[Vibero更新] 用户选择下载，打开浏览器');
          // 使用 Zotero 内置的 launchURL 打开浏览器
          Zotero.launchURL(updateInfo.url);
        } else {

          // console.log('[Vibero更新] 用户取消下载');
        }
        // console.log('[Vibero更新] Windows 更新流程完成');
        return;
      }

      // macOS/Linux: 自动下载和安装
      // console.log('[Vibero更新] macOS/Linux 平台：自动下载和安装');

      // 显示下载进度
      let progressWindow = new Zotero.ProgressWindow({ closeOnClick: false });
      progressWindow.changeHeadline('Vibero更新');
      progressWindow.addLines(['正在下载更新包...']);
      progressWindow.show();

      // console.log('[Vibero更新] 开始fetch请求');

      // 下载更新包
      let response = await fetch(updateInfo.url);

      // console.log(`[Vibero更新] 响应状态: ${response.status}`);

      if (!response.ok) {
        // console.log(`[Vibero更新] 错误: HTTP ${response.status}`);
        progressWindow.close();
        Zotero.alert(null, 'Vibero更新', `下载更新包失败 (HTTP ${response.status})`);
        return;
      }

      // console.log('[Vibero更新] 获取响应数据');

      // 获取更新包数据
      let buffer = await response.arrayBuffer();
      let fileSizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);

      // console.log(`[Vibero更新] 获取数据成功，大小: ${buffer.byteLength} 字节 (${fileSizeMB} MB)`);

      progressWindow.addLines(['保存更新包...']);

      // macOS/Linux: 保存到数据目录（用于自动安装）
      let dataDir = Zotero.DataDirectory.dir;
      let updateDir = PathUtils.join(dataDir, 'updates');
      await IOUtils.makeDirectory(updateDir, { ignoreExisting: true });

      let marFile = PathUtils.join(updateDir, `Vibero-${newVersion}.mar`);

      // console.log(`[Vibero更新] macOS/Linux 更新目录: ${updateDir}`);
      // console.log(`[Vibero更新] MAR文件路径: ${marFile}`);

      // 写入文件
      await IOUtils.write(marFile, new Uint8Array(buffer));

      // console.log('[Vibero更新] 更新包已保存');

      progressWindow.close();

      // macOS/Linux: 自动安装
      let ps = Services.prompt;
      let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
      ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
      let index = ps.confirmEx(
        null,
        'Vibero更新',
        `更新包已下载完成！\n\n新版本: ${newVersion}\n\n点击"退出并安装"将关闭应用并自动完成更新。\n更新完成后应用会自动重启。`,
        buttonFlags,
        '退出并安装', // 按钮 0
        null,
        null,
        null,
        {}
      );

      if (index === 0) {
        // console.log('[Vibero更新] 用户选择退出并安装');
        // 标记待应用的更新
        Services.prefs.setCharPref('extensions.zotero.vibeZotero.pendingUpdate', newVersion);
        Services.prefs.setCharPref('extensions.zotero.vibeZotero.pendingUpdateFile', marFile);
        // 退出并安装更新
        await Zotero._quitAndInstallUpdate(marFile, newVersion);
      } else {
        // macOS/Linux: 自动安装
        let ps = Services.prompt;
        let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING +
        ps.BUTTON_POS_1 * ps.BUTTON_TITLE_CANCEL;
        let index = ps.confirmEx(
          null,
          'Vibero更新',
          `更新包已下载完成！\n\n新版本: ${newVersion}\n\n点击"退出并安装"将关闭应用并自动完成更新。\n更新完成后应用会自动重启。`,
          buttonFlags,
          '退出并安装', // 按钮 0
          null,
          null,
          null,
          {}
        );

        if (index === 0) {
          // console.log('[Vibero更新] 用户选择退出并安装');
          // 标记待应用的更新
          Services.prefs.setCharPref('extensions.zotero.vibeZotero.pendingUpdate', newVersion);
          Services.prefs.setCharPref('extensions.zotero.vibeZotero.pendingUpdateFile', marFile);
          // 退出并安装更新
          await Zotero._quitAndInstallUpdate(marFile, newVersion);
        } else {

          // console.log('[Vibero更新] 用户取消安装，更新将在下次启动时提示');
        }}
    } catch (e) {
      Zotero.logError(e);
      // console.log(`[Vibero更新] 异常: ${e.message}`);
      console.error('[Vibero更新] 异常:', e);
      Zotero.alert(null, 'Vibero更新', '下载更新时出错: ' + e.message);
    }
  };

  /**
   * 退出应用并安装更新
   * 
   * 创建更新脚本，启动脚本，然后立即退出应用
   * 更新脚本会：
   * 1. 等待应用完全退出（检查进程）
   * 2. 解压更新包
   * 3. 备份当前应用
   * 4. 替换应用文件
   * 5. 启动新版本应用
   * 6. 清理临时文件和脚本自己
   */
  this._quitAndInstallUpdate = async function (marFile, newVersion) {
    try {
      console.log('[Vibero更新] 准备退出并安装更新');

      // 获取当前应用路径
      // GreD 是 Gecko 运行时目录
      // Windows: 通常就是可执行文件所在目录
      // macOS: Contents/Resources/，需要回到 .app
      let greDir = Services.dirsvc.get("GreD", Components.interfaces.nsIFile);
      // console.log(`[Vibero更新] GreD 路径: ${greDir.path}`);

      // 根据平台选择脚本类型和路径
      // 使用 Services.appinfo.OS 进行平台检测，更可靠
      let isWindows = Services.appinfo.OS === "WINNT";
      // console.log(`[Vibero更新] 检测到平台: ${Services.appinfo.OS}, isWindows: ${isWindows}`);

      // 获取可执行文件所在目录
      let appDir;
      if (isWindows) {
        // Windows: GreD 就是可执行文件所在目录
        appDir = greDir;
      } else {
        // macOS: GreD 是 Contents/Resources，需要回到 .app
        appDir = greDir.parent.parent;
      }

      let appPath = appDir.path;
      // console.log(`[Vibero更新] 应用路径: ${appPath}`);

      // 获取应用名称（用于检查进程）
      let appName = 'Vibero';

      // 创建更新目录
      let dataDir = Zotero.DataDirectory.dir;
      let updateDir = PathUtils.join(dataDir, 'updates');
      let extractDir = PathUtils.join(updateDir, 'extract');

      // console.log(`[Vibero更新] 数据目录: ${dataDir}`);
      // console.log(`[Vibero更新] 更新目录: ${updateDir}`);

      let scriptPath = isWindows ?
      PathUtils.join(updateDir, 'install_update.bat') :
      PathUtils.join(updateDir, 'install_update.sh');

      let scriptContent;

      if (isWindows) {
        // Windows 更新脚本（Batch）
        // 定义日志文件路径
        let logFile = PathUtils.join(updateDir, 'update.log');
        // 将路径转换为 Windows 格式（反斜杠）
        let logFileWin = logFile.replace(/\//g, '\\');
        let marFileWin = marFile.replace(/\//g, '\\');
        let appPathWin = appPath.replace(/\//g, '\\');
        let extractDirWin = extractDir.replace(/\//g, '\\');
        let exeName = 'vibero.exe';

        scriptContent = `@echo off
REM Vibero 更新安装脚本 (Windows)
REM 自动生成，请勿手动编辑

setlocal enabledelayedexpansion

REM 设置日志文件
set "LOGFILE=${logFileWin}"

REM 记录开始
echo [%date% %time%] ========================================== >> "%LOGFILE%"
echo [%date% %time%] Vibero 更新脚本已启动 >> "%LOGFILE%"
echo [%date% %time%] 目标版本: ${newVersion} >> "%LOGFILE%"
echo [%date% %time%] MAR 文件: ${marFileWin} >> "%LOGFILE%"
echo [%date% %time%] 应用路径: ${appPathWin} >> "%LOGFILE%"
echo [%date% %time%] 解压目录: ${extractDirWin} >> "%LOGFILE%"
echo [%date% %time%] ========================================== >> "%LOGFILE%"

REM 等待应用完全退出（最多等待 30 秒）
echo [%date% %time%] 等待应用完全退出... >> "%LOGFILE%"
set /a count=0
:wait_loop
tasklist /FI "IMAGENAME eq ${exeName}" 2>NUL | find /I /N "${exeName}">NUL
if "%ERRORLEVEL%"=="0" (
    set /a count+=1
    if !count! GEQ 30 (
        echo [%date% %time%] 错误: 等待超时，应用仍在运行 >> "%LOGFILE%"
        goto cleanup_and_exit
    )
    echo [%date% %time%] 等待应用退出... (!count!/30^) >> "%LOGFILE%"
    timeout /t 1 /nobreak >nul
    goto wait_loop
)

echo [%date% %time%] 应用已退出 >> "%LOGFILE%"

REM 额外等待 2 秒确保文件系统释放
echo [%date% %time%] 额外等待 2 秒... >> "%LOGFILE%"
timeout /t 2 /nobreak >nul

echo [%date% %time%] 开始安装更新 ${newVersion} >> "%LOGFILE%"

REM 清理旧的解压目录
if exist "${extractDirWin}" (
    echo [%date% %time%] 清理旧的解压目录 >> "%LOGFILE%"
    rmdir /s /q "${extractDirWin}" 2>>"%LOGFILE%"
)

REM 创建解压目录
echo [%date% %time%] 创建解压目录 >> "%LOGFILE%"
mkdir "${extractDirWin}" 2>>"%LOGFILE%"

REM 检查 MAR 文件
if not exist "${marFileWin}" (
    echo [%date% %time%] 错误: MAR 文件不存在 >> "%LOGFILE%"
    goto cleanup_and_exit
)

REM 解压更新包
echo [%date% %time%] 开始解压更新包... >> "%LOGFILE%"
tar -xzf "${marFileWin}" -C "${extractDirWin}" 2>>"%LOGFILE%"
if errorlevel 1 (
    echo [%date% %time%] 错误: 解压失败！ >> "%LOGFILE%"
    goto cleanup_and_exit
)

echo [%date% %time%] 解压完成 >> "%LOGFILE%"

REM 检查解压结果（注意：解压后可能是 Vibero_win-x64 目录）
if exist "${extractDirWin}\\Vibero_win-x64" (
    echo [%date% %time%] 找到 Vibero_win-x64 目录 >> "%LOGFILE%"
    set "SOURCE_DIR=${extractDirWin}\\Vibero_win-x64"
) else if exist "${extractDirWin}\\Vibero" (
    echo [%date% %time%] 找到 Vibero 目录 >> "%LOGFILE%"
    set "SOURCE_DIR=${extractDirWin}\\Vibero"
) else (
    echo [%date% %time%] 错误: 未找到 Vibero 目录 >> "%LOGFILE%"
    dir "${extractDirWin}" >> "%LOGFILE%"
    goto cleanup_and_exit
)

REM 验证可执行文件
if not exist "%SOURCE_DIR%\\${exeName}" (
    echo [%date% %time%] 错误: 未找到 ${exeName} >> "%LOGFILE%"
    goto cleanup_and_exit
)

echo [%date% %time%] 目录结构验证通过 >> "%LOGFILE%"

REM 备份当前应用
set "BACKUP_PATH=${appPathWin}.backup"
echo [%date% %time%] 备份当前应用 >> "%LOGFILE%"

if exist "%BACKUP_PATH%" (
    echo [%date% %time%] 删除旧备份 >> "%LOGFILE%"
    rmdir /s /q "%BACKUP_PATH%" 2>>"%LOGFILE%"
)

move "${appPathWin}" "%BACKUP_PATH%" 2>>"%LOGFILE%"
if errorlevel 1 (
    echo [%date% %time%] 错误: 备份失败！ >> "%LOGFILE%"
    goto cleanup_and_exit
)

echo [%date% %time%] 备份完成 >> "%LOGFILE%"

REM 移动新应用到原位置
echo [%date% %time%] 安装新版本应用 >> "%LOGFILE%"
move "%SOURCE_DIR%" "${appPathWin}" 2>>"%LOGFILE%"
if errorlevel 1 (
    echo [%date% %time%] 错误: 安装失败！尝试恢复备份... >> "%LOGFILE%"
    move "%BACKUP_PATH%" "${appPathWin}" 2>>"%LOGFILE%"
    if errorlevel 1 (
        echo [%date% %time%] 错误: 恢复备份也失败了！ >> "%LOGFILE%"
    ) else (
        echo [%date% %time%] 备份已恢复 >> "%LOGFILE%"
    )
    goto cleanup_and_exit
)

echo [%date% %time%] 新版本应用已安装 >> "%LOGFILE%"

REM 删除备份
echo [%date% %time%] 删除备份 >> "%LOGFILE%"
rmdir /s /q "%BACKUP_PATH%" 2>>"%LOGFILE%"

echo [%date% %time%] 更新安装完成！ >> "%LOGFILE%"

REM 清理临时文件
:cleanup_temp_files
echo [%date% %time%] 清理临时文件... >> "%LOGFILE%"

if exist "${extractDirWin}" (
    rmdir /s /q "${extractDirWin}" 2>>"%LOGFILE%"
)

if exist "${marFileWin}" (
    del /f /q "${marFileWin}" 2>>"%LOGFILE%"
)

REM 启动新版本应用
echo [%date% %time%] 启动新版本应用 >> "%LOGFILE%"
start "" "${appPathWin}\\${exeName}"

REM 等待应用启动
timeout /t 3 /nobreak >nul

REM 检查应用是否启动成功
tasklist /FI "IMAGENAME eq ${exeName}" 2>NUL | find /I /N "${exeName}">NUL
if "%ERRORLEVEL%"=="0" (
    echo [%date% %time%] 应用已成功启动 >> "%LOGFILE%"
) else (
    echo [%date% %time%] 未检测到应用进程 >> "%LOGFILE%"
)

echo [%date% %time%] ========================================== >> "%LOGFILE%"
echo [%date% %time%] 更新流程全部完成 >> "%LOGFILE%"
echo [%date% %time%] ========================================== >> "%LOGFILE%"

REM 删除更新脚本自己
del /f /q "%~f0"
exit

:cleanup_and_exit
echo [%date% %time%] 更新失败，执行清理... >> "%LOGFILE%"
if exist "${extractDirWin}" rmdir /s /q "${extractDirWin}"
if exist "${marFileWin}" del /f /q "${marFileWin}"
del /f /q "%~f0"
exit /b 1
`;
      } else {
        // macOS 更新脚本（保持原有逻辑）
        let logFile = '/tmp/vibezotero_update.log';
        scriptContent = `#!/bin/bash
# VibeZotero 更新安装脚本
# 自动生成，请勿手动编辑
# 日志文件: ${logFile}

# 重定向所有输出到日志文件（同时也输出到控制台）
exec > >(tee -a "${logFile}") 2>&1

set -x  # 打印每条命令（调试用）

log_msg() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log_error() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ 错误: $1" >&2
}

# 优化点3: 清理函数 - 无论成功失败都清理临时文件
cleanup_temp_files() {
    log_msg "清理临时文件..."
    
    # 删除解压目录
    if [ -d "${extractDir}" ]; then
        log_msg "删除解压目录: ${extractDir}"
        rm -rf "${extractDir}"
    fi
    
    # 删除 MAR 包（无论成功失败都删除，让用户重新下载）
    if [ -f "${marFile}" ]; then
        log_msg "删除 MAR 包: ${marFile}"
        rm -f "${marFile}"
    fi
    
    # 删除更新脚本自己
    if [ -f "$0" ]; then
        log_msg "删除更新脚本: $0"
        rm -f "$0"
    fi
}

# 设置错误处理 - 失败时也清理
trap 'log_error "更新失败！"; cleanup_temp_files; exit 1' ERR

log_msg "=========================================="
log_msg "VibeZotero 更新脚本已启动"
log_msg "目标版本: ${newVersion}"
log_msg "MAR 文件: ${marFile}"
log_msg "应用路径: ${appPath}"
log_msg "解压目录: ${extractDir}"
log_msg "=========================================="

# 等待应用完全退出（最多等待 30 秒）
log_msg "等待应用完全退出..."
for i in {1..30}; do
    if ! pgrep -x "${appName}" > /dev/null; then
        log_msg "应用已退出 (等待了 $i 秒)"
        break
    fi
    log_msg "等待应用退出... ($i/30)"
    sleep 1
done

# 再等待 2 秒确保文件系统释放
log_msg "额外等待 2 秒确保文件系统释放..."
sleep 2

log_msg "开始安装更新 ${newVersion}"

# 清理旧的解压目录
if [ -d "${extractDir}" ]; then
    log_msg "清理旧的解压目录: ${extractDir}"
    rm -rf "${extractDir}"
fi

# 创建解压目录
log_msg "创建解压目录: ${extractDir}"
mkdir -p "${extractDir}"

# 检查 MAR 文件
if [ ! -f "${marFile}" ]; then
    log_error "MAR 文件不存在: ${marFile}"
    exit 1
fi

log_msg "MAR 文件大小: $(ls -lh "${marFile}" | awk '{print $5}')"

# 解压更新包
log_msg "开始解压更新包..."
log_msg "命令: tar -xzf ${marFile} -C ${extractDir}"

if ! tar -xzf "${marFile}" -C "${extractDir}"; then
    log_error "解压失败！"
    log_msg "tar 命令返回码: $?"
    exit 1
fi

log_msg "解压命令执行完成"

# 列出解压后的目录内容（调试用）
log_msg "解压后的目录内容:"
ls -la "${extractDir}"
log_msg "递归列出解压目录（前 50 行）:"
find "${extractDir}" -maxdepth 3 | head -50

# 检查解压结果
if [ ! -d "${extractDir}/Vibero.app" ]; then
    log_error "解压后未找到 Vibero.app"
    log_msg "解压目录内容:"
    ls -laR "${extractDir}" | head -100
    log_msg "检查是否有其他 .app 目录:"
    find "${extractDir}" -name "*.app" -type d
    exit 1
fi

log_msg "✅ 解压完成，找到 Vibero.app"

# 验证 Vibero.app 结构
log_msg "验证 Vibero.app 结构:"
ls -la "${extractDir}/Vibero.app/"
if [ -d "${extractDir}/Vibero.app/Contents" ]; then
    log_msg "✅ Contents 目录存在"
    ls -la "${extractDir}/Vibero.app/Contents/"
else
    log_error "Vibero.app/Contents 目录不存在！"
    exit 1
fi

# 备份当前应用
BACKUP_PATH="${appPath}.backup"
log_msg "备份当前应用: ${appPath} -> $BACKUP_PATH"

if [ -d "$BACKUP_PATH" ]; then
    log_msg "删除旧备份: $BACKUP_PATH"
    rm -rf "$BACKUP_PATH"
fi

if ! mv "${appPath}" "$BACKUP_PATH"; then
    log_error "备份失败！无法移动 ${appPath} 到 $BACKUP_PATH"
    exit 1
fi

log_msg "✅ 备份完成"

# 移动新应用到原位置
log_msg "安装新版本应用: ${extractDir}/Vibero.app -> ${appPath}"

if ! mv "${extractDir}/Vibero.app" "${appPath}"; then
    log_error "安装失败！尝试恢复备份..."
    if mv "$BACKUP_PATH" "${appPath}"; then
        log_msg "✅ 备份已恢复"
    else
        log_error "恢复备份也失败了！应用可能损坏！"
    fi
    exit 1
fi

log_msg "✅ 新版本应用已安装"

# 删除备份（更新成功）
log_msg "删除备份: $BACKUP_PATH"
rm -rf "$BACKUP_PATH"

log_msg "✅ 更新安装完成！"

# 清理临时文件（成功时调用）
cleanup_temp_files

# 启动新版本应用
log_msg "启动新版本应用: ${appPath}"
open -a "${appPath}"

# 等待应用启动
log_msg "等待应用启动..."
sleep 3

# 检查应用是否启动成功
if pgrep -x "${appName}" > /dev/null; then
    log_msg "✅ 应用已成功启动"
else
    log_msg "⚠️ 未检测到应用进程，请手动检查"
fi

log_msg "=========================================="
log_msg "✅ 更新流程全部完成"
log_msg "=========================================="
`;
      }

      // 写入脚本文件
      console.log(`[Vibero更新] 创建更新脚本: ${scriptPath}`);
      await IOUtils.writeUTF8(scriptPath, scriptContent);

      if (!isWindows) {
        // macOS: 设置脚本可执行权限
        let scriptFile = Components.classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsIFile);
        scriptFile.initWithPath(scriptPath);
        scriptFile.permissions = 0o755;
      }

      console.log('[Vibero更新] 更新脚本已创建');

      // 启动更新脚本（后台运行）
      console.log('[Vibero更新] 启动更新脚本...');
      let process = Components.classes["@mozilla.org/process/util;1"].
      createInstance(Components.interfaces.nsIProcess);
      let shellBin = Components.classes["@mozilla.org/file/local;1"].
      createInstance(Components.interfaces.nsIFile);

      if (isWindows) {
        // Windows: 使用独立的 vibero-updater.exe
        console.log(`[Vibero更新] 使用独立更新程序`);

        // 创建更新程序的 nsIFile 对象
        let updaterFile = appDir.clone();
        updaterFile.append('vibero-updater.exe');

        console.log(`[Vibero更新] 更新程序路径: ${updaterFile.path}`);

        // 检查更新程序是否存在
        if (!updaterFile.exists()) {
          throw new Error(`更新程序不存在: ${updaterFile.path}`);
        }

        // 创建 MAR 文件的 nsIFile 对象
        let marFileObj = Components.classes["@mozilla.org/file/local;1"].
        createInstance(Components.interfaces.nsIFile);
        marFileObj.initWithPath(marFile);

        // 准备参数（使用 nsIFile.path 获取本地路径格式）
        // 参数1: MAR 文件路径
        // 参数2: 应用目录
        // 参数3: 新版本号
        let args = [marFileObj.path, appDir.path, newVersion];

        console.log(`[Vibero更新] 启动更新程序`);
        console.log(`[Vibero更新] MAR 文件: ${args[0]}`);
        console.log(`[Vibero更新] 应用目录: ${args[1]}`);
        console.log(`[Vibero更新] 新版本: ${args[2]}`);

        // 初始化进程
        process.init(updaterFile);

        // 非阻塞方式启动更新程序
        process.runAsync(args, args.length, {
          observe: function (subject, topic, data) {
            if (topic === 'process-finished') {
              console.log('[Vibero更新] 更新程序已启动');
            } else if (topic === 'process-failed') {
              console.error('[Vibero更新] 更新程序启动失败');
            }
          }
        });
      } else {
        // macOS: 使用 bash 执行 .sh 脚本
        shellBin.initWithPath("/bin/bash");
        process.init(shellBin);
        let args = [scriptPath];

        // 非阻塞方式启动脚本
        process.runAsync(args, args.length, {
          observe: function (subject, topic, data) {
            if (topic === 'process-finished') {
              console.log('[Vibero更新] 更新脚本已完成');
            } else if (topic === 'process-failed') {
              console.error('[Vibero更新] 更新脚本执行失败');
            }
          }
        });
      }

      console.log('[Vibero更新] 更新脚本已启动，准备退出应用...');

      // 等待一小段时间确保脚本启动
      await new Promise((resolve) => setTimeout(resolve, 500));

      // 立即退出应用（强制退出，不保存状态）
      console.log('[Vibero更新] 退出应用...');
      Services.startup.quit(Components.interfaces.nsIAppStartup.eForceQuit);

    } catch (e) {
      Zotero.logError(e);
      console.error('[Vibero更新] 退出并安装更新失败:', e);
      Zotero.alert(null, 'VibeZotero更新', '启动更新安装失败: ' + e.message);
    }
  };


  /**
   * Launch a file, the best way we can
   */
  this.launchFile = function (file) {
    file = Zotero.File.pathToFile(file);

    Zotero.Utilities.Internal.Environment.clearMozillaVariables();

    try {
      Zotero.debug("Launching " + file.path);
      file.launch();
    }
    catch (e) {
      // macOS only: if there's no associated application, launch() will throw, but
      // the OS will show a dialog asking the user to choose an application. We don't
      // want to show the Firefox dialog in that case.
      if (Zotero.isMac && file.exists()) {
        return;
      }

      Zotero.debug(e, 2);
      Zotero.debug("launch() not supported -- trying fallback executable", 2);

      try {
        if (Zotero.isWin) {
          var pref = "fallbackLauncher.windows";
        } else
        {
          var pref = "fallbackLauncher.unix";
        }
        let launcher = Zotero.Prefs.get(pref);
        this.launchFileWithApplication(file.path, launcher);
      }
      catch (e) {
        Zotero.debug(e);
        Zotero.debug("Launching via executable failed -- passing to loadURI()");

        // If nsIFile.launch() isn't available and the fallback
        // executable doesn't exist, we just let the Firefox external
        // helper app window handle it
        var uri = Services.io.newFileURI(file);

        var nsIEPS = Components.classes["@mozilla.org/uriloader/external-protocol-service;1"].
        getService(Components.interfaces.nsIExternalProtocolService);
        nsIEPS.loadURI(
          uri,
          Services.scriptSecurityManager.getSystemPrincipal()
        );
      }
    }
  };


  /**
   * Launch a file with the given application
   */
  this.launchFileWithApplication = function (filePath, applicationPath) {
    Zotero.debug(`Launching ${filePath} with ${applicationPath}`);

    var exec = Zotero.File.pathToFile(applicationPath);
    if (!exec.exists()) {
      throw new Error("'" + applicationPath + "' does not exist");
    }

    var args;
    // On macOS, if we only have an .app, launch it using 'open'
    if (Zotero.isMac && applicationPath.endsWith('.app')) {
      args = [filePath, '-a', applicationPath];
      applicationPath = '/usr/bin/open';
    } else
    {
      args = [filePath];
    }

    Zotero.Utilities.Internal.Environment.clearMozillaVariables();

    // Async, but we don't want to block
    Zotero.Utilities.Internal.exec(applicationPath, args);
  };


  /**
   * Launch a URL externally, the best way we can
   */
  this.launchURL = function (url) {
    if (!Zotero.Utilities.isHTTPURL(url)) {
      if (Zotero.Utilities.isHTTPURL(url, true)) {
        url = 'http://' + url;
      }
      // Launch non-HTTP URLs
      else {
        let schemeRE = /^([a-z][a-z0-9+.-]+):/;
        let matches = url.match(schemeRE);
        if (!matches) {
          throw new Error(`Invalid URL '${url}'`);
        }
        let scheme = matches[1];
        if (['javascript', 'data', 'chrome', 'resource'].includes(scheme)) {
          throw new Error(`Invalid scheme '${scheme}'`);
        }
        let svc = Components.classes['@mozilla.org/uriloader/external-protocol-service;1'].
        getService(Components.interfaces.nsIExternalProtocolService);
        let found = {};
        let handlerInfo = svc.getProtocolHandlerInfoFromOS(scheme, found);
        if (!found.value) {
          throw new Error(`Handler not found for '${scheme}' URLs`);
        }
        if (!Zotero.isWin) {
          Zotero.Utilities.Internal.Environment.clearMozillaVariables();
        }

        svc.loadURI(Services.io.newURI(url, null, null));
        return;
      }
    }

    try {
      if (!Zotero.isWin) {
        Zotero.Utilities.Internal.Environment.clearMozillaVariables();
      }

      var uri = Services.io.newURI(url, null, null);
      var handler = Components.classes['@mozilla.org/uriloader/external-protocol-service;1'].
      getService(Components.interfaces.nsIExternalProtocolService).
      getProtocolHandlerInfo('http');
      handler.preferredAction = Components.interfaces.nsIHandlerInfo.useSystemDefault;
      handler.launchWithURI(uri, null);
    }
    catch (e) {
      Zotero.debug("launchWithURI() not supported -- trying fallback executable");

      if (Zotero.isWin) {
        var pref = "fallbackLauncher.windows";
      } else
      {
        var pref = "fallbackLauncher.unix";
      }
      var path = Zotero.Prefs.get(pref);

      let exec = Zotero.File.pathToFile(path);
      if (!exec.exists()) {
        throw new Error("Fallback executable not found -- " +
        "check extensions.zotero." + pref + " in about:config");
      }

      Zotero.Utilities.Internal.Environment.clearMozillaVariables();

      var proc = Components.classes["@mozilla.org/process/util;1"].
      createInstance(Components.interfaces.nsIProcess);
      proc.init(exec);

      var args = [url];
      proc.runw(false, args, args.length);
    }
  };


  /**
   * Opens a URL in the basic viewer, and optionally run a callback on load
   *
   * @param {String} uri
   * @param {Object} [options]
   * @param {Function} [options.onLoad] - Function to run once URI is loaded; passed the loaded document
   * @param {Object} [options.cookieSandbox] - Attach a cookie sandbox to the browser
   * @param {Boolean} [options.allowJavaScript] - Set to false to disable JavaScript
   */
  this.openInViewer = function (uri, options) {
    if (options && !options.onLoad && typeof options === 'function') {
      Zotero.debug("Zotero.openInViewer() now takes an 'options' object for its second parameter -- update your code");
      options = { onLoad: options };
    }

    var viewerWins = Services.wm.getEnumerator("zotero:basicViewer");
    for (let existingWin of viewerWins) {
      if (existingWin.viewerOriginalURI === uri) {
        existingWin.focus();
        return existingWin;
      }
    }
    let ww = Components.classes['@mozilla.org/embedcomp/window-watcher;1'].
    getService(Components.interfaces.nsIWindowWatcher);
    let arg = {
      uri,
      options: {
        ...options,
        onLoad: undefined
      }
    };
    arg.wrappedJSObject = arg;
    let win = ww.openWindow(null, "chrome://zotero/content/standalone/basicViewer.xhtml",
    null, "chrome,dialog=yes,resizable,centerscreen,menubar,scrollbars", arg);
    if (options?.onLoad) {
      let browser;
      let func = function () {
        win.removeEventListener("load", func);
        // <browser> is created in basicViewer.js in a window load event, so we have to
        // wait for that
        setTimeout(() => {
          browser = win.document.documentElement.getElementsByTagName('browser')[0];
          browser.addEventListener("pageshow", innerFunc);
        });
      };
      let innerFunc = function () {
        browser.removeEventListener("pageshow", innerFunc);
        options.onLoad(browser.contentDocument);
      };
      win.addEventListener("load", func);
    }
    return win;
  };


  /*
   * Debug logging function
   *
   * Uses prefs e.z.debug.log and e.z.debug.level (restart required)
   *
   * @param {} message
   * @param {Integer} [level=3]
   * @param {Integer} [maxDepth]
   * @param {Boolean|Integer} [stack] Whether to display the calling stack.
   *   If true, stack is displayed starting from the caller. If an integer,
   *   that many stack levels will be omitted starting from the caller.
   */
  function debug(message, level, maxDepth, stack) {
    // Account for this alias
    if (stack === true) {
      stack = 1;
    } else if (stack >= 0) {
      stack++;
    }

    Zotero.Debug.log(message, level, maxDepth, stack);
  }


  /*
   * Log a message to the Mozilla JS error console
   *
   * |type| is a string with one of the flag types in nsIScriptError:
   *    'error', 'warning', 'exception', 'strict'
   */
  this.log = function (message, type, sourceName, sourceLine, lineNumber, columnNumber) {
    var scriptError = Components.classes["@mozilla.org/scripterror;1"].
    createInstance(Components.interfaces.nsIScriptError);

    if (!type) {
      type = 'warning';
    }
    var flags = scriptError[type + 'Flag'];

    scriptError.init(
      message,
      sourceName ? sourceName : null,
      sourceLine != undefined ? sourceLine : null,
      lineNumber != undefined ? lineNumber : null,
      columnNumber != undefined ? columnNumber : null,
      flags,
      'system javascript',
      false,
      true
    );
    Services.console.logMessage(scriptError);
  };

  /**
   * Log a JS error to the Mozilla error console and debug output
   * @param {Exception} err
   */
  this.logError = function (err) {
    Zotero.debug(err, 1);
    this.log(err.message ? err.message : err.toString(), "error",
    err.fileName ? err.fileName : err.filename ? err.filename : null, null,
    err.lineNumber ? err.lineNumber : null, null);
  };


  this.warn = function (err) {
    Zotero.debug(err + "\n\n" + Zotero.Utilities.Internal.filterStack(new Error().stack), 2);
    this.log(err.message ? err.message : err.toString(), "warning",
    err.fileName ? err.fileName : err.filename ? err.filename : null, null,
    err.lineNumber ? err.lineNumber : null, null);
  };


  /**
   * Display an alert in a given window
   *
   * @param {Window}
   * @param {String} title
   * @param {String} msg
   */
  this.alert = function (window, title, msg) {
    this.debug(`Alert:\n\n${msg}`);
    Services.prompt.alert(window, title, msg);
  };


  /**
   * Display an error message saying that an error has occurred and Zotero needs to be restarted.
   *
   * If |popup| is TRUE, display in popup progress window; otherwise, display as items pane message
   */
  this.crash = function (popup) {
    this.crashed = true;

    // Check the database after restart
    Zotero.Schema.setIntegrityCheckRequired(true).catch((e) => this.logError(e));

    var reportErrorsStr = Zotero.getString('errorReport.reportErrors');
    var reportInstructions = Zotero.getString('errorReport.reportInstructions', reportErrorsStr);

    var msg;
    if (popup) {
      msg = Zotero.getString('general.pleaseRestart', Zotero.appName) + ' ' +
      reportInstructions;
    } else
    {
      msg = Zotero.getString('general.errorHasOccurred') + ' ' +
      Zotero.getString('general.pleaseRestart', Zotero.appName) + '\n\n' +
      reportInstructions;
    }
    Zotero.logError(msg);
    Zotero.logError(new Error().stack);

    this.startupError = msg;
    this.startupErrorHandler = null;

    var enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      let win = enumerator.getNext();
      if (!win.ZoteroPane) continue;

      // Display as popup progress window
      if (popup) {
        var pw = new Zotero.ProgressWindow();
        pw.changeHeadline(Zotero.getString('general.errorHasOccurred'));
        pw.addDescription(msg);
        pw.show();
        pw.startCloseTimer(8000);
      }
      // Display as items pane message
      else {
        win.ZoteroPane.setItemsPaneMessage(msg, true);
      }
    }
  };


  this.getErrors = function (asStrings) {
    var errors = [];

    for (let msg of _startupErrors.concat(_recentErrors)) {
      let altMessage;
      // Remove password in malformed XML errors
      if (msg.category == 'malformed-xml') {
        try {
          // msg.message is read-only, so store separately
          altMessage = msg.message.replace(/(https?:\/\/[^:]+:)([^@]+)(@[^"]+)/, "$1****$3");
        }
        catch (e) {}
      }

      if (asStrings) {
        errors.push(altMessage || msg.message);
      } else
      {
        errors.push(msg);
      }
    }
    return errors;
  };

  this.isWin64EmulatedOnArm = function () {
    if (!this.isWin) {
      return false;
    }

    if (Services.sysinfo.getProperty("build") < 22000) {
      // GetMachineTypeAttributes is only available on Windows 11 and later
      return false;
    }

    if (this.arch !== "x86_64") {
      // We only check if x86_64 build is running on ARM
      return false;
    }

    // https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/ne-processthreadsapi-machine_attributes
    const userEnabled = 0x00000001;

    let { ctypes } = ChromeUtils.importESModule(
      "resource://gre/modules/ctypes.sys.mjs"
    );
    try {
      // https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getmachinetypeattributes
      let kernel32 = ctypes.open("Kernel32");
      let getMachineTypeAttributesC = kernel32.declare(
        "GetMachineTypeAttributes",
        ctypes.winapi_abi,
        ctypes.int,
        ctypes.unsigned_short,
        ctypes.int.ptr
      );
      let aa64 = 0xaa64;
      let output = ctypes.int();
      getMachineTypeAttributesC(aa64, output.address());
      kernel32.close();
      return !!(output.value & userEnabled);
    }
    catch (e) {
      Zotero.logError(e);
      return false;
    }
  };

  this.isLinux64EmulatedOnArm = function () {
    if (!this.isLinux) {
      return false;
    }

    // We only check if x86_64 build is running on ARM
    if (this.arch !== "x86_64") {
      return false;
    }

    try {
      const { ctypes } = ChromeUtils.importESModule(
        "resource://gre/modules/ctypes.sys.mjs"
      );

      let utsname = ctypes.StructType("utsname", [
      { sysname: ctypes.ArrayType(ctypes.char, 65) },
      { nodename: ctypes.ArrayType(ctypes.char, 65) },
      { release: ctypes.ArrayType(ctypes.char, 65) },
      { version: ctypes.ArrayType(ctypes.char, 65) },
      { machine: ctypes.ArrayType(ctypes.char, 65) },
      { domainname: ctypes.ArrayType(ctypes.char, 65) }]
      );

      let libc = ctypes.open("libc.so.6");
      let unameC = libc.declare(
        "uname",
        ctypes.default_abi,
        ctypes.int,
        utsname.ptr
      );

      let buf = utsname();
      if (unameC(buf.address()) !== 0) {
        libc.close();
        return false;
      }

      let machine = buf.machine.readString().trim(); // e.g., "x86_64", "aarch64"
      libc.close();

      return ["aarch64", "arm64"].includes(machine.toLowerCase());
    }
    catch (e) {
      Zotero.logError(e);
      return false;
    }
  };

  /**
   * Get versions, platform, etc.
   */
  this.getSystemInfo = async function () {
    var version = Zotero.version + ' (';

    var arch = Zotero.arch;
    if (arch == 'aarch64') {
      arch = 'ARM64';
    } else
    if (arch == 'x86_64') {
      arch = 'x64';
    }
    version += arch;

    if (Zotero.isWin) {
      let info = await Services.sysinfo.processInfo;
      if (info.isWowARM64 || this.isWin64EmulatedOnArm()) {
        version += " on ARM64";
      } else
      if (info.isWow64) {
        version += " on x64";
      }
    }
    version += ')';

    var info = {
      appName: Services.appinfo.name,
      version,
      os: await this.getOSVersion(),
      locale: Zotero.locale
    };

    if (Services.appinfo.inSafeMode) {
      info.safeMode = true;
    }

    var extensions = await Zotero.getInstalledExtensions();
    info.extensions = extensions.join(', ');

    var str = '';
    for (var key in info) {
      str += key + ' => ' + info[key] + ', ';
    }
    str = str.substr(0, str.length - 2);
    return str;
  };


  /**
   * Return OS and OS version
   *
   * "macOS 13.3.1"
   * "Windows 10.0 19043"
   * "Windows 11 22000"
   * "Linux 5.4.0-148-generic #165-Ubuntu SMP Tue Apr 18 08:53:12 UTC 2023"
   *
   * @return {String}
   */
  this.getOSVersion = async function () {
    if (Zotero.isMac) {
      try {
        return "macOS " +
        (await Zotero.Utilities.Internal.subprocess('/usr/bin/sw_vers', ['-productVersion'])).trim();
      }
      catch (e) {
        Zotero.logError(e);
      }
    }

    var name = Services.sysinfo.getProperty("name");
    var version = Services.sysinfo.getProperty("version");
    var build = Services.sysinfo.getProperty("build");
    if (Zotero.isWin) {
      name = "Windows";
      // Builds above 22000 are Windows 11
      if (build >= 22000) {
        version = 11;
      }
    }
    return name + " " + version + " " + build;
  };


  /**
   * @return {Promise<String[]>} - Promise for an array of extension names and versions
   */
  this.getInstalledExtensions = async function () {
    var { AddonManager } = ChromeUtils.importESModule("resource://gre/modules/AddonManager.sys.mjs");
    var installed = await AddonManager.getAllAddons();

    installed.sort(function (a, b) {
      return (a.appDisabled || a.userDisabled ? 1 : 0) - (
      b.appDisabled || b.userDisabled ? 1 : 0);
    });
    var addons = [];
    var isSafeMode = Services.appinfo.inSafeMode;
    for (let addon of installed) {
      if (addon.type == "theme") {
        continue;
      }

      addons.push(addon.name + " (" + addon.version + (
      addon.type != 2 ? ", " + addon.type : "") + (
      addon.appDisabled || addon.userDisabled || isSafeMode ? ", disabled" : "") +
      ")");
    }

    return addons;
  };

  this.getString = function (name, params, num) {
    return Zotero.Intl.getString(...arguments);
  };

  this.defineProperty = (...args) => Zotero.Utilities.Internal.defineProperty(...args);

  this.extendClass = (...args) => Zotero.Utilities.Internal.extendClass(...args);

  this.getLocaleCollation = function () {
    return Zotero.Intl.collation;
  };

  this.localeCompare = function (...args) {
    return Zotero.Intl.compare(...args);
  };

  function setFontSize(rootElement) {
    return Zotero.Utilities.Internal.setFontSize(rootElement);
  }

  function flattenArguments(args) {
    return Zotero.Utilities.Internal.flattenArguments(args);
  }

  function getAncestorByTagName(elem, tagName) {
    return Zotero.Utilities.Internal.getAncestorByTagName(elem, tagName);
  }

  this.randomString = function (len, chars) {
    return Zotero.Utilities.randomString(len, chars);
  };


  this.moveToUnique = function (file, newFile) {
    Zotero.debug("Zotero.moveToUnique() is deprecated -- use Zotero.File.moveToUnique()", 2);
    newFile.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0o644);
    var newName = newFile.leafName;
    newFile.remove(null);

    // Move file to unique name
    file.moveTo(newFile.parent, newName);
    return file;
  };

  this.lazy = function (fn) {
    return Zotero.Utilities.Internal.lazy(fn);
  };

  this.serial = function (fn) {
    return Zotero.Utilities.Internal.serial(fn);
  };

  /**
   * Show Zotero pane overlay and progress bar in all windows
   *
   * @param {String} msg
   * @param {Boolean} [determinate=false]
   * @param {Boolean} [modalOnly=false] - Don't use popup if Zotero pane isn't showing
   * @return	void
   */
  this.showZoteroPaneProgressMeter = function (msg, determinate, icon, modalOnly) {
    // If msg is undefined, keep any existing message. If false/null/"", clear.
    // The message is also cleared when the meters are hidden.
    _progressMessage = msg = (msg === undefined ? _progressMessage : msg) || "";
    var currentWindow = Services.wm.getMostRecentWindow("navigator:browser");
    var enumerator = Services.wm.getEnumerator("navigator:browser");
    var progressMeters = [];
    while (enumerator.hasMoreElements()) {
      var win = enumerator.getNext();
      if (!win.ZoteroPane) continue;

      var label = win.ZoteroPane.document.getElementById('zotero-pane-progress-label');
      if (!label) {
        Components.utils.reportError("label not found in " + win.document.location.href);
      }
      if (msg) {
        label.hidden = false;
        label.value = msg;
      } else
      {
        label.hidden = true;
      }
      // This is the craziest thing. In Firefox 52.6.0, the very presence of this line
      // causes Zotero on Linux to burn 5% CPU at idle, even if everything below it in
      // the block is commented out. Same if the progressmeter itself is hidden="true".
      // For some reason it also doesn't seem to work to set the progressmeter to
      // 'determined' when hiding, which we're doing in lookup.js. So instead, create a new
      // progressmeter each time and delete it in _hideWindowZoteroPaneOverlay().
      //
      //let progressMeter = win.ZoteroPane.document.getElementById('zotero-pane-progressmeter');
      let doc = win.ZoteroPane.document;
      let container = doc.getElementById('zotero-pane-progressmeter-container');
      let id = 'zotero-pane-progressmeter';
      let progressMeter = doc.getElementById(id);
      if (!progressMeter) {
        progressMeter = doc.createElement('progress');
        progressMeter.id = id;
      }
      if (determinate) {
        progressMeter.setAttribute('value', 0);
        progressMeter.max = 1000;
      } else
      {
        progressMeter.removeAttribute('value');
      }
      container.appendChild(progressMeter);

      _showWindowZoteroPaneOverlay(win.ZoteroPane.document);
      win.ZoteroPane.document.getElementById('zotero-pane-overlay-deck').selectedIndex = 0;

      progressMeters.push(progressMeter);
    }
    this.locked = true;
    _progressMeters = progressMeters;
  };


  /**
   * @param	{Number}	percentage		Percentage complete as integer or float
   */
  this.updateZoteroPaneProgressMeter = function (percentage) {
    if (percentage !== null) {
      if (percentage < 0 || percentage > 100) {
        Zotero.debug("Invalid percentage value '" + percentage + "' in Zotero.updateZoteroPaneProgressMeter()");
        return;
      }
      percentage = Math.round(percentage * 10);
    }
    if (percentage === _lastPercentage) {
      return;
    }
    for (let pm of _progressMeters) {
      if (percentage !== null) {
        if (!pm.hasAttribute('value')) {
          pm.max = 1000;
        }
        pm.setAttribute('value', percentage);
      } else
      if (pm.hasAttribute('value')) {
        pm.removeAttribute('value');
      }
    }
    _lastPercentage = percentage;
  };


  /**
   * Hide Zotero pane overlay in all windows
   */
  this.hideZoteroPaneOverlays = function () {
    this.locked = false;

    var enumerator = Services.wm.getEnumerator("navigator:browser");
    while (enumerator.hasMoreElements()) {
      var win = enumerator.getNext();
      if (win.ZoteroPane && win.ZoteroPane.document) {
        _hideWindowZoteroPaneOverlay(win.ZoteroPane.document);
      }
    }

    if (_progressPopup) {
      _progressPopup.close();
    }

    _progressMessage = null;
    _progressMeters = [];
    _progressPopup = null;
    _lastPercentage = null;
  };


  /**
   * Adds a listener to be called when Zotero shuts down (even if Firefox is not shut down)
   */
  this.addShutdownListener = function (listener) {
    _shutdownListeners.push(listener);
  };

  function _showWindowZoteroPaneOverlay(doc) {
    doc.getElementById('zotero-collections-tree').disabled = true;
    doc.getElementById('zotero-items-tree').disabled = true;
    doc.getElementById('zotero-pane-overlay').hidden = false;
  }


  function _hideWindowZoteroPaneOverlay(doc) {
    doc.getElementById('zotero-collections-tree').disabled = false;
    doc.getElementById('zotero-items-tree').disabled = false;
    doc.getElementById('zotero-pane-overlay').hidden = true;

    // See note in showZoteroPaneProgressMeter()
    let pm = doc.getElementById('zotero-pane-progressmeter');
    if (pm) {
      pm.parentNode.removeChild(pm);
    }
  }


  this.updateQuickSearchBox = function (document) {
    var searchBox = document.getElementById('zotero-tb-search');
    if (searchBox) {
      searchBox.updateMode();
    }
  };


  /*
   * Clear entries that no longer exist from various tables
   */
  this.purgeDataObjects = async function () {
    var d = new Date();

    await Zotero.Creators.purge();
    await Zotero.DB.executeTransaction(async function () {
      return Zotero.Tags.purge();
    });
    await Zotero.Fulltext.purgeUnusedWords();
    await Zotero.Items.purge();
    // DEBUG: this might not need to be permanent
    //yield Zotero.DB.executeTransaction(async function () {
    //	return Zotero.Relations.purge();
    //});

    Zotero.debug("Purged data tables in " + (new Date() - d) + " ms");
  };


  this.reloadDataObjects = function () {
    return Promise.all([
    Zotero.Collections.reloadAll(),
    Zotero.Creators.reloadAll(),
    Zotero.Items.reloadAll()]
    );
  };


  /**
   * Brings Zotero Standalone to the foreground
   */
  this.activateStandalone = function () {
    var uri = Services.io.newURI('zotero://select', null, null);
    var handler = Components.classes['@mozilla.org/uriloader/external-protocol-service;1'].
    getService(Components.interfaces.nsIExternalProtocolService).
    getProtocolHandlerInfo('zotero');
    handler.preferredAction = Components.interfaces.nsIHandlerInfo.useSystemDefault;
    handler.launchWithURI(uri, null);
  };

  /**
   * Determines whether to keep an error message so that it can (potentially) be reported later
   */
  function _shouldKeepError(msg) {
    const skip = ['CSS Parser', 'content javascript'];

    //Zotero.debug(msg);
    try {
      msg.QueryInterface(Components.interfaces.nsIScriptError);
      //Zotero.debug(msg);
      if (skip.indexOf(msg.category) != -1 || msg.flags & msg.warningFlag) {
        return false;
      }
    }
    catch (e) {}

    const blacklist = [
    "No chrome package registered for chrome://communicator",
    '[JavaScript Error: "Components is not defined" {file: "chrome://nightly/content/talkback/talkback.js',
    '[JavaScript Error: "document.getElementById("sanitizeItem")',
    'No chrome package registered for chrome://piggy-bank',
    '[JavaScript Error: "[Exception... "\'Component is not available\' when calling method: [nsIHandlerService::getTypeFromExtension',
    '[JavaScript Error: "this._uiElement is null',
    'Error: a._updateVisibleText is not a function',
    '[JavaScript Error: "Warning: unrecognized command line flag ',
    'LibX:',
    'function skype_',
    '[JavaScript Error: "uncaught exception: Permission denied to call method Location.toString"]',
    'CVE-2009-3555',
    'OpenGL',
    'trying to re-register CID',
    'Services.HealthReport',
    '[JavaScript Error: "this.docShell is null"',
    '[JavaScript Error: "downloadable font:',
    '[JavaScript Error: "Image corrupt or truncated:',
    '[JavaScript Error: "The character encoding of the',
    'nsLivemarkService.js',
    'Sync.Engine.Tabs',
    'content-sessionStore.js',
    'org.mozilla.appSessions',
    'bad script XDR magic number',
    'did not contain an updates property'];


    for (var i = 0; i < blacklist.length; i++) {
      if (msg.message.indexOf(blacklist[i]) != -1) {
        //Zotero.debug("Skipping blacklisted error: " + msg.message);
        return false;
      }
    }

    return true;
  }

  /**
   * Warn if Zotero Standalone is running as root and clobber the cache directory if it is
   */
  function _checkRoot() {
    var env = Components.classes["@mozilla.org/process/environment;1"].
    getService(Components.interfaces.nsIEnvironment);
    var user = env.get("USER") || env.get("USERNAME");
    if (user === "root") {
      // Show warning
      if (Services.prompt.confirmEx(null, "", Zotero.getString("standalone.rootWarning"),
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING |
      Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_IS_STRING,
      Zotero.getString("standalone.rootWarning.exit"),
      Zotero.getString("standalone.rootWarning.continue"),
      null, null, {}) == 0) {
        const { ctypes } = ChromeUtils.importESModule("resource://gre/modules/ctypes.sys.mjs");
        var exit = Zotero.IPC.getLibc().declare("exit", ctypes.default_abi,
        ctypes.void_t, ctypes.int);
        // Zap cache files
        try {
          Services.dirsvc.get("ProfLD", Components.interfaces.nsIFile).remove(true);
        } catch (e) {}
        // Exit Zotero without giving XULRunner the opportunity to figure out the
        // cache is missing. Otherwise XULRunner will zap the prefs
        exit(0);
      }
    }
  }

  function _checkExecutableLocation() {
    // Make sure Zotero wasn't started from a Mac disk image, which can cause bundled extensions
    // not to load and possibly other problems
    if (Zotero.isMac && OS.Constants.Path.libDir.includes('AppTranslocation')) {
      let ps = Services.prompt;
      let buttonFlags = ps.BUTTON_POS_0 * ps.BUTTON_TITLE_IS_STRING;
      ps.confirmEx(
        null,
        Zotero.getString('general.error'),
        Zotero.getString('startupError.startedFromDiskImage1', Zotero.clientName) +
        '\n\n' +
        Zotero.getString('startupError.startedFromDiskImage2', Zotero.clientName),
        buttonFlags,
        Zotero.getString('general.quitApp', Zotero.clientName),
        null, null, null, {}
      );
      Zotero.Utilities.Internal.quit();
      return false;
    }

    return true;
  }

  /**
   * Observer for console messages
   * @namespace
   */
  var ConsoleListener = {
    "QueryInterface": ChromeUtils.generateQI([Components.interfaces.nsIConsoleMessage,
    Components.interfaces.nsISupports]),
    "observe": function (msg) {
      if (!_shouldKeepError(msg)) return;
      if (_recentErrors.length === ERROR_BUFFER_SIZE) _recentErrors.shift();
      _recentErrors.push(msg);
    }
  };
}).call(Zotero);


/*
 * Handles keyboard shortcut initialization from preferences, optionally
 * overriding existing global shortcuts
 *
 * Actions are configured in ZoteroPane.handleKeyPress()
 */
Zotero.Keys = new function () {
  this.init = init;
  this.windowInit = windowInit;
  this.getCommand = getCommand;

  var _keys = {};


  /*
   * Called by Zotero.init()
   */
  function init() {
    var cmds = Zotero.Prefs.rootBranch.getChildList(ZOTERO_CONFIG.PREF_BRANCH + 'keys', {}, {});

    // Get the key=>command mappings from the prefs
    for (let cmd of cmds) {
      cmd = cmd.replace(/^extensions\.zotero\.keys\./, '');
      // Remove old pref
      if (cmd == 'overrideGlobal') {
        Zotero.Prefs.clear('keys.overrideGlobal');
        continue;
      }
      _keys[this.getKeyForCommand(cmd)] = cmd;
    }
  }


  /*
   * Called by ZoteroPane.onLoad()
   */
  function windowInit(document) {
    var globalKeys = [
    {
      name: 'saveToZotero',
      defaultKey: 'S'
    }];


    globalKeys.forEach(function (x) {
      let keyElem = document.getElementById('key_' + x.name);
      if (keyElem) {
        let prefKey = this.getKeyForCommand(x.name);
        // Only override the default with the pref if the <key> hasn't
        // been manually changed and the pref has been
        if (keyElem.getAttribute('key') == x.defaultKey &&
        keyElem.getAttribute('modifiers') == 'accel shift' &&
        prefKey != x.defaultKey) {
          keyElem.setAttribute('key', prefKey);
        }
      }
    }.bind(this));
  }


  function getCommand(key) {
    key = key.toUpperCase();
    return _keys[key] ? _keys[key] : false;
  }


  this.getKeyForCommand = function (cmd) {
    try {
      var key = Zotero.Prefs.get('keys.' + cmd);
    }
    catch (e) {}
    return key !== undefined ? key.toUpperCase() : false;
  };
}();


/**
 * Identify client when connecting to first-party domains
 *
 * @namespace
 */
Zotero.VersionHeader = {
  init: function () {
    this.register();
    Zotero.addShutdownListener(this.unregister);
  },

  register: function () {
    Services.obs.addObserver(this, "http-on-modify-request", false);
  },

  observe: function (subject, topic, data) {
    try {
      let channel = subject.QueryInterface(Components.interfaces.nsIHttpChannel);
      let domain = channel.URI.host;
      // Add X-Zotero-Version header to HTTP requests to zotero.org
      let isPrimaryDomain = domain == ZOTERO_CONFIG.DOMAIN_NAME ||
      domain.endsWith('.' + ZOTERO_CONFIG.DOMAIN_NAME);
      if (isPrimaryDomain) {
        channel.setRequestHeader("X-Zotero-Version", Zotero.version, false);
      } else
      {
        // Use "Firefox/[version]" in user agent if not a proxy check or file sync request
        let s3RE = /(zoteroproxycheck|zoterofilestorage(test)?)\.s3\.(us-east-1\.)?amazonaws\.com|files\.zotero\.net/;
        let isAppNameDomain = s3RE.test(domain);
        if (!isAppNameDomain) {
          let ua = channel.getRequestHeader('User-Agent');
          ua = this.update(ua);
          channel.setRequestHeader('User-Agent', ua, false);
        }
      }
    }
    catch (e) {
      Zotero.debug(e, 1);
    }
  },

  /**
   * Add Firefox/[version] to the default user agent
   *
   * @param {String} ua - User Agent
   */
  update: function (ua) {
    var info = Services.appinfo;
    var appName = info.name;

    var pos = ua.indexOf(appName + '/');

    // Default UA (not a faked UA from the connector)
    if (pos != -1) {
      ua = ua.substring(0, pos) + `Firefox/${info.platformVersion.match(/^\d+/)[0]}.0 ` + ua.substring(pos);
    }

    return ua;
  },

  unregister: function () {
    Services.obs.removeObserver(Zotero.VersionHeader, "http-on-modify-request");
  }
};

Zotero.DragDrop = {
  currentEvent: null,
  currentOrientation: 0,

  getDataFromDataTransfer: function (dataTransfer, firstOnly) {
    var dt = dataTransfer;

    var dragData = {
      dataType: '',
      data: [],
      dropEffect: dt.dropEffect
    };

    var len = firstOnly ? 1 : dt.mozItemCount;

    if (dt.types.includes('zotero/collection')) {
      dragData.dataType = 'zotero/collection';
      let ids = dt.getData('zotero/collection').split(",").map((id) => parseInt(id));
      dragData.data = ids;
    } else
    if (dt.types.includes('zotero/item')) {
      dragData.dataType = 'zotero/item';
      let ids = dt.getData('zotero/item').split(",").map((id) => parseInt(id));
      dragData.data = ids;
    } else
    if (dt.types.includes('zotero/search')) {
      dragData.dataType = 'zotero/search';
      let ids = dt.getData('zotero/search').split(",").map((id) => parseInt(id));
      dragData.data = ids;
    } else
    {
      if (dt.types.includes('application/x-moz-file')) {
        dragData.dataType = 'application/x-moz-file';
        var files = [];
        for (var i = 0; i < len; i++) {
          var file = dt.mozGetDataAt("application/x-moz-file", i);
          if (!file) {
            continue;
          }
          file.QueryInterface(Components.interfaces.nsIFile);
          if (Zotero.isMac && /%[0-9A-F]{2}/.test(file.path) && !file.exists()) {
            // On macOS, Firefox reads a file URL from `public.file-url`,
            // constructs an NSURL from it, then gets its unescaped path using
            // stringByReplacingPercentEscapesUsingEncoding:
            //   https://searchfox.org/mozilla-central/rev/fcfb558f/widget/cocoa/nsCocoaUtils.mm#1668-1673
            // But that function uses a strict URI parser that chokes on things
            // like errant brackets in the file path, and when it chokes, the
            // URI is left escaped. Unescape it ourselves.
            file = Zotero.File.pathToFile(decodeURIComponent(file.path));
          }
          // Don't allow folder drag
          if (file.isDirectory()) {
            continue;
          }
          files.push(file);
        }
        dragData.data = files;
      }
      // This isn't an else because on Linux a link drag contains an empty application/x-moz-file too
      if (!dragData.data || !dragData.data.length) {
        if (dt.types.includes('text/x-moz-url')) {
          dragData.dataType = 'text/x-moz-url';
          var urls = [];
          for (var i = 0; i < len; i++) {
            var url = dt.getData("text/x-moz-url").split("\n")[0];
            urls.push(url);
          }
          dragData.data = urls;
        }
      }
    }

    return dragData;
  },


  getDragSource: function () {
    return this.currentDragSource;
  },


  getDragTarget: function (event) {
    var target = event.target;
    if (target.tagName == 'treechildren') {
      var tree = target.parentNode;
      if (tree.id == 'zotero-collections-tree') {
        let { row } = tree.getCellAt(event.clientX, event.clientY);
        let win = tree.ownerDocument.defaultView;
        return win.ZoteroPane.collectionsView.getRow(row);
      }
    }
    return false;
  }
};


/*
 * Implements nsIWebProgressListener
 */
Zotero.WebProgressFinishListener = function (onFinish) {
  var _request;
  var _finished = false;

  this.getRequest = function () {
    return _request;
  };

  this.onStateChange = function (wp, req, stateFlags, status) {
    //Zotero.debug('onStateChange: ' + stateFlags);
    if (stateFlags & Components.interfaces.nsIWebProgressListener.STATE_STOP &&
    stateFlags & Components.interfaces.nsIWebProgressListener.STATE_IS_NETWORK &&
    !(stateFlags & Components.interfaces.nsIWebProgressListener.STATE_IS_REQUEST)) {
      if (_finished) {
        return;
      }

      // Get status code and content ype
      let status = null;
      let contentType = null;
      try {
        let r = _request || req;
        if (!r) {
          Zotero.debug("WebProgressFinishListener: finished without a valid request");
        } else {
          r.QueryInterface(Components.interfaces.nsIHttpChannel);
          status = r.responseStatus;
          contentType = r.contentType;
        }
      }
      catch (e) {
        Zotero.debug(e, 2);
      }

      _request = null;
      onFinish({ status, contentType });
      _finished = true;
    } else
    {
      _request = req;
    }
  };

  this.onProgressChange = function (wp, req, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) {



    //Zotero.debug('onProgressChange');
    //Zotero.debug('Current: ' + curTotalProgress);
    //Zotero.debug('Max: ' + maxTotalProgress);
  };this.onLocationChange = function (wp, req, location) {};this.onSecurityChange = function (wp, req, stateFlags, status) {};
  this.onStatusChange = function (wp, req, status, msg) {};
};

/*
 * Saves or loads JSON objects.
 */
Zotero.JSON = new function () {
  this.serialize = function (arg) {
    Zotero.debug("WARNING: Zotero.JSON.serialize() is deprecated; use JSON.stringify()");
    return JSON.stringify(arg);
  };

  this.unserialize = function (arg) {
    Zotero.debug("WARNING: Zotero.JSON.unserialize() is deprecated; use JSON.parse()");
    return JSON.parse(arg);
  };
}();