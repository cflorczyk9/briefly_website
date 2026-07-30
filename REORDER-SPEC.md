# Homepage reorder spec, ratified 2026-07-30

Connor ratified a new scroll order, a pricing split, and the demotion of the MCP section. This
file is the authority for that work. Do not re-litigate the decisions, do not improvise values.

`index.html` is the reference implementation for the palette and the surface system. Read its
`:root` block and `DESIGN-SYSTEM.md` before writing any CSS.

---

## 1. The problem being fixed

The page prices before it proves. The first demonstration of the product sits at position 5. The
price sits at position 3, inside a section that calls itself "Pick where your client files live"
but is really three plans at $100, $150 and $175 a seat. A visitor meets a price table before
they have seen the product do anything.

Second problem: `#mcp` at position 2 leads with the protocol, which produces the read "it's just
a Claude plugin." The connector is how someone touches Briefly. It is not what Briefly is.

## 2. The ratified order, and the thought each step must land

| # | id | Section | The thought a visiting advisor should have |
|---|---|---|---|
| 1 | `hero` | Hero, unchanged | "That's the job I actually have." |
| 2 | `see-it` | **Show it** (rebuilt) | "It reads my real files and I can check its work." |
| 3 | `platform` | The file compounds | "This is not a generator, it accumulates and my corrections stick." |
| 4 | `different` | Differentiation | "I can't get this from Zocks, or from raw ChatGPT." |
| 5 | `custody` | Where the files live | "My client data stays where I say it does." |
| 6 | `mcp` | And it meets you in Claude | "Good, I already work there." |
| 7 | `faq` | FAQ | unchanged |
| 8 | `contact` | Closer | unchanged |

Pricing leaves the homepage entirely and becomes `/pricing`.

## 3. Clip assignments (fixed, do not reassign)

Clips are mounted by `assets/briefly-clips.js` via `<div data-bpa-clip="N"></div>` plus a
`BrieflyClips.mountAll()` call that already exists at the end of `index.html`. The mount adds
`class="bpa"` to that div.

| Section | Clip | What it shows | Native | **Safe floor** |
|---|---|---|---|---|
| 2 Show it | **04** | A statement is dropped in and filed | 722x482 | **620px** |
| 2 Show it | **03** | Ask Briefly, answer with its sources | 472x590 | **340px** |
| 3 Platform | **07** | One spoken correction becomes a standing rule | 1002x431 | **880px** |
| 4 Different | **02** | A brief drafted with every claim cited | 562x702 | **562px (native, cannot shrink)** |

Clips 01, 05 and 06 are NOT on the homepage this round. Do not add them.

**The floors are hard limits.** Below its floor a clip's fixed-pixel internal grid crops its
content rather than reflowing, because `.bpa-stage` is `overflow: hidden` with a locked
`aspect-ratio`. The floors above already carry a safety margin over the measured value. Never set
a stage `max-width` below the floor, and never apply `transform: scale()` to a stage (internal
labels run as small as 7.5px and scaling makes them illegible).

## 4. Two mistakes already made on this section. Do not repeat them.

**a. The white box.** `.bpa` sets `background: var(--bg)` which is `#FFFFFF`. The mount div is
sized by the page while `.bpa-stage` caps at its own max-width, so the leftover area renders as a
bare white rectangle. Every section carrying a clip needs:

```css
.your-section .bpa { background: transparent; }
```

**b. Shrink-to-fit collapse.** Do NOT put `justify-items: center` on a grid whose item contains a
stage. It makes the wrapper shrink-to-fit, the stage's own `width: 100%` then has nothing to
resolve against, and it collapses to about 2x3 pixels. Centre with `margin-inline: auto` on
`.bpa-stage` instead.

## 5. Surfaces

