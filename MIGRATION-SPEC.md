# Direction A palette migration spec

Working spec for the cool-slate migration. `index.html` is already done and is the reference
implementation. Read its `:root` block before starting.

**Every value below was measured against WCAG AA. Do not substitute, round, or invent colours.**

## 1. Replace the `:root` token block

Keep every token NAME. Only values change, so existing `var()` uses keep working.

```css
  :root {
    --paper: #F7F8FA;              /* page ground */
    --paper-2: #EEF1F5;            /* alternating band */
    --paper-3: #FFFFFF;            /* cards, raised */
    --ink: #0F172A;                /* 17.85 on white */
    --ink-soft: #475569;           /*  7.58 on white */
    --ink-muted: #5E6E85;          /*  4.58 on raised */
    --ink-faint: #CBD5E1;          /* hairlines, never text */
    --rule: #E2E8F0;

    --bg: #0B1220;
    --bg-2: #131C2E;
    --panel: #1B2740;
    --cream: #F1F5F9;              /* 17.09 on --bg */
    --cream-soft: #C3CEDD;         /* 11.76 on --bg */
    --cream-muted: #94A3B8;        /*  7.30 on --bg */
    --cream-line: #243149;

    --navy: #0F172A;
    --blue: #2F8CFF;               /* FILLS, ICONS, GRAPHICS ONLY */
    --blue-ink: #1D4ED8;           /* links, small text, focus rings */
    --focus: #1D4ED8;
    --cyan: #8cd8ff;
    --teal: #65dcc8;
    --green: #45d18f;
    --amber: #d97706;
    --red: #dc2626;
  }
```

**Correction, added after the SEO lane reported.** An earlier instruction here said to delete the
second `:root` block on pages that have one. That is wrong and following it would break those pages.
On `claude-for-financial-advisors.html` and `ai-compliance-for-financial-advisors.html` the two
blocks now own disjoint tokens. Block 1 carries the page-content palette, block 2 supplies
nav-only tokens (`--paper`, `--paper-2`, `--paper-3`, `--ink`, `--rule`, `--nav-accent`, `--sans`)
that both `body` and the nav bar depend on. The original duplicate-declaration bug, where block 2
redeclared `--blue` and silently overwrote the page palette, was already fixed in an earlier session
by renaming it to `--nav-accent`. Leave the structure alone and migrate the values inside each block.

## 2. Raw hex literals

| Old | New |
|---|---|
| `#1c1d1f` | `#0F172A` |
| `#fffdf6` | `#FFFFFF` |
| `#d9d7cb` | `#F7F8FA` |
| `#e6e3d6` | `#EEF1F5` |
| `#f7f3ea` | `#F1F5F9` |
| `#f1eee2` | `#FFFFFF` |
| `#efede4` | `#F7F8FA` |
| `#161a21` | `#1B2740` |
| `#11141a` | `#131C2E` |
| `#0b5394` | `#1D4ED8` |
| `#0b2545` | `#0F172A` |
| `#0b0d11` | `#0B1220` |

Case-insensitive. Leave `#fff`, `#2f8cff`, `#dc2626`, `#d97706`, `#45d18f`, `#8cd8ff`, `#65dcc8`.

**Never replace `#000`.** Those are `mask-image` gradient stops that need true zero luminance.
`var(--ink)` is only about 89% as dark and weakens the mask. This was already caught once as a wrong
recommendation, do not repeat it.

## 2b. Legacy template tones (added after the first lanes reported)

`knowledge-base.html` and `sample-deliverables.html` carry an older template with its own local
palette that the table above did not cover. Same mapping applies anywhere else these show up:

| Old | New | What it was |
|---|---|---|
| `#5d5b52` | `#475569` | secondary body, 13.5-15px |
| `#44423a` | `#475569` | card body, 15px |
| `#3a3831` | `#334155` | lede, 18px |
| `#F5F4F0` | `#F7F8FA` | `--off`, warm off-white ground |
| `#1d1d1f` | `#0F172A` | `--text`, near-neutral dark. Note it is one digit off `#1c1d1f` |

These already-cool values are correct as they stand and need no change: `#6b7280`, `#e5e7eb`,
`#334155`, `#f1f5f9`, `#0d9488`, `#059669`. Warm `#d97706` and `#dc2626` are semantic amber and red
and stay warm on purpose.

## 3. rgba base triplets

Shift the base, keep every alpha exactly as authored.

- `rgba(28,29,31,` becomes `rgba(15,23,42,`
- `rgba(247,243,234,` becomes `rgba(241,245,249,`
- `rgba(217,215,203,` becomes `rgba(238,241,245,`
- `rgba(11,83,148,` becomes `rgba(29,78,216,`

## 4. The rule that causes almost every contrast failure

`#2F8CFF` measures 3.32 on white and 2.93 on a light card. The floor for body text is 4.5.

So **`--blue` must never be the `color` of small text.** Anywhere a rule sets `color: var(--blue)`
or `color: #2f8cff` on text under 24px, change it to `var(--blue-ink)`. On `index.html` the offenders
were `.eyebrow`, `.fc-num`, `.fc-tag`, `.plan li::before` and the active hero label. Hover states are
fine to leave on `--blue`.

Blue stays as a background fill, an icon colour, an svg stroke and a border. Only `color` on text moves.

## 5. Focus indicators

Any rule with `outline: 0` or `outline: none` on a focusable element needs a real ring:

```css
  outline: 2px solid var(--focus);
  outline-offset: 3px;
```

If the rule combines a state class with `:focus-visible` (for example
`.thing.active, .thing:focus-visible`), split the `:focus-visible` case into its own rule so the
ring is not applied to the non-keyboard state.

## 6. Font weight descriptor

Five pages were already fixed to request weights up to 900. Do not narrow any
`fonts.googleapis.com` request back to 700. If a page declares `font-weight: 900` anywhere, its
request must cover 900. DM Sans is a variable font so the wider range costs zero extra bytes.

## 7. Hard rules

- Do not commit, push, or deploy. Local only.
- One agent owns each file. Never edit a file outside your assigned list.
- `download.html`: the scroll-locked walkthrough is the established format. Retint it, do not
  restructure it, and do not touch the scene sequencing or the cursor animations.
- Do not touch `index.html`, `context-graph.html`, `meeting-briefs.html`,
  `relationship-intelligence.html`, `preview-fixes.html`, or `sample-brief-email-preview.html`.
- Report any colour you could not map rather than guessing.

## 8. Self-check before you report done

Run these in the repo and paste the real output:

```bash
for f in <your files>; do
  echo "$f"
  echo "  warm hex left: $(grep -cio '#1c1d1f\|#fffdf6\|#d9d7cb\|#e6e3d6\|#f7f3ea\|#f1eee2\|#0b2545\|#0b0d11\|#0b5394' $f)"
  echo "  old rgba left: $(grep -c 'rgba(28,29,31\|rgba(247,243,234\|rgba(217,215,203\|rgba(11,83,148' $f)"
  echo "  blue on text:  $(grep -c 'color:\s*var(--blue)\s*;' $f)"
  echo "  mask stops:    $(grep -o '#000\b' $f | wc -l)"
done
```

Warm hex and old rgba must be 0. Mask stops must be unchanged from before you started, so record the
count first. A non-zero "blue on text" is only acceptable if every hit is a `:hover` rule, and if so
say which.
