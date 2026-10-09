document.documentElement.classList.add('js');

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
  frame.className = 'demo-cal-frame';
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