Sections 2 and 3 carry clips against a ground. The existing precedent on this page for light
product UI is the dark treatment, because `--paper` (#F7F8FA) against a white clip is a 1.5%
luminance step and reads flat. `.mcp` and the current `.seeit` both use:

```css
background: var(--navy);
/* plus the 56px grid overlay, copied from .mcp::before */
```

with `--cream` headings, `--cream-soft` body, `--cyan` eyebrows, and on the stage
`border-color: rgba(255,255,255,.12); box-shadow: 0 24px 60px rgba(0,0,0,.45);`

Do not put two dark sections back to back. Coordinate through the ground assignments in section 7.

## 6. Voice rules for every word you write

Load BOTH of these and apply them before writing any prose:

1. `~/.claude/skills/humanizer/SKILL.md`
2. `/Users/connorflorczyk/.claude/projects/-Users-connorflorczyk-Documents-connor-brain2/memory/feedback_email_humanizer.md`

The second wins on conflict. Absolute rules: no em dashes, no semicolons, no prose colons
(including as a dash replacement), no contrastive fragments ("Not X. Y."), even temperature, no
hype, no rhetorical questions, no "imagine".

Two standing product rulings that constrain copy:
- The pitch is the **knowledge base / context** frame. Meeting prep is an example only, never the
  headline. Do not describe Briefly as a brief tool or a meeting-prep tool.
- Briefly is not a CRM.

Finish by asking "what makes this obviously AI generated", fix what surfaces, then deliver.

## 7. Lane assignments. ONE OWNER PER FILE.

Lanes A1 to A5 **do not edit any file**. They return markup and CSS as text and the main thread
integrates them into `index.html`. This is because `index.html` can have exactly one writer.

| Lane | Owns | Deliverable |
|---|---|---|
| A1 | nothing (text only) | Section 2 "Show it", new. Clips 04 then 03. Dark ground. |
| A2 | nothing (text only) | Section 3 Platform, existing markup plus clip 07. Light ground. |
| A3 | nothing (text only) | Section 4 Different, existing markup plus clip 02. Light ground. |
| A4 | nothing (text only) | Section 5 Custody, prices stripped, links to /pricing. Light ground. |
| A5 | nothing (text only) | Section 6 MCP, demoted and shortened. Dark ground (it already is). |
| B1 | `pricing.html` | The new pricing page. Writes the file. |
| B2 | every `.html` EXCEPT `index.html`, `pricing.html`, `_clips-preview.html`, `preview-fixes.html` | Adds the Pricing nav item. Writes those files. |

Ground alternation across the page must end up: hero light, **2 dark**, 3 light, 4 light,
5 light, **6 dark**, faq light, closer dark. A2, A3 and A4 are all light, so they must
differentiate with `--paper` vs `--paper-3` rather than by adding another dark band.

## 8. Nav

The nav gains one item and becomes six: How it works / Samples / Pricing / Security / Download /
About. "How it works" retargets from `#platform` to `#see-it`, because the demonstration is now
where the explanation starts.

Canonical nav markup lives in `index.html`. B2 copies it and fixes hrefs to be root-relative on
every other page.

**Watch the fit.** A previous review flagged a stale nav carve-out in the 1080-1320px range from
when the nav had more items. Going 5 to 6 may reintroduce crowding there. B2 must check and report
the real behaviour at 1280, 1180 and 1080.

## 9. Hard rules

- Do not commit, push, or deploy. Local only.
- Do not modify `assets/briefly-clips.js` or `assets/briefly-clips.css`. Express every clip
  override as page CSS scoped under your section.
- Do not change any colour token VALUE. You may change which token a rule uses.
- Contrast floors: 4.5:1 for text under 24px, 3.0:1 for large text (24px+, or 18.66px+ at weight
  700+). `--blue` (#2F8CFF) is 3.32 on white and must never be the `color` of small text. Use
  `--blue-ink` (#1D4ED8).
- The hero and its wordmark stacking are protected. Do not touch them.
- `download.html`'s scroll-locked walkthrough is a protected format. B2 touches its nav only.
- Do not invent pricing. B1 moves the existing numbers, it does not change them.

## 10. Self-check before reporting

State plainly: what you produced, any value you could not derive from this spec, and anything here
you think is wrong. If you believe a decision in section 2 or 3 is a mistake, say so in a
"Disagreement" block rather than quietly doing something else.
