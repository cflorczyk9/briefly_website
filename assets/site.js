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
});
