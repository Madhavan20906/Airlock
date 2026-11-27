import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

const reveals: Element[] = [];
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
  }
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

let stagger = 0;
document.querySelectorAll('section, .card, .stat, .lane, .compare__row, .faq dt, .faq dd').forEach((el) => {
  el.classList.add('reveal');
  const parent = el.closest('.stats, .faq, .compare, .duo-cards, .guard-demo, .lanes');
  if (parent) { (el as HTMLElement).style.setProperty('--d', `${stagger * 80}ms`); stagger++; }
  reveals.push(el);
  io.observe(el);
});

setTimeout(() => { for (const el of reveals) el.classList.add('in-view'); }, 1500);

const counterIo = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counterIo.unobserve(e.target);
    const el = e.target as HTMLElement;
    const text = el.textContent || '';
    const match = text.match(/^([\d.]+)(%|s| ms)?/);
    if (!match) continue;
    const end = parseFloat(match[1]);
    const suffix = match[2] || '';
    const rest = text.slice(match[0].length);
    const duration = 1400;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const val = end * ease;
      el.textContent = (Number.isInteger(end) ? Math.round(val).toString() : val.toFixed(1)) + suffix + rest;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}, { threshold: 0.5 });

document.querySelectorAll('#results .t-stat').forEach(el => counterIo.observe(el));

document.querySelectorAll('.hero [data-step]').forEach((el, i) => {
  (el as HTMLElement).style.animationDelay = `${0.6 + i * 0.5}s`;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') document.documentElement.classList.add('using-keyboard');
});
document.addEventListener('mousedown', () => document.documentElement.classList.remove('using-keyboard'));

const nav = document.querySelector('.nav') as HTMLElement;
if (nav) {
  let last = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('nav--scrolled', y > 60);
    nav.classList.toggle('nav--hidden', y > 400 && y > last);
    last = y;
  }, { passive: true });
}

document.querySelectorAll<HTMLAnchorElement>('.nav__link[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href')!);
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});
