#!/usr/bin/env node
/**
 * measure-rendered.js -- rendered-page analyser using real browser computed
 * styles (Playwright/Chromium). Complements measure-css.py: the static
 * analyser reads authored CSS text; this reads what a browser actually
 * paints, which is the only way to get contrast ratios, overflow, and
 * above-the-fold numbers right.
 *
 * Usage:
 *   node measure-rendered.js <url>
 *   node measure-rendered.js <url> --viewport 390x844
 *   node measure-rendered.js <url> --viewport 1440x900 --json
 *
 * Defaults to 1440x900 if --viewport is omitted.
 *
 * Requires the `playwright` package (installed locally in tools/,
 * see tools/package.json) and a Chromium build Playwright can launch
 * (already cached on this machine).
 */

const { chromium } = require("playwright");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { url: null, width: 1440, height: 900, json: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") {
      args.json = true;
    } else if (a === "--viewport") {
      const v = argv[++i];
      const m = /^(\d+)x(\d+)$/.exec(v || "");
      if (!m) {
        console.error(`error: --viewport expects WIDTHxHEIGHT, got "${v}"`);
        process.exit(1);
      }
      args.width = parseInt(m[1], 10);
      args.height = parseInt(m[2], 10);
    } else if (a === "--width") {
      args.width = parseInt(argv[++i], 10);
    } else if (a === "--height") {
      args.height = parseInt(argv[++i], 10);
    } else {
      rest.push(a);
    }
  }
  args.url = rest[0];
  return args;
}

// ---------------------------------------------------------------------------
// In-page collector. Everything in here runs inside the browser via
// page.evaluate -- no access to Node scope. Kept as one function so the
// whole measurement is a single DOM pass (fast, and every number below is
// computed from the exact same live layout, not re-queried later).
// ---------------------------------------------------------------------------

