
content-blocking-trackers-view-empty = None detected on this site

content-blocking-cookies-blocking-trackers-label = Cross-Site Tracking Cookies
content-blocking-cookies-blocking-third-party-label = Third-Party Cookies
content-blocking-cookies-blocking-unvisited-label = Unvisited Site Cookies
content-blocking-cookies-blocking-all-label = All Cookies

content-blocking-cookies-view-first-party-label = From This Site
content-blocking-cookies-view-trackers-label = Cross-Site Tracking Cookies
content-blocking-cookies-view-third-party-label = Third-Party Cookies

content-blocking-cookies-view-allowed-label =
    .value = Allowed
content-blocking-cookies-view-blocked-label =
    .value = Blocked

content-blocking-cookies-view-remove-button =
    .tooltiptext = Clear cookie exception for { $domain }

tracking-protection-icon-active = Blocking social media trackers, cross-site tracking cookies, and fingerprinters.
tracking-protection-icon-active-container =
    .aria-label = { tracking-protection-icon-active }
tracking-protection-icon-disabled = Enhanced Tracking Protection is OFF for this site.
tracking-protection-icon-disabled-container =
    .aria-label = { tracking-protection-icon-disabled }
tracking-protection-icon-no-trackers-detected = No trackers known to { -brand-short-name } were detected on this page.
tracking-protection-icon-no-trackers-detected-container =
    .aria-label = { tracking-protection-icon-no-trackers-detected }


protections-header = Protections for { $host }


protections-blocking-fingerprinters =
    .title = Fingerprinters Blocked
protections-blocking-cryptominers =
    .title = Cryptominers Blocked
protections-blocking-cookies-trackers =
    .title = Cross-Site Tracking Cookies Blocked
protections-blocking-cookies-third-party =
    .title = Third-Party Cookies Blocked
protections-blocking-cookies-all =
    .title = All Cookies Blocked
protections-blocking-cookies-unvisited =
    .title = Unvisited Site Cookies Blocked
protections-blocking-tracking-content =
    .title = Tracking Content Blocked
protections-blocking-social-media-trackers =
    .title = Social Media Trackers Blocked
protections-not-blocking-fingerprinters =
    .title = Not Blocking Fingerprinters
protections-not-blocking-cryptominers =
    .title = Not Blocking Cryptominers
protections-not-blocking-cookies-third-party =
    .title = Not Blocking Third-Party Cookies
protections-not-blocking-cookies-all =
    .title = Not Blocking Cookies
protections-not-blocking-cross-site-tracking-cookies =
    .title = Not Blocking Cross-Site Tracking Cookies
protections-not-blocking-tracking-content =
    .title = Not Blocking Tracking Content
protections-not-blocking-social-media-trackers =
    .title = Not Blocking Social Media Trackers


protections-footer-blocked-tracker-counter =
    { $trackerCount ->
        [one] { $trackerCount } Blocked
       *[other] { $trackerCount } Blocked
    }
    .tooltiptext = Since { DATETIME($date, year: "numeric", month: "long", day: "numeric") }
protections-footer-blocked-tracker-counter-no-tooltip =
    { $trackerCount ->
        [one] { $trackerCount } Blocked
       *[other] { $trackerCount } Blocked
    }

protections-milestone =
    { $trackerCount ->
        [one] { -brand-short-name } blocked { $trackerCount } tracker since { DATETIME($date, year: "numeric", month: "long") }
       *[other] { -brand-short-name } blocked over { $trackerCount } trackers since { DATETIME($date, year: "numeric", month: "long") }
    }
