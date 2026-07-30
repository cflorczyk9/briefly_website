#!/usr/bin/env python3
"""
measure-css.py -- static CSS/HTML analyser. No browser, no network.

Reads the HTML file as text, pulls every inline <style>...</style> block
(this codebase has no local external stylesheets -- only inline <style> tags
plus a remote Google Fonts <link>, verified against index.html/about.html/
download.html/terms-of-service.html on 2026-07-29), and regex-extracts
declarations for the properties this project is tracking during the
type/colour/spacing refactor.

This is NOT a real CSS parser. It does not resolve the cascade, does not
know specificity, does not expand shorthands, and does not resolve var()
references to their computed value. It reports literal declared values as
authored. For what actually renders in a browser (computed styles, contrast,
overflow), use measure-rendered.js instead -- the two tools are complementary,
not redundant. See the "Caveats" section of the project report for the full
list of blind spots.

Usage:
    python3 measure-css.py index.html
    python3 measure-css.py index.html --json
    python3 measure-css.py index.html --json > baseline-static.json
    python3 measure-css.py index.html --compare baseline-static.json
"""

import argparse
import html as htmlmod
import json
import re
import sys
from pathlib import Path

STYLE_BLOCK_RE = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S | re.I)
SCRIPT_STRIP_RE = re.compile(r"<script\b[^>]*>.*?</script>", re.S | re.I)
STYLE_STRIP_RE = re.compile(r"<style\b[^>]*>.*?</style>", re.S | re.I)
TAG_RE = re.compile(r"<[^>]+>")

INK_ALPHA_RE = re.compile(r"rgba\(\s*28\s*,\s*29\s*,\s*31\s*,\s*([\d.]+)\s*\)", re.I)
RING_SHADOW_RE = re.compile(r"^0 0 0 [\d.]+px\s+\S+$")
HEX_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGB_RE = re.compile(r"\brgb\([^)]*\)", re.I)
RGBA_RE = re.compile(r"\brgba\([^)]*\)", re.I)
OTHER_COLOR_RE = re.compile(r"\b(?:color|oklab|oklch|hsl|hsla)\([^)]*\)", re.I)
ROOT_BLOCK_RE = re.compile(r":root\s*\{(.*?)\}", re.S)
CUSTOM_PROP_DECL_RE = re.compile(r"(--[\w-]+)\s*:\s*([^;]+);")


def norm(v: str) -> str:
    """Canonicalize a declared value for dedup: collapse whitespace, strip
    spaces after commas and inside parens, so 'rgba(28, 29, 31, .5)' and
    'rgba(28,29,31,.5)' count as one distinct value, matching how a browser
    would treat them."""
    v = v.strip()
    v = re.sub(r"\s+", " ", v)
    v = re.sub(r",\s+", ",", v)
    v = re.sub(r"\(\s+", "(", v)
    v = re.sub(r"\s+\)", ")", v)
    return v


def extract_css(html: str) -> str:
    return "\n".join(STYLE_BLOCK_RE.findall(html))


def extract_markup_for_color_scan(html: str) -> str:
    """Colour values in this codebase are NOT confined to <style> blocks --
    inline SVG illustrations set fill="rgba(...)" / stroke="rgba(...)" as
    presentation attributes directly on elements in the body. Restricting
    colour extraction to <style> content undercounts (measured on this file:
    14 distinct ink alphas from <style> alone vs the true 17 once inline SVG
    attributes are included -- 3 alphas, .35/.5/.55, exist ONLY in inline
    <svg stroke="..."> attributes around line 2083-2093).
    So: colour scanning runs over the whole document with <script> blocks
    stripped (JS has no colour literals in this file, but stripping it is a
    defensive no-op against matching a hex code inside a JS string). Layout
    properties (font-size, padding, box-shadow, etc.) stay scoped to <style>
    blocks only, since SVG/HTML never carries those as bare attributes here
    (checked: no font-size= or font-weight= attributes exist in the file)."""
    return SCRIPT_STRIP_RE.sub(" ", html)


def declarations(css: str, prop: str):
    """All values declared for an exact property name (not a prefix match,
    so 'padding' does not also match 'padding-top')."""
    pat = re.compile(
        r"(?<![\w-])" + re.escape(prop) + r"\s*:\s*([^;{}]+?)\s*(?=[;}])", re.I
    )
    return [norm(m.group(1)) for m in pat.finditer(css)]


def word_count(html: str) -> int:
    """Visible word count. Order matters: strip <script> and <style> blocks
    BEFORE stripping tags. Stripping tags first leaves JS/CSS token soup in
    the text stream and inflates the count roughly 3-6x (measured on this
    file: 1,577 words correct order vs 10,063 words if tags are stripped
    first) -- this exact bug has already happened once on this project."""
    no_script = SCRIPT_STRIP_RE.sub(" ", html)
    no_style = STYLE_STRIP_RE.sub(" ", no_script)
    text = TAG_RE.sub(" ", no_style)
    text = htmlmod.unescape(text)
    return len(text.split())


