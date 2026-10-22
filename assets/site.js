document.documentElement.classList.add('js');

/* Analytics. Every named count goes to both Google Analytics and PostHog.
   PostHog only loads on pages that already load Google's tag, so the legal
   pages and /unsubscribe (which have no tag, on purpose) stay untracked.
   Only the live site counts: Netlify deploy previews and local copies send
   nothing to either tool. Visit any page with ?notrack=1 to stop counting this
   browser (team visits); ?notrack=0 turns it back on. */
// PostHog project "Briefly website" (write-only, safe in public code). Empty = PostHog off.
var POSTHOG_KEY = 'phc_BYhWN3s6h3vgmwPfSRMFACZeAiWg6LuBKzqzqvVh8ZVg';
var GA_ID = 'G-92NXKY9W1S';
var LIVE_HOSTS = ['brieflywealth.com', 'www.brieflywealth.com'];
var HEATMAP_PAGES = ['/', '/start', '/sample-brief'];
// Private link codes: /download?t= (personal download) and /unsubscribe?token=.
var SECRET_PARAM = /([?&](?:t|token)=)[^&#"'\s]*/g;
function scrubUrl(value) { return value.replace(SECRET_PARAM, '$1redacted'); }
var pageHasSecret = /[?&](?:t|token)=/.test(location.search);

// One name per page: /start, /start.html and /start/ all count as /start.
var pagePath = location.pathname.replace(/\.html$/, '').replace(/\/index$/, '/').replace(/(.)\/$/, '$1') || '/';
var noTrack = (function () {
  try {
    var flag = new URLSearchParams(location.search).get('notrack');
    if (flag === '1') localStorage.setItem('briefly_notrack', '1');
    if (flag === '0') localStorage.removeItem('briefly_notrack');
    return localStorage.getItem('briefly_notrack') === '1';
  } catch (e) { return false; }
})();
var liveSite = LIVE_HOSTS.indexOf(location.hostname) !== -1;
var siteTracked = typeof window.gtag === 'function' && liveSite && !noTrack;
if (noTrack || !liveSite) window['ga-disable-' + GA_ID] = true;

if (siteTracked && POSTHOG_KEY) {
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  // Autocapture records clicks (link and button text, never typed values) on
  // top of the named counts below. Recordings blank every typed field;
  // elements that echo a visitor's name or email carry class="ph-no-capture".
  // A page opened from a private link (a customer's personal download link)
  // gets counts only: no click capture and no recording, because the page
  // copies the code into its download buttons. Every string sent is scrubbed.
  window.posthog.init(POSTHOG_KEY, {
    api_host: 'https://us.i.posthog.com',
    defaults: '2026-05-30',
    autocapture: !pageHasSecret,
    disable_session_recording: pageHasSecret,
    capture_exceptions: true,
    // The library itself also strips these codes from page addresses, which
    // covers what it sends past before_send (the stored first landing address).
    mask_personal_data_properties: true,
    custom_personal_data_properties: ['t', 'token'],
    enable_heatmaps: HEATMAP_PAGES.indexOf(pagePath) !== -1,
    enable_recording_console_log: false,
    session_recording: {
      maskAllInputs: true,
      maskCapturedNetworkRequestFn: function (request) {
        if (request.name) request.name = scrubUrl(request.name);
        return request;
      }
    },
    // Person fields ($set_once holds the first landing URL) sit beside
    // properties, so all three are scrubbed.
    before_send: function (event) {
      if (!event) return event;
      event.properties = scrubStrings(event.properties);
      if (event.$set) event.$set = scrubStrings(event.$set);
      if (event.$set_once) event.$set_once = scrubStrings(event.$set_once);
      return event;
    }
  });
}

function scrubStrings(value) {
  if (typeof value === 'string') return scrubUrl(value);
  if (Array.isArray(value)) return value.map(scrubStrings);
  if (Object.prototype.toString.call(value) === '[object Object]') {
    var out = {};
    for (var key in value) out[key] = scrubStrings(value[key]);
    return out;
  }
  return value;
}

// Called from inside form handlers, so a tracking error must never surface as
// a failed send (the visitor would resubmit and file a duplicate lead).
window.brieflyTrack = function (name, props) {
  if (!siteTracked) return;
  try {
    props = props || {};
    props.page = pagePath;
    window.gtag('event', name, props);
    if (window.posthog && POSTHOG_KEY) window.posthog.capture(name, props);
  } catch (e) { /* counting is best effort */ }
};

// The demo modal's open function lives in each page's inline script, which
// runs before this deferred file, so wrapping it here covers every page.
if (typeof window.openDemoModal === 'function') {
  var openDemoModalUntracked = window.openDemoModal;
  window.openDemoModal = function () {
    window.brieflyTrack('demo_form_opened');
    return openDemoModalUntracked.apply(this, arguments);
  };
}

document.addEventListener('click', function (e) {
  var link = e.target.closest && e.target.closest('a[href]');
  if (!link) return;
  var href = link.getAttribute('href');
  // The download page swaps in /signup/download?t=... for invited customers.
  if (/\.mcpb$|\/signup\/download\b/.test(href)) window.brieflyTrack('addon_downloaded');
  else if (/^mailto:/.test(href) && !/subject=Unsubscribe/i.test(href)) window.brieflyTrack('email_clicked');
});

// Calendly's inline frame posts this message when a time is booked
// (it needs the embed_domain param set in showDemoCalendar below).
window.addEventListener('message', function (e) {
  if (e.origin === 'https://calendly.com' && e.data && e.data.event === 'calendly.event_scheduled') {
    window.brieflyTrack('demo_booked');
  }
});

document.addEventListener('DOMContentLoaded', function () {
  var els = [].slice.call(document.querySelectorAll('.reveal'));
  if (!els.length) return;

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach(function (el) { el.classList.add('is-in'); });
    return;
  }

  var vh = window.innerHeight || document.documentElement.clientHeight;
  var rest = [];
  els.forEach(function (el) {
    var r = el.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) {
      el.classList.add('is-in');
    } else {
      rest.push(el);
    }
  });

  if (!rest.length) return;

  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-in');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

  rest.forEach(function (el) { io.observe(el); });

  // fail open: never leave content hidden for bots or screenshots that do not scroll
  function showAll() {
    rest.forEach(function (el) { el.classList.add('is-in'); });
    io.disconnect();
  }
  setTimeout(showAll, 1500);
  window.addEventListener('beforeprint', showAll);
});

