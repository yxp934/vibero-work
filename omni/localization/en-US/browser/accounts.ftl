
account-finish-account-setup = Finish Account Setup

account-disconnected2 = Account disconnected

account-send-to-all-devices = Send to all devices

account-manage-devices = Manage devices…


account-reconnect = Reconnect { $email }
account-verify = Verify { $email }


account-send-to-all-devices-titlecase = Send to All Devices
account-manage-devices-titlecase = Manage Devices…


account-send-tab-to-device-singledevice-status = No Devices Connected

account-send-tab-to-device-singledevice-learnmore = Learn About Sending Tabs…

account-send-tab-to-device-connectdevice = Connect Another Device…


account-send-tab-to-device-verify-status = Account Not Verified
account-send-tab-to-device-verify = Verify Your Account…


account-connection-title-2 = Account

account-connection-connected-with = This computer is now connected with { $deviceName }.

account-connection-connected-with-noname = This computer is now connected with a new device.

account-connection-connected = You have signed in successfully

account-connection-disconnected = This computer has been disconnected.


account-single-tab-arriving-title = Tab Received
account-single-tab-arriving-from-device-title = Tab from { $deviceName }

account-single-tab-arriving-truncated-url = { $url }…


account-multiple-tabs-arriving-title = Tabs Received

account-multiple-tabs-arriving-from-single-device =
    { $tabCount ->
        [one] { $tabCount } tab has arrived from { $deviceName }
       *[other] { $tabCount } tabs have arrived from { $deviceName }
    }
account-multiple-tabs-arriving-from-multiple-devices =
    { $tabCount ->
        [one] { $tabCount } tab has arrived from your connected devices
       *[other] { $tabCount } tabs have arrived from your connected devices
    }
account-multiple-tabs-arriving-from-unknown-device =
    { $tabCount ->
        [one] { $tabCount } tab has arrived
       *[other] { $tabCount } tabs have arrived
    }


account-view-recently-closed-tabs = View recently closed tabs
account-tabs-closed-remotely =
    {
        $closedCount ->
            [one] { $closedCount } { -brand-short-name } tab closed
           *[other] { $closedCount } { -brand-short-name } tabs closed
    }
