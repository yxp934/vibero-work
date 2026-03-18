
fxa-toolbar-sync-syncing2 = Syncing…

sync-disconnect-dialog-title2 = Disconnect?
sync-disconnect-dialog-body = { -brand-product-name } will stop syncing your account but won’t delete any of your browsing data on this device.
sync-disconnect-dialog-button = Disconnect

fxa-signout-dialog-title2 = Sign out of your account?
fxa-signout-dialog-body = Synced data will remain in your account.
fxa-signout-dialog2-button = Sign out
fxa-signout-dialog2-checkbox = Delete data from this device (passwords, history, bookmarks, etc.)

fxa-menu-sync-settings =
    .label = Sync settings
fxa-menu-turn-on-sync =
    .value = Turn on sync
fxa-menu-turn-on-sync-default = Turn on sync

fxa-menu-connect-another-device =
    .label = Connect another device…
fxa-menu-send-tab-to-device =
    .label =
        { $tabCount ->
            [1] Send tab to device
           *[other] Send { $tabCount } tabs to device
        }

fxa-menu-send-tab-to-device-syncnotready =
    .label = Syncing Devices…

fxa-menu-send-tab-to-device-description = Send a tab instantly to any device you’re signed in on.

fxa-menu-sign-out =
    .label = Sign out…


fxa-menu-sync-description = Access your web anywhere

fxa-avatar-sign-in = Sign in
fxa-avatar-sign-up = Sign up
fxa-avatar-tooltip =
    .tooltiptext = Sign in to your account


sync-setup-verify-continue = Continue
sync-setup-verify-title = Merge Warning
sync-setup-verify-heading = Are you sure you want to sign in to sync?


sync-setup-verify-description = A different user was previously signed in to sync on this computer. Signing in will merge this browser’s bookmarks, passwords and other settings with { $email }


sync-profile-different-account-title = Account limit reached for this profile
sync-profile-different-account-header = This profile was previously synced to a different account

sync-profile-different-account-description = To keep your data organized and secure, each { -brand-product-name } profile can only be synced to one account. To sign in using { $acctEmail }, create a new profile.

sync-profile-different-account-title-merge = Profile synced to different account

sync-profile-different-account-description-merge = To keep your data organized and secure, we recommend creating a new profile to sign in using { $acctEmail }. If you choose to continue to sync on this profile, data from both accounts will be permanently merged on “{ $profileName }”.

sync-account-in-use-header = Account already in use

sync-account-in-use-header-merge = { $acctEmail } is already signed in to the “{ $otherProfile }” profile
sync-account-in-use-description = You can only associate this account with one profile on this computer.

sync-account-already-signed-in-header = This account is signed in to another profile. Sync both profiles?

sync-account-in-use-description-merge = { $acctEmail } is signed in to the “{ $otherProfile }” profile on this computer. Syncing the “{ $currentProfile }” profile will permanently combine data from both profiles, such as passwords and bookmarks.

sync-button-switch-profile = Switch to “{ $profileName }”
sync-button-create-profile = Create a new profile
sync-button-sync-and-merge = Sync and merge data
sync-button-sync-profile = Sync “{ $profileName }”
