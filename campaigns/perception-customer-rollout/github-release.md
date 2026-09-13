---
platform: github
format: release-and-readme-announcement
created: 2026-09-11
status: ready
---

# Listening Post now connects to Perception

Listening Post started as a local Omarchy radar for model releases, pricing changes, and provider incidents. That local radar still matters. But the more useful product needed a place to tune topics, explain relevance, preserve source health, and manage the connection.

That place is **Perception**.

Perception is the paid web signal room. Listening Post is its free MIT-licensed Omarchy companion.

Together they form one loop:

1. Perception watches a curated field of 29 sources.
2. Operational impact and your topics rank what changed.
3. Every signal keeps its reason and source.
4. Listening Post carries the actionable edge into the bar.
5. Nothing new stays quiet.

The account boundary is deliberately small. Buy through Lemon Squeezy. Use the purchase email for a one-time sign-in link. Create a revocable device credential inside Perception, then paste it into Listening Post's hidden connector prompt. The token stays out of QML, shell history, process arguments, and `shell.json`.

Install the companion:

```bash
omarchy plugin add https://github.com/jeremylongshore/omarchy-listening-post-entry --enable
```

Open the signal room: https://oma.intentsolutions.io/perception/

The plugin remains useful before pairing. After its first valid account response, it preserves the last good Perception field through interrupted or malformed responses instead of silently changing data sources.

Quiet by design.
