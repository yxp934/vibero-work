


about-debugging-page-title-setup-page = Debugging - Setup

about-debugging-page-title-runtime-page = Debugging - Runtime / { $selectedRuntimeId }


about-debugging-this-firefox-runtime-name = This { -brand-shorter-name }

about-debugging-sidebar-this-firefox =
  .name = { about-debugging-this-firefox-runtime-name }

about-debugging-sidebar-setup =
  .name = Setup

about-debugging-sidebar-usb-enabled = USB enabled

about-debugging-sidebar-usb-disabled = USB disabled

aboutdebugging-sidebar-runtime-connection-status-connected = Connected
aboutdebugging-sidebar-runtime-connection-status-disconnected = Disconnected

about-debugging-sidebar-no-devices = No devices discovered

about-debugging-sidebar-item-connect-button = Connect

about-debugging-sidebar-item-connect-button-connecting = Connecting…

about-debugging-sidebar-item-connect-button-connection-failed = Connection failed

about-debugging-sidebar-item-connect-button-connection-not-responding = Connection still pending, check for messages on the target browser

about-debugging-sidebar-item-connect-button-connection-timeout = Connection timed out

about-debugging-sidebar-runtime-item-waiting-for-browser = Waiting for browser…

about-debugging-sidebar-runtime-item-unplugged = Unplugged

about-debugging-sidebar-runtime-item-name =
  .title = { $displayName } ({ $deviceName })
about-debugging-sidebar-runtime-item-name-no-device =
  .title = { $displayName }

about-debugging-sidebar-support = Debugging Support

about-debugging-sidebar-support-icon =
  .alt = Help icon

about-debugging-refresh-usb-devices-button = Refresh devices


about-debugging-setup-title = Setup

about-debugging-setup-intro = Configure the connection method you wish to remotely debug your device with.

about-debugging-setup-this-firefox2 = Use <a>{ about-debugging-this-firefox-runtime-name }</a> to debug extensions and service workers on this version of { -brand-shorter-name }.

about-debugging-setup-connect-heading = Connect a Device

about-debugging-setup-usb-title = USB

about-debugging-setup-usb-disabled = Enabling this will download and add the required Android USB debugging components to { -brand-shorter-name }.

about-debugging-setup-usb-enable-button = Enable USB Devices

about-debugging-setup-usb-disable-button = Disable USB Devices

about-debugging-setup-usb-updating-button = Updating…

about-debugging-setup-usb-status-enabled = Enabled
about-debugging-setup-usb-status-disabled = Disabled
about-debugging-setup-usb-status-updating = Updating…

about-debugging-setup-usb-step-enable-dev-menu2 = Enable Developer menu on your Android device.

about-debugging-setup-usb-step-enable-debug2 = Enable USB Debugging in the Android Developer Menu.

about-debugging-setup-usb-step-enable-file-transfer = Enable file transfer and ensure that your device is not in charging-only mode.

about-debugging-setup-usb-step-enable-debug-firefox2 = Enable USB Debugging in Firefox on the Android device.

about-debugging-setup-usb-step-plug-device = Connect the Android device to your computer.

about-debugging-setup-usb-troubleshoot = Problems connecting to the USB device? <a>Troubleshoot</a>

about-debugging-setup-network =
  .title = Network Location

about-debugging-setup-network-troubleshoot = Problems connecting via network location? <a>Troubleshoot</a>

about-debugging-network-locations-add-button = Add

about-debugging-network-locations-host-input-label = Host

about-debugging-network-locations-remove-button = Remove

about-debugging-network-location-form-invalid = Invalid host “{ $host-value }”. The expected format is “hostname:portnumber”.

about-debugging-network-location-form-duplicate = The host “{ $host-value }” is already registered


about-debugging-runtime-temporary-extensions =
  .name = Temporary Extensions
about-debugging-runtime-extensions =
  .name = Extensions
about-debugging-runtime-tabs =
  .name = Tabs
about-debugging-runtime-service-workers =
  .name = Service Workers
