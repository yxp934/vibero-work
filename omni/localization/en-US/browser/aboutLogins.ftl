
about-logins-page-title-name = Passwords

about-logins-login-filter2 =
  .placeholder = Search Passwords
  .key = F

create-login-button =
  .title = Add password

fxaccounts-sign-in-text = Get your passwords on your other devices
fxaccounts-sign-in-sync-button = Sign in to sync
fxaccounts-avatar-button =
  .title = Manage account


menu =
  .title = Open menu
about-logins-menu-menuitem-import-from-another-browser = Import from Another Browser…
about-logins-menu-menuitem-import-from-a-file = Import from a File…

about-logins-menu-menuitem-export-logins2 = Export Passwords…
about-logins-menu-menuitem-remove-all-logins2 = Remove All Passwords…

menu-menuitem-preferences =
  { PLATFORM() ->
      [windows] Options
     *[other] Preferences
  }
about-logins-menu-menuitem-help = Help


login-list =
  .aria-label = Logins matching search query
login-list-count2 =
  { $count ->
      [one] { $count } password
     *[other] { $count } passwords
  }
login-list-filtered-count2 =
  { $total ->
      [one] { $count } of { $total } password
     *[other] { $count } of { $total } passwords
  }
login-list-sort-label-text = Sort by:
login-list-name-option = Name (A-Z)
login-list-name-reverse-option = Name (Z-A)
login-list-username-option = Username (A-Z)
login-list-username-reverse-option = Username (Z-A)
about-logins-login-list-alerts-option = Alerts
login-list-last-changed-option = Last Modified
login-list-last-used-option = Last Used

login-list-intro-title2 = No passwords saved
login-list-intro-description = When you save a password in { -brand-product-name }, it will show up here.

about-logins-login-list-empty-search-title2 = No passwords found
about-logins-login-list-empty-search-description = There are no results matching your search.

login-list-item-title-new-login2 = Add password

login-list-item-subtitle-missing-username = (no username)
about-logins-list-item-breach-icon =
  .title = Breached website
about-logins-list-item-vulnerable-password-icon =
  .title = Vulnerable password
about-logins-list-section-breach = Breached websites
about-logins-list-section-vulnerable = Vulnerable passwords
about-logins-list-section-nothing = No alert
about-logins-list-section-today = Today
about-logins-list-section-yesterday = Yesterday
about-logins-list-section-week = Last 7 days


about-logins-login-intro-heading-message = Save your passwords to a safe spot
login-intro-description2 = All passwords you save to { -brand-product-name } are encrypted. Plus, we watch out for breaches and alert you if you’re affected. <a data-l10n-name="breach-alert-link">Learn more</a>
login-intro-instructions-fxa2 = Create or sign in to your account on the device where your logins are saved.
login-intro-instructions-fxa-settings = Go to Settings > Sync > Turn on syncing… Select the Logins and passwords checkbox.
login-intro-instructions-fxa-passwords-help = Visit <a data-l10n-name="passwords-help-link">passwords support</a> for more help.
about-logins-intro-import3 = Select the plus sign button above to add a password now. You can also <a data-l10n-name="import-browser-link">import passwords from another browser</a> or <a data-l10n-name="import-file-link">from a file</a>.


about-logins-login-item-new-login-title = Add password
login-item-edit-button = Edit
about-logins-login-item-remove-button = Remove
login-item-origin-label = Website address
about-logins-origin-tooltip2 = Enter the full address and make sure it’s an exact match for where you sign in.
about-logins-edit-password-tooltip = Make sure you’re saving your current password for this site. Changing the password here does not change it with { $webTitle }.
about-logins-add-password-tooltip = Make sure you’re saving your current password for this site.
login-item-origin =
  .placeholder = https://www.example.com
login-item-username-label = Username
about-logins-login-item-username =
  .placeholder = (no username)
login-item-copy-username-button-text = Copy
login-item-copied-username-button-text = Copied!
login-item-password-label = Password
login-item-password-reveal-checkbox =
  .aria-label = Show password
login-item-password-conceal-checkbox =
  .aria-label = Hide password
login-item-copy-password-button-text = Copy
login-item-copied-password-button-text = Copied!
about-logins-login-item-save-changes-button = Save
login-item-save-new-button = Save
login-item-cancel-button = Cancel


