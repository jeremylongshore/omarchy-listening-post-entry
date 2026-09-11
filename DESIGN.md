---
name: Perception
description: A Beacon field-paper threshold leading into a quiet, source-backed signal room.
colors:
  field-paper: "#eef1e9"
  field-ink: "#18221b"
  field-muted: "#52645a"
  field-line: "color-mix(in srgb, #18221b 26%, transparent)"
  parchment-panel: "#e5d9bd"
  route-orange-display: "#c64b26"
  route-orange-action: "#f97316"
  route-orange-hover: "#ff8a3d"
  signal-teal: "#086976"
  marker-yellow: "#f4c542"
  policy-link: "#a63d0a"
  private-ink: "#e8edf0"
  private-muted: "#8999a4"
  private-line: "#26343d"
  private-panel: "#101a22"
  private-deep: "#0c141b"
  private-amber: "#efa84a"
  private-cyan: "#63c7c5"
  incident-coral: "#f07167"
  band-muted: "#b8c5bb"
  band-cyan: "#69c3ca"
typography:
  display:
    fontFamily: "Newsreader, serif"
    fontSize: "clamp(58px, 6.8vw, 96px)"
    fontWeight: 500
    lineHeight: 0.88
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Newsreader, serif"
    fontSize: "clamp(46px, 5.7vw, 86px)"
    fontWeight: 500
    lineHeight: 0.94
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Newsreader, serif"
    fontSize: "clamp(17px, 1.5vw, 23px)"
    fontWeight: 500
    lineHeight: 1.15
  body:
    fontFamily: "Manrope, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: "10px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "0.1em"
  action:
    fontFamily: "DM Mono, monospace"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1
rounded:
  square: "0"
  subtle: "3px"
  round: "50%"
spacing:
  compact: "12px"
  control-x: "20px"
  contained: "24px"
  offer: "34px"
  public-gutter: "clamp(22px, 4vw, 64px)"
components:
  public-button-primary:
    backgroundColor: "{colors.route-orange-action}"
    textColor: "{colors.field-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.square}"
    padding: "0 20px"
    height: "50px"
  public-button-primary-hover:
    backgroundColor: "{colors.route-orange-hover}"
    textColor: "{colors.field-ink}"
    typography: "{typography.action}"
    rounded: "{rounded.square}"
    padding: "0 20px"
    height: "50px"
  private-button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.private-ink}"
    rounded: "{rounded.square}"
    padding: "10px 14px"
  private-input:
    backgroundColor: "{colors.private-panel}"
    textColor: "{colors.private-ink}"
    rounded: "{rounded.square}"
    padding: "12px 14px"
  public-field-window:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.field-ink}"
    rounded: "{rounded.square}"
    padding: "0"
  private-card:
    backgroundColor: "{colors.private-panel}"
    textColor: "{colors.private-ink}"
    rounded: "{rounded.square}"
    padding: "24px"
  private-nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.private-muted}"
    rounded: "{rounded.subtle}"
    padding: "11px 10px"
---


# Design System: Perception

## Overview

**Creative North Star: "The Beacon Editorial Field"**

Perception joins two deliberately different environments into one coherent product. The public threshold uses the Intent Solutions Beacon field system: quiet field paper, forest ink, route orange, signal teal, marker yellow, square construction, and a split Intent Solutions / Perception wordmark. It should feel like an assured field document that helps a technical operator decide, not like a conventional SaaS landing page.

The private signal room remains a dark, dense operational workspace. Newsreader supplies editorial judgment across both surfaces, Manrope makes explanation humane, and DM Mono proves state and provenance. The source-backed field window is the hinge between them: public material and private information grammar in one precise artifact.

HustleStats informed the public conversion sequence only. It is not visual authority: do not import its identity, motifs, styling, or brand vocabulary into Perception.

**Key Characteristics:**

- Light Beacon field paper for public and policy surfaces; dark blue-black for the private signal room.
- Forest bands distinguish Listening Post and the closing action from the paper field.
- Newsreader editorial hierarchy, Manrope body copy, and DM Mono data labels across both surfaces.
- Source-backed field rows, square geometry, fine rules, and flat, border-led depth.
- Route orange for action and large light-surface emphasis; signal teal for provenance; marker yellow for focus and rollout status.
- Split Intent Solutions / Perception wordmark on public surfaces.

## Colors

The palette has two coordinated environments: Beacon field materials outside the account and a cool blue-black instrument field inside it.

### Primary

- **Route Orange Display** (`route-orange-display`): Large Newsreader emphasis on field paper. Its measured contrast is 4.15:1 on the paper ground, so it is display-only rather than a small-text color.
- **Route Orange Action** (`route-orange-action`): Primary action fills and accents on forest bands. Pair it with Field Ink text on buttons; do not use it as small text on field paper.

### Secondary

