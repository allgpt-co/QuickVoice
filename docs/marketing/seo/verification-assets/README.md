# Verification artifacts

Final live rollout evidence is in [production routes](production-final-2026-09-06.json), [deployment](production-deployment-final-2026-09-06.json), [resource hashes](resources-production-final-2026-09-06.json), [sitemap submission and processing](sitemap-final-2026-09-06.json), and [directory acknowledgement](directory-submission-2026-09-06.json). See the [execution record](../execution-2026-09-06.md) for scope and remaining dependencies.

The earlier artifacts in the table below were captured in the original QuickVoice workspace on 2026-09-06 and copied here for review. They document local browser and production-build checks before transfer to the PR branch. Those earlier artifacts are not deployment evidence or a replacement for checks against the final PR revision. The original workspace files were left unchanged.

| Artifact | Provenance and scope |
| --- | --- |
| [Mobile homepage](seo-home-mobile.png) | Earlier local full-page browser screenshot at a 390px viewport. UI evidence only; not a production measurement. |
| [Desktop appointment workflow](seo-workflow-desktop.png) | Earlier local full-page browser screenshot at a 1440px viewport. Shows the request-intake and permitted-booking boundary. UI evidence only. |
| [Production HTTP smoke results](production-smoke.json) | Earlier local production-server checks for 45 sitemap URLs, publication boundaries and the `www` redirect. The JSON has no embedded revision/build ID; its associated check history is in the [implementation report](../verification-2026-09-06.md). |
| [GA default browser verification](ga-default-verification-2026-09-06.json) | Local build `mcQelttorQ6fTc10wwncU`, using a simulated canonical origin and mocked Google JavaScript. Confirms host guarding and a single initialization; no actual Google tag or collection request was sent. Includes limits and earlier navigation timeouts. |
| [Performance/contact observations](performance-observations.json) | Earlier local, unthrottled, short-window browser observations with external HTTP blocked. Contact success and the lead event were mocked. The test phone value and unused screenshot-path field were removed from this repository copy. |

The two PNGs, HTTP smoke JSON and GA browser JSON are exact copies of their source artifacts. Only the two unnecessary contact fields were removed from the performance JSON. No raw account reports, credentials, tokens, cookie/client identifiers or local CLI logs are packaged here. Local-only report locations and their key findings remain in the [live measurement report](../live-measurement-check-2026-09-06.md).

Use the [publishing workflow](../publishing-workflow.md) to verify a deployed result and the [current execution report](../execution-2026-09-06.md) for later production observations. These historical artifacts do not establish that later releases are deployed. The connected Analytics token has read-only scope; `generate_lead` key-event registration remains a separate administrative dependency.