about-debugging-runtime-shared-workers =
  .name = Shared Workers
about-debugging-runtime-other-workers =
  .name = Other Workers
about-debugging-runtime-processes =
  .name = Processes

about-debugging-runtime-profile-button2 = Profile performance

about-debugging-runtime-service-workers-not-compatible = Your browser configuration is not compatible with Service Workers. <a>Learn more</a>

about-debugging-browser-version-too-old = The connected browser has an old version ({ $runtimeVersion }). The minimum supported version is ({ $minVersion }). This is an unsupported setup and may cause DevTools to fail. Please update the connected browser. <a>Troubleshooting</a>

about-debugging-browser-version-too-old-fennec = This version of Firefox cannot debug Firefox for Android (68). We recommend installing Firefox for Android Nightly on your phone for testing. <a>More details</a>

about-debugging-browser-version-too-recent = The connected browser is more recent ({ $runtimeVersion }, buildID { $runtimeID }) than your { -brand-shorter-name } ({ $localVersion }, buildID { $localID }). This is an unsupported setup and may cause DevTools to fail. Please update Firefox. <a>Troubleshooting</a>

about-debugging-runtime-name = { $name } ({ $version })

about-debugging-runtime-disconnect-button = Disconnect

about-debugging-connection-prompt-enable-button = Enable connection prompt

about-debugging-connection-prompt-disable-button = Disable connection prompt

about-debugging-profiler-dialog-title2 = Profiler

about-debugging-collapse-expand-debug-targets = Collapse / expand


about-debugging-debug-target-list-empty = Nothing yet.

about-debugging-debug-target-inspect-button = Inspect

about-debugging-tmp-extension-install-button = Load Temporary Add-on…

about-debugging-tmp-extension-install-error = There was an error during the temporary add-on installation.

about-debugging-tmp-extension-reload-button = Reload

about-debugging-tmp-extension-remove-button = Remove

about-debugging-tmp-extension-terminate-bgscript-button = Terminate background script

about-debugging-tmp-extension-install-message = Select manifest.json file or .xpi/.zip archive

about-debugging-tmp-extension-temporary-id = This WebExtension has a temporary ID. <a>Learn more</a>

about-debugging-extension-manifest-url =
  .label = Manifest URL

about-debugging-extension-uuid =
  .label = Internal UUID

about-debugging-extension-location =
  .label = Location

about-debugging-extension-id =
  .label = Extension ID

about-debugging-extension-backgroundscript =
  .label = Background script

about-debugging-extension-backgroundscript-status-running = Running

about-debugging-extension-backgroundscript-status-stopped = Stopped

about-debugging-worker-action-push2 = Push
  .disabledTitle = Service Worker push is currently disabled for multiprocess { -brand-shorter-name }

about-debugging-worker-action-start2 = Start
  .disabledTitle = Service Worker start is currently disabled for multiprocess { -brand-shorter-name }

about-debugging-worker-action-unregister = Unregister

about-debugging-worker-fetch-listening =
  .label = Fetch
  .value = Listening for fetch events

about-debugging-worker-fetch-not-listening =
  .label = Fetch
  .value = Not listening for fetch events

about-debugging-worker-status-running = Running

about-debugging-worker-status-stopped = Stopped

about-debugging-worker-status-registering = Registering

about-debugging-worker-scope =
  .label = Scope

about-debugging-worker-push-service =
  .label = Push Service

about-debugging-worker-origin =
  .label = Origin

about-debugging-worker-inspect-action-disabled =
  .title = Service Worker inspection is currently disabled for multiprocess { -brand-shorter-name }

about-debugging-zombie-tab-inspect-action-disabled =
  .title = Tab is not fully loaded and cannot be inspected

about-debugging-multiprocess-toolbox-name = Multiprocess Toolbox

about-debugging-multiprocess-toolbox-description = Main Process and Content Processes for the target browser

about-debugging-message-close-icon =
  .alt = Close message

about-debugging-message-details-label-error = Error details

about-debugging-message-details-label-warning = Warning details

about-debugging-message-details-label = Details