- **Signal Teal** (`signal-teal`): Public provenance, lane labels, trace marks, and live-field cues.
- **Private Signal Cyan** (`private-cyan`): The corresponding healthy, connected, and source-backed signal inside the private room.

### Tertiary

- **Marker Yellow** (`marker-yellow`): Visible keyboard focus, selected text, highlighted promise labels, and the prominent rollout-draft notice on policy pages.
- **Incident Coral** (`incident-coral`): Private incident lanes, destructive actions, and error boundaries only.

### Neutral

- **Field Paper** (`field-paper`): Default public and policy background.
- **Field Ink / Forest** (`field-ink`): Public text, borders, Listening Post and closing bands, and the strongest public structural contrast.
- **Field Muted** (`field-muted`): Supporting public copy and quiet metadata.
- **Field Line** (`field-line`): Fine dividers and grid structure on light surfaces.
- **Parchment Panel** (`parchment-panel`): The access offer and other deliberately contained public material.
- **Private Ink** (`private-ink`): Primary private-room text and high-confidence information.
- **Private Muted** (`private-muted`): Private timestamps, support copy, and subdued states.
- **Private Line** (`private-line`): Private dividers, outlines, and grid structure.
- **Private Panel** (`private-panel`): Contained private fields, device cards, and operational panels.
- **Private Deep** (`private-deep`): Private room ground.

### Named Rules

**The Surface Contract Rule.** Field Paper and Field Ink belong to public and policy surfaces; Private Deep, Private Panel, and Private Ink belong to the authenticated signal room. Bridge them through typography, geometry, and signal semantics rather than forcing one palette everywhere.

**The Route Orange Rule.** Use the darker display orange for large text on paper and the brighter action orange for controls and dark-surface accents; never substitute one merely because both read as orange.

**The Quiet Field Rule.** Orange, teal, cyan, and yellow identify meaningful action or state; none becomes general decoration, and a quiet field stays visually quiet.

## Typography

**Display Font:** Newsreader (with serif fallback)

**Body Font:** Manrope (with sans-serif fallback)

**Label/Mono Font:** DM Mono (with monospace fallback)

**Character:** Newsreader gives decisions and findings editorial gravity; Manrope keeps explanation direct and legible; DM Mono supplies the instrumentation layer for status, provenance, scores, and navigation codes. The Beacon layer changes material and color, not Perception's typographic voice.

### Hierarchy

- **Display** (500, fluid 58–96px, 0.88): Public hero statements only, balanced tightly with selective italic Route Orange Display emphasis.
- **Headline** (500, fluid 46–86px, 0.94): Major public sections and strong private-view declarations.
- **Title** (500, fluid 17–23px, 1.15): Signal titles, compact editorial findings, and offer headings.
- **Body** (400, 17px, 1.7): Public explanatory copy; private operational copy steps down to the implemented 11–13px range when density requires it.
- **Label** (500, 10px, 0.1em tracking, uppercase): Field state, provenance, lane, step, and section metadata.
- **Action** (650, 12px, compact): Primary calls to action, often paired with the forward arrow.

### Named Rules

**The Editorial Scale Rule.** Newsreader carries meaning, Manrope explains it, and DM Mono proves where it came from or what state it is in.

## Layout

The public surface uses a centered 1480px maximum canvas with fluid horizontal gutters from 22px to 64px. Its opening is an asymmetric two-column composition, followed by border-separated editorial sections. The sequence moves from promise to mechanism, dark Listening Post band, trust, access, FAQ, and a dark closing action. That sequence is conversion logic, not permission to borrow another product's visual identity.

Below 1050px the large paired regions stack. The four-part promise band becomes two columns below 860px. Below 760px navigation compresses, primary actions become full width, the split wordmark tightens, and multi-column structures become one readable column.

The private signal room uses a 68px sticky masthead, a 196px sticky left rail, and a workspace capped at 1380px with 46px horizontal padding. Signal rows favor asymmetric score/copy/state columns and compact metadata. Below 760px the rail becomes a fixed bottom navigation bar; its height, page scroll padding, and workspace bottom padding include the device safe area.

Public spacing is generous and sectional; private spacing is compact and operational. Both surfaces preserve whitespace around editorial headlines and use rules instead of turning every region into a card.

## Elevation & Depth

The system is flat by default. Depth comes from tonal surface changes, one- and two-pixel borders, sticky translucent private navigation, the public field window's offset border, and dark full-bleed bands. Cards and containers do not use ambient shadows. The public primary action alone may lift two pixels and gain a compact forest-tinted shadow on hover; that is interaction feedback, not a general elevation system.

Visible focus uses a 2px Marker Yellow outline with a 3px offset and a one-pixel Field Ink edge on public surfaces. Reduced-motion behavior is mandatory: motion compresses to effectively static feedback, and deep-linked signals retain a non-animated outline.

