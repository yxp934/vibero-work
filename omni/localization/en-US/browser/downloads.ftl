

downloads-window =
  .title = Downloads
downloads-panel =
  .aria-label = Downloads


downloads-panel-items =
  .style = width: 35em

downloads-cmd-pause =
    .label = Pause
    .accesskey = P
downloads-cmd-resume =
    .label = Resume
    .accesskey = R
downloads-cmd-cancel =
    .tooltiptext = Cancel
downloads-cmd-cancel-panel =
    .aria-label = Cancel

downloads-cmd-show-menuitem-2 =
  .label = { PLATFORM() ->
      [macos] Show in Finder
     *[other] Show in Folder
  }
  .accesskey = F


downloads-cmd-use-system-default =
  .label = Open In System Viewer
  .accesskey = I
downloads-cmd-use-system-default-named =
  .label = Open In { $handler }
  .accesskey = I

downloads-cmd-always-use-system-default =
  .label = Always Open In System Viewer
  .accesskey = w
downloads-cmd-always-use-system-default-named =
  .label = Always Open In { $handler }
  .accesskey = w


downloads-cmd-always-open-similar-files =
  .label = Always Open Similar Files
  .accesskey = w

downloads-cmd-show-button-2 =
  .tooltiptext = { PLATFORM() ->
      [macos] Show in Finder
     *[other] Show in Folder
  }

downloads-cmd-show-panel-2 =
  .aria-label = { PLATFORM() ->
      [macos] Show in Finder
     *[other] Show in Folder
  }
downloads-cmd-show-description-2 =
  .value = { PLATFORM() ->
      [macos] Show in Finder
     *[other] Show in Folder
  }

downloads-cmd-retry =
    .tooltiptext = Retry
downloads-cmd-retry-panel =
    .aria-label = Retry
downloads-cmd-go-to-download-page =
    .label = Go To Download Page
    .accesskey = G
downloads-cmd-copy-download-link =
    .label = Copy Download Link
    .accesskey = L
downloads-cmd-remove-from-history =
    .label = Remove From History
    .accesskey = e
downloads-cmd-clear-list =
    .label = Clear Preview Panel
    .accesskey = a
downloads-cmd-clear-downloads =
    .label = Clear Downloads
    .accesskey = C
downloads-cmd-delete-file =
    .label = Delete
    .accesskey = D

downloads-cmd-unblock =
    .label = Allow Download
    .accesskey = o

downloads-cmd-remove-file =
    .tooltiptext = Remove File

downloads-cmd-remove-file-panel =
    .aria-label = Remove File

downloads-cmd-choose-unblock =
    .tooltiptext = Remove File or Allow Download

downloads-cmd-choose-unblock-panel =
    .aria-label = Remove File or Allow Download

downloads-cmd-choose-open =
    .tooltiptext = Open or Remove File

downloads-cmd-choose-open-panel =
    .aria-label = Open or Remove File

downloads-show-more-information =
    .value = Show more information

downloads-open-file =
    .value = Open File


downloading-file-opens-in-hours-and-minutes-2 =
  .value = Opening in { $hours }h { $minutes }m…
downloading-file-opens-in-minutes-2 =
  .value = Opening in { $minutes }m…
downloading-file-opens-in-minutes-and-seconds-2 =
  .value = Opening in { $minutes }m { $seconds }s…
downloading-file-opens-in-seconds-2 =
  .value = Opening in { $seconds }s…
downloading-file-opens-in-some-time-2 =
  .value = Opening when completed…
downloading-file-click-to-open =
  .value = Open when completed


downloads-retry-download =
    .value = Retry Download

downloads-cancel-download =
    .value = Cancel Download

downloads-history =
    .label = Show all downloads
    .accesskey = S

downloads-details =
    .title = Download details


downloads-files-not-downloaded = { $num ->
    [one] File not downloaded.
   *[other] {$num} files not downloaded.
}
downloads-blocked-from-url = Downloads blocked from { $url }.
downloads-blocked-download-detailed-info = { $url } attempted to automatically download multiple files. The site could be broken or trying to store spam files on your device.


downloads-clear-downloads-button =
    .label = Clear Downloads
    .tooltiptext = Clears completed, canceled and failed downloads

downloads-list-empty =
    .value = There are no downloads.

downloads-panel-empty =
    .value = No downloads for this session.

downloads-more-downloading =
    { $count ->
        [one] { $count } more file downloading
       *[other] { $count } more files downloading
    }


downloads-error-alert-title = Download Error
downloads-error-blocked-by = The download cannot be saved because it is blocked by { $extension }.
downloads-error-extension = The download cannot be saved because it is blocked by an extension.
downloads-error-generic =
    The download cannot be saved because an unknown error occurred.

    Please try again.