def _numeric_key(v: str):
    m = re.search(r"[\d.]+", v)
    return float(m.group(0)) if m else 0.0


def analyse(path: str) -> dict:
    html = Path(path).read_text(encoding="utf-8")
    css = extract_css(html)
    color_scan_text = extract_markup_for_color_scan(html)

    if not css.strip():
        print(
            f"warning: no <style> blocks found in {path} -- this tool only reads "
            "inline <style> tags, not external stylesheets. All CSS metrics will "
            "read zero.",
            file=sys.stderr,
        )

    result = {"file": str(path), "style_block_count": len(STYLE_BLOCK_RE.findall(html))}

    # font-size
    fs = set(declarations(css, "font-size"))
    result["font_size"] = {"count": len(fs), "values": sorted(fs, key=_numeric_key)}

    # font-weight
    fw = set(declarations(css, "font-weight"))
    result["font_weight"] = {
        "count": len(fw),
        "values": sorted(fw, key=lambda v: (_numeric_key(v), v)),
    }

    # colours -- scanned over the whole document (see extract_markup_for_color_scan),
    # not just <style> blocks, because inline SVG fill=/stroke= attributes carry
    # rgba()/hex colour values too
    hexc = set(HEX_RE.findall(color_scan_text))
    rgb = {norm(v) for v in RGB_RE.findall(color_scan_text)}
    rgba = {norm(v) for v in RGBA_RE.findall(color_scan_text)}
    other = {norm(v) for v in OTHER_COLOR_RE.findall(color_scan_text)}
    result["colors"] = {
        "hex": {"count": len(hexc), "values": sorted(hexc)},
        "rgb": {"count": len(rgb), "values": sorted(rgb)},
        "rgba": {"count": len(rgba), "values": sorted(rgba)},
        "other": {"count": len(other), "values": sorted(other)},
        "total_distinct": len(hexc) + len(rgb) + len(rgba) + len(other),
    }

    # ink alpha channel -- rgba(28,29,31,x), the headline metric
    alphas = set(INK_ALPHA_RE.findall(color_scan_text))
    result["ink_alpha"] = {
        "pattern": "rgba(28,29,31,x)",
        "count": len(alphas),
        "values": sorted(alphas, key=float),
    }

    # padding
    pad = set(declarations(css, "padding"))
    result["padding"] = {"count": len(pad), "values": sorted(pad)}

    # max-width
    mw = set(declarations(css, "max-width"))
    result["max_width"] = {"count": len(mw), "values": sorted(mw, key=_numeric_key)}

    # box-shadow, split blurred-elevation vs "0 0 0 Npx" ring
    bs = sorted(set(declarations(css, "box-shadow")))
    ring = [v for v in bs if RING_SHADOW_RE.match(v)]
    ring_set = set(ring)
    blurred = [v for v in bs if v not in ring_set]
    result["box_shadow"] = {
        "count": len(bs),
        "ring_count": len(ring),
        "ring_values": ring,
        "blurred_elevation_count": len(blurred),
        "blurred_elevation_values": blurred,
    }

    # border-radius
    br = set(declarations(css, "border-radius"))
    result["border_radius"] = {"count": len(br), "values": sorted(br, key=_numeric_key)}

    # :root blocks: duplicate detection + redeclared properties
    roots = ROOT_BLOCK_RE.findall(css)
    prop_first_value = {}
    redeclared = {}
    all_prop_names = []
    for block in roots:
        for name, val in CUSTOM_PROP_DECL_RE.findall(block):
            all_prop_names.append(name)
            nv = norm(val)
            if name in prop_first_value:
                redeclared.setdefault(name, [prop_first_value[name]]).append(nv)
            else:
                prop_first_value[name] = nv
    result["root_blocks"] = {
        "count": len(roots),
        "duplicate": len(roots) > 1,
        "redeclared_properties": redeclared,
    }

    # dead tokens: declared in :root, never referenced again anywhere in the file
    dead = []
    for p in sorted(set(all_prop_names)):
        total_refs = len(re.findall(re.escape(p) + r"\b", html))
        if total_refs <= 1:
            dead.append(p)
    result["dead_tokens"] = {"count": len(dead), "values": dead}

    # visible word count
    result["word_count"] = word_count(html)

    return result


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def print_human(r: dict):
    print(f"measure-css.py -- {r['file']}")
    print(f"  <style> blocks found: {r['style_block_count']}")
    print()
    print(f"font-size      : {r['font_size']['count']} distinct")
    for v in r["font_size"]["values"]:
        print(f"    {v}")
    print()
    print(f"font-weight    : {r['font_weight']['count']} distinct")
    for v in r["font_weight"]["values"]:
        print(f"    {v}")
    print()
    c = r["colors"]
    print(f"colours        : {c['total_distinct']} distinct total")
    print(f"    hex   : {c['hex']['count']}  {c['hex']['values']}")
    print(f"    rgb   : {c['rgb']['count']}  {c['rgb']['values']}")
    print(f"    rgba  : {c['rgba']['count']}  {c['rgba']['values']}")
    print(f"    other : {c['other']['count']}  {c['other']['values']}")
    print()
    a = r["ink_alpha"]
    print(f"ink alpha {a['pattern']}: {a['count']} distinct -> {a['values']}")
    print()
    print(f"padding        : {r['padding']['count']} distinct")
    for v in r["padding"]["values"]:
        print(f"    {v}")
    print()
    print(f"max-width      : {r['max_width']['count']} distinct -> {r['max_width']['values']}")
    print()
    b = r["box_shadow"]
    print(f"box-shadow     : {b['count']} distinct "
          f"({b['ring_count']} ring, {b['blurred_elevation_count']} blurred-elevation)")
    print(f"    ring     : {b['ring_values']}")
    print(f"    blurred  : {b['blurred_elevation_values']}")
    print()
    print(f"border-radius  : {r['border_radius']['count']} distinct -> {r['border_radius']['values']}")
    print()
    rb = r["root_blocks"]
    print(f":root blocks   : {rb['count']}"
          + (" -- DUPLICATE :ROOT DETECTED" if rb["duplicate"] else ""))
    if rb["redeclared_properties"]:
        print("    redeclared properties (later block silently overwrites earlier):")
        for name, vals in rb["redeclared_properties"].items():
            print(f"      {name}: {' -> '.join(vals)}")
    print()
    d = r["dead_tokens"]
    print(f"dead :root tokens (declared, never referenced again): {d['count']}")
    for v in d["values"]:
        print(f"    {v}")
    print()
    print(f"visible word count: {r['word_count']}")


