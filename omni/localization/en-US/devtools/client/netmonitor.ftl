

network-menu-summary-tooltip-perf =
    .title = Start performance analysis
network-menu-summary-tooltip-domcontentloaded =
    .title = Time when “DOMContentLoaded” event occurred
network-menu-summary-tooltip-load =
    .title = Time when “load” event occurred
network-menu-summary-requests-count =
    { $requestCount ->
        [0] No requests
        [one] { $requestCount } request
        *[other] { $requestCount } requests
    }
network-menu-summary-tooltip-requests-count =
    .title = Number of requests
network-menu-summary-transferred =
    { $formattedContentSize } / { $formattedTransferredSize } transferred
network-menu-summary-tooltip-transferred =
    .title = Size/transferred size of all requests
network-menu-summary-finish = Finish: { $formattedTime }
network-menu-summary-tooltip-finish =
    .title = Total time needed to load all requests
