---
campaign: perception-customer-rollout
calendar: relative-to-go-live
total_assets: 5
status: ready-when-dns-checkout-and-smoke-test-pass
---

# Perception Rollout Schedule

| Time | Channel | Asset | Purpose |
| --- | --- | --- | --- |
| T-7 days | GitHub | `github-release.md` as draft | Let maintainers verify install and claims. |
| T-3 days | Owned email test list | `emails/10-launch-announcement.md` | Verify sender, links, plain text, and reply path. |
| T-1 day | Omarchy community, if permitted | `social/reddit-omarchy.md` | Ask for product-specific feedback without hiding affiliation. |
| Launch, 9:00 | Product and API | First-customer smoke test | Prove buy → email → signal → pair before promotion. |
| Launch, 10:00 | Owned email | `emails/10-launch-announcement.md` | Announce to the existing permissioned audience. |
| Launch, 11:00 | LinkedIn | `social/linkedin-launch.md` | Explain the mechanism and invite operator feedback. |
| Launch, active release window | Bluesky | `social/bluesky-thread.md` | Join a relevant live technical conversation, not a cold promotion blast. |
| Launch +1 day | GitHub | `github-release.md` | Publish only after public URLs and install command pass. |
| Launch +3 days | All replied channels | Founder follow-up | Answer actual objections; do not post a second generic launch blast. |
| Launch +7 days | Product review | Funnel query | Compare directional event counts and log real learnings. |

No scheduler is connected. Publish manually after the rollout gate clears. Times are starting hypotheses, not claimed performance data.