login-item-timeline-point-date = { DATETIME($datetime, day: "numeric", month: "short", year: "numeric") }
login-item-timeline-action-created = Created
login-item-timeline-action-updated = Updated
login-item-timeline-action-used = Used


about-logins-os-auth-dialog-caption = { -brand-full-name }


about-logins-os-auth-dialog-message=
  { PLATFORM() ->
    [macos] change the settings for passwords
    *[other] { -brand-short-name } is trying to change the settings for passwords. Use your device sign in to allow this.
  }

about-logins-edit-login-os-auth-dialog-message2-win = To edit your password, enter your Windows login credentials. This helps protect the security of your accounts.
about-logins-edit-login-os-auth-dialog-message2-macosx = edit the saved password

about-logins-reveal-password-os-auth-dialog-message-win = To view your password, enter your Windows login credentials. This helps protect the security of your accounts.
about-logins-reveal-password-os-auth-dialog-message-macosx = reveal the saved password

about-logins-copy-password-os-auth-dialog-message-win = To copy your password, enter your Windows login credentials. This helps protect the security of your accounts.
about-logins-copy-password-os-auth-dialog-message-macosx = copy the saved password

about-logins-export-password-os-auth-dialog-message2-win = To export your passwords, enter your Windows login credentials. This helps protect the security of your accounts.
about-logins-export-password-os-auth-dialog-message2-macosx = export saved passwords


about-logins-primary-password-notification-message = Please enter your Primary Password to view saved logins & passwords
master-password-reload-button =
  .label = Log in
  .accesskey = L


confirmation-dialog-cancel-button = Cancel
confirmation-dialog-dismiss-button =
  .title = Cancel

about-logins-confirm-delete-dialog-title = Remove password?
about-logins-confirm-delete-dialog-message = You cannot undo this action.
about-logins-confirm-remove-dialog-confirm-button = Remove


about-logins-confirm-remove-all-dialog-confirm-button-label =
  { $count ->
     [1] Remove
    *[other] Remove All
  }

about-logins-confirm-remove-all-dialog-checkbox-label2 =
  { $count ->
     [1] Yes, remove password
    *[other] Yes, remove passwords
  }

about-logins-confirm-remove-all-dialog-title2 =
  { $count ->
     [one] Remove { $count } password?
    *[other] Remove all { $count } passwords?
  }
about-logins-confirm-remove-all-dialog-message2 =
  { $count ->
     [1] This will remove the password saved to { -brand-short-name } and any breach alerts. You cannot undo this action.
    *[other] This will remove the passwords saved to { -brand-short-name } and any breach alerts. You cannot undo this action.
  }

about-logins-confirm-remove-all-sync-dialog-title2 =
  { $count ->
     [one] Remove { $count } password from all devices?
    *[other] Remove all { $count } passwords from all devices?
  }

about-logins-confirm-remove-all-sync-dialog-message3 =
  { $count ->
    [1] This will remove the password saved to { -brand-short-name } on all your synced devices. This will also remove any breach alerts that appear here. You cannot undo this action.
    *[other] This will remove all passwords saved to { -brand-short-name } on all your synced devices. This will also remove any breach alerts that appear here. You cannot undo this action.
  }


about-logins-confirm-export-dialog-title2 = A note about exporting passwords
about-logins-confirm-export-dialog-message2 = When you export, your passwords are saved to a file with readable text.
    When you’re done using the file, we recommend deleting it so others who use this device can’t see your passwords.
about-logins-confirm-export-dialog-confirm-button2 = Continue with export

about-logins-alert-import-message = View detailed Import Summary

confirm-discard-changes-dialog-title = Discard unsaved changes?
confirm-discard-changes-dialog-message = All unsaved changes will be lost.
confirm-discard-changes-dialog-confirm-button = Discard


about-logins-breach-alert-title = Website Breach
breach-alert-text = Passwords were leaked or stolen from this website since you last updated your login details. Change your password to protect your account.
about-logins-breach-alert-date = This breach occurred on { DATETIME($date, day: "numeric", month: "long", year: "numeric") }
about-logins-breach-alert-link = Go to { $hostname }


