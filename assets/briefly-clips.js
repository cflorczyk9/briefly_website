/*
 * Briefly product-animation clips — mount-by-id runtime.
 *
 * Source: wiki/system/assets/briefly-product-animations-2026-07-29.html
 * (a standalone 7-clip review deck that auto-mounted all seven clips on
 * load, driven by one shared rAF loop). This file replaces that with an
 * explicit API:
 *
 *   BrieflyClips.mount(clipNumber, element)
 *     Builds clip `clipNumber` (1-7) inside `element` and starts it once
 *     `element` scrolls into view. Nothing runs until this is called.
 *     `element` becomes the CSS scope root (class "bpa" is added to it) —
 *     pair with briefly-clips.css. Returns the internal clip record, or
 *     null if the clip number or element is invalid.
 *
 *   BrieflyClips.mountAll([root])
 *     Convenience: scans root (default document) for elements carrying
 *     data-bpa-clip="N" and mounts each. E.g. <div data-bpa-clip="3"></div>
 *
 * Playback is gated two ways:
 *   - IntersectionObserver: a mounted clip only accumulates time and ticks
 *     while its element is intersecting the viewport. The shared rAF loop
 *     stops entirely once no mounted clip is visible, and restarts when
 *     one comes back into view.
 *   - prefers-reduced-motion: reduce — a mounted clip renders its first
 *     frame (t=0) once and the loop never starts for it.
 * Each mounted clip runs its own independent clock (starts accumulating
 * elapsed time from the moment it first becomes visible), not a single
 * global clock shared across every clip the way the source deck had it —
 * clips are meant to be placed independently around a page now, not
 * reviewed side by side, so cross-clip sync isn't meaningful here. This
 * does not touch how any single clip's own animation is timed.
 *
 * The cursor engine (minJerk, homePt, holdCursor, drawCursor, and clip 01's
 * continuous multi-leg cursor path) is ported verbatim from the source —
 * same constants, same math, same comments. Do not touch it.
 */