/* Demo modal: after the form posts, show Connor's Calendly inline so the
   prospect can book on the spot. Name, email and firm are prefilled. If this
   never runs, the success screen keeps its "we'll be in touch" fallback copy. */
window.showDemoCalendar = function (name, email, firm) {
  window.brieflyTrack('demo_form_sent'); // only runs after the form posted OK
  var success = document.getElementById('demoModalSuccess');
  if (!success) return;
  var params = new URLSearchParams({
    embed_domain: location.hostname,
    embed_type: 'Inline',
    hide_gdpr_banner: '1',
    hide_event_type_details: '1',
    hide_landing_page_details: '1',
    name: name || '',
    email: email || ''
  });
  if (firm) params.set('a1', 'Firm: ' + firm);
  var frame = document.createElement('iframe');
  frame.className = 'demo-cal-frame ph-no-capture'; // its link carries name and email
  frame.title = 'Pick a time for your Briefly demo';
  frame.src = 'https://calendly.com/connor-florczyk-brieflywealth/30min?' + params.toString();
  var wrap = success.querySelector('.demo-cal');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'demo-cal';
    var body = success.querySelector('.demo-modal-success-body');
    success.insertBefore(wrap, body ? body.nextSibling : success.firstChild);
  }
  wrap.innerHTML = '';
  wrap.appendChild(frame);
  var title = success.querySelector('.demo-modal-success-title');
  var text = success.querySelector('.demo-modal-success-body');
  if (title) title.textContent = 'Thanks. Pick a time below.';
  if (text) text.textContent = "Choose a 30-minute time that works for you. If none do, we'll email you shortly to find another.";
};
