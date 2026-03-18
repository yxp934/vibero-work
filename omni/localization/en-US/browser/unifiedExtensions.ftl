


unified-extensions-header-title = Extensions
unified-extensions-manage-extensions =
    .label = Manage extensions


unified-extensions-item-open-menu =
    .aria-label = Open menu for { $extensionName }

unified-extensions-item-message-manage = Manage extension

unified-extensions-item-messagebar-softblocked = { $extensionName } violates Mozilla’s policies. Using it may be risky.


unified-extensions-context-menu-pin-to-toolbar =
    .label = Pin to Toolbar

unified-extensions-context-menu-manage-extension =
    .label = Manage Extension

unified-extensions-context-menu-remove-extension =
    .label = Remove Extension

unified-extensions-context-menu-report-extension =
    .label = Report Extension

unified-extensions-context-menu-move-widget-up =
    .label = Move Up

unified-extensions-context-menu-move-widget-down =
    .label = Move Down


unified-extensions-mb-quarantined-domain-message-3 =
    .heading = Some extensions are not allowed
    .message = To protect your data, some extensions can’t read or change data on this site. Use the extension’s settings to allow on sites restricted by { -vendor-short-name }.

unified-extensions-mb-quarantined-domain-learn-more = Learn more
    .aria-label = Learn more: Some extensions are not allowed

unified-extensions-mb-about-addons-link = Go to extension settings

unified-extensions-mb-blocklist-warning-single =
    .heading = { $extensionName } disabled
    .message =
        This extension violates Mozilla’s policies and has been disabled.
        You can enable it in settings, but this may be risky.

unified-extensions-mb-blocklist-error-single =
    .heading = { $extensionName } disabled
    .message =
        This extension violates Mozilla’s policies and has been disabled.

unified-extensions-mb-blocklist-warning-multiple =
    .heading =
        { $extensionsCount ->
            *[other] { $extensionsCount } extensions disabled
        }
    .message =
        Some of your extensions have been disabled for violating Mozilla’s policies.
        You can enable them in settings, but this may be risky.

unified-extensions-mb-blocklist-error-multiple =
    .heading =
        { $extensionsCount ->
            *[other] { $extensionsCount } extensions disabled
        }
    .message =
        Some of your extensions have been disabled for violating Mozilla’s policies.
