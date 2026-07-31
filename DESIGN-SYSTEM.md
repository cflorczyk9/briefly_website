# Design system pass, decisions locked 2026-07-30

Four decisions were made after an eight-lane design review. This spec is the authority. Do not
improvise values, and do not re-litigate the decisions.

## Amendments ratified 2026-07-31 (Connor, after the ten-lane Stripe/Jump/Plaid review)

These override the matching values below wherever the two disagree.

1. **Radius:** cards, panels, notes, and clip stages moved from 10px to **16px**. Buttons,
   inputs, and small controls stay 6px. Pills 999px and avatars 50% unchanged.
2. **Shadows:** cards float at rest now. Resting tier is
   `0 1px 2px rgba(15,23,42,.05), 0 8px 24px rgba(15,23,42,.08)`, interactive hover is
   `0 16px 40px rgba(15,23,42,.12)`, modals keep `0 20px 40px rgba(15,23,42,.14)`.
3. **Type weight:** 900 is reserved for the BRIEFLY wordmark (.brand-word, .center-word).
   Section headings run **800**, card-level h3s run **700**. None of Stripe, Plaid, or Jump
   exceed 700, and Connor chose to move toward that feel while keeping the wordmark black.
4. **Accents:** one accent hue per illustration. Status now reads from fill state
   (solid blue = done, hollow = pending, solid ink = held), not from green/amber/red.
   The page-level --teal/--green/--amber/--red tokens were removed as dead; --cyan survives
   for dark sections only. The clip runtime (.bpa scope) keeps its own internal palette.

`index.html` is the reference for the palette. Its `:root` block holds the canonical tokens.

---

## 1. Surface system (all pages)

The palette moved to cool slate but the geometry stayed editorial, so cards still read as
ink-outlined diagram boxes. Fix the geometry.

### 1a. Borders

**Near-black borders come off content containers.** Anywhere a card, panel, note, modal or
similar container uses `border: 1px solid var(--ink)` or a near-black literal, change it to
`1px solid var(--rule)` (`#E2E8F0`).

Keep `var(--ink)` borders ONLY where the line is genuinely graphic rather than a container edge:
chart strokes, the hero's connector lines, diagram rules. When in doubt, it is a container, so use
the hairline.

`.readout` in index.html uses `rgba(15,23,42,.6)`. That is the same problem in rgba form. Use
`var(--rule)` and let the backdrop blur carry the separation.

FAQ row dividers using `var(--ink)` become `var(--rule)` too.

### 1b. Radius scale

Four values, plus two that already exist and do not change.

| Use | Value |
|---|---|
| Buttons, inputs, small controls | `6px` |
| Cards, panels, notes, quote blocks | `10px` |
| Modals, large surfaces, hero glass panels | `16px` |
| Pills and tags | `999px` (unchanged) |
| Avatars, dots, status circles | `50%` (unchanged) |

Apply these everywhere, at every breakpoint. `security.html` currently declares
`border-radius: 10px` on `.card` and `.note` INSIDE `@media (max-width: 820px)`, which rounds them
on phones and leaves them square on desktop. That is backwards. Move the radius out of the media
query so it applies at all widths.

### 1c. Shadow scale

Three tiers. Every card gets exactly one depth cue set, which is a hairline border plus the resting
shadow. Never a hard border stacked with a heavy shadow.

```css
/* resting, for any card or panel */
box-shadow: 0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06);
/* hover or otherwise interactive */
box-shadow: 0 8px 24px rgba(15,23,42,.08);
/* modals and popovers */
box-shadow: 0 20px 40px rgba(15,23,42,.14);
```

Replace existing ad-hoc shadows with the matching tier. The demo modal currently sits at `.28`
opacity, which is roughly double the new modal tier, so bring it down.

### 1d. Emphasis

A highlighted or recommended card must NOT be a thicker flat border. Use a soft accent ring:

```css
border: 1px solid var(--rule);
box-shadow: 0 0 0 3px rgba(47,140,255,.12), 0 8px 24px rgba(15,23,42,.08);
```

This applies to `.plan-lead` on index.html and `.compare-card.is-briefly` on security.html.

---

## 2. CTA routing (index.html only)

Three buttons labelled "Request a demo" currently point at `#contact`, which is a scroll target.
Only "Book a live demo" opens the form. Point all three at the modal:

- the nav button
- both pricing-card buttons

Each becomes `href="#" onclick="openDemoModal();return false;"`, matching the existing working
pattern at the closer. Leave the closer button as it is. Leave `See it work` in the platform header
as a scroll link, that one is honest about being a scroll.

---

## 3. One nav, one footer, one width

### 3a. Nav

`index.html` lines 1204-1218 is canonical: 5 items (How it works / Samples / Security / Download /
About), root-relative hrefs, "Web app sign in" label, 64px height, `.nav-links a` at 11px weight 700
letter-spacing .07em colour `var(--ink-soft)`.

Pages currently wrong:
- `privacy-policy.html`, `terms-of-service.html`, `subprocessors.html` still ship the OLD 8-item nav
  with relative hrefs and a "Sign in" label. Replace wholesale.
