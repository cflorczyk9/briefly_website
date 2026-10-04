# Briefly website design system

Source of truth: `assets/site.css` (tokens, type, buttons, bands), `index.html` (hero chat `.ak-*`, On the day `.otd-*`, `#how`, `#ways`). If a value here disagrees with those files, the files win and this page is stale.

## 1. Principles

- Apple-clean. White and #F5F5F7 bands, ink #1D1D1F, system font, hairlines, lots of air.
- One blue. #2F8CFF for fills, dots, icons and bars. #0A66D6 for any blue text.
- Mockups are copied from the real app. Same layout, labels, sentence templates and spacing as app.brieflywealth.com. Invent only the client data. Where unsure, do what the app does.
- Illustrative data only. Reuse the demo book (Margaret Whitfield, Raj Patel, Tom Brennan, Sarah Coleman, Linda Choi, David Okafor, advisor Jane Smith). Never real clients.
- Mockups are the only place the product's serif, mono and paper (`--serif`, `--mono`, `--doc-*`) appear. The site chrome never uses them.

## 2. Tokens (`:root` in `assets/site.css`)

| Token | Value | Use and contrast |
|---|---|---|
| `--paper` | #FFFFFF | ground |
| `--paper-2` | #F5F5F7 | alternating band |
| `--ink` | #1D1D1F | primary text, 16.8:1 on white |
| `--ink-soft` | #424245 | secondary text, 10.1:1 |
| `--ink-muted` | #6E6E73 | muted text, 5.1:1 on white, 4.6:1 on the band. Smallest text it may label is 12px |
| `--rule` | #D2D2D7 | borders |
| `--hairline` | #E5E5EA | row and header dividers inside cards |
| `--blue` | #2F8CFF | fills, icons, pins. 3.3:1 on white, never text under 18px |
| `--blue-ink` | #0A66D6 | all blue text and links, 5.4:1 on white, 4.8:1 on `--blue-soft` |
| `--blue-soft` | #EAF3FF | pill and icon backgrounds |
| `--cyan` | #6CB4FF | blue text on the dark band only |
| `--navy-band` | #1D1D1F | closer, footer |
| `--cream` / `--cream-soft` | #F5F5F7 / #A1A1A6 | text on the dark band, 7.0:1 for soft |
| `--card-border` | 1px solid #D2D2D7 | every app-look card |
| `--card-radius` | 14px | every app-look card |
| `--card-shadow` | 0 18px 48px rgba(29,29,31,.10) | front card only |
| `--hover-soft` | #EEF4FF | hovered row in a mockup |
| `--hover-ring` | inset 0 0 0 1px #CFE2FF | hovered row outline |
| `--r-control` / `--r-card` / `--r-panel` | 6px / 12px / 18px | buttons, small cards, large panels |
| `--ring` | 0 0 0 2px rgba(47,140,255,.10) | soft focus halo |
| Green chip | bg #EAF7EE, text #1E7F38 | success state |
| Amber chip | bg #FFF4E5, text #9A4500 | flags |
| Red | #C4281C | negative numbers only |

Type: `--sans` and `--display` are the system stack. Body 17px/1.6. h1 `clamp(34px, 4.2vw, 48px)`, h2 `clamp(28px, 3vw, 32px)`, h3 20px. All 600 weight, tight tracking. Eyebrow 13px/600 `--ink-soft`. Numbers in mockups use `font-variant-numeric: tabular-nums`. Container 1080px max, 28px side padding.

Buttons (`.btn`): ink fill, white text, 15px/600, min-height 44px, radius 6px, hover #3A3A3C. `.btn.ghost` is transparent with an ink border, hover `--paper-2`. On the closer the button inverts to cream on near-black.

## 3. Bands

Alternate white and #F5F5F7 so the eye can find each section. Do not add a new color.

| Order | Section | Band |
|---|---|---|
| 1 | Hero (Ask Briefly chat) | white |
| 2 | Proof line | gray `.band-paper2` |
| 3 | On the day (`#features`) | white |
| 4 | What Briefly does (`#how`) | gray `.band-paper2` |
| 5 | Pricing (`#ways`) | white `.band-white` |
| 6 | FAQ (`#faq`) | gray `.band-paper2` |
| 7 | Closer (`#contact`) | near-black `--navy-band`, 110px top, 96px bottom |
| 8 | Footer | near-black |

## 4. Card frame

Every app-look card (hero chat, On the day cards, client picture, pricing) shares one frame.

- Border `--card-border`, radius `--card-radius` (14px), background #FFF, text ink, 13px/1.4 system font.
- Shadow `--card-shadow` on the front card only. Cards behind it have no shadow. No shadows inside a card.
- Header row 48px tall, 20px side padding (14px on phone), hairline under it. Left is a 14px/600 title (a screen name or a client name, like the app). Right is either 12px #6E6E73 meta or ONE blue pill (bg #EAF3FF, text #0A66D6, 12px/500, radius 999px, padding 5px 10px). Never two pills.
- Rows 40 to 52px tall, 12 to 14px text, `--hairline` between rows. Never stretch rows with flex to fill the card. Leftover space stays white, or ends in a #F5F5F7 footer strip with a hairline on top.
- Carousel cards are 420px tall (460px under 620px wide). Content must fit with no clipping at 540x420 and 358x460.
- Primary button inside a card: ink bg, white text, radius 8px, 28px tall, 12px/500. Secondary: gray #F0F0F2. Flags use the amber chip, status uses the green chip.
- No gradients, no emoji, no icon fonts, no colored left borders on rows.
- Pricing card (`.pr-card`): max 880px, two columns 5fr/7fr, left padding 32px with a hairline divider, right panel #FBFBFD, price 48px/600. Stacks to one column at 760px.