about-logins-vulnerable-alert-title = Vulnerable Password
about-logins-vulnerable-alert-text2 = This password has been used on another account that was likely in a data breach. Reusing credentials puts all your accounts at risk. Change this password.
about-logins-vulnerable-alert-link = Go to { $hostname }
about-logins-vulnerable-alert-learn-more-link = Learn more


about-logins-error-message-duplicate-login-with-link = An entry for { $loginTitle } with that username already exists. <a data-l10n-name="duplicate-link">Go to existing entry?</a>

about-logins-error-message-default = An error occurred while trying to save this password.


about-logins-export-file-picker-title2 = Export Passwords from { -brand-short-name }
about-logins-export-file-picker-default-filename2 = passwords.csv
about-logins-export-file-picker-export-button = Export
about-logins-export-file-picker-csv-filter-title =
  { PLATFORM() ->
      [macos] CSV Document
     *[other] CSV File
  }


about-logins-import-file-picker-title2 = Import Passwords to { -brand-short-name }
about-logins-import-file-picker-import-button = Import
about-logins-import-file-picker-csv-filter-title =
  { PLATFORM() ->
      [macos] CSV Document
     *[other] CSV File
  }
about-logins-import-file-picker-tsv-filter-title =
  { PLATFORM() ->
      [macos] TSV Document
     *[other] TSV File
  }


about-logins-import-dialog-title = Import Complete
about-logins-import-dialog-items-added2 =
  { $count ->
     *[other] <span>New passwords added:</span> <span data-l10n-name="count">{ $count }</span>
  }

about-logins-import-dialog-items-modified2 =
  { $count ->
     *[other] <span>Existing entries updated:</span> <span data-l10n-name="count">{ $count }</span>
  }

about-logins-import-dialog-items-no-change2 =
  { $count ->
     *[other] <span>Duplicate entries found:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(not imported)</span>
  }
about-logins-import-dialog-items-error =
  { $count ->
      *[other] <span>Errors:</span> <span data-l10n-name="count">{ $count }</span> <span data-l10n-name="meta">(not imported)</span>
  }
about-logins-import-dialog-done = Done

about-logins-import-dialog-error-title = Import Error
about-logins-import-dialog-error-conflicting-values-title = Multiple Conflicting Values for One Login
about-logins-import-dialog-error-conflicting-values-description = For example: multiple usernames, passwords, URLs, etc. for one login.
about-logins-import-dialog-error-file-format-title = File Format Issue
about-logins-import-dialog-error-file-format-description = Incorrect or missing column headers. Make sure the file includes columns for username, password and URL.
about-logins-import-dialog-error-file-permission-title = Unable to Read File
about-logins-import-dialog-error-file-permission-description = { -brand-short-name } does not have permission to read the file. Try changing the file permissions.
about-logins-import-dialog-error-unable-to-read-title = Unable to Parse File
about-logins-import-dialog-error-unable-to-read-description = Make sure you selected a CSV or TSV file.
about-logins-import-dialog-error-no-logins-imported = No logins have been imported
about-logins-import-dialog-error-learn-more = Learn more
about-logins-import-dialog-error-try-import-again = Try Import Again…
about-logins-import-dialog-error-cancel = Cancel

about-logins-import-report-title = Import Summary
about-logins-import-report-description2 = Passwords imported to { -brand-short-name }.

about-logins-import-report-row-index = Row { $number }
about-logins-import-report-row-description-no-change2 = Duplicate: Exact match of existing entry
about-logins-import-report-row-description-modified2 = Existing entry updated
about-logins-import-report-row-description-added2 = New password added
about-logins-import-report-row-description-error = Error: Missing field


about-logins-import-report-row-description-error-multiple-values = Error: Multiple values for { $field }
about-logins-import-report-row-description-error-missing-field = Error: Missing { $field }


about-logins-import-report-added2 =
  { $count ->
      *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">New passwords added</div>
  }
about-logins-import-report-modified2 =
  { $count ->
      *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">Existing entries updated</div>
  }
about-logins-import-report-no-change2 =
  { $count ->
      *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">Duplicate entries</div> <div data-l10n-name="not-imported">(not imported)</div>
  }
about-logins-import-report-error =
  { $count ->
      *[other] <div data-l10n-name="count">{ $count }</div> <div data-l10n-name="details">Errors</div> <div data-l10n-name="not-imported">(not imported)</div>
  }


about-logins-import-report-page-title = Import Summary Report