function collectInBrowser({ viewportHeight, viewportWidth }) {
  function parseColor(str) {
    if (!str) return null;
    const m = /rgba?\(([^)]+)\)/.exec(str);
    if (!m) return null;
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    const [r, g, b, a] = parts;
    return { r, g, b, a: a === undefined ? 1 : a };
  }

  function composite(fg, bg) {
    const a = fg.a;
    return {
      r: fg.r * a + bg.r * (1 - a),
      g: fg.g * a + bg.g * (1 - a),
      b: fg.b * a + bg.b * (1 - a),
    };
  }

  // WCAG relative luminance, exact formula (not approximated):
  // https://www.w3.org/WAI/GL/wiki/Relative_luminance
  function relLuminance({ r, g, b }) {
    const lin = (c) => {
      const cs = c / 255;
      return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  }

  function contrastRatio(c1, c2) {
    const L1 = relLuminance(c1);
    const L2 = relLuminance(c2);
    const lighter = Math.max(L1, L2);
    const darker = Math.min(L1, L2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  // Effective background: walk the ancestor chain from <html> down to the
  // element itself, alpha-compositing every layer that has a non-transparent
  // background-color on top of the running result. This is a proper
  // composite (not just "grab the first non-transparent ancestor"), because
  // several backgrounds on this page are themselves translucent
  // (rgba(28,29,31,.04) panels over a paper background, etc.) and picking
  // only the first one without blending it against what's beneath it would
  // misstate the actual rendered colour.
  function effectiveBackground(el) {
    const chain = [];
    let node = el;
    while (node) {
      chain.push(node);
      node = node.parentElement;
    }
    chain.reverse(); // <html> ... el
    let bg = { r: 255, g: 255, b: 255 }; // ultimate fallback: default canvas white
    for (const n of chain) {
      const cs = getComputedStyle(n);
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0) bg = composite(c, bg);
    }
    return bg;
  }

  function cssPath(el) {
    if (el.id) return "#" + el.id;
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      let part = node.tagName.toLowerCase();
      if (typeof node.className === "string" && node.className.trim()) {
        part += "." + node.className.trim().split(/\s+/).slice(0, 2).join(".");
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }
      parts.unshift(part);
      node = parent;
      depth++;
    }
    return parts.join(" > ");
  }

  const docEl = document.documentElement;
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE"]);

  // Real visibility, not just the element's own computed style. Checking
  // only an element's own display/visibility/opacity misses the common case
  // of a VISIBLE-looking element whose ANCESTOR is display:none (a JS modal
  // wrapper: `.demo-modal { display:none }` / `.demo-modal.active { display:flex }`
  // on this page) or a closed native <details> accordion (this page's FAQ).
  // Element.checkVisibility() walks the ancestor chain and correctly returns
  // false for both -- confirmed against document.body.innerText's word count
  // (965) vs. this method's leaf-element word sum (969, effectively the same)
  // on this file; before this fix the naive per-element check overcounted by
  // ~500 words by including closed-FAQ-answer and hidden-modal text.
  function isReallyVisible(el) {
    if (typeof el.checkVisibility === "function") {
      // Deliberately NOT passing checkOpacity: this page uses scroll-triggered
      // reveal animations (elements carry a `.reveal` class and sit at
      // opacity:0 until an IntersectionObserver flips them on scroll). At
      // page-load with no scroll, checkOpacity:true marks ~80% of the page's
      // real content as "invisible" (measured: word count collapses from 969
      // to 194), which is wrong for a density/content audit -- that content
      // IS the page, just pending its reveal animation. checkVisibilityCSS
      // and contentVisibilityAuto are safe to include (verified: no effect
      // on this page's counts either way) and stay on for correctness.
      return el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true });
    }
    // fallback for older engines: own-element check only (known undercount risk,
    // will miss ancestor-hidden cases like a display:none modal wrapper)
    const cs = getComputedStyle(el);
    return cs.display !== "none" && cs.visibility !== "hidden" && cs.visibility !== "collapse";
  }

  function collectTextEls() {
    const out = [];
    document.querySelectorAll("*").forEach((el) => {
      if (SKIP_TAGS.has(el.tagName)) return;
      if (!isReallyVisible(el)) return;
      let own = "";
      for (const node of el.childNodes) {
        if (node.nodeType === 3) own += node.textContent;
      }
      own = own.replace(/\s+/g, " ").trim();
      if (!own) return;
      const rect = el.getBoundingClientRect();
      out.push({ el, own, rect, cs: getComputedStyle(el) });
    });
    return out;
  }

  const wc = (s) => s.split(/\s+/).filter(Boolean).length;

  // ---- PASS A: natural, as-loaded state (FAQ accordions closed, modal
  // closed). Word count / page height / density / above-the-fold / overflow
  // all come from THIS pass, because these are "what does a visitor see
  // scrolling down on load" metrics -- opening the accordions would inflate
  // them with content nobody sees without clicking. ----
  const naturalTextEls = collectTextEls();
  const totalWords = naturalTextEls.reduce((sum, t) => sum + wc(t.own), 0);
  const foldWords = naturalTextEls
    .filter((t) => t.rect.bottom > 0 && t.rect.top < viewportHeight)
    .reduce((sum, t) => sum + wc(t.own), 0);
  const pageHeight = docEl.scrollHeight;
  const wordsPer1000px = pageHeight > 0 ? totalWords / (pageHeight / 1000) : null;

  const scrollsHorizontally = docEl.scrollWidth > docEl.clientWidth + 1;
  let overflowOffenders = [];
  if (scrollsHorizontally) {
    const vw = docEl.clientWidth;
    document.querySelectorAll("*").forEach((el) => {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1 || rect.left < -1) {
        overflowOffenders.push({
          selector: cssPath(el),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        });
      }
    });
    overflowOffenders.sort((a, b) => b.right - vw - (a.right - vw));
    overflowOffenders = overflowOffenders.slice(0, 20);
  }

  // ---- MUTATE: force every native <details> open (cheap, deterministic,
  // no click simulation needed -- `.open` is a plain reflected attribute)
  // so the style/colour/contrast passes below see FAQ answer text too, not
  // just FAQ questions. The demo-modal (`.demo-modal.active`) is opened by
  // JS on a button click with no static equivalent, so it is NOT opened
  // here and its contents are excluded from every metric below -- see
  // Caveats in the project report. ----
  const detailsEls = Array.from(document.querySelectorAll("details"));
  const detailsWereOpen = detailsEls.map((d) => d.open);
  detailsEls.forEach((d) => (d.open = true));

  // ---- PASS B: details-opened state, for maximum coverage on style and
  // contrast metrics (these describe the design system across the whole
  // page's real content, not just the above-the-fold/as-loaded slice). ----
  const styleTextEls = collectTextEls();

  const fontSizeCounts = {};
  const colorCounts = {};
  const familyCounts = {};
  const weightCounts = {};
  styleTextEls.forEach((t) => {
    fontSizeCounts[t.cs.fontSize] = (fontSizeCounts[t.cs.fontSize] || 0) + 1;
    colorCounts[t.cs.color] = (colorCounts[t.cs.color] || 0) + 1;
    familyCounts[t.cs.fontFamily] = (familyCounts[t.cs.fontFamily] || 0) + 1;
    weightCounts[t.cs.fontWeight] = (weightCounts[t.cs.fontWeight] || 0) + 1;
  });

  // ---- background colours: every VISIBLE element on the page (details-open
  // state), not just text-bearing ones ----
  const bgCounts = {};
  document.querySelectorAll("*").forEach((el) => {
    if (!isReallyVisible(el)) return;
    const cs = getComputedStyle(el);
    const c = parseColor(cs.backgroundColor);
    if (c && c.a > 0) bgCounts[cs.backgroundColor] = (bgCounts[cs.backgroundColor] || 0) + 1;
  });

  // ---- border vs shadow (details-open state, visible elements only) ----
  let borderCount = 0;
  let shadowCount = 0;
  document.querySelectorAll("*").forEach((el) => {
    if (!isReallyVisible(el)) return;
    const cs = getComputedStyle(el);
    const hasBorder = ["Top", "Right", "Bottom", "Left"].some((side) => {
      const w = parseFloat(cs["border" + side + "Width"]);
      const style = cs["border" + side + "Style"];
      return w > 0 && style !== "none";
    });
    if (hasBorder) borderCount++;
    if (cs.boxShadow && cs.boxShadow !== "none") shadowCount++;
  });

  // ---- h1 ----
  const h1 = document.querySelector("h1");
  let h1Info = null;
  if (h1) {
    const cs = getComputedStyle(h1);
    h1Info = {
      text: h1.textContent.trim().slice(0, 120),
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      fontFamily: cs.fontFamily,
    };
  }

  // ---- WCAG AA contrast check, every failure (details-open state) ----
  const failures = [];
  styleTextEls.forEach((t) => {
    const cs = t.cs;
    const fg = parseColor(cs.color);
    if (!fg || fg.a === 0) return; // fully transparent text isn't visible text
    const bg = effectiveBackground(t.el);
    const fgComposited = fg.a < 1 ? composite(fg, bg) : { r: fg.r, g: fg.g, b: fg.b };
    const ratio = contrastRatio(fgComposited, bg);
    const fontSize = parseFloat(cs.fontSize);
    const fontWeight = parseInt(cs.fontWeight, 10) || 400;
    const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
    const threshold = isLarge ? 3.0 : 4.5;
    if (ratio < threshold) {
      failures.push({
        selector: cssPath(t.el),
        color: cs.color,
        background: `rgb(${Math.round(bg.r)}, ${Math.round(bg.g)}, ${Math.round(bg.b)})`,
        ratio: Math.round(ratio * 100) / 100,
        threshold,
        isLarge,
        fontSizePx: fontSize,
        fontWeight,
        textSample: t.own.slice(0, 60),
      });
    }
  });

  // ---- loaded fonts (best-effort, via the Font Loading API) ----
  let loadedFonts = [];
  try {
    loadedFonts = Array.from(document.fonts)
      .filter((f) => f.status === "loaded")
      .map((f) => `${f.family} ${f.weight} ${f.style}`);
  } catch (e) {
    loadedFonts = [];
  }

  // restore <details> to their original open/closed state, leave the DOM as found
  detailsEls.forEach((d, i) => (d.open = detailsWereOpen[i]));

  const sortByCountDesc = (obj) =>
    Object.entries(obj)
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count);

  return {
    viewport: { width: viewportWidth, height: viewportHeight },
    pageHeight,
    totalWords,
    wordsPer1000px: wordsPer1000px === null ? null : Math.round(wordsPer1000px * 10) / 10,
    aboveFoldWords: foldWords,
    fontSizes: sortByCountDesc(fontSizeCounts),
    textColors: sortByCountDesc(colorCounts),
    backgroundColors: sortByCountDesc(bgCounts),
    fontFamilies: sortByCountDesc(familyCounts),
    fontWeights: sortByCountDesc(weightCounts),
    loadedFonts: Array.from(new Set(loadedFonts)).sort(),
    h1: h1Info,
    borderElementCount: borderCount,
    shadowElementCount: shadowCount,
    horizontalScroll: {
      scrolls: scrollsHorizontally,
      scrollWidth: docEl.scrollWidth,
      clientWidth: docEl.clientWidth,
      offenders: overflowOffenders,
    },
    contrastFailures: failures,
    contrastElementsChecked: styleTextEls.length,
    methodology: {
      wordAndDensityMetrics: "natural as-loaded state (FAQ accordions closed, demo modal closed)",
      styleAndContrastMetrics: "FAQ <details> accordions force-opened for full text coverage; demo modal NOT opened (JS-triggered, no static switch) -- its contents are excluded from every metric in this report",
    },
  };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printHuman(url, r) {
  console.log(`measure-rendered.js -- ${url}`);
  console.log(`  viewport: ${r.viewport.width}x${r.viewport.height}`);
  console.log(`  words/density: ${r.methodology.wordAndDensityMetrics}`);
  console.log(`  style/contrast: ${r.methodology.styleAndContrastMetrics}`);
  console.log();
  console.log(`page height: ${r.pageHeight}px`);
  console.log(`total words: ${r.totalWords}`);
  console.log(`words per 1000px: ${r.wordsPer1000px}`);
  console.log(`above-the-fold words: ${r.aboveFoldWords}`);
  console.log();
  console.log(`font sizes in use (${r.fontSizes.length} distinct), by element count:`);
  r.fontSizes.forEach((f) => console.log(`    ${f.value.padEnd(10)} x${f.count}`));
  console.log();
  console.log(`text colours in use (${r.textColors.length} distinct):`);
  r.textColors.forEach((f) => console.log(`    ${f.value.padEnd(24)} x${f.count}`));
  console.log();
  console.log(`background colours in use (${r.backgroundColors.length} distinct):`);
  r.backgroundColors.forEach((f) => console.log(`    ${f.value.padEnd(24)} x${f.count}`));
  console.log();
  console.log(`font families in use (${r.fontFamilies.length} distinct):`);
  r.fontFamilies.forEach((f) => console.log(`    ${f.value.padEnd(50)} x${f.count}`));
  console.log();
  console.log(`font weights in use (${r.fontWeights.length} distinct):`);
  r.fontWeights.forEach((f) => console.log(`    ${f.value.padEnd(6)} x${f.count}`));
  console.log();
  console.log(`fonts actually loaded (Font Loading API): ${r.loadedFonts.length}`);
  r.loadedFonts.forEach((f) => console.log(`    ${f}`));
  console.log();
  if (r.h1) {
    console.log(`h1: "${r.h1.text}"`);
    console.log(`    font-size: ${r.h1.fontSize}`);
    console.log(`    font-weight: ${r.h1.fontWeight}`);
    console.log(`    line-height: ${r.h1.lineHeight}`);
    console.log(`    letter-spacing: ${r.h1.letterSpacing}`);
    console.log(`    font-family: ${r.h1.fontFamily}`);
  } else {
    console.log("h1: NOT FOUND");
  }
  console.log();
  console.log(`elements with a border: ${r.borderElementCount}`);
  console.log(`elements with a box-shadow: ${r.shadowElementCount}`);
  console.log();
  console.log(`horizontal scroll: ${r.horizontalScroll.scrolls ? "YES" : "no"}`);
  if (r.horizontalScroll.scrolls) {
    console.log(
      `    scrollWidth ${r.horizontalScroll.scrollWidth}px > clientWidth ${r.horizontalScroll.clientWidth}px`
    );
    console.log(`    offending elements (worst first, top ${r.horizontalScroll.offenders.length}):`);
    r.horizontalScroll.offenders.forEach((o) =>
      console.log(`      ${o.selector}  left=${o.left} right=${o.right} width=${o.width}`)
    );
  }
  console.log();
  console.log(
    `WCAG AA contrast: checked ${r.contrastElementsChecked} text elements, ${r.contrastFailures.length} failures`
  );
  if (r.contrastFailures.length) {
    // group by (selector-tag-signature, ratio) so the console isn't a wall
    // of thousands of near-identical card-title failures; --json has the
    // full itemized list per the spec ("report every failure").
    const grouped = new Map();
    r.contrastFailures.forEach((f) => {
      const key = `${f.selector.split(" > ").pop()}|${f.color}|${f.background}|${f.ratio}`;
      if (!grouped.has(key)) grouped.set(key, { ...f, count: 0, examples: [] });
      const g = grouped.get(key);
      g.count++;
      if (g.examples.length < 2) g.examples.push(f.selector);
    });
    Array.from(grouped.values())
      .sort((a, b) => a.ratio - b.ratio)
      .forEach((g) => {
        console.log(
          `    [${g.count}x] ratio ${g.ratio}:1 (needs ${g.threshold}:1${g.isLarge ? ", large text" : ""}) ` +
            `${g.color} on ${g.background}`
        );
        console.log(`         e.g. ${g.examples.join(" , ")}`);
        console.log(`         text: "${g.textSample}"`);
      });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error("usage: node measure-rendered.js <url> [--viewport WxH] [--json]");
    process.exit(1);
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: args.width, height: args.height } });
    await page.goto(args.url, { waitUntil: "networkidle", timeout: 30000 });
    // let webfonts finish and any late layout (CSS transitions, lazy images) settle
    await page.evaluate(() => (document.fonts ? document.fonts.ready : Promise.resolve()));
    await page.waitForTimeout(300);

    const result = await page.evaluate(collectInBrowser, {
      viewportHeight: args.height,
      viewportWidth: args.width,
    });

    result.url = args.url;

    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printHuman(args.url, result);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("measure-rendered.js failed:", err);
  process.exit(1);
});
