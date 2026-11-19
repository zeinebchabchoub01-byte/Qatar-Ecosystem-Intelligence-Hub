# Qatar event source checks

Checked on 19 November 2026. These checks cover the supplied sources and additional relevant Qatar ecosystem sites; they do not establish exhaustive coverage of all events in Qatar. Source availability and listings can change.

| Source | Observed result | Collection behavior |
| --- | --- | --- |
| [AllEvents Doha](https://allevents.in/doha-qa/all) | Public event cards and individual Event JSON-LD were readable. | Enabled; relevant cards lead to individual pages for dates, venue, organizer and description. |
| [AllEvents business](https://allevents.in/doha-qa/business) | Readable; included the same founder networking event as the main page. | Enabled; identical event records share a database ID. |
| [AllEvents startups](https://allevents.in/doha-qa/startups) | Explicitly reported no active events. | Enabled; recognized empty categories return zero events successfully. |
| [AllEvents entrepreneurship](https://allevents.in/doha-qa/entrepreneurship) | Readable; included the founder networking event. | Enabled. |
| [Eventbrite Qatar](https://www.eventbrite.com/d/qatar--doha/qatar/) and [business](https://www.eventbrite.com/d/qatar--doha/business--events/) | HTTP 200, but embedded search results were empty and JSON-LD contained no event records. | Enabled; supports Event JSON-LD, embedded search records and public event links. Reports unavailable records when the public page does not expose them. This does not prove Eventbrite has no Qatar events. |
| [incubator.qa](https://incubator.qa/) | Client-rendered calendar. Its public application bundle calculated event dates from the current date plus offsets, including the LeanStartup Workshop and FinTech Networking Mixer. | Visible but unconfigured and disabled. Relative dates cannot establish a real scheduled event. |
| [Startup Qatar](https://startupqatar.qa/en/events) | Public calendar remained readable and supplied historical Qatar events. | Existing collector retained. |
| [QSTP](https://www.qstp.org.qa/) | Homepage exposed official event links; individual qstp.qa event pages and the tested calendar/API paths returned HTTP 403. | Homepage discovery enabled; inaccessible details produce a visible source error. |
| [QBIC](https://www.qbic.qa/) | HTTP 403. | Checked; no unverifiable listings imported. |
| [Qatar FinTech Hub](https://qatarfintech.com/) | HTTP 403. The fintech.qa address linked by incubator.qa failed certificate verification in the check environment. | Checked; no unverifiable listings imported. |
| [QDB events](https://www.qdb.qa/events) | Tested URL returned HTTP 404. | No working calendar endpoint established. |

## Verified example

[Business Connect I B2B Networking I Founders & Investors](https://allevents.in/doha/business-connect-i-b2b-networking-i-founders-and-investors/100001980245554761) supplied a start of **28 November 2026, 19:00**, end of **22:00**, venue **Mondrian Doha**, and organizer **Tablon Community**. Times came from the source with a +03:00 offset. The application displays event dates rather than times. A live detail fetch through the new collector returned this record successfully.

The screenshot examples were used to identify relevant topics. Their workshop, fintech mixer and WSJ dates were not imported as verified events. In particular, the incubator calendar's shifting dates did not corroborate fixed organizer dates.

## Collection limits

Each page is bounded to 3 MB with a 12-second request timeout. Up to 12 relevant detail links per listing are followed, with three concurrent requests. Link discovery restricts detail hosts and paths to the supported providers. Event text is sanitized, and malformed dates, reversed ranges, non-Qatar venues, online-only events, canceled/postponed listings and unrelated events are excluded. A failed source leaves stored events intact. Detail-page failures are retried in subsequent daily collections; a successful partial crawl may contain fewer events than the source website.

The existing Netlify Database table and applied migration were preserved. Deployment and a full authenticated database-backed synchronization were not performed during these checks.

## Automatic collection integration

Opening Events now requests a separate background event collection automatically. A database-backed claim prevents simultaneous visitors from creating duplicate jobs, retains source results between requests, and limits successful refreshes to one per 30 minutes. Failed dispatches retry after a short cooldown. A changed built-in source configuration invalidates a completed collection's cooldown so newly integrated sources are checked. The job uses the current deployment's worker and database branch; it does not require preview deployments to trigger production article synchronization.

The Events response includes collection progress and per-source results. The browser polls until the collected events appear, distinguishes an active check from an empty result, and preserves saved listings if dispatch or an individual source fails. This removes the previous dependency on publishing a production deployment or manually starting the full article synchronization before new event sources can populate the Events page.

Validation covered queue deduplication, stale and duplicate worker deliveries, dispatch timeout races, partial source failures, saved-event preservation, and source confidentiality. A browser check with API fixtures verified the collecting-to-event transition, automatic polling and a mobile viewport. Live AllEvents requests returned Business Connect at Mondrian Doha on 28 November 2026. Database-backed execution of the new job still requires deployment with the new collection-status migration; no write through the restricted investigation connection was attempted.

## WSJ Tech: Qatar — verified organizer integration

The official page at https://wsjtechevent.wsj.com/qatar/ was checked on 19 November 2026. It confirmed **30 November–2 December 2026**, **Waldorf Astoria Doha Lusail, Doha, Qatar**. The WSJ event previously referenced in the screenshots is now corroborated by its organizer's page. The page's description explicitly covers investors, innovators, technology and business.

Two gaps explained the missing listing. WSJ was absent from the registered event sources, and its page exposed WebPage metadata rather than Event JSON-LD. A dedicated enabled source now parses the visible conference header, complete date range, overview and main venue section. It deliberately ignores article publication/modification dates and excursion locations. The source URL excludes the supplied advertising parameters.

The latest preview's calendar response also showed a job remaining queued while the older production site's full synchronization started at the same time. Event dispatch previously relied on environment URL fallbacks that could select an older deployment. The Events API now passes its serving origin through the queue to dispatch, so the current deployment's worker receives the job and uses its matching database branch.

A live request through fetchFeed returned the WSJ event with start 2026-11-30 and end 2026-12-02. Regression tests covered its non-Event HTML, invalid dates, missing venue, geographic rejection, origin precedence, and organizer HTML flowing through a queued job into event storage using a test repository. Deployment-backed execution of the revised dispatch and persistence still requires validation after publication.
