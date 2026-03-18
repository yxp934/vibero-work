
toolbar-button-firefox-view-2 =
  .label = { -firefoxview-brand-name }
  .tooltiptext = View recent browsing across windows and devices

menu-tools-firefox-view =
  .label = { -firefoxview-brand-name }
  .accesskey = F

firefoxview-page-title = { -firefoxview-brand-name }

firefoxview-page-heading =
  .heading = { -firefoxview-brand-name }

firefoxview-page-label =
  .label = { -firefoxview-brand-name }

firefoxview-just-now-timestamp = Just now

firefoxview-syncedtabs-signin-header-2 = Your { -brand-product-name } on all your devices
firefoxview-syncedtabs-signin-description-2 = To see tabs you have open on your phone and other devices, sign in or sign up for an account. With an account, you can also sync your passwords, history, and more.
firefoxview-syncedtabs-signin-primarybutton-2 = Sign in

firefoxview-syncedtabs-adddevice-header-2 = Grab tabs from anywhere
firefoxview-syncedtabs-adddevice-description-2 = Sign in to { -brand-product-name } on your phone or another computer to see tabs here. Learn how to <a data-l10n-name="url">connect additional devices</a>.
firefoxview-syncedtabs-adddevice-primarybutton = Try { -brand-product-name } for mobile

firefoxview-tabpickup-synctabs-primarybutton = Sync open tabs

firefoxview-syncedtabs-synctabs-header = Update your sync settings
firefoxview-syncedtabs-synctabs-description = To see tabs from other devices, you need to sync your open tabs.

firefoxview-syncedtabs-loading-header = Sync in progress
firefoxview-syncedtabs-loading-description = When it’s done, you’ll see any tabs you have open on other devices. Check back soon.

firefoxview-tabpickup-fxa-admin-disabled-header = Your organization has disabled sync
firefoxview-tabpickup-fxa-disabled-by-policy-description = { -brand-short-name } is not able to sync tabs between devices because your organization has disabled syncing.

firefoxview-tabpickup-network-offline-header = Check your internet connection
firefoxview-tabpickup-network-offline-description = If you’re using a firewall or proxy, check that { -brand-short-name } has permission to access the web.
firefoxview-tabpickup-network-offline-primarybutton = Try again

firefoxview-tabpickup-sync-error-header = We’re having trouble syncing
firefoxview-tabpickup-generic-sync-error-description = { -brand-short-name } can’t reach the syncing service right now. Try again in a few moments.
firefoxview-tabpickup-sync-error-primarybutton = Try again

firefoxview-tabpickup-sync-disconnected-header = Turn on syncing to continue
firefoxview-tabpickup-sync-disconnected-description = To grab your tabs, you’ll need to allow syncing in { -brand-short-name }.
firefoxview-tabpickup-sync-disconnected-primarybutton = Turn on sync in settings

firefoxview-tabpickup-password-locked-header = Enter your Primary Password to view tabs
firefoxview-tabpickup-password-locked-description = To grab your tabs, you’ll need to enter the Primary Password for { -brand-short-name }.
firefoxview-tabpickup-password-locked-link = Learn more
firefoxview-tabpickup-password-locked-primarybutton = Enter Primary Password
firefoxview-syncedtab-password-locked-link = <a data-l10n-name="syncedtab-password-locked-link">Learn more</a>

firefoxview-tabpickup-signed-out-header = Sign in to reconnect
firefoxview-tabpickup-signed-out-description2 = To reconnect and grab your tabs, sign in to your account.
firefoxview-tabpickup-signed-out-primarybutton = Sign in

firefoxview-closed-tabs-dismiss-tab =
  .title = Dismiss { $tabTitle }

firefoxview-tabs-list-tab-button =
  .title = Open { $targetURI } in a new tab

firefoxview-collapse-button-show =
  .title = Show list

firefoxview-collapse-button-hide =
  .title = Hide list

firefoxview-overview-nav = Recent browsing
  .title = Recent browsing
firefoxview-overview-header = Recent browsing
  .title = Recent browsing


firefoxview-history-nav = History
  .title = History