(function (global) {
  "use strict";

  /* ---------------------------------------------------------------------
   * Shared math / easing — verbatim from the source deck.
   * ------------------------------------------------------------------ */
  function bezier(x1, y1, x2, y2) {
    function A(a,b){return 1-3*b+3*a;} function B(a,b){return 3*b-6*a;} function C(a){return 3*a;}
    function calc(t,a,b){return ((A(a,b)*t+B(a,b))*t+C(a))*t;}
    function slope(t,a,b){return 3*A(a,b)*t*t+2*B(a,b)*t+C(a);}
    return function (x) {
      if (x <= 0) return 0; if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var cx = calc(t,x1,x2) - x; if (Math.abs(cx) < 1e-5) break;
        var d = slope(t,x1,x2); if (Math.abs(d) < 1e-6) break;
        t -= cx / d;
      }
      return calc(t,y1,y2);
    };
  }
  var easePill = bezier(0.22, 1, 0.36, 1);
  var easeExit = bezier(0.64, 0, 0.78, 0);   // the real row-exit curve
  var easeOut  = bezier(0.16, 1, 0.3, 1);
  var easeIO   = bezier(0.4, 0, 0.2, 1);
  function seg(t,a,b){ if (b<=a) return t>=b?1:0; return Math.max(0, Math.min(1, (t-a)/(b-a))); }
  function lerp(a,b,u){ return a+(b-a)*u; }

  var MARK = {
    outlook: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect width="24" height="24" rx="4" fill="#0364B8"/><path d="M11 6h9a1 1 0 011 1v10a1 1 0 01-1 1h-9z" fill="#fff" opacity=".92"/><path d="M11.6 8.2l4.6 3 4.6-3" stroke="#0364B8" stroke-width="1.1" fill="none" stroke-linejoin="round"/><rect x="2" y="5" width="9.5" height="14" rx="1.6" fill="#032F5E"/><ellipse cx="6.75" cy="12" rx="2.9" ry="3.6" fill="none" stroke="#fff" stroke-width="1.7"/></svg>',
    salesforce: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect width="24" height="24" rx="4" fill="#fff"/><path d="M6.6 17.4c-1.9 0-3.4-1.4-3.4-3.2 0-1.5 1-2.7 2.4-3.1a3.6 3.6 0 01-.2-1.2c0-2 1.8-3.7 4-3.7 1.3 0 2.4.6 3.1 1.5a4 4 0 012.5-.9c1.7 0 3.2 1 3.8 2.4a3 3 0 011-.2c1.6 0 2.9 1.2 2.9 2.8 0 1.6-1.3 2.9-2.9 2.9H6.6z" fill="#00A1E0"/></svg>',
    pdf: '<svg viewBox="0 0 24 24" width="100%" height="100%"><rect width="24" height="24" rx="4" fill="#fff" stroke="#E2E8F0"/><path d="M7 4.5h7L18 8.5v11H7z" fill="#FFFFFF" stroke="#CBD5E1" stroke-width=".9"/><path d="M14 4.5V8.5h4" fill="none" stroke="#CBD5E1" stroke-width=".9"/><rect x="5.4" y="12.4" width="13.2" height="6" rx="1.4" fill="#C4271B"/><text x="12" y="17" font-family="ui-sans-serif,system-ui,sans-serif" font-size="4.4" font-weight="700" fill="#fff" text-anchor="middle">PDF</text></svg>'
  };
  var PHRASES = ["Reading the wiki", "Pulling the right pages", "Cross-checking citations", "Drafting an answer"];
  function dotWave(dots, lt) {
    for (var i = 0; i < dots.length; i++) {
      var ph = ((lt - i*0.15) % 1.2 + 1.2) % 1.2, amp = Math.sin((ph/1.2)*Math.PI*2);
      dots[i].style.transform = "translateY(" + (amp*-3).toFixed(2) + "px)";
      dots[i].style.opacity = String(0.45 + 0.55*Math.max(0, amp));
    }
  }
  function rectIn(stage, el) {
    var sb = stage.getBoundingClientRect(), bb = el.getBoundingClientRect();
    return { x: bb.left - sb.left + bb.width/2, y: bb.top - sb.top + bb.height/2,
             left: bb.left - sb.left, top: bb.top - sb.top, w: bb.width, h: bb.height };
  }
  // Minimum-jerk profile, the standard model of a human reaching movement: zero velocity at
  // both ends, peak speed in the middle. The old curve here was easeOut bezier(.16,1,.3,1),
  // which hits full speed on the first frame. Nothing with a hand attached moves like that,
  // and that single curve is most of why these read as machine-driven.
  function minJerk(p) { p = p < 0 ? 0 : p > 1 ? 1 : p; return p*p*p*(10 - 15*p + 6*p*p); }

  // Holds the cursor where it last was, still visible, on frames where a clip cannot measure
  // its target (clip 04's "File here" button only exists during one phase, for instance).
  // One resting point per stage. Clips with more than one click leg pass this as the origin
  // for every leg, so the cursor leaves and returns to the same place and never teleports
  // when the target switches. holdCursor falls back to the identical point, which is what
  // makes the hold-to-move handoff seamless.
  function homePt(stage) { return { x: stage.clientWidth * 0.18, y: stage.clientHeight * 0.86 }; }

  function holdCursor(cur, ring, stage) {
    if (cur.dataset.tx === undefined && stage) {
      var h = homePt(stage);
      cur.dataset.tx = (h.x - 2).toFixed(2);
      cur.dataset.ty = (h.y - 1).toFixed(2);
    }
    if (cur.dataset.tx !== undefined) {
      cur.style.transform = "translate(" + cur.dataset.tx + "px," + cur.dataset.ty + "px)";
    }
    cur.style.opacity = "1";
    ring.style.opacity = "0";
  }

  // restAt is where the beat is finished. The cursor used to fade out there. It now eases
  // back to the point it started from, which keeps it on screen and makes every loop seam,
  // since the last frame lands exactly where the first one begins.
  // retX/retY default to the origin. They exist so a multi-leg clip can wait on the button it
  // just clicked (origin = that button) while still retiring to the shared home at the end.
  function drawCursor(stage, cur, ring, fromX, fromY, toX, toY, t, mA, mB, clickT, restAt, retX, retY) {
    var cx, cy;
    if (t <= mA) {
      cx = fromX; cy = fromY;                            // parked, visible, waiting to move
    } else {
      var p = minJerk(seg(t, mA, mB));
      var dx = toX - fromX, dy = toY - fromY, len = Math.sqrt(dx*dx + dy*dy) || 1;
      var bow = Math.min(24, len * 0.085) * Math.sin(Math.PI * p);   // hands arc, rulers do not
      cx = lerp(fromX, toX, p) - (dy / len) * bow;
      cy = lerp(fromY, toY, p) + (dx / len) * bow;
      var s = seg(t, mB, mB + 0.40);                     // small damped settle on arrival
      if (s > 0 && s < 1) {
        var d = Math.exp(-6 * s) * Math.sin(s * 7.5);
        cx += d * 2.6; cy += d * 1.7;
      }
      if (restAt != null && t > restAt) {
        var rx = retX == null ? fromX : retX, ry = retY == null ? fromY : retY;
        var r = minJerk(seg(t, restAt, restAt + 1.05));
        cx = lerp(cx, rx, r); cy = lerp(cy, ry, r);
      }
    }
    cx = Math.max(0, Math.min(stage.clientWidth - 18, cx - 2));
    cy = Math.max(0, Math.min(stage.clientHeight - 18, cy - 1));
    cur.dataset.tx = cx.toFixed(2); cur.dataset.ty = cy.toFixed(2);
    cur.style.opacity = "1";
    cur.style.transform = "translate(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px)";
    var rp = seg(t, clickT, clickT + 0.34);
    ring.style.left = toX + "px"; ring.style.top = toY + "px";
    ring.style.opacity = rp > 0 && rp < 1 ? String((1-rp)*0.9) : "0";
    ring.style.transform = "scale(" + (0.30 + rp*1.25) + ")";
  }

  var T_SPIN = '<svg class="bpa-spinner" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
  var T_CHK  = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" stroke-width="3.4"><path d="M4 12l6 6L20 6"/></svg>';
  // brand sheet: black B with a blue pin dot at the top right (ink #0F172A, blue #2f8cff)
  var B_MARK = '<svg viewBox="0 0 24 24" width="100%" height="100%">' +
    '<text x="1.5" y="19" font-family="Georgia,serif" font-size="20" font-weight="700" fill="#0F172A">B</text>' +
    '<circle cx="18.6" cy="6.2" r="3.1" fill="#2f8cff"/></svg>';

  /* ---------------------------------------------------------------------
   * Per-clip skeleton markup — namespaced under .bpa, refs via data-bpa.
   * ------------------------------------------------------------------ */
  var CUR_SVG = '<svg class="bpa-cur" data-bpa="cur" viewBox="0 0 20 20"><path d="M2 1l6.5 15.5 2.2-5.6 5.8-2.1z" fill="#0F172A" stroke="#fff" stroke-width="1.3"/></svg>' +
                '<div class="bpa-ring" data-bpa="ring"></div>';

  var SKELETONS = {
    1: '<div class="bpa-stage bpa-f-w1000">' +
         '<div class="bpa-q">' +
           '<div class="bpa-q-top"><div>' +
             '<div class="bpa-q-h1">Action items to review</div>' +
             '<div class="bpa-q-sub">AI proposed these from your meetings and uploads. Approve to send to Salesforce, or reject to dismiss.</div>' +
           '</div><div class="bpa-q-cnt" data-bpa="qCnt">5 pending</div></div>' +
           '<div class="bpa-q-tabs">' +
             '<span class="bpa-fp bpa-on" data-bpa="qTabPending">Pending (5)</span>' +
             '<span class="bpa-fp">Approved</span><span class="bpa-fp">Rejected</span><span class="bpa-fp">All</span>' +
           '</div>' +
           '<div class="bpa-q-filters">' +
             '<span class="bpa-q-fl"><b>Client</b><span class="bpa-sel">All clients</span></span>' +
             '<span class="bpa-q-fl"><b>Owner</b><span class="bpa-sel">All owners</span></span>' +
             '<span class="bpa-q-fl"><b>Due</b><span class="bpa-sel">Any time</span></span>' +
           '</div>' +
           '<div class="bpa-q-grid">' +
             '<div class="bpa-q-hd"><span>State</span><span>Client</span><span>Proposed action</span><span>Owner</span><span class="bpa-r">Due</span><span>Review</span></div>' +
             '<div data-bpa="qRows"></div>' +
           '</div>' +
         '</div>' + CUR_SVG +
       '</div>',

    2: '<div class="bpa-stage bpa-f-t560">' +
         '<div class="bpa-ag">' +
           '<div class="bpa-ag-h">Agents</div>' +
           '<div class="bpa-ag-s">Pick a client, run a workflow. Briefly drafts; you approve.</div>' +
           '<div class="bpa-ag-pick"><b>Client</b><span class="bpa-who">Raj Patel</span></div>' +
           '<div class="bpa-ag-btns">' +
             '<div class="bpa-ag-b bpa-sel" data-bpa="agBtn">Pre-meeting brief</div>' +
             '<div class="bpa-ag-b">Meeting agenda</div>' +
             '<div class="bpa-ag-b">Meeting follow-up</div>' +
           '</div>' +
         '</div>' +
         '<div class="bpa-ovl" data-bpa="agOvl"><div class="bpa-ovl-c">' +
           '<div class="bpa-ovl-e">Agent running</div>' +
           '<div class="bpa-ovl-h">Generating pre-meeting brief for Patel / Mehta Household</div>' +
           '<div data-bpa="agSteps"></div>' +
         '</div></div>' +
         '<div class="bpa-dv" data-bpa="dv"><div class="bpa-dv-scroll" data-bpa="dvScroll">' +
           '<div class="bpa-dv-head" data-bpa="dvHead">' +
             '<div class="bpa-dv-eb">Pre-meeting brief &middot; Briefly Wealth</div>' +
             '<div class="bpa-dv-t">Patel / Mehta household - Q2 review</div>' +
             '<div class="bpa-dv-s">Quarterly investment review - Thursday July 30, 2026 - 11:00 AM ET</div>' +
           '</div>' +
           '<dl class="bpa-dv-meta" data-bpa="dvMeta">' +
             '<dt>Client</dt><dd>Patel / Mehta Household</dd>' +
             '<dt>Sources reviewed</dt><dd>6</dd>' +
             '<dt>Household AUM</dt><dd>$6,231,300</dd>' +
           '</dl>' +
           '<div data-bpa="dvBody"></div>' +
         '</div></div>' + CUR_SVG +
       '</div>',

    3: '<div class="bpa-stage bpa-f-t470">' +
         '<div class="bpa-ak">' +
           '<div class="bpa-ak-h">Ask Briefly <span class="bpa-chip">Raj Patel</span></div>' +
           '<div class="bpa-ak-q" data-bpa="akQ">What should I know before Thursday\'s review?</div>' +
           '<div data-bpa="akLoadWrap"></div>' +
           '<div class="bpa-ak-ans" data-bpa="akAns"></div>' +
           '<div class="bpa-prov" data-bpa="prov1"></div>' +
           '<div class="bpa-prov" data-bpa="prov2"></div>' +
         '</div>' + CUR_SVG +
       '</div>',

    4: '<div class="bpa-stage bpa-f-32">' +
         '<div class="bpa-up">' +
           '<div class="bpa-up-h">Upload</div>' +
           '<div class="bpa-up-l">Drop a PDF, image, email, or note. Auto-detect figures out the client, or pick one yourself.</div>' +
           '<div class="bpa-up-assign">' +
             '<b>Assign to</b><span class="bpa-sel">Auto-detect from filename (default)</span>' +
             '<span class="bpa-hint">Briefly will guess the client per file. You confirm before each upload.</span>' +
           '</div>' +
           '<div class="bpa-dz" data-bpa="upZone">' +
             '<div class="bpa-dz-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
             '<div class="bpa-dz-t">Drop files here</div>' +
             '<div class="bpa-dz-s">Briefly detects the client from the filename. You confirm before it files.</div>' +
             '<div class="bpa-dz-b">Choose files</div>' +
           '</div>' +
           '<div class="bpa-sess" data-bpa="upSess"><h2>This session</h2>' +
             '<div class="bpa-up-card">' +
               '<div class="bpa-up-top">' +
                 '<span class="bpa-up-fn">Priya Mehta Stripe 401k Q1 2026 Fidelity Statement.pdf</span>' +
                 '<span class="bpa-up-kb">412 KB</span>' +
                 '<span class="bpa-chip" data-bpa="upChip">Detecting</span>' +
               '</div>' +
               '<div data-bpa="upBody"></div>' +
             '</div>' +
           '</div>' +
         '</div>' +
         '<div class="bpa-filechip" data-bpa="upFile"></div>' +
         '<div class="bpa-cutlabel" data-bpa="upCut">time cut</div>' + CUR_SVG +
       '</div>',

    5: '<div class="bpa-stage bpa-f-w780">' +
         '<div class="bpa-nt">' +
           '<div class="bpa-nt-h">Sources</div>' +
           '<div class="bpa-nt-l" data-bpa="ntCount">0 awaiting review &middot; 4 filed &middot; 4 total</div>' +
           '<div class="bpa-nt-tbl">' +
             '<div class="bpa-nt-hd"><span>Document</span><span>Household</span><span>Type</span><span>Status</span></div>' +
             '<div data-bpa="ntRows"></div>' +
           '</div>' +
         '</div>' +
         '<div class="bpa-np-tab" data-bpa="ntTab"><span>NOTES</span></div>' +
         '<div class="bpa-np" data-bpa="ntPanel">' +
           '<div class="bpa-np-h">Add note</div>' +
           '<div class="bpa-np-s">Files with the client\'s sources when you save.</div>' +
           '<div class="bpa-np-lab">Client</div><div class="bpa-np-in">Sarah Coleman</div>' +
           '<div class="bpa-np-lab">Note</div><div class="bpa-np-ed" data-bpa="ntEd"></div>' +
           '<div class="bpa-np-two">' +
             '<div><div class="bpa-np-lab">Channel</div><div class="bpa-np-in">Phone</div></div>' +
             '<div><div class="bpa-np-lab">Purpose</div><div class="bpa-np-in">Relationship review</div></div>' +
           '</div>' +
           '<div class="bpa-np-ft">' +
             '<button class="bpa-nbtn" style="background:transparent;color:#475569;border-color:#CBD5E1" tabindex="-1">Cancel</button>' +
             '<button class="bpa-nbtn" data-bpa="ntSave" tabindex="-1">Save note</button>' +
           '</div>' +
         '</div>' + CUR_SVG +
       '</div>',

    6: '<div class="bpa-stage bpa-f-sq">' +
         '<div class="bpa-cw">' +
           '<div class="bpa-cw-bar">' +
             '<span class="bpa-cw-mk" data-bpa="cwMk"></span>' +
             '<span class="bpa-cw-nm">Briefly</span>' +
             '<span class="bpa-cw-dot"></span><span class="bpa-cw-st">Connected</span>' +
             '<span class="bpa-cw-ct">37 tools</span>' +
           '</div>' +
           '<div class="bpa-cw-body">' +
             '<div class="bpa-cw-you" data-bpa="cwYou">What should I know before my 2pm with the Mehtas?</div>' +
             '<div class="bpa-cw-tools" data-bpa="cwTools"></div>' +
             '<div data-bpa="cwAns"></div>' +
             '<div class="bpa-cw-src" data-bpa="cwSrc"></div>' +
           '</div>' +
           '<div class="bpa-cw-comp" data-bpa="cwComp"><span class="bpa-ph">Reply to Briefly</span><span class="bpa-snd" data-bpa="cwSnd"></span></div>' +
           '<div class="bpa-cw-ft" data-bpa="cwFt"><span class="bpa-cw-lk" data-bpa="cwLk"></span><span>Read from your firm\'s folder on this machine</span></div>' +
         '</div>' +
       '</div>',

    7: '<div class="bpa-stage bpa-f-band">' +
         '<div class="bpa-lp">' +
           '<div class="bpa-lp-h">How Briefly learns your taste</div>' +
           '<div class="bpa-lp-cols">' +
             '<div class="bpa-lp-col" data-bpa="lpC1">' +
               '<div class="bpa-lp-step"><i>1</i><span>You say it once</span></div>' +
               '<div class="bpa-lp-card">' +
                 '<div class="bpa-lp-said" data-bpa="lpSaid"></div>' +
                 '<div class="bpa-lp-foot" data-bpa="lpF1">' +
                   '<div class="bpa-tcall" data-bpa="lpCap">' +
                     '<span class="bpa-ti" data-bpa="lpCapI"></span>' +
                     '<span class="bpa-tn">briefly_capture</span>' +
                     '<span class="bpa-tr" data-bpa="lpCapR">Saved</span>' +
                   '</div>' +
                   '<div class="bpa-lp-reply" data-bpa="lpReply"><span class="bpa-bm" data-bpa="lpBmk"></span><span>Saved. Three points from here, with the dollar figure first.</span></div>' +
                 '</div>' +
               '</div>' +
             '</div>' +
             '<div class="bpa-lp-col" data-bpa="lpC2">' +
               '<div class="bpa-lp-step"><i>2</i><span>It becomes a rule</span></div>' +
               '<div class="bpa-lp-card">' +
                 '<div class="bpa-lp-rt" data-bpa="lpRt">Talking points, three maximum. Open on the dollar figure.</div>' +
                 '<div class="bpa-lp-meta" data-bpa="lpMeta">' +
                   '<span class="bpa-lp-tag">rule 14</span><span class="bpa-lp-tag">scope, your briefs</span>' +
                 '</div>' +
                 '<div class="bpa-lp-eff" data-bpa="lpEff"><span data-bpa="lpEffI"></span><span>In effect on the next brief</span></div>' +
                 '<div class="bpa-lp-prev" data-bpa="lpPrev">' +
                   '<div class="bpa-lp-pl">Already learned</div>' +
                   '<div class="bpa-lp-r"><span class="bpa-lp-rn">13</span><span>Use the family\'s names, never "the client".</span></div>' +
                   '<div class="bpa-lp-r"><span class="bpa-lp-rn">12</span><span>Compliance reads anything client-facing first.</span></div>' +
                   '<div class="bpa-lp-r"><span class="bpa-lp-rn">11</span><span>Covered calls are not a concentration flag here.</span></div>' +
                 '</div>' +
                 '<div class="bpa-lp-foot" data-bpa="lpF2"><div class="bpa-lp-cap">Ask for the whole list any time. One word retires a rule you no longer want.</div></div>' +
               '</div>' +
             '</div>' +
             '<div class="bpa-lp-col" data-bpa="lpC3">' +
               '<div class="bpa-lp-step"><i>3</i><span>Every brief after</span></div>' +
               '<div class="bpa-lp-card">' +
                 '<div class="bpa-lp-bm" data-bpa="lpBm"><span class="bpa-lp-bt">Pre-meeting brief</span><span class="bpa-lp-bd">Mehta &middot; 8/04</span></div>' +
                 '<div class="bpa-lp-hl" data-bpa="lpHl"><span class="bpa-lp-amt" data-bpa="lpAmt">$4.1M<i data-bpa="lpUl"></i></span> taxable, 40% of it in NVDA after the 6/15 vest.</div>' +
                 '<div class="bpa-lp-tph" data-bpa="lpTph">Talking points</div>' +
                 '<div data-bpa="lpPts"></div>' +
                 '<div class="bpa-lp-foot" data-bpa="lpF3">' +
                   '<div class="bpa-lp-pl">Sources cited</div>' +
                   '<div class="bpa-lp-r"><span class="bpa-lp-rn">1</span><span>Q1 2026 Fidelity Statement.pdf (filed 7/28/2026)</span></div>' +
                   '<div class="bpa-lp-r"><span class="bpa-lp-rn">2</span><span>Re: Thursday pre-read attached (filed 7/28/2026)</span></div>' +
                 '</div>' +
               '</div>' +
             '</div>' +
           '</div>' +
         '</div>' +
       '</div>',

    8: '<div class="bpa-stage bpa-f-32">' +
         '<div class="bpa-ix">' +
           '<div class="bpa-ix-h" data-bpa="ixH">One client file, every source</div>' +
           '<div class="bpa-ix-l" data-bpa="ixL">Connect Outlook and Salesforce, then drop in statements and notes. It all lands in the same file.</div>' +
           '<div class="bpa-ix-srcs">' +
             '<div class="bpa-ix-row" data-bpa="ixRowOl">' +
               '<span class="bpa-ix-ic">' + MARK.outlook + '</span>' +
               '<span class="bpa-ix-nm">Outlook</span>' +
               '<span class="bpa-ix-si" data-bpa="ixOlIco"></span>' +
               '<span class="bpa-ix-st" data-bpa="ixOlSt">Connecting&hellip;</span>' +
             '</div>' +
             '<div class="bpa-ix-row" data-bpa="ixRowSf">' +
               '<span class="bpa-ix-ic">' + MARK.salesforce + '</span>' +
               '<span class="bpa-ix-nm">Salesforce</span>' +
               '<span class="bpa-ix-si" data-bpa="ixSfIco"></span>' +
               '<span class="bpa-ix-st" data-bpa="ixSfSt">Connecting&hellip;</span>' +
             '</div>' +
             '<div class="bpa-ix-row" data-bpa="ixRowFl">' +
               '<span class="bpa-ix-ic">' + MARK.pdf + '</span>' +
               '<span class="bpa-ix-nm">Files</span>' +
               '<span class="bpa-ix-si" data-bpa="ixFlIco"></span>' +
               '<span class="bpa-ix-st" data-bpa="ixFlSt">Drop files here</span>' +
               '<span class="bpa-ix-dz" data-bpa="ixDz"></span>' +
             '</div>' +
           '</div>' +
           '<div class="bpa-ix-file" data-bpa="ixFile">' +
             '<div class="bpa-ix-file-hd">' +
               '<span class="bpa-ix-file-nm">Patel / Mehta Household</span>' +
               '<span class="bpa-chip bpa-amber" data-bpa="ixFileChip">Building</span>' +
             '</div>' +
             '<div class="bpa-ix-items" data-bpa="ixItems"></div>' +
             '<div class="bpa-ix-foot" data-bpa="ixFoot">Everything above is in the client file now, each item still tied to its source.</div>' +
           '</div>' +
         '</div>' +
         '<div class="bpa-filechip" data-bpa="ixFlyer"></div>' +
         '<div class="bpa-cutlabel" data-bpa="ixCut">time cut</div>' +
       '</div>'
  };

  /* ---------------------------------------------------------------------
   * Per-clip builders. Each takes the mounted .bpa-stage element, wires
   * behaviour, and returns { dur, tick }. Return null on a missing ref
   * (defensive — should not happen against the skeletons above).
   * ------------------------------------------------------------------ */
  var BUILDERS = {};

  /* ===== 01 work the queue ===== */
  BUILDERS[1] = function (stage) {
    var body = stage.querySelector('[data-bpa="qRows"]');
    var cur = stage.querySelector('[data-bpa="cur"]'), ring = stage.querySelector('[data-bpa="ring"]');
    var cnt = stage.querySelector('[data-bpa="qCnt"]'), tab = stage.querySelector('[data-bpa="qTabPending"]');
    if (!body) return null;

    // Real seeded items, five households, in the app's own alphabetical-by-client order.
    var ROWS = [
      { c: "Tom Brennan", own: "Operations", oi: "OPS", t: "Set up money-market sweep for Brennan's $850k uninvested cash", cat: "operations", due: "Due in 5 days", tone: "soon", src: 2, act: "approve" },
      { c: "Linda Choi", own: "Analyst 2", oi: "A2", t: "Run lump-sum vs annuity comparison for Linda's Cisco pension", cat: "planning", due: "Due in 9 days", tone: "later", src: 2, act: "approve" },
      { c: "Sarah Coleman", own: "Advisor 1", oi: "A1", t: "Draft talking points for Coleman household Q2 portfolio review", cat: "planning", due: "Due in 5 days", tone: "soon", src: 2, act: "approve" },
      { c: "Raj Patel", own: "Tax lead", oi: "TAX", t: "Confirm Mehta's W2 withholding adjustment with payroll", cat: "operations", due: "Due in 14 days", tone: "later", src: 2, act: "reject" },
      { c: "Margaret Whitfield", own: "Advisor 3", oi: "A3", t: "Schedule estate planning call with Margaret's attorney (Bennet)", cat: "client_outreach", due: "Due in 8 days", tone: "later", src: 2, act: null }
    ];

    ROWS.forEach(function (r) {
      var tr = document.createElement("div");
      tr.className = "bpa-q-row";
      tr.innerHTML =
        '<span><span class="bpa-chip bpa-amber">Pending</span></span>' +
        '<span class="bpa-q-cli">' + r.c + "</span>" +
        '<div><div class="bpa-q-task">' + r.t + '</div><div class="bpa-q-meta">' +
          '<span class="bpa-chip">Suggested: ' + r.cat + ' &times;</span>' +
          '<span class="bpa-chip">' + r.src + " sources cited</span></div></div>" +
        '<div class="bpa-q-own"><span class="bpa-q-init">' + r.oi + '</span><span class="bpa-sel">' + r.own + '</span></div>' +
        '<div style="text-align:right"><span class="bpa-chip bpa-' + r.tone + '">' + r.due + "</span></div>" +
        '<div class="bpa-q-act">' +
          '<span class="bpa-q-pair"><button class="bpa-rb bpa-ap" tabindex="-1">Approve</button><button class="bpa-rb bpa-rj" tabindex="-1">Reject</button></span>' +
          '<span class="bpa-res ' + (r.act === "reject" ? "bpa-no" : "bpa-ok") + '">' +
            (r.act === "reject"
              ? '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 6l12 12M18 6L6 18"/></svg>Rejected'
              : '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M4 12l6 6L20 6"/></svg>Approved') +
          "</span></div>";
      body.appendChild(tr);
      r.tr = tr; r.pair = tr.querySelector(".bpa-q-pair"); r.res = tr.querySelector(".bpa-res");
      r.ap = tr.querySelector(".bpa-rb.bpa-ap"); r.rj = tr.querySelector(".bpa-rb.bpa-rj");
      r.h = 0;
    });

    var ACTS = ROWS.filter(function (r) { return r.act; });
    // Hand-authored per-action timing. This used to fire every 2.60s with an identical 0.52s
    // reach and an identical 0.80s hold, four times running, which is the metronome that made
    // it read as a machine. These vary the way a person actually clears a queue: two quick
    // ones, a longer pause to read the third, then a slower deliberate decline at the end.
    var GAP   = [0.55, 2.28, 2.94, 2.60];   // wait before each reach begins
    var REACH = [0.58, 0.44, 0.63, 0.49];   // how long the reach itself takes
    var HOLD  = [0.74, 0.96, 0.66, 0.88];   // dwell on the row after the pill lands
    var acc = 0;
    ACTS.forEach(function (r, i) {
      acc += GAP[i];
      r.tA = acc;                            // travel start
      r.tB = r.tA + REACH[i];                // arrive
      r.tClick = r.tB + 0.13;                // click just after landing, not on a fixed offset
      r.pA = r.tClick + 0.03; r.pB = r.pA + 0.18;   // 180ms pill
      r.hEnd = r.pB + HOLD[i];
      r.fEnd = r.hEnd + 0.22; r.cEnd = r.hEnd + 0.26;
    });
    var DUR = 11.6;

    return { dur: DUR, tick: function (t) {
      var done = 0;
      for (var i = 0; i < ROWS.length; i++) {
        var r = ROWS[i];
        if (!r.h) { r.tr.style.maxHeight = "none"; r.h = r.tr.getBoundingClientRect().height || 56; }
        if (!r.act) { r.pair.style.opacity = "1"; r.res.style.opacity = "0"; continue; }

        // buttons stay in the DOM; only opacity changes, so their rect is always real
        var pv = t >= r.pA ? 0 : 1;
        r.pair.style.opacity = String(pv);
        r.pair.style.pointerEvents = "none";
        r.rj.className = "bpa-rb bpa-rj" + (r.act === "reject" && t >= r.tB - 0.04 && t < r.hEnd ? " bpa-hot" : "");

        var p = easePill(seg(t, r.pA, r.pB));
        r.res.style.opacity = String(p);
        r.res.style.transform = "scale(" + lerp(0.96, 1, p) + ")";

        if (t >= r.hEnd) {
          var fo = easeExit(seg(t, r.hEnd, r.fEnd)), co = easeExit(seg(t, r.hEnd, r.cEnd));
          r.tr.style.opacity = String(1 - fo);
          r.tr.style.maxHeight = lerp(r.h, 0, co) + "px";
          r.tr.style.paddingTop = lerp(9, 0, co) + "px";
          r.tr.style.paddingBottom = lerp(9, 0, co) + "px";
          r.tr.style.borderBottomWidth = co > 0.9 ? "0" : "1px";
          if (co > 0.95) done++;
        } else {
          r.tr.style.opacity = "1"; r.tr.style.maxHeight = r.h + "px";
          r.tr.style.paddingTop = "9px"; r.tr.style.paddingBottom = "9px";
          r.tr.style.borderBottomWidth = "1px";
        }
      }

      // Cursor: ONE continuous path for the whole loop. It never fades out and is never
      // hidden, per the standing ruling from the download-page scenes. It travels to each
      // Review button, rests where it clicked while the row clears underneath it (which is
      // what a real mouse does), then glides home so t=DUR lands exactly on t=0.
      // Each act's resting point, measured live while its row is still open and latched
      // afterwards, because a collapsed row's button rect is no longer where it was clicked.
      var pts = [];
      for (var k = 0; k < ACTS.length; k++) {
        var a = ACTS[k];
        var live = rectIn(stage, a.act === "reject" ? a.rj : a.ap);
        if (t < a.hEnd || !a.lastPos) a.lastPos = { x: live.x, y: live.y };
        pts.push(a.lastPos);
      }
      // Home sits just below and left of the first button. Parking it in a far corner made
      // the opening move a ~780px whip inside 0.52s, which is far too fast to read as a hand.
      var home = { x: pts[0].x - 190, y: pts[0].y + 150 };

      // Each approved row collapses and the next slides up into the same slot, so every
      // Approve button lands on the same pixel. Without a pull-away after each click the
      // pointer would sit dead still for the whole clip. It eases off the button while the
      // row clears, then comes back in to the next one.
      // Four different pull-aways rather than the same nudge four times. Mixed distance and
      // angle, so no two gestures between rows look alike.
      var DRIFT = [{ x: -64, y: 38 }, { x: -29, y: 67 }, { x: -91, y: 21 }, { x: -47, y: 58 }];
      function driftOf(i) {
        var d = DRIFT[i % DRIFT.length];
        return { x: pts[i].x + d.x, y: pts[i].y + d.y };
      }

      var RET_A = DUR - 0.85, RET_B = DUR;   // glide home, so the loop seams invisibly
      var cx, cy;
      if (t < ACTS[0].tA) {                   // parked at home before the first move
        cx = home.x; cy = home.y;
      } else if (t >= RET_A) {                // return leg
        var ur = minJerk(seg(t, RET_A, RET_B)), dl = driftOf(ACTS.length - 1);
        cx = lerp(dl.x, home.x, ur); cy = lerp(dl.y, home.y, ur);
      } else {
        var idx = 0;
        for (var k2 = 0; k2 < ACTS.length; k2++) if (t >= ACTS[k2].tA) idx = k2;
        var a2 = ACTS[idx];
        if (t < a2.tB) {                      // travelling in to the button
          var from = idx === 0 ? home : driftOf(idx - 1);
          var u = minJerk(seg(t, a2.tA, a2.tB));
          var vx = pts[idx].x - from.x, vy = pts[idx].y - from.y;
          var vl = Math.sqrt(vx * vx + vy * vy) || 1;
          var sgn = (idx === 1 || idx === 2) ? -1 : 1;      // arc alternates side
          var bw = Math.min(20, vl * 0.11) * Math.sin(Math.PI * u) * sgn;
          cx = lerp(from.x, pts[idx].x, u) - (vy / vl) * bw;
          cy = lerp(from.y, pts[idx].y, u) + (vx / vl) * bw;
        } else if (t < a2.hEnd) {             // held on the button through the click
          cx = pts[idx].x; cy = pts[idx].y;
          var sl = seg(t, a2.tB, a2.tB + 0.38);            // damped settle on landing
          if (sl > 0 && sl < 1) {
            var dd = Math.exp(-6.2 * sl) * Math.sin(sl * 7.8);
            cx += dd * (idx % 2 ? -2.9 : 2.6); cy += dd * 1.7;
          }
        } else {                              // easing away while the row clears
          var nextT = ACTS[idx + 1] ? ACTS[idx + 1].tA : RET_A;
          var ud = minJerk(seg(t, a2.hEnd, Math.min(nextT, a2.hEnd + 0.45)));
          var dp = driftOf(idx);
          cx = lerp(pts[idx].x, dp.x, ud); cy = lerp(pts[idx].y, dp.y, ud);
        }
      }
      // A hand never holds perfectly still. Harmonics of the clip's own period, so the wander
      // is deterministic and repeats exactly on every loop instead of drifting out of seam.
      // Amplitude stays under 2px, well inside the buttons, so clicks still land true.
      var w = 2 * Math.PI / DUR;
      cx += Math.sin(w * 3 * t + 0.6) * 0.80 + Math.sin(w * 7 * t + 2.2) * 1.00;
      cy += Math.cos(w * 4 * t + 1.4) * 0.70 + Math.sin(w * 9 * t + 0.3) * 0.90;

      cur.style.opacity = "1";
      cur.style.transform = "translate(" +
        Math.max(0, Math.min(stage.clientWidth - 18, cx - 2)).toFixed(2) + "px," +
        Math.max(0, Math.min(stage.clientHeight - 18, cy - 1)).toFixed(2) + "px)";

      // The click ring still pulses only at the moment of each click.
      var ringP = 0, ringPt = null;
      for (var k3 = 0; k3 < ACTS.length; k3++) {
        var rp0 = seg(t, ACTS[k3].tClick, ACTS[k3].tClick + 0.34);
        if (rp0 > 0 && rp0 < 1) { ringP = rp0; ringPt = pts[k3]; break; }
      }
      if (ringPt) {
        ring.style.left = ringPt.x + "px"; ring.style.top = ringPt.y + "px";
        ring.style.opacity = String((1 - ringP) * 0.9);
        ring.style.transform = "scale(" + (0.30 + ringP * 1.25) + ")";
      } else {
        ring.style.opacity = "0";
      }

      var remaining = 5 - done;
      cnt.textContent = remaining + " pending";
      tab.textContent = "Pending (" + remaining + ")";
    }};
  };

  /* ===== 02 run an agent ===== */
  BUILDERS[2] = function (stage) {
    var btn = stage.querySelector('[data-bpa="agBtn"]');
    var ovl = stage.querySelector('[data-bpa="agOvl"]'), stepsHost = stage.querySelector('[data-bpa="agSteps"]');
    var dv = stage.querySelector('[data-bpa="dv"]'), scroll = stage.querySelector('[data-bpa="dvScroll"]');
    var head = stage.querySelector('[data-bpa="dvHead"]'), meta = stage.querySelector('[data-bpa="dvMeta"]');
    var bodyHost = stage.querySelector('[data-bpa="dvBody"]');
    var cur = stage.querySelector('[data-bpa="cur"]'), ring = stage.querySelector('[data-bpa="ring"]');
    if (!stage || !dv) return null;

    var ICO_DOT = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><circle cx="12" cy="12" r="8"/></svg>';
    var ICO_SPIN = '<svg class="bpa-spinner" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
    var ICO_CHK = '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2"><path d="M4 12l6 6L20 6"/></svg>';

    var STEPS = [
      ["Reading household context", "Reviewing the household node, account summaries, and open items."],
      ["Checking cited documents", "Matching the summary points back to source citations."],
      ["Formulating the pre-meeting brief", "Turning the client context into plain-English advisor notes."],
      ["Preparing the review document", "Organizing sections, citations, and final formatting."]
    ];
    var stepEls = STEPS.map(function (x) {
      var d = document.createElement("div"); d.className = "bpa-stp bpa-off";
      d.innerHTML = '<div class="bpa-stp-i"></div><div><div class="bpa-stp-t">' + x[0] + '</div><div class="bpa-stp-d">' + x[1] + "</div></div>";
      stepsHost.appendChild(d);
      return { el: d, ico: d.querySelector(".bpa-stp-i") };
    });
    // the three systems being read, held for the whole run so it is clear
    // where the material is coming from, then gone with the overlay
    var marksRow = document.createElement("div");
    marksRow.className = "bpa-mkrow";
    marksRow.innerHTML = '<span class="bpa-mkl">Reading from</span>' + ["outlook", "salesforce", "pdf"].map(function (m, j) {
      return '<span class="bpa-mi"><span class="bpa-g">' + MARK[m] + "</span>" + ["Outlook", "Salesforce", "Statement"][j] + "</span>";
    }).join("");
    stepsHost.appendChild(marksRow);

    // real template order, with source labels that name the actual inputs
    var items = [];
    function h2(txt) { var d = document.createElement("div"); d.className = "bpa-dv-h2"; d.textContent = txt; bodyHost.appendChild(d); items.push(d); return d; }
    function cites(list) { return '<div class="bpa-cite"><span>Supported by</span>' + list.map(function (c) { return '<span class="bpa-cc">' + c + "</span>"; }).join("") + "</div>"; }
    h2("Headline");
    var p1 = document.createElement("div"); p1.className = "bpa-dv-p";
    p1.innerHTML = "Thursday is a sell-rate decision. Raj wants 50% week-of-vest, Priya wants 70%, and the taxable book sits at 40% NVDA after the 6/15 vest." +
      cites(["Re: Thursday pre-read", "Q1 2026 Fidelity Statement"]);
    bodyHost.appendChild(p1); items.push(p1);
    h2("Talking points");
    var ol = document.createElement("ol"); ol.className = "bpa-tp"; bodyHost.appendChild(ol);
    [
      { b: "Settle the systematic sell rate.", p: "Raj replied Tuesday asking to lock the rate so the tax piece stops moving. Five downstream items are gated on it.", c: ["Re: Thursday pre-read", "Salesforce tasks"] },
      { b: "Deferred-comp election window opens 8/15.", p: "Up to 40% of 2027 base, closing 9/30. Priya has not weighed in yet.", c: ["NVIDIA Deferred Comp Notice"] }
    ].forEach(function (x, i) {
      var li = document.createElement("li");
      li.innerHTML = '<span class="bpa-bdg2">' + (i+1) + "</span><b>" + x.b + "</b><p>" + x.p + "</p>" + cites(x.c);
      ol.appendChild(li); items.push(li);
    });
    h2("Open items from last meeting");
    var oi = document.createElement("ul"); oi.className = "bpa-oi"; bodyHost.appendChild(oi);
    oi.innerHTML = '<li class="bpa-done">Mumbai recurring wire confirmed at $6,000 a month.</li>' +
                   "<li>Q2 estimated tax of $48,000 due from Raj by end of day.</li>" + cites(["Advisor note"]);
    items.push(oi);

    // the closing manifest: every input, named and typed
    h2("Sources cited");
    // the real SourcesList: a plain numbered list, each entry
    // "{label} (filed M/D/YYYY)", linked when the ref carries a source id
    var SRCS = [
      ["Re: Thursday pre-read attached, NVDA sell-rate scenarios", "7/28/2026"],
      ["Priya Mehta Stripe 401k Q1 2026 Fidelity Statement.pdf", "7/28/2026"],
      ["Salesforce Contact + 3 open Tasks", null],
      ["NVIDIA Deferred Compensation Plan Enrollment Notice 2027.pdf", "7/27/2026"],
      ["Stanford Children's Center 2026-27 TK Agreement - Vivaan.pdf", "7/26/2026"],
      ["Advisor note, Mumbai wire confirmation", "7/26/2026"]
    ];
    var scList = document.createElement("ol"); scList.className = "bpa-srcs"; bodyHost.appendChild(scList);
    var scLis = SRCS.map(function (r) {
      var li = document.createElement("li");
      var txt = r[0] + (r[1] ? " (filed " + r[1] + ")" : "");
      li.innerHTML = r[1] ? "<a>" + txt + "</a>" : txt;
      scList.appendChild(li); return li;
    });

    var T_MOVE_A = 0.55, T_MOVE_B = 1.05, T_CLICK = 1.15;
    var T_OVL = 1.25, STEP0 = 1.60, SDUR = 0.80;
    var T_CUT = STEP0 + SDUR * 4 + 0.22;                 // 5.02
    var T_BODY = T_CUT + 0.34, STAG = 0.44;
    var T_SCROLL_A = T_BODY + items.length * STAG + 0.55; // after the body lands
    var T_SCROLL_B = T_SCROLL_A + 0.90;
    var T_SRC = T_SCROLL_B - 0.20, SRC_STAG = 0.26;

    return { dur: 13.4, tick: function (t) {
      // click Pre-meeting brief
      if (btn.getBoundingClientRect().width > 0 && t < T_CUT) {
        var to = rectIn(stage, btn);
        drawCursor(stage, cur, ring, to.x - 96, to.y + 92, to.x, to.y, t, T_MOVE_A, T_MOVE_B, T_CLICK, T_OVL + 0.20);
      } else { holdCursor(cur, ring, stage); }
      btn.innerHTML = t >= T_CLICK && t < T_CUT
        ? '<span class="bpa-sp">' + ICO_SPIN.replace('stroke="currentColor"', 'stroke="#fff"') + "Generating</span>"
        : "Pre-meeting brief";

      var running = t < T_CUT;
      ovl.style.opacity = running ? String(easeIO(seg(t, T_OVL, T_OVL + 0.24))) : "0";
      var idx = Math.floor((t - STEP0) / SDUR);
      for (var i = 0; i < stepEls.length; i++) {
        var st = t >= T_CUT ? "done" : i < idx ? "done" : i === idx ? "on" : "off";
        stepEls[i].el.className = "bpa-stp bpa-" + st;
        if (stepEls[i].ico.getAttribute("data-s") !== st) {
          stepEls[i].ico.setAttribute("data-s", st);
          stepEls[i].ico.innerHTML = st === "done" ? ICO_CHK : st === "on" ? ICO_SPIN : ICO_DOT;
        }
      }
      var mi = marksRow.children;
      for (var j = 0; j < mi.length; j++) {
        var app = seg(t, STEP0 + 0.10 + j * 0.14, STEP0 + 0.34 + j * 0.14);
        var gone = seg(t, T_CUT - 0.30, T_CUT - 0.06);
        mi[j].style.opacity = String(Math.max(0, app - gone));
      }

      dv.style.opacity = t >= T_CUT ? "1" : "0";
      var agLayer = stage.querySelector(".bpa-ag");
      if (agLayer) agLayer.style.opacity = t >= T_CUT ? "0" : "1";
      head.style.opacity = String(easeOut(seg(t, T_CUT, T_CUT + 0.26)));
      meta.style.opacity = String(easeOut(seg(t, T_CUT + 0.12, T_CUT + 0.40)));
      for (var k = 0; k < items.length; k++) {
        var ia = T_BODY + k * STAG, iu = easeOut(seg(t, ia, ia + 0.26));
        items[k].style.opacity = String(iu);
        items[k].style.transform = "translateY(" + lerp(5, 0, iu) + "px)";
      }
      // scroll the document to its own Sources cited section
      // scroll exactly enough to bring the end of the document into view,
      // rather than parking the Sources heading at the top and leaving dead space
      var need = Math.max(0, scroll.scrollHeight - (dv.clientHeight - 38));
      scroll.style.transform = "translateY(" + (-need * easeIO(seg(t, T_SCROLL_A, T_SCROLL_B))) + "px)";
      for (var m = 0; m < scLis.length; m++) {
        var sa = T_SRC + m * SRC_STAG, su = easeOut(seg(t, sa, sa + 0.24));
        scLis[m].style.opacity = String(su);
        scLis[m].style.transform = "translateY(" + lerp(4, 0, su) + "px)";
      }
    }};
  };

  /* ===== 03 provenance ===== */
  BUILDERS[3] = function (stage) {
    var q = stage.querySelector('[data-bpa="akQ"]'), wrap = stage.querySelector('[data-bpa="akLoadWrap"]');
    var ans = stage.querySelector('[data-bpa="akAns"]'), p1 = stage.querySelector('[data-bpa="prov1"]'), p2 = stage.querySelector('[data-bpa="prov2"]');
    var cur = stage.querySelector('[data-bpa="cur"]'), ring = stage.querySelector('[data-bpa="ring"]');
    if (!wrap || !ans) return null;
    wrap.innerHTML = '<div class="bpa-load" style="margin-top:8px;align-self:flex-start"><span class="bpa-dots"><i></i><i></i><i></i></span><span class="bpa-ph"></span></div>';
    var load = wrap.querySelector(".bpa-load"), ph = wrap.querySelector(".bpa-ph");
    var dots = load.querySelectorAll(".bpa-dots i");
    ans.innerHTML = 'The anchor is the <b>sell-rate decision</b>. Raj wants 50% week-of-vest, Priya wants 70% ' +
      '<span class="bpa-pc bpa-ol"><span class="bpa-mk">' + MARK.outlook + '</span>email</span>, ' +
      'and the taxable book is <b>40% NVDA</b> after the 6/15 vest ' +
      '<span class="bpa-pc bpa-pd"><span class="bpa-mk">' + MARK.pdf + '</span>statement</span>.';
    p1.innerHTML = '<div class="bpa-prov-hd" style="background:#EAF2FB;color:#0B4A86"><span class="bpa-mk">' + MARK.outlook + '</span>Re: Thursday pre-read &mdash; NVDA sell-rate scenarios</div>' +
      '<div class="bpa-prov-b">Raj, 8:42 AM: <span class="bpa-hl">I\'d rather sell 50% the week of each vest and keep the rest. Priya wants to go to 70%.</span> Can we settle the rate Thursday so the tax piece stops moving?</div>';
    p2.innerHTML = '<div class="bpa-prov-hd" style="background:#FBECEA;color:#93261C"><span class="bpa-mk">' + MARK.pdf + '</span>Joint Patel/Mehta Taxable &middot; Apr 2026</div>' +
      '<div class="bpa-prov-b"><div class="bpa-prov-tbl">' +
      '<span class="bpa-hl"><b>NVDA</b></span><span class="bpa-hl">$612,250</span><span class="bpa-hl"><b>40.2%</b></span>' +
      '<span>VTI</span><span>$522,000</span><span>33.9%</span>' +
      '<span>VMSXX</span><span>$250,750</span><span>16.3%</span></div></div>';

    var T_Q = 0.55, LA = 0.75, LB = 3.05, AA = 3.10, AB = 3.52;
    var M1A = 4.62, M1B = 5.20, C1 = 5.30, P1A = 5.36, P1B = 5.72;
    var M2A = 7.32, M2B = 7.90, C2 = 8.00, P2A = 8.06, P2B = 8.42;

    return { dur: 11.6, tick: function (t) {
      q.style.opacity = String(easeOut(seg(t, T_Q, T_Q + 0.18)));
      var loading = t >= LA && t < LB + 0.18;
      load.style.display = loading ? "inline-flex" : "none";
      if (loading) {
        var lt = t - LA; dotWave(dots, lt);
        ph.textContent = PHRASES[Math.min(PHRASES.length-1, Math.floor(lt/0.72))] + "…";
        load.style.opacity = String(1 - seg(t, LB, LB + 0.18));
      }
      var av = easeOut(seg(t, AA, AB));
      ans.style.opacity = String(av);
      ans.style.transform = "translateY(" + lerp(6,0,av) + "px)";
      var d1 = easeOut(seg(t, P1A, P1B));
      p1.style.display = d1 <= 0.001 ? "none" : "block";
      p1.style.opacity = String(d1); p1.style.transform = "translateY(" + lerp(8,0,d1) + "px)";
      var d2 = easeOut(seg(t, P2A, P2B));
      p2.style.display = d2 <= 0.001 ? "none" : "block";
      p2.style.opacity = String(d2); p2.style.transform = "translateY(" + lerp(8,0,d2) + "px)";
      var firstLeg = t < 6.60;
      var olEl = ans.querySelector(".bpa-pc.bpa-ol");
      var pcEl = firstLeg ? olEl : ans.querySelector(".bpa-pc.bpa-pd");
      if (pcEl && av > 0.9 && pcEl.getBoundingClientRect().width > 0) {
        var to = rectIn(stage, pcEl), h3 = homePt(stage);
        if (firstLeg) {
          // no retire here: the hand stays on the Outlook pill until it reaches for the PDF one
          drawCursor(stage, cur, ring, h3.x, h3.y, to.x, to.y, t, M1A, M1B, C1, null);
        } else {
          var olR = rectIn(stage, olEl);   // leg 2 waits exactly where leg 1 clicked
          drawCursor(stage, cur, ring, olR.x, olR.y, to.x, to.y, t, M2A, M2B, C2, C2 + 0.70, h3.x, h3.y);
        }
      } else { holdCursor(cur, ring, stage); }
    }};
  };

  /* ===== 04 upload ===== */
  BUILDERS[4] = function (stage) {
    var zone = stage.querySelector('[data-bpa="upZone"]'), sess = stage.querySelector('[data-bpa="upSess"]');
    var body = stage.querySelector('[data-bpa="upBody"]');
    var file = stage.querySelector('[data-bpa="upFile"]'), cut = stage.querySelector('[data-bpa="upCut"]'), chip = stage.querySelector('[data-bpa="upChip"]');
    var cur = stage.querySelector('[data-bpa="cur"]'), ring = stage.querySelector('[data-bpa="ring"]');
    // "File here" is destroyed at T_CUT, before the retire-to-home finishes. Latching its box
    // lets drawCursor keep running so the retire completes instead of freezing part-way.
    var lastTo4 = null;
    if (!zone || !body) return null;
    file.innerHTML = '<span style="width:13px;height:13px;display:inline-block">' + MARK.pdf + '</span><span>&hellip;Q1 2026 Fidelity Statement.pdf</span>';
    var SPIN = '<svg class="bpa-spinner" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#5E6E85" stroke-width="3"><path d="M12 3a9 9 0 1 0 9 9"/></svg>';
    var lastKey = "";
    var T_OVER = 0.55, T_DROP = 1.25, T_DET = 2.35, T_CONF = 3.55, M_A = 2.95, M_B = 3.42, T_CUT = 4.55;

    return { dur: 8.4, tick: function (t) {
      // the file travels over the dropzone, and the border crossfades while it hovers
      var z = rectIn(stage, zone);
      var u = easeOut(seg(t, 0.12, T_OVER));
      file.style.opacity = t < T_DROP ? String(Math.min(1, seg(t, 0.06, 0.3))) : "0";
      file.style.left = lerp(z.left - 40, z.left + z.w * 0.54, u) + "px";
      file.style.top = lerp(z.top + z.h + 46, z.top + z.h * 0.70, u) + "px";
      var dragging = t >= T_OVER && t < T_DROP;
      var g = dragging ? seg(t, T_OVER, T_OVER + 0.12) : (t < T_OVER ? 0 : 1 - seg(t, T_DROP, T_DROP + 0.12));
      zone.style.borderColor = g > 0.5 ? "#7A4E2D" : "#B7BBC2";
      zone.style.background = g > 0.5 ? "color-mix(in srgb, #7A4E2D 6%, #FFFFFF)" : "#FFFFFF";

      sess.style.opacity = String(easeOut(seg(t, T_DROP, T_DROP + 0.22)));

      var key = t < T_DROP ? "idle" : t < T_DET ? "detect" : t < T_CONF ? "match" : t < T_CUT ? "filing" : t < 5.60 ? "reading" : t < 6.60 ? "extracting" : "indexed";
      if (key !== lastKey) {
        lastKey = key;
        if (key === "detect") { body.innerHTML = '<div class="bpa-up-st">' + SPIN + "Detecting the client from the file&hellip;</div>"; chip.textContent = "Detecting"; }
        else if (key === "match") { body.innerHTML = '<div class="bpa-up-ban"><span>Looks like this is for <b>Patel / Mehta Household</b></span><span class="bpa-b2 bpa-pri bpa-up-file-btn">File here</span><span class="bpa-b2 bpa-sec">Change</span><span class="bpa-b2 bpa-sec">Not them? Add new</span></div>'; chip.textContent = "Needs review"; }
        else if (key === "filing") { body.innerHTML = '<div class="bpa-up-st">' + SPIN + "Filing and kicking off extraction&hellip;</div>"; chip.textContent = "Queued"; }
        else if (key === "reading") { body.innerHTML = '<div class="bpa-up-st">' + SPIN + "Reading PDF&hellip;</div>"; chip.textContent = "Indexing"; }
        else if (key === "extracting") { body.innerHTML = '<div class="bpa-up-st">' + SPIN + "Extracting facts and writing the summary&hellip;</div>"; chip.textContent = "Indexing"; }
        else if (key === "indexed") { body.innerHTML = '<div class="bpa-up-st"><span>Filed to <b>Patel / Mehta Household</b>. Indexing in the background &middot; open source &rarr;</span></div>'; chip.textContent = "Indexed"; }
        else { body.innerHTML = ""; chip.textContent = "Detecting"; }
      }
      var upBtn = body.querySelector(".bpa-up-file-btn");
      if (upBtn && upBtn.getBoundingClientRect().width > 0) lastTo4 = rectIn(stage, upBtn);
      if (lastTo4) {
        var h4 = homePt(stage);
        drawCursor(stage, cur, ring, h4.x, h4.y, lastTo4.x, lastTo4.y, t, M_A, M_B, T_CONF, T_CONF + 0.34);
      } else { holdCursor(cur, ring, stage); }
      cut.style.opacity = t >= T_CUT - 0.22 && t < T_CUT + 0.30 ? "1" : "0";
    }};
  };

  /* ===== 05 take a note ===== */
  BUILDERS[5] = function (stage) {
    var host = stage.querySelector('[data-bpa="ntRows"]'), panel = stage.querySelector('[data-bpa="ntPanel"]');
    var ed = stage.querySelector('[data-bpa="ntEd"]'), save = stage.querySelector('[data-bpa="ntSave"]');
    var tab = stage.querySelector('[data-bpa="ntTab"]'), countEl = stage.querySelector('[data-bpa="ntCount"]');
    var cur = stage.querySelector('[data-bpa="cur"]'), ring = stage.querySelector('[data-bpa="ring"]');
    if (!host || !panel) return null;
    var BASE = [
      ["Re: Roth conversion timing", "Coleman Household", "Email"],
      ["Fidelity Joint Brokerage Apr 2026 Statement.pdf", "Coleman Household", "Statement"],
      ["AAPL tranche 3 confirmation.pdf", "Coleman Household", "Statement"],
      ["Re: Vanguard link", "Coleman Household", "Email"]
    ];
    var TEXT = "Sarah called. Hold the last AAPL tranche until after the Roth conversion window. Loop in Daniel Lin before we model it.";
    var noteRow = document.createElement("div"); noteRow.className = "bpa-nt-r";
    noteRow.innerHTML = '<div class="bpa-nt-fn">Sarah called. Hold the last AAPL tranche&hellip;</div><div>Coleman Household</div><div><span class="bpa-chip">Note</span></div><div><span class="bpa-chip bpa-grn">Indexed</span></div>';
    host.appendChild(noteRow);
    BASE.forEach(function (r) {
      var d = document.createElement("div"); d.className = "bpa-nt-r";
      d.innerHTML = '<div class="bpa-nt-fn">' + r[0] + "</div><div>" + r[1] + '</div><div><span class="bpa-chip">' + r[2] + '</span></div><div><span class="bpa-chip bpa-grn">Indexed</span></div>';
      host.appendChild(d);
    });
    var noteH = 0;
    var lastTab5 = null, lastSave5 = null;
    var M1A = 0.45, M1B = 1.05, OPEN = 1.15, PB = 1.42, TA = 1.65, TB = 4.30;
    var M2A = 4.70, M2B = 5.25, SAVE = 5.38, SEND = 5.95, CB = 6.25, RA = 6.45, RB = 6.90;
    return { dur: 9.6, tick: function (t) {
      if (!noteH) { noteRow.style.maxHeight = "none"; noteH = noteRow.scrollHeight; }
      var pin = easeIO(seg(t, OPEN, PB)), pout = seg(t, SEND, CB);
      var pv = t < SEND ? pin : 1 - pout;
      if (t < OPEN || t > CB) pv = 0;
      panel.style.display = pv <= 0.001 ? "none" : "block";
      panel.style.opacity = String(pv);
      panel.style.transform = "translateX(" + lerp(30, 0, t < SEND ? pin : 1 - pout) + "px)";
      tab.style.opacity = String(1 - pv);
      ed.textContent = TEXT.slice(0, t >= TA ? Math.floor(seg(t, TA, TB) * TEXT.length) : 0);
      save.textContent = t >= SAVE && t < SEND ? "Saving…" : "Save note";
      save.style.opacity = t >= SAVE && t < SEND ? "0.7" : "1";
      var rv = easeOut(seg(t, RA, RB));
      noteRow.style.overflow = "hidden";
      noteRow.style.opacity = String(rv);
      noteRow.style.maxHeight = lerp(0, noteH, rv) + "px";
      noteRow.style.paddingTop = lerp(0, 7, rv) + "px";
      noteRow.style.paddingBottom = lerp(0, 7, rv) + "px";
      countEl.textContent = rv > 0.9 ? "0 awaiting review · 5 filed · 5 total" : "0 awaiting review · 4 filed · 4 total";
      // Same latch as clip 04: the Save button goes away when the panel closes at CB, before
      // the retire finishes, so hold its last box rather than freezing the cursor mid-move.
      if (tab.getBoundingClientRect().width > 0) lastTab5 = rectIn(stage, tab);
      if (save.getBoundingClientRect().width > 0) lastSave5 = rectIn(stage, save);
      var h5 = homePt(stage);
      if (t < OPEN + 0.30) {
        if (lastTab5) drawCursor(stage, cur, ring, h5.x, h5.y, lastTab5.x, lastTab5.y, t, M1A, M1B, OPEN, null);
        else holdCursor(cur, ring, stage);
      } else if (lastSave5 && lastTab5) {
        // leg 2 waits on the tab it just opened, then retires to the shared home
        drawCursor(stage, cur, ring, lastTab5.x, lastTab5.y, lastSave5.x, lastSave5.y,
                   t, M2A, M2B, SAVE, SAVE + 0.48, h5.x, h5.y);
      } else { holdCursor(cur, ring, stage); }
    }};
  };

  /* ===== 06 asking inside Claude ===== */
  BUILDERS[6] = function (stage) {
    var mk = stage.querySelector('[data-bpa="cwMk"]'), you = stage.querySelector('[data-bpa="cwYou"]');
    var host = stage.querySelector('[data-bpa="cwTools"]'), ansHost = stage.querySelector('[data-bpa="cwAns"]');
    var srcHost = stage.querySelector('[data-bpa="cwSrc"]'), comp = stage.querySelector('[data-bpa="cwComp"]');
    var snd = stage.querySelector('[data-bpa="cwSnd"]');
    var ft = stage.querySelector('[data-bpa="cwFt"]'), lk = stage.querySelector('[data-bpa="cwLk"]');
    if (!host) return null;
    mk.innerHTML = B_MARK;
    lk.innerHTML = '<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" stroke-width="2.2">' +
      '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
    snd.innerHTML = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 20V5M5 12l7-7 7 7"/></svg>';

    // the two markers resolved, in the app's own SourcesList wording
    [["1", "Re: Thursday pre-read attached, NVDA sell-rate scenarios", "7/28/2026"],
     ["2", "Priya Mehta Stripe 401k Q1 2026 Fidelity Statement.pdf", "7/28/2026"]
    ].forEach(function (s) {
      var d = document.createElement("div"); d.className = "bpa-sl";
      d.innerHTML = '<span class="bpa-sn">' + s[0] + '</span><span><a>' + s[1] + "</a> (filed " + s[2] + ")</span>";
      srcHost.appendChild(d);
    });

    // the real chain for "no exact household named": ask resolves the name, then
    // the brief tool does the work. Names + result shapes come from manifest.json.
    var TOOLS = [
      ["briefly_ask", "1 household matched"],
      ["briefly_prepare_meeting_brief", "6 sources read"],
      ["briefly_get_recent_activity", "12 entries"]
    ];
    var rows = TOOLS.map(function (x) {
      var d = document.createElement("div"); d.className = "bpa-tcall";
      d.innerHTML = '<span class="bpa-ti"></span><span class="bpa-tn">' + x[0] + '</span><span class="bpa-tr">' + x[1] + "</span>";
      host.appendChild(d);
      return { el: d, ico: d.querySelector(".bpa-ti"), res: d.querySelector(".bpa-tr") };
    });

    // two streamed sentences, each closing on its own citation marker
    var LINES = [
      ["Thursday is a sell-rate decision. Raj asked to lock the systematic rate at 50% week-of-vest and Priya wants 70%.", "1"],
      ["The taxable book sits at 40% NVDA after the 6/15 vest, and five open items are waiting on that one call.", "2"]
    ];
    var lineEls = LINES.map(function (x) {
      var p = document.createElement("div"); p.className = "bpa-cw-ans";
      p.innerHTML = '<span class="bpa-tx"></span><span class="bpa-m">' + x[1] + "</span>";
      ansHost.appendChild(p);
      return { tx: p.querySelector(".bpa-tx"), m: p.querySelector(".bpa-m") };
    });

    var YA = 0.30, YB = 0.52;
    var TSTEP = [[0.78, 1.52], [1.66, 2.86], [3.00, 3.68]];
    var L1A = 3.95, L1B = 5.55, M1 = 5.62;
    var L2A = 5.80, L2B = 7.30, M2 = 7.38;
    var SRCA = 7.60, FTA = 7.95;

    return { dur: 10.4, tick: function (t) {
      var yu = easeOut(seg(t, YA, YB));
      you.style.opacity = String(yu);
      you.style.transform = "translateY(" + lerp(5,0,yu) + "px)";

      for (var i = 0; i < rows.length; i++) {
        var a = TSTEP[i][0], b = TSTEP[i][1];
        var ru = easeOut(seg(t, a - 0.16, a + 0.10));
        rows[i].el.style.opacity = String(ru);
        rows[i].el.style.transform = "translateY(" + lerp(4,0,ru) + "px)";
        var done = t >= b;
        var want = t < a - 0.16 ? "" : (done ? T_CHK : T_SPIN);
        if (rows[i].ico.getAttribute("data-s") !== want) { rows[i].ico.innerHTML = want; rows[i].ico.setAttribute("data-s", want); }
        rows[i].res.style.opacity = String(easeOut(seg(t, b, b + 0.20)));
        rows[i].el.style.borderColor = done ? "#C5D9C8" : "#E2E8F0";
      }

      var s1 = LINES[0][0], n1 = t >= L1A ? Math.floor(seg(t, L1A, L1B) * s1.length) : 0;
      lineEls[0].tx.textContent = s1.slice(0, n1);
      lineEls[0].m.style.opacity = String(easeOut(seg(t, M1, M1 + 0.20)));
      var s2 = LINES[1][0], n2 = t >= L2A ? Math.floor(seg(t, L2A, L2B) * s2.length) : 0;
      lineEls[1].tx.textContent = s2.slice(0, n2);
      lineEls[1].m.style.opacity = String(easeOut(seg(t, M2, M2 + 0.20)));

      var su = easeOut(seg(t, SRCA, SRCA + 0.34));
      srcHost.style.opacity = String(su);
      srcHost.style.transform = "translateY(" + lerp(4,0,su) + "px)";
      ft.style.opacity = String(easeOut(seg(t, FTA, FTA + 0.30)));
      // the composer sits there the whole time, as it does in a real chat
      comp.style.opacity = "1";
    }};
  };

  /* ===== 07 the correction loop ===== */
  BUILDERS[7] = function (stage) {
    var c1 = stage.querySelector('[data-bpa="lpC1"]'), c2 = stage.querySelector('[data-bpa="lpC2"]'), c3 = stage.querySelector('[data-bpa="lpC3"]');
    var said = stage.querySelector('[data-bpa="lpSaid"]'), cap = stage.querySelector('[data-bpa="lpCap"]');
    var capI = stage.querySelector('[data-bpa="lpCapI"]'), capR = stage.querySelector('[data-bpa="lpCapR"]');
    var rt = stage.querySelector('[data-bpa="lpRt"]'), meta = stage.querySelector('[data-bpa="lpMeta"]');
    var eff = stage.querySelector('[data-bpa="lpEff"]'), effI = stage.querySelector('[data-bpa="lpEffI"]');
    var f1 = stage.querySelector('[data-bpa="lpF1"]'), f2 = stage.querySelector('[data-bpa="lpF2"]');
    var reply = stage.querySelector('[data-bpa="lpReply"]'), bmk = stage.querySelector('[data-bpa="lpBmk"]');
    var prev = stage.querySelector('[data-bpa="lpPrev"]'), f3 = stage.querySelector('[data-bpa="lpF3"]');
    var bm = stage.querySelector('[data-bpa="lpBm"]'), hl = stage.querySelector('[data-bpa="lpHl"]'), ul = stage.querySelector('[data-bpa="lpUl"]');
    var tph = stage.querySelector('[data-bpa="lpTph"]'), ptsHost = stage.querySelector('[data-bpa="lpPts"]');
    if (!c1) return null;
    effI.innerHTML = '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.6"><path d="M4 12l6 6L20 6"/></svg>';
    bmk.innerHTML = B_MARK;

    // the advisor's own phrasing, loose and spoken. The rule in column 2 is the
    // normalised version of it, which is the point of the two panels
    var SAY = "Keep briefs to three talking points and put the dollar figure up front. I stop reading after three.";
    var PTS = [
      "Settle the systematic sell rate. Five items are gated on it.",
      "Deferred-comp election window opens 8/15, closes 9/30.",
      "Q2 estimated tax of $48,000 is due from Raj today."
    ];
    var ptEls = PTS.map(function (x, i) {
      var d = document.createElement("div"); d.className = "bpa-lp-p";
      d.innerHTML = "<b>" + (i+1) + "</b><span>" + x + "</span>";
      ptsHost.appendChild(d); return d;
    });

    var C1 = 0.20, SA = 0.55, SB = 2.30;
    var CAPA = 2.42, CAPB = 3.00, RPL = 3.15;
    var C2 = 3.62, RT = 3.86, MT = 4.22, EFF = 4.50, PREV = 4.84, CP2 = 5.12;
    var C3 = 5.40, BM = 5.62, HL = 5.86, TPH = 6.12, P0 = 6.32, PST = 0.30;
    var ULA = 7.36, ULB = 7.78;

    function fadeUp(el, t, a, b, dy) {
      var u = easeOut(seg(t, a, b));
      el.style.opacity = String(u);
      el.style.transform = "translateY(" + lerp(dy == null ? 5 : dy, 0, u) + "px)";
      return u;
    }

    return { dur: 10.6, tick: function (t) {
      fadeUp(c1, t, C1, C1 + 0.28);
      var n = t >= SA ? Math.floor(seg(t, SA, SB) * SAY.length) : 0;
      var typing = t >= SA && t < SB + 0.45;
      said.innerHTML = SAY.slice(0, n) + (typing && (Math.floor(t * 1.7) % 2 === 0) ? '<span class="bpa-cr"></span>' : "");

      f1.style.opacity = String(easeOut(seg(t, CAPA - 0.16, CAPA + 0.10)));
      cap.style.opacity = "1";
      var cdone = t >= CAPB;
      var w = t < CAPA - 0.16 ? "" : (cdone ? T_CHK : T_SPIN);
      if (capI.getAttribute("data-s") !== w) { capI.innerHTML = w; capI.setAttribute("data-s", w); }
      capR.style.opacity = String(easeOut(seg(t, CAPB, CAPB + 0.20)));
      cap.style.borderColor = cdone ? "#C5D9C8" : "#E2E8F0";

      fadeUp(reply, t, RPL, RPL + 0.30, 3);

      fadeUp(c2, t, C2, C2 + 0.28);
      fadeUp(rt, t, RT, RT + 0.26, 3);
      meta.style.opacity = String(easeOut(seg(t, MT, MT + 0.24)));
      var eu = easePill(seg(t, EFF, EFF + 0.26));
      eff.style.opacity = String(eu);
      eff.style.transform = "scale(" + lerp(0.94, 1, eu) + ")";
      fadeUp(prev, t, PREV, PREV + 0.30, 3);
      f2.style.opacity = String(easeOut(seg(t, CP2, CP2 + 0.28)));

      fadeUp(c3, t, C3, C3 + 0.28);
      bm.style.opacity = String(easeOut(seg(t, BM, BM + 0.24)));
      fadeUp(hl, t, HL, HL + 0.28, 3);
      tph.style.opacity = String(easeOut(seg(t, TPH, TPH + 0.22)));
      for (var i = 0; i < ptEls.length; i++) fadeUp(ptEls[i], t, P0 + i*PST, P0 + i*PST + 0.26, 3);
      f3.style.opacity = String(easeOut(seg(t, P0 + ptEls.length*PST + 0.14, P0 + ptEls.length*PST + 0.44)));
      ul.style.transform = "scaleX(" + easeOut(seg(t, ULA, ULB)) + ")";
    }};
  };

  /* ===== 08 multi-source intake (Outlook + Salesforce sync, files upload) ===== */
  BUILDERS[8] = function (stage) {
    var h = stage.querySelector('[data-bpa="ixH"]'), l = stage.querySelector('[data-bpa="ixL"]');
    var rowOl = stage.querySelector('[data-bpa="ixRowOl"]'), rowSf = stage.querySelector('[data-bpa="ixRowSf"]'), rowFl = stage.querySelector('[data-bpa="ixRowFl"]');
    var olIco = stage.querySelector('[data-bpa="ixOlIco"]'), olSt = stage.querySelector('[data-bpa="ixOlSt"]');
    var sfIco = stage.querySelector('[data-bpa="ixSfIco"]'), sfSt = stage.querySelector('[data-bpa="ixSfSt"]');
    var flIco = stage.querySelector('[data-bpa="ixFlIco"]'), flSt = stage.querySelector('[data-bpa="ixFlSt"]'), dz = stage.querySelector('[data-bpa="ixDz"]');
    var cut = stage.querySelector('[data-bpa="ixCut"]');
    var fileCard = stage.querySelector('[data-bpa="ixFile"]'), fileChip = stage.querySelector('[data-bpa="ixFileChip"]');
    var itemsHost = stage.querySelector('[data-bpa="ixItems"]'), foot = stage.querySelector('[data-bpa="ixFoot"]');
    var flyer = stage.querySelector('[data-bpa="ixFlyer"]');
    if (!rowOl || !rowSf || !rowFl || !fileCard || !dz) return null;

    // the file that gets dropped in, reusing the vendor mark rather than a new icon
    flyer.innerHTML = '<span style="width:13px;height:13px;display:inline-block">' + MARK.pdf + '</span><span>Q1 statement.pdf</span>';

    // one result line per source, each carrying its own vendor mark forward
    // into the assembled file, so the file visibly inherits from all three
    var ITEMS = [
      { m: MARK.outlook, t: "6 email threads, including Thursday's pre-read" },
      { m: MARK.salesforce, t: "1 contact, 3 open tasks" },
      { m: MARK.pdf, t: "3 statements filed, Q1 Fidelity included" }
    ];
    var itemEls = ITEMS.map(function (x) {
      var d = document.createElement("div"); d.className = "bpa-ix-item";
      d.innerHTML = '<span class="bpa-ix-item-ic">' + x.m + "</span><span>" + x.t + "</span>";
      itemsHost.appendChild(d);
      return d;
    });

    function fadeUp(el, t, a, b, dy) {
      var u = easeOut(seg(t, a, b));
      el.style.opacity = String(u);
      el.style.transform = "translateY(" + lerp(dy == null ? 6 : dy, 0, u) + "px)";
      return u;
    }
    function setIco(el, want) {
      if (el.getAttribute("data-s") === want) return;
      el.setAttribute("data-s", want);
      el.innerHTML = want === "chk" ? T_CHK : want === "spin" ? T_SPIN : "";
    }

    var HDR_A = 0.10, HDR_B = 0.38;
    var SUB_A = 0.24, SUB_B = 0.52;

    // three rows appear on their own uneven beat rather than a single evenly
    // spaced reveal, so the entrance doesn't read as one mechanical sweep
    var ROW_OL_A = 0.42, ROW_OL_B = 0.68;
    var ROW_SF_A = 0.64, ROW_SF_B = 0.90;
    var ROW_FL_A = 1.00, ROW_FL_B = 1.26;

    var OL_CONNECT_END = 1.15, OL_SYNC_A = 1.15, OL_SYNC_B = 4.00, OL_SYNCED = OL_SYNC_B;
    var SF_CONNECT_END = 1.38, SF_SYNC_A = 1.38, SF_SYNC_B = 3.15, SF_SYNCED = SF_SYNC_B;
    var SF_CONTACT_AT = SF_SYNC_A + (SF_SYNC_B - SF_SYNC_A) * 0.2;   // the contact resolves before the tasks do

    // the file itself makes a short, fully on-stage hop into the row's own
    // drop target (same technique as clip 04's drag, not the cursor engine)
    var FLY_A = 1.40, FLY_B = 2.05, FLY_FADE_A = 2.15, FLY_FADE_B = 2.35;
    var FL_UP_A = FLY_FADE_B, FL_UP_B = 4.30, FL_SYNCED = FL_UP_B;

    var CUT_START = 3.95, CUT_END = 4.55;   // marks the skip past the real wait, same idiom as clip 04

    var FILE_HDR_A = 4.65, FILE_HDR_B = 4.97;
    var ITEM_A = [5.12, 5.58, 6.04];
    var CHIP_FLIP = 6.60;
    var FOOT_A = 6.65, FOOT_B = 6.97;

    var DUR = 10.6;

    return { dur: DUR, tick: function (t) {
      fadeUp(h, t, HDR_A, HDR_B);
      fadeUp(l, t, SUB_A, SUB_B);

      // Outlook: connects, then a climbing count while it syncs, then settles
      fadeUp(rowOl, t, ROW_OL_A, ROW_OL_B);
      setIco(olIco, t < ROW_OL_A ? "" : (t < OL_SYNCED ? "spin" : "chk"));
      rowOl.style.borderColor = t >= OL_SYNCED ? "#C5D9C8" : "#E2E8F0";
      if (t < OL_CONNECT_END) { olSt.textContent = "Connecting…"; }
      else if (t < OL_SYNCED) { olSt.textContent = Math.round(lerp(0, 182, easeOut(seg(t, OL_SYNC_A, OL_SYNC_B)))) + " emails scanned"; }
      else { olSt.textContent = "182 emails, 6 threads flagged"; }

      // Salesforce: same shape, its own pace and its own numbers
      fadeUp(rowSf, t, ROW_SF_A, ROW_SF_B);
      setIco(sfIco, t < ROW_SF_A ? "" : (t < SF_SYNCED ? "spin" : "chk"));
      rowSf.style.borderColor = t >= SF_SYNCED ? "#C5D9C8" : "#E2E8F0";
      if (t < SF_CONNECT_END) { sfSt.textContent = "Connecting…"; }
      else if (t < SF_SYNCED) {
        var sfTasks = Math.round(lerp(0, 3, easeOut(seg(t, SF_SYNC_A, SF_SYNC_B))));
        sfSt.textContent = (t >= SF_CONTACT_AT ? 1 : 0) + " contact, " + sfTasks + " open tasks";
      } else { sfSt.textContent = "1 contact, 3 open tasks synced"; }

      // Files: the one source a person actually drops in, then it gets read
      fadeUp(rowFl, t, ROW_FL_A, ROW_FL_B);
      setIco(flIco, t < FL_UP_A ? "" : (t < FL_SYNCED ? "spin" : "chk"));
      rowFl.style.borderColor = t >= FL_SYNCED ? "#C5D9C8" : "#E2E8F0";
      dz.style.borderColor = (t >= FLY_A && t < FLY_B + 0.15) ? "#7A4E2D" : "#B7BBC2";
      if (t < FLY_A) { flSt.textContent = "Drop files here"; }
      else if (t < FL_UP_A) { flSt.textContent = "Filing…"; }
      else if (t < FL_SYNCED) { flSt.textContent = "Reading " + Math.max(1, Math.min(3, Math.round(lerp(0, 3, easeOut(seg(t, FL_UP_A, FL_UP_B)))))) + " of 3 files…"; }
      else { flSt.textContent = "3 files filed"; }

      // land inside the row itself (not pixel-locked to the small dz target), so the
      // chip's own width never pushes past the row's own already-safe right edge
      var rowR = rectIn(stage, rowFl);
      var landLeft = rowR.left + 12, landTop = rowR.top + rowR.h + 8;
      var flyU = easeOut(seg(t, FLY_A, FLY_B));
      flyer.style.left = lerp(landLeft - 8, landLeft, flyU) + "px";
      flyer.style.top = lerp(landTop + 46, landTop, flyU) + "px";
      flyer.style.opacity = String(t < FLY_A ? 0 : (t < FLY_FADE_A ? 1 : (t < FLY_FADE_B ? 1 - seg(t, FLY_FADE_A, FLY_FADE_B) : 0)));

      cut.style.opacity = t >= CUT_START && t < CUT_END ? "1" : "0";

      // the client file, assembled from what each source produced
      fadeUp(fileCard, t, FILE_HDR_A, FILE_HDR_B, 4);
      for (var i = 0; i < itemEls.length; i++) fadeUp(itemEls[i], t, ITEM_A[i], ITEM_A[i] + 0.32, 4);
      if (t >= CHIP_FLIP) {
        if (fileChip.getAttribute("data-s") !== "done") {
          fileChip.setAttribute("data-s", "done"); fileChip.className = "bpa-chip bpa-grn"; fileChip.textContent = "Indexed";
        }
      } else if (fileChip.getAttribute("data-s") !== "building") {
        fileChip.setAttribute("data-s", "building"); fileChip.className = "bpa-chip bpa-amber"; fileChip.textContent = "Building";
      }
      fadeUp(foot, t, FOOT_A, FOOT_B, 3);
    }};
  };

  /* ---------------------------------------------------------------------
   * Mount registry + visibility-gated rAF loop.
   * ------------------------------------------------------------------ */
  var reduceMotion = false;
  try { reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var mounted = [];
  var rafId = null;

  function loop(now) {
    rafId = null;
    var anyVisible = false;
    for (var i = 0; i < mounted.length; i++) {
      var m = mounted[i];
      if (!m.visible) continue;
      anyVisible = true;
      if (m.last === null) m.last = now;
      var dt = (now - m.last) / 1000;
      m.last = now;
      if (dt > 0.25) dt = 0.25;
      m.elapsed += dt;
      m.tick(m.elapsed % m.dur);
    }
    if (anyVisible) rafId = requestAnimationFrame(loop);
  }
  function ensureLoop() {
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }

  var io = null;
  function observer() {
    if (io) return io;
    if (typeof IntersectionObserver === "undefined") return null;
    io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        var m = entries[i].target.__bpaClip;
        if (!m) continue;
        m.visible = entries[i].isIntersecting;
        if (m.visible) { m.last = null; ensureLoop(); }
      }
    }, { threshold: 0.01 });
    return io;
  }

  function mount(clipNumber, element) {
    var n = Number(clipNumber);
    var build = BUILDERS[n], skeleton = SKELETONS[n];
    if (!build || !skeleton || !element || !element.appendChild) return null;
    if (element.__bpaClip) return element.__bpaClip;   // already mounted, no-op

    element.classList.add("bpa");
    element.innerHTML = skeleton;
    var stage = element.querySelector(".bpa-stage");
    var built = stage ? build(stage) : null;
    if (!built) return null;

    var m = { dur: built.dur, tick: built.tick, elapsed: 0, last: null, visible: false, el: element };
    element.__bpaClip = m;
    mounted.push(m);

    if (reduceMotion) {
      built.tick(0);          // first frame only, loop never starts
    } else {
      var obs = observer();
      if (obs) {
        obs.observe(element);
      } else {
        // no IntersectionObserver support: fall back to always-on
        m.visible = true;
        ensureLoop();
      }
    }
    return m;
  }

  function mountAll(root) {
    root = root || document;
    var els = root.querySelectorAll("[data-bpa-clip]");
    for (var i = 0; i < els.length; i++) {
      mount(els[i].getAttribute("data-bpa-clip"), els[i]);
    }
  }

  global.BrieflyClips = { mount: mount, mountAll: mountAll };
})(typeof window !== "undefined" ? window : this);