### Shadow Vocabulary

- **Public action lift** (`0 8px 22px rgba(24,34,27,.16)`): Hover feedback for the public primary action only.
- **Live status ring** (`0 0 0 4px rgba(99,199,197,.12)`): A small halo around healthy or live private status dots; never card elevation.

### Named Rules

**The Border-Led Depth Rule.** Establish hierarchy with tone, rules, and offset geometry; never add ambient card shadows to manufacture elevation.

## Shapes

The dominant geometry is square. Public actions, fields, windows, offers, policy notices, topic cells, device cards, and private panels use hard corners. Private rail items alone soften slightly with a 3px radius. Full circles are reserved for status dots, unread marks, and Listening Post marks. One-pixel rules and occasional two-pixel public outlines keep every enclosure precise and field-built.

## Components

### Buttons

- **Shape:** Square, compact, and outlined in Field Ink on the public surface.
- **Primary:** Route Orange Action fill, Field Ink text, 50px minimum height, and 20px horizontal padding; the forward arrow is part of the action language.
- **Hover / Focus:** The fill brightens, the control lifts 2px, its arrow advances 4px, and keyboard focus receives Marker Yellow plus an ink edge. Reduced motion suppresses travel.
- **Secondary / Text:** Private secondary controls are transparent with a one-pixel Private Line border and 10px by 14px padding. Text actions remain unboxed and change to their surface's action accent on hover.

### Cards / Containers

- **Corner Style:** Square.
- **Background:** Field Paper or Parchment Panel outside the account; Private Panel over Private Deep inside it.
- **Shadow Strategy:** None at rest; use borders, dividers, dark bands, or the field window's offset border.
- **Border:** Fine Field Ink/Field Line structure publicly and Private Line structure privately; high-value public artifacts may use a two-pixel ink outline.
- **Internal Padding:** Common contained surfaces use 24px; the public access offer uses 34px at larger widths and 25px by 20px on mobile.

### Inputs / Fields

- **Style:** Square Private Panel field, one-pixel Private Line stroke, Private Ink text, and 12px by 14px padding.
- **Focus:** A 2px accent outline with 3px offset; the caret is Private Signal Cyan.
- **Error / Disabled:** Error communication uses Incident Coral plus text; disabled controls retain a visible cool border and subdued text.

### Navigation

The public header uses a three-part grid: split Intent Solutions / Perception wordmark, restrained mono links, and customer sign-in. The divider inside the wordmark is structural, not a slash glyph. On mobile the navigation reduces to the split wordmark and a concise sign-in action. The private rail pairs two-letter mono codes with plain labels; active state is tonal and reserves Private Amber for the code. On mobile, private navigation becomes a five-item fixed bottom bar padded for the device safe area.

### Signal Row

The signature row combines a mono relevance score, teal or cyan lane and source metadata, a Newsreader finding, a narrow semantic lane stroke, and a circular unread mark. Opened and resolved state remain legible without depending on color alone.

### Field Window

The public field window previews the private product without pretending to be live data. It uses Field Paper, a two-pixel Field Ink enclosure, an offset outline on larger screens, and the signal room's score, metadata, divider, and waveform grammar. Its footer must explicitly label the field as illustrative and not live.

### Policy Notice

Privacy, terms, and acceptable-use pages stay on Field Paper and place a prominent square Marker Yellow rollout-draft notice before policy copy. The notice remains until legal approval; it must not be softened into a footnote or removed as visual cleanup.

## Do's and Don'ts

### Do:

- **Do** keep public and policy surfaces on Beacon Field Paper while preserving the dark private signal room.
- **Do** let Newsreader headlines and whitespace establish editorial hierarchy across both environments.
- **Do** attach mono provenance, status, and timing to consequential information.
- **Do** use Route Orange Display only for large paper-surface text and Route Orange Action for controls or dark-surface emphasis.
- **Do** use dark forest bands to distinguish Listening Post and the closing action.
- **Do** preserve source labels, illustrative-data disclosure, visible yellow-plus-ink focus, reduced-motion behavior, 44px minimum footer legal-link targets, and mobile safe-area spacing.
- **Do** keep the policy rollout-draft notice prominent until legal approval.

### Don't:

- **Don't** collapse the Beacon public surface and dark private room into one undifferentiated theme.
- **Don't** add ambient card shadows, gradients, glossy surfaces, or rounded SaaS tiles.
- **Don't** use Route Orange Action as small text on Field Paper or rely on color alone to communicate state.
- **Don't** turn the interface into a continuous feed or fill a quiet state with synthetic activity.
- **Don't** replace source-backed editorial hierarchy with generic dashboard density.
- **Don't** import HustleStats visual identity; its influence ends at conversion sequence.
- **Don't** obscure the distinction between Perception, the optional Listening Post companion, and the Intent Solutions parent brand.
