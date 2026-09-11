---
platform: reddit
format: transparent-value-post
source: Perception customer rollout
created: 2026-09-11
status: ready-after-community-rules-review
recommended_post_time: "Weekday morning; only in a community that allows project posts"
---

# Reddit / Omarchy Community Post

## Title

I built a quiet AI signal room with a free Omarchy companion

## Body

Disclosure: I built this.

I kept running into the same problem: checking model release pages, provider status sites, changelogs, newsletters, and RSS just to discover that nothing relevant had happened.

Listening Post began as a local Omarchy plugin for that job. It watches a fixed set of sources and keeps the bar quiet unless a release, pricing change, or unresolved incident appears.

The local version proved the interface, but it could not provide a real account watchlist, cross-device read state, explainable ranking, or a place to inspect source health. So I built the deeper product as a web app called Perception.

The split is intentional:

- Perception is the paid signal room: customer topics, ranked field, finite brief, source health, account and device management.
- Listening Post is the free MIT-licensed companion: a compact edge of that field in Omarchy.
- Every signal retains its source.
- A stale or interrupted field is labeled instead of passed off as fresh.
- Purchase-email magic links replace passwords and social login.
- Device tokens are shown once, stored hash-only by the API, and revocable.

The plugin can still operate locally before pairing. Once it receives a valid Perception field, it preserves that last good account snapshot through API failures instead of silently changing modes.

Project/source: https://github.com/jeremylongshore/omarchy-listening-post-entry

Product: https://perception.intentsolutions.io

The most useful feedback would be concrete: what source or kind of change is actually worth putting in an Omarchy bar, and what should remain silent?

I will check the community's self-promotion rules before posting and remove the product link if links are not allowed.