## 5. Mockup animation contract

- The host adds `is-live` to the card root when it comes to the front and removes it when it leaves. Keyframes live under `.cX-card.is-live ...` with `animation-fill-mode: both`.
- Plays once per `is-live`, runs 3.5 to 8 seconds, ends on the complete frame.
- Without `is-live` the card shows that same finished frame. Blurred cards behind, thumbnails and screenshots all look done.
- Reduced motion: `@media (prefers-reduced-motion: reduce) { .cX-card * { animation: none !important; transition: none !important; } }`. The carousel also stops auto-advancing.
- Two to four beats, eased `cubic-bezier(.2,.7,.2,1)`, nothing bouncy, nothing under 250ms per beat. Stagger rows 150 to 250ms.
- Every class and keyframe name carries the card's prefix (`ca-`, `cb-`, `cc-`, `ce-`, `cf-`, `cg-`).
- Carousel dwell (`dwell()` in index.html) = the longest running animation on the front card, at least 1500ms, plus that card's `data-read` hold. Current holds in ms: brief 3500, idle cash 1500, prospect 4500, follow-up 2000, off target 1500, market brief 3000.
- The front card sits at `data-pos="0"`. Positions 1 and 2 are scaled (.92, .86), blurred (3px, 5px) and faded (.55, .35). Positions 3 to 5 are hidden.

## 6. Pointer, hover and click

Used by the cards with a clicking beat (idle cash, follow-up, off target, hero chat).

1. One arrow. Exactly this SVG, 18px, tip at the element's top-left, black fill, 1.4px white outline, soft shadow:
   `<svg width="18" height="18" viewBox="0 0 18 18"><path d="M2 1.5v13.2l3.4-3.1 2.3 5.1 2.2-1-2.3-5h4.6z" fill="#1D1D1F" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>`
2. Landing accuracy. Put the pointer INSIDE the target's own `position: relative` wrapper, resting with its tip at the button center (`left: 50%; top: 55%`). Animate it in from an offset with `transform`. Never position it with card percentages, because it must land on the real button at every width.
3. Hover. The hovered row gets #EEF4FF plus `inset 0 0 0 1px #CFE2FF`, 180ms. Never the zebra gray, which reads as two boxes merging.
4. Reveal after hover. Buttons the app shows only on hover start at `opacity: 0; translateX(6px)` and fade in 150ms after the pointer enters, over 220ms. Cause, then effect.
5. Click. Pointer presses (scale .86 for 120ms), a 24px ring at the tip (2px rgba(47,140,255,.55), scale .3 to 1.4, fades over 450ms), the button shows a pressed state (darker fill, 1px down) for 150ms.
6. Result. "Adding..." for about 500ms, then a confirmed state in green, cross-faded in place in a same-width slot so nothing jumps. Use the app's wording, for example "✓ Task in Salesforce" or "Sent to Salesforce". Tasks only go to Salesforce after the advisor approves.
7. After. The pointer drifts 16px down-right and fades over 300ms. It is hidden at rest so it never covers the finished frame.
8. Timing. Pointer travel 650 to 800ms, `cubic-bezier(.4,0,.2,1)`. Hold each beat long enough to read.

## 7. Copy rules

- No em dashes, anywhere, including code comments and this file. No semicolons and no prose colons in visible copy. No "not X but Y". No hype words (seamless, powerful, effortless, unlock, supercharge).
- Short, plain, adult. Run the humanizer files before writing visible words.
- Never call Briefly a meeting-prep tool. It automates advisor workflows (briefs, agendas, follow-ups, client status, market briefs, chat, prospect analyses, CRM tasks).
- Never say "file" or "files" as the product's identity. Say "client picture".
- Citations are small blue numbers (`sup`, 8.5 to 9.5px, #0A66D6 or muted) with a gray "Sources" footer, as in the app.
- Every mockup carries "Illustrative example, not real client data." in its `aria-label` or caption.
- Orion portfolio alerts (idle cash, drift, required distributions, maturities) are live. Say they come from Orion or turn on once Orion is linked, never "rolling out" or "in progress" (Connor, 2026-10-02).
- Exception, the homepage pricing card. It keeps the generic wording "turned on once your custodian or portfolio management system is linked" so firms on other systems are not put off (Connor, 2026-10-04). The comparison page and llms files still name Orion.
- Idle cash flags only when cash is above the larger of $25,000 or 5% of the portfolio, so any % shown must exceed 5.0 and match the dollars.
- Prospect analysis ends with "Nothing here is a recommendation."
- The Claude connector gets one reference line at most on the homepage (the aside under pricing). No pitch.
- Never claim SOC 2, MFA required, or Orion on every firm.

## 8. Accessibility

- Hit areas 44px minimum (buttons, nav links). The carousel dots are 10px visuals, so keep their clickable area padded to 44px or reachable by the list items.
- Every control is keyboard reachable with a 2px blue focus ring (`:focus-visible { outline: 2px solid var(--blue-ink); outline-offset: 2px; }`). A skip link is the first focusable element.
- Mockups are `role="img"` with a one-sentence `aria-label`. Carousel cards that are not in front get `aria-hidden="true"`, and the front card gets `false`.
- Clicking a dot or a list item pins the carousel. Pinned means no auto-advance. Hovering the stage also holds it, and it only advances while in view.
- Reduced motion shows the finished frame and turns off auto-advance (section 5).
- Text contrast follows the token notes in section 2.
