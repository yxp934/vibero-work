
migration-wizard-selection-header = Import browser data
migration-wizard-selection-list = Select the data you’d like to import.

migration-wizard-selection-option-without-profile = { $sourceBrowser }

migration-wizard-selection-option-with-profile = { $sourceBrowser } — { $profileName }


migration-wizard-migrator-display-name-brave = Brave
migration-wizard-migrator-display-name-canary = Chrome Canary
migration-wizard-migrator-display-name-chrome = Chrome
migration-wizard-migrator-display-name-chrome-beta = Chrome Beta
migration-wizard-migrator-display-name-chrome-dev = Chrome Dev
migration-wizard-migrator-display-name-chromium = Chromium
migration-wizard-migrator-display-name-chromium-360se = 360 Secure Browser
migration-wizard-migrator-display-name-chromium-edge = Microsoft Edge
migration-wizard-migrator-display-name-chromium-edge-beta = Microsoft Edge Beta
migration-wizard-migrator-display-name-edge-legacy = Microsoft Edge Legacy
migration-wizard-migrator-display-name-firefox = Firefox
migration-wizard-migrator-display-name-file-password-csv = Passwords from CSV file
migration-wizard-migrator-display-name-file-bookmarks = Bookmarks from HTML file
migration-wizard-migrator-display-name-ie = Microsoft Internet Explorer
migration-wizard-migrator-display-name-opera = Opera
migration-wizard-migrator-display-name-opera-gx = Opera GX
migration-wizard-migrator-display-name-safari = Safari
migration-wizard-migrator-display-name-vivaldi = Vivaldi

migration-source-name-ie = Internet Explorer
migration-source-name-edge = Microsoft Edge
migration-source-name-chrome = Google Chrome

migration-imported-safari-reading-list = Reading List (From Safari)
migration-imported-edge-reading-list = Reading List (From Edge)


migration-no-permissions-message = { -brand-short-name } does not have access to other browsers’ profiles installed on this device.

migration-no-permissions-instructions = To continue importing data from another browser, grant { -brand-short-name } access to its profile folder.

migration-no-permissions-instructions-step1 = Select “Continue”

migration-no-permissions-instructions-step2 = In the file picker, navigate to <code>{ $permissionsPath }</code> and choose “Select”


migration-all-available-data-label = Import all available data
migration-no-selected-data-label = No data selected for import
migration-selected-data-label = Import selected data


migration-select-all-option-label = Select all
migration-bookmarks-option-label = Bookmarks

migration-favorites-option-label = Favorites

migration-passwords-option-label = Saved passwords
migration-history-option-label = Browsing history
migration-extensions-option-label = Extensions
migration-form-autofill-option-label = Form autofill data
migration-payment-methods-option-label = Payment methods
migration-cookies-option-label = Cookies
migration-session-option-label = Windows and tabs
migration-otherdata-option-label = Other data

migration-passwords-from-file-progress-header = Import passwords file
migration-passwords-from-file-success-header = Passwords imported successfully
migration-passwords-from-file = Checking file for passwords
migration-passwords-new = New passwords
migration-passwords-updated = Existing passwords
migration-passwords-from-file-no-valid-data = The file doesn’t include any valid password data. Pick another file.

migration-passwords-from-file-picker-title = Import Passwords File
migration-passwords-from-file-csv-filter-title =
  { PLATFORM() ->
      [macos] CSV Document
     *[other] CSV File
  }
migration-passwords-from-file-tsv-filter-title =
  { PLATFORM() ->
      [macos] TSV Document
     *[other] TSV File
  }

migration-wizard-progress-success-new-passwords =
    { $newEntries ->
        [one] { $newEntries } added
       *[other] { $newEntries } added
    }

migration-wizard-progress-success-updated-passwords =
    { $updatedEntries ->
        [one] { $updatedEntries } updated
       *[other] { $updatedEntries } updated
    }

migration-bookmarks-from-file-picker-title = Import bookmarks file
migration-bookmarks-from-file-progress-header = Importing bookmarks
migration-bookmarks-from-file = Bookmarks
migration-bookmarks-from-file-success-header = Bookmarks imported successfully
migration-bookmarks-from-file-no-valid-data = The file doesn’t include any bookmark data. Pick another file.