firefoxview-history-header = History
firefoxview-history-context-delete = Delete from History
    .accesskey = D


firefoxview-opentabs-nav = Open tabs
  .title = Open tabs
firefoxview-opentabs-header = Open tabs


firefoxview-recently-closed-nav = Recently closed tabs
  .title = Recently closed tabs
firefoxview-recently-closed-header = Recently closed tabs


firefoxview-synced-tabs-nav = Tabs from other devices
  .title = Tabs from other devices
firefoxview-synced-tabs-header = Tabs from other devices


firefoxview-view-all-link = View all

firefoxview-opentabs-window-header =
  .title = Window { $winID }

firefoxview-opentabs-current-window-header =
  .title = Window { $winID } (Current)

firefoxview-show-more = Show more
firefoxview-show-less = Show less
firefoxview-show-all = Show all

firefoxview-search-text-box-clear-button =
  .title = Clear

firefoxview-search-text-box-recentbrowsing =
  .placeholder = Search

firefoxview-search-text-box-history =
  .placeholder = Search history

firefoxview-search-text-box-recentlyclosed =
  .placeholder = Search recently closed tabs

firefoxview-search-text-box-tabs =
  .placeholder = Search tabs

firefoxview-search-text-box-opentabs =
  .placeholder = Search open tabs

firefoxview-search-results-header = Search results for “{ $query }”

firefoxview-search-results-count = { $count ->
  [one] { $count } site
 *[other] { $count } sites
}

firefoxview-search-results-empty = No results for “{ $query }”

firefoxview-sort-history-by-date-label = Sort by date
firefoxview-sort-history-by-site-label = Sort by site
firefoxview-sort-open-tabs-by-recency-label = Sort by recent activity
firefoxview-sort-open-tabs-by-order-label = Sort by tab order


firefoxview-history-date-today = Today - { DATETIME($date, dateStyle: "full") }
firefoxview-history-date-yesterday = Yesterday - { DATETIME($date, dateStyle: "full") }
firefoxview-history-date-this-month = { DATETIME($date, dateStyle: "full") }
firefoxview-history-date-prev-month = { DATETIME($date, month: "long", year: "numeric") }

firefoxview-history-site-localhost = (local files)


firefoxview-show-all-history = Show all history


firefoxview-history-empty-header = Get back to where you’ve been
firefoxview-history-empty-description = As you browse, the pages you visit will be listed here.
firefoxview-history-empty-description-two = Protecting your privacy is at the heart of what we do. It’s why you can control the activity { -brand-short-name } remembers, in your <a data-l10n-name="history-settings-url">history settings</a>.


firefoxview-choose-browser-button = Choose browser
  .title = Choose browser


firefoxview-dont-remember-history-empty-header-2 = You’re in control of what { -brand-short-name } remembers
firefoxview-dont-remember-history-empty-description-one = Right now, { -brand-short-name } does not remember your browsing activity. To change that, <a data-l10n-name="history-settings-url-two">update your history settings</a>.


firefoxview-import-history-close-button =
  .aria-label = Close
  .title = Close


firefoxview-import-history-header = Import history from another browser
firefoxview-import-history-description = Make { -brand-short-name } your go-to browser. Import browsing history, bookmarks, and more.


firefoxview-recentlyclosed-empty-header = Closed a tab too soon?
firefoxview-recentlyclosed-empty-description = Here you’ll find the tabs you recently closed, so you can reopen any of them quickly.
firefoxview-recentlyclosed-empty-description-two = To find tabs from longer ago, view your <a data-l10n-name="history-url">browsing history</a>.


firefoxview-syncedtabs-device-notabs = No tabs open on this device

firefoxview-syncedtabs-connect-another-device = Connect another device

firefoxview-pinned-tabs =
  .title = Pinned Tabs

firefoxview-tabs =
  .title = Tabs


firefoxview-opentabs-pinned-tab =
  .title = Switch to { $tabTitle }

firefoxview-opentabs-bookmarked-pinned-tab =
  .title = Switch to (Bookmarked) { $tabTitle }


firefoxview-opentabs-bookmarked-tab =
  .title = (Bookmarked) { $url }