def print_compare(baseline: dict, current: dict):
    def row(label, b, c, fmt=str):
        delta = c - b
        sign = "+" if delta > 0 else ""
        flag = "" if delta == 0 else f"  ({sign}{delta})"
        print(f"{label:<28} {fmt(b):>10} -> {fmt(c):>10}{flag}")

    print(f"measure-css.py --compare")
    print(f"  baseline: {baseline.get('file')}")
    print(f"  current : {current.get('file')}")
    print()
    row("font-size (distinct)", baseline["font_size"]["count"], current["font_size"]["count"])
    row("font-weight (distinct)", baseline["font_weight"]["count"], current["font_weight"]["count"])
    row("colours (total distinct)", baseline["colors"]["total_distinct"], current["colors"]["total_distinct"])
    row("  hex", baseline["colors"]["hex"]["count"], current["colors"]["hex"]["count"])
    row("  rgb", baseline["colors"]["rgb"]["count"], current["colors"]["rgb"]["count"])
    row("  rgba", baseline["colors"]["rgba"]["count"], current["colors"]["rgba"]["count"])
    row("  other", baseline["colors"]["other"]["count"], current["colors"]["other"]["count"])
    row("ink alpha rgba(28,29,31,x)", baseline["ink_alpha"]["count"], current["ink_alpha"]["count"])
    row("padding (distinct)", baseline["padding"]["count"], current["padding"]["count"])
    row("max-width (distinct)", baseline["max_width"]["count"], current["max_width"]["count"])
    row("box-shadow (distinct)", baseline["box_shadow"]["count"], current["box_shadow"]["count"])
    row("  ring (0 0 0 Npx)", baseline["box_shadow"]["ring_count"], current["box_shadow"]["ring_count"])
    row("  blurred-elevation", baseline["box_shadow"]["blurred_elevation_count"], current["box_shadow"]["blurred_elevation_count"])
    row("border-radius (distinct)", baseline["border_radius"]["count"], current["border_radius"]["count"])
    row(":root blocks", baseline["root_blocks"]["count"], current["root_blocks"]["count"])
    row("dead :root tokens", baseline["dead_tokens"]["count"], current["dead_tokens"]["count"])
    row("visible word count", baseline["word_count"], current["word_count"])
    print()
    if current["root_blocks"]["duplicate"]:
        print("WARNING: current file still has more than one :root block.")
    if current["colors"]["hex"]["count"] == 0 and current["style_block_count"] == 0:
        print("WARNING: current file has no <style> blocks -- comparison may be meaningless.")


def main():
    ap = argparse.ArgumentParser(description="Static CSS/HTML analyser (no browser).")
    ap.add_argument("file", help="path to an HTML file")
    ap.add_argument("--json", action="store_true", help="print machine-readable JSON instead of a human table")
    ap.add_argument("--compare", metavar="BASELINE.json", help="print a before/after diff table against a prior --json run")
    args = ap.parse_args()

    if not Path(args.file).exists():
        print(f"error: {args.file} not found", file=sys.stderr)
        sys.exit(1)

    result = analyse(args.file)

    if args.compare:
        baseline_path = Path(args.compare)
        if not baseline_path.exists():
            print(f"error: baseline file {args.compare} not found", file=sys.stderr)
            sys.exit(1)
        baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
        print_compare(baseline, result)
        return

    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print_human(result)


if __name__ == "__main__":
    main()
