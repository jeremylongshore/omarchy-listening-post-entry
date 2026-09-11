# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Perception is for technical builders and operators who need to track a fast-moving AI ecosystem without repeatedly checking feeds, release pages, status sites, and social streams. Its first customer group is people working in Omarchy who value keyboard-first tools, source provenance, and quiet software.

## Product Purpose

Perception watches a curated field of primary and trusted sources, ranks changes against a customer's topics, and turns the result into a finite, source-backed priority brief. Success means a customer can return to their work while Perception keeps watch, then understand what changed and why it matters without entering an endless feed.

Listening Post is the free MIT-licensed Omarchy companion. It carries the actionable edge of Perception into the desktop bar and opens the paid web product for depth.

## Positioning

The Perception Loop is the product's distinctive mechanism: Perception watches, ranks, and explains the field in the web signal room; Listening Post brings only the useful edge of that intelligence to the customer's point of work.

Umbrella promise: **Perception watches the web. Listening Post taps your shoulder when it matters.**

## Operating Context

- Customers buy a Perception license or subscription through Lemon Squeezy.
- The purchase email is the account identity. Customers sign in with a one-time passwordless link; there is no customer password to manage.
- Entitled customers choose topics, read ranked signals and a daily brief, and manage paired devices in the web signal room.
- Omarchy customers install Listening Post separately, create a device connection in Perception, and store its revocable token outside QML and shell history.
- Every signal retains its source link. A quiet or stale field is represented honestly rather than filled with synthetic activity.

## Capabilities and Constraints

- Perception is the paid customer product; Listening Post is the free companion and discovery surface.
- Lemon Squeezy subscription state is the entitlement authority. Recognized non-expired states retain access; cancelled access ends after the paid-through date.
- Browser sessions and device tokens recheck current entitlement.
- Magic links are one-time, expire after 15 minutes, and are removed from the browser URL before exchange.
- Device tokens are shown once, stored hash-only by the API, revocable by the customer, and limited per account.
- Firebase and GitHub OAuth are not product authentication dependencies.
- The web app deploys at `perception.intentsolutions.io`; the API deploys at `api.perception.intentsolutions.io`.
- Production price, billing interval, refund window, legal entity wording, support mailbox, and final Lemon Squeezy checkout URL are deployment-owned open decisions. Customer copy must not fabricate them.
- Wait State is a different plugin and is not part of this product.

## Brand Commitments

- Product name: Perception.
- Companion name: Listening Post.
- Voice: calm, discerning, editorial, technically honest, and protective of attention.
- Recurring language: “What changed while you worked,” “Quiet by design,” “signal,” “brief,” “watchlist,” and “source.”
- Avoid generic AI/SaaS hype, omniscient promises, fake urgency, fake social proof, and infrastructure names in customer-facing benefits.
- Existing visual assets: `assets/banner.svg`, `preview.png`, and the signal-room implementation in `web/src/`.

## Evidence on Hand

- A working React signal room, Fastify API, Lemon Squeezy entitlement boundary, passwordless authentication, device pairing, curated ingestion, ranking, briefs, and an Omarchy companion exist in this repository.
- Automated web, API, contract, QML, security, container, and recovery evidence is recorded in `VERIFICATION.md`.
- The source catalog is implemented in `api/src/sources.ts`.
- There are no customer testimonials, revenue figures, conversion benchmarks, press quotes, or production-traffic metrics on hand. Marketing must not invent them.

## Product Principles

1. Protect attention. Silence is a valid product state.
2. Prove every signal with a source and explain its relevance.
3. Reach customers at the point of work without turning the desktop into another feed.
4. Make the paid boundary and account state understandable and recoverable.
5. Keep the free companion useful, secure, and clearly connected to the paid depth product.

## Accessibility & Inclusion

The web product must remain keyboard operable, responsive, readable at 200% zoom, respectful of reduced-motion preferences, and clear without relying on color alone. Transactional email must include equivalent plain-text and HTML content.
