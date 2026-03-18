
page-info-window =
    .style = width: 600px; min-height: 550px;

copy =
    .key = C
menu-copy =
    .label = Copy
    .accesskey = C

select-all =
    .key = A
menu-select-all =
    .label = Select All
    .accesskey = A

close-dialog =
    .key = w

general-tab =
    .label = General
    .accesskey = G
general-title =
    .value = Title:
general-url =
    .value = Address:
general-type =
    .value = Type:
general-mode =
    .value = Render Mode:
general-size =
    .value = Size:
general-referrer =
    .value = Referring URL:
general-modified =
    .value = Modified:
general-encoding =
    .value = Text Encoding:
general-meta-name =
    .label = Name
general-meta-content =
    .label = Content

media-tab =
    .label = Media
    .accesskey = M
media-location =
    .value = Location:
media-text =
    .value = Associated Text:
media-alt-header =
    .label = Alternate Text
media-address =
    .label = Address
media-type =
    .label = Type
media-size =
    .label = Size
media-count =
    .label = Count
media-dimension =
    .value = Dimensions:
media-long-desc =
    .value = Long Description:
media-select-all =
    .label = Select All
    .accesskey = e
media-save-as =
    .label = Save As…
    .accesskey = A
media-save-image-as =
    .label = Save As…
    .accesskey = v

perm-tab =
    .label = Permissions
    .accesskey = P
permissions-for =
    .value = Permissions for:

security-tab =
    .label = Security
    .accesskey = S
security-view =
    .label = View Certificate
    .accesskey = V
security-view-unknown = Unknown
    .value = Unknown
security-view-identity =
    .value = Website Identity
security-view-identity-owner =
    .value = Owner:
security-view-identity-domain =
    .value = Website:
security-view-identity-verifier =
    .value = Verified by:
security-view-identity-validity =
    .value = Expires on:
security-view-privacy =
    .value = Privacy & History

security-view-privacy-history-value = Have I visited this website prior to today?
security-view-privacy-sitedata-value = Is this website storing information on my computer?

security-view-privacy-clearsitedata =
    .label = Clear Cookies and Site Data
    .accesskey = C

security-view-privacy-passwords-value = Have I saved any passwords for this website?

security-view-privacy-viewpasswords =
    .label = View Saved Passwords
    .accesskey = w
security-view-technical =
    .value = Technical Details

help-button =
    .label = Help


security-site-data-cookies = Yes, cookies and { $value } { $unit } of site data
security-site-data-only = Yes, { $value } { $unit } of site data

security-site-data-cookies-only = Yes, cookies
security-site-data-no = No


image-size-unknown = Unknown
page-info-not-specified =
    .value = Not specified
not-set-alternative-text = Not specified
not-set-date = Not specified
media-img = Image
media-bg-img = Background
media-border-img = Border
media-list-img = Bullet
media-cursor = Cursor
media-object = Object
media-embed = Embed
media-link = Icon
media-input = Input
media-video = Video
media-audio = Audio
saved-passwords-yes = Yes
saved-passwords-no = No

no-page-title =
    .value = Untitled Page:
general-quirks-mode =
    .value = Quirks mode
general-strict-mode =
    .value = Standards compliance mode
page-info-security-no-owner =
    .value = This website does not supply ownership information.
media-select-folder = Select a Folder to Save the Images
media-unknown-not-cached =
    .value = Unknown (not cached)
permissions-use-default =
    .label = Use Default

general-meta-tags =
    .value =
        { $tags ->
             [one] Meta (1 tag)
            *[other] Meta ({ $tags } tags)
        }

security-visits-number =
    { $visits ->
         [0] No
         [one] Yes, once
        *[other] Yes, { $visits } times
    }

properties-general-size =
    .value = { $bytes ->
         [one] { $kb } KB ({ $bytes } byte)
        *[other] { $kb } KB ({ $bytes } bytes)
    }

media-animated-image-type =
    .value = { $frames ->
         [one] { $type } Image (animated, { $frames } frame)
        *[other] { $type } Image (animated, { $frames } frames)
    }

media-image-type =
    .value = { $type } Image

media-dimensions-scaled =
    .value = { $dimx }px × { $dimy }px (scaled to { $scaledx }px × { $scaledy }px)

media-dimensions =
    .value = { $dimx }px × { $dimy }px

media-file-size = { $size } KB


page-info-page =
    .title = Page Info — { $website }
page-info-frame =
    .title = Frame Info — { $website }