- `security.html` runs a stale fork at 72px with 12px/800 links, under a comment claiming it is
  canonical. Replace it and delete the dead `.nav-links a` and `.nav-btn` rules left from an even
  earlier version.

### 3b. Footer

`index.html` lines 2011-2047 is canonical: `.foot-grid` with a brand blurb plus Product, Company and
Legal columns, then `.foot-bottom`. Dark background.

**Critical detail.** The canonical Product column uses in-page anchors (`#mcp`, `#contact`,
`#different`, `#platform`) which only resolve on the homepage. On every OTHER page those must become
root-relative (`/#mcp`, `/#contact`, `/#different`, `/#platform`). Copy the markup, then fix the
anchors.

Pages currently wrong:
- `download.html` has a LIGHT footer (`background: var(--paper)`) against dark everywhere else.
- `security.html`, `knowledge-base.html`, `claude-for-financial-advisors.html`,
  `ai-compliance-for-financial-advisors.html`, `sample-deliverables.html` use a flat single-row link
  list with no columns and no brand blurb.
- `privacy-policy.html`, `subprocessors.html`, `terms-of-service.html` have the right grid but stale
  links (relative paths, missing Download and Security).
- `about.html` is missing 3 Product links the others have.

`unsubscribe.html` deliberately has no nav or footer. Leave it that way, it is a bare confirmation
card reached only from an email.

### 3c. Container width (index.html only)

`.container` is 1280px at line 97. Five later per-section rules override it: `.mcp-inner` 1140,
`.custody-inner` 1120, `.feat-inner` 1200, `.site-faq-inner` 880, plus `.platform-*` at 1280.
Delete the four that are not 1280 so everything inherits `.container`.

Two elements carry `class="container ... -inner reveal"` where `.container` is currently inert, at
lines 1551 and 1936. After the override rules are gone, those resolve correctly.

Exception: if a text-only section genuinely wants a narrower measure, use `720px` on the paragraph
element itself, not a new container width.

---

## 4. Fold the four serif pages into the main system

`claude-for-financial-advisors.html`, `ai-compliance-for-financial-advisors.html`,
`knowledge-base.html`, `sample-deliverables.html` currently use a DM Serif Display headline at
weight 400 and rounded cards, so they read as a different product.

- Headlines move to `var(--sans)` at the weight the main pages use (800-900 for h1).
- Cards adopt the section 1 surface system like everywhere else.
- **Token collision, fix on all four:** they define `--blue: #1D4ED8`, repurposing the fill token to
  hold the ink value. Split it properly: `--blue: #2F8CFF` and `--blue-ink: #1D4ED8`, then audit
  every `var(--blue)` use on the page and move the ones that colour small text to `--blue-ink`.
  Getting this wrong reintroduces contrast failures, so check each use.

Do NOT touch `download.html`'s serif usage. Its walkthrough is a separate protected format.

---

## 5. Functional fixes found by the review

- `subscribe.html` has NO `prefers-reduced-motion` query at all, and its ticker
  (`.np-ticker-track`, 22s linear infinite) runs forever with no pause. That is a WCAG 2.2.2 Level A
  failure. Add the query and stop the animation under it.
- The demo modal in `index.html` has no focus trap, never restores focus to the button that opened
  it, and loses its accessible name on success because the node holding `aria-labelledby` is hidden.
  Trap focus while open, store and restore the trigger, and keep a visible labelled heading in both
  states.
- No status message anywhere is announced. Give `#demoModalError` and `#demoModalSuccess` in
  index.html, and `#messageBox` and the success section in subscribe.html, `role="status"` with
  `aria-live` (assertive for errors, polite for success), and move focus to the new state.
- `index.html` `.plan ul` uses `list-style: none`, which strips list semantics in Safari VoiceOver.
  Add `role="list"` to those three lists.
- `index.html` has no `<main>` landmark. Wrap the page content between `</nav>` and `<footer>`.

---

## 6. Hard rules

- Do not commit, push, or deploy. Local only.
- One agent owns each file. Never edit a file outside your assigned list.
- Do not change any colour token VALUE. The palette is settled and measured.
- `download.html`: the scroll-locked walkthrough and its five drawn scenes are protected. Apply the
  surface system to page chrome only, never inside the scene markup or its `bwv4*` namespaces.
- The hero wordmark sitting over the headline on index.html is protected. Do not touch its stacking.
- Do not modify `assets/briefly-clips.js` or `.css`.

## 7. Self-check before reporting

For each file you own, run and paste the real output:

```bash
for f in <your files>; do
  echo "$f"
  echo "  ink borders left:  $(grep -c 'border:\s*1px solid var(--ink)' $f)"
  echo "  radius values:     $(grep -oE 'border-radius:\s*[0-9]+px' $f | sort -u | tr '\n' ' ')"
  echo "  old shadows:       $(grep -c 'box-shadow:\s*0 10px 30px\|box-shadow:\s*0 24px 50px' $f)"
done
```

Then state: which selectors you changed, anything you judged to be graphic rather than a container
and therefore left on `var(--ink)`, and anything you could not map.