migration-bookmarks-from-file-html-filter-title =
  { PLATFORM() ->
      [macos] HTML Document
     *[other] HTML File
  }

migration-bookmarks-from-file-json-filter-title = JSON File

migration-wizard-progress-success-new-bookmarks =
    { $newEntries ->
        [one] { $newEntries } bookmark
       *[other] { $newEntries } bookmarks
    }

migration-import-button-label = Import
migration-choose-to-import-from-file-button-label = Import from file
migration-import-from-file-button-label = Select file
migration-cancel-button-label = Cancel
migration-done-button-label = Done
migration-continue-button-label = Continue

migration-wizard-import-browser-no-browsers = { -brand-short-name } couldn’t find any programs that contain bookmark, history or password data.
migration-wizard-import-browser-no-resources = There was an error. { -brand-short-name } can’t find any data to import from that browser profile.


migration-list-bookmark-label = bookmarks

migration-list-favorites-label = favorites
migration-list-password-label = passwords
migration-list-history-label = history
migration-list-extensions-label = extensions
migration-list-autofill-label = autofill data
migration-list-payment-methods-label = payment methods


migration-wizard-progress-header = Importing data

migration-wizard-progress-done-header = Data imported successfully

migration-wizard-progress-done-with-warnings-header = Data import complete

migration-wizard-progress-icon-in-progress =
  .aria-label = Importing…
migration-wizard-progress-icon-completed =
  .aria-label = Completed

migration-safari-password-import-header = Import passwords from Safari
migration-safari-password-import-steps-header = To import Safari passwords:
migration-safari-password-import-step1 = In Safari, open “Safari” menu and go to Preferences > Passwords
migration-safari-password-import-step2 = Select the <img data-l10n-name="safari-icon-3dots"/> button and choose “Export All Passwords”
migration-safari-password-import-step3 = Save the passwords file
migration-safari-password-import-step4 = Use “Select file” below to choose the passwords file you saved

migration-chrome-windows-password-import-header = How to import passwords from Chrome
migration-chrome-windows-password-import-steps-header = In Chrome:
migration-chrome-windows-password-import-step1 = Open the main menu <img data-l10n-name="chrome-icon-3dots"/> and go to Passwords and Autofill > Google Password Manager.
migration-chrome-windows-password-import-step2 = Select “Settings” from the menu.
migration-chrome-windows-password-import-step3 = Choose “Download file” and save it to your device.
migration-chrome-windows-password-import-step4 = Return here and “Select file” to finish import.

migration-manual-password-import-skip-button = Skip
migration-manual-password-import-select-button = Select file

migration-wizard-progress-success-bookmarks =
    { $quantity ->
        [one] { $quantity } bookmark
       *[other] { $quantity } bookmarks
    }

migration-wizard-progress-success-favorites =
    { $quantity ->
        [one] { $quantity } favorite
       *[other] { $quantity } favorites
    }


migration-wizard-progress-success-extensions =
    { $quantity ->
        [one] { $quantity } extension
       *[other] { $quantity } extensions
    }

migration-wizard-progress-partial-success-extensions = { $matched } of { $quantity } extensions

migration-wizard-progress-extensions-support-link = Learn how { -brand-product-name } matches extensions
migration-wizard-progress-no-matched-extensions = No matching extensions

migration-wizard-progress-extensions-addons-link = Browse extensions for { -brand-short-name }


migration-wizard-progress-success-passwords =
    { $quantity ->
        [one] { $quantity } password
       *[other] { $quantity } passwords
    }

migration-wizard-progress-success-history =
    { $maxAgeInDays ->
        [one] From the last day
       *[other] From the last { $maxAgeInDays } days
    }

migration-wizard-progress-success-formdata = Form history

migration-wizard-progress-success-payment-methods =
    { $quantity ->
        [one] { $quantity } payment method
       *[other] { $quantity } payment methods
    }

migration-wizard-safari-permissions-sub-header = To import Safari bookmarks and browsing history:
migration-wizard-safari-instructions-continue = Select “Continue”
migration-wizard-safari-instructions-folder = Select Safari folder in the list and choose “Open”
