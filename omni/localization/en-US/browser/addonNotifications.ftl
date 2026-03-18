
xpinstall-prompt = { -brand-short-name } prevented this site from asking you to install software on your computer.


xpinstall-prompt-header = Allow { $host } to install an add-on?
xpinstall-prompt-message = You are attempting to install an add-on from { $host }. Make sure you trust this site before continuing.


xpinstall-prompt-header-unknown = Allow an unknown site to install an add-on?
xpinstall-prompt-message-unknown = You are attempting to install an add-on from an unknown site. Make sure you trust this site before continuing.

xpinstall-prompt-dont-allow =
    .label = Don’t Allow
    .accesskey = D
xpinstall-prompt-never-allow =
    .label = Never Allow
    .accesskey = N
xpinstall-prompt-never-allow-and-report =
    .label = Report Suspicious Site
    .accesskey = R
xpinstall-prompt-install =
    .label = Continue to Installation
    .accesskey = C


site-permission-install-first-prompt-midi-header = This site is requesting access to your MIDI (Musical Instrument Digital Interface) devices. Device access can be enabled by installing an add-on.
site-permission-install-first-prompt-midi-message = This access is not guaranteed to be safe. Only continue if you trust this site.


xpinstall-disabled-by-policy = Software installation has been disabled by your organization.
xpinstall-disabled = Software installation is currently disabled. Click Enable and try again.
xpinstall-disabled-button =
    .label = Enable
    .accesskey = n

addon-installation-blocked-by-policy = { $addonName } ({ $addonId }) is blocked by your organization.
addon-install-domain-blocked-by-policy = Your organization prevented this site from asking you to install software on your computer.
addon-install-full-screen-blocked = Add-on installation is not allowed while in or before entering fullscreen mode.

webext-perms-sideload-menu-item = { $addonName } added to { -brand-short-name }
webext-perms-update-menu-item = { $addonName } requires new permissions

webext-imported-addons = Finalize installing extensions imported to { -brand-short-name }


addon-removal-title = Remove { $name }?
addon-removal-button = Remove
addon-removal-abuse-report-checkbox = Report this extension to { -vendor-short-name }
addon-mlmodel-removal-body = If you use the features or extensions that use this model, it will be re-added.

addon-downloading-and-verifying =
    { $addonCount ->
        [1] Downloading and verifying add-on…
       *[other] Downloading and verifying { $addonCount } add-ons…
    }
addon-download-verifying = Verifying

addon-install-cancel-button =
    .label = Cancel
    .accesskey = C
addon-install-accept-button =
    .label = Add
    .accesskey = A


addon-confirm-install-message =
    { $addonCount ->
        [1] This site would like to install an add-on in { -brand-short-name }:
       *[other] This site would like to install { $addonCount } add-ons in { -brand-short-name }:
    }
addon-confirm-install-unsigned-message =
    { $addonCount ->
        [1] Caution: This site would like to install an unverified add-on in { -brand-short-name }. Proceed at your own risk.
       *[other] Caution: This site would like to install { $addonCount } unverified add-ons in { -brand-short-name }. Proceed at your own risk.
    }
addon-confirm-install-some-unsigned-message =
    { $addonCount ->
       *[other] Caution: This site would like to install { $addonCount } add-ons in { -brand-short-name }, some of which are unverified. Proceed at your own risk.
    }


addon-install-error-network-failure = The add-on could not be downloaded because of a connection failure.
addon-install-error-incorrect-hash = The add-on could not be installed because it does not match the add-on { -brand-short-name } expected.
addon-install-error-corrupt-file = The add-on downloaded from this site could not be installed because it appears to be corrupt.
addon-install-error-file-access = { $addonName } could not be installed because { -brand-short-name } cannot modify the needed file.
addon-install-error-not-signed = { -brand-short-name } has prevented this site from installing an unverified add-on.
addon-install-error-invalid-domain = The add-on { $addonName } can not be installed from this location.
addon-local-install-error-network-failure = This add-on could not be installed because of a filesystem error.
addon-local-install-error-incorrect-hash = This add-on could not be installed because it does not match the add-on { -brand-short-name } expected.
addon-local-install-error-corrupt-file = This add-on could not be installed because it appears to be corrupt.
addon-local-install-error-file-access = { $addonName } could not be installed because { -brand-short-name } cannot modify the needed file.
addon-local-install-error-not-signed = This add-on could not be installed because it has not been verified.
addon-install-error-incompatible = { $addonName } could not be installed because it is not compatible with { -brand-short-name } { $appVersion }.
addon-install-error-hard-blocked = { $addonName } violates Mozilla’s policies and can’t be installed on { -brand-short-name }.
addon-install-error-soft-blocked = { $addonName } violates Mozilla’s policies and can’t be installed on { -brand-short-name }.
addon-install-error-admin-install-only = You cannot install { $addonName } as an end user, it can only be installed by an organization using enterprise policies.
