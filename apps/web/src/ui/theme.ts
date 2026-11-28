/** Paper (light) / Darkroom (dark). Preference: 'light' | 'dark' | 'system' (default). Shared by Studio and Notes. */
import { html } from './dom.js';
import { icon } from './icons.js';

const KEY = 'tandem-theme-pref';
const read = () => { try { return localStorage.getItem(KEY) ?? 'system'; } catch { return 'system'; } };
const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
export const effective = () => { const p = read(); return p === 'system' ? (sysDark() ? 'dark' : 'light') : p; };

let onChange: () => void = () => {};
function apply() {
  document.documentElement.dataset.theme = effective();
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', effective() === 'dark' ? '#0F0D0B' : '#F2EEE3');
}
export function initTheme(cb?: () => void) {
  if (cb) onChange = cb;
  apply();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (read() === 'system') { apply(); onChange(); } });
}
export function toggleTheme() {
  const next = effective() === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem(KEY, next === (sysDark() ? 'dark' : 'light') ? 'system' : next); } catch { /* private mode: still switch for this page */ document.documentElement.dataset.theme = next; }
  apply();
  onChange();
}
export function themeButton(compact = false) {
  const dark = effective() === 'dark';
  return compact
    ? html`<button class="btn btn-sm" data-theme-toggle aria-label="Switch to ${dark ? 'Paper' : 'Darkroom'} mode">${icon(dark ? 'sun' : 'moon')}</button>`
    : html`<button class="theme-btn" data-theme-toggle aria-label="Switch to ${dark ? 'Paper' : 'Darkroom'} mode">${icon(dark ? 'moon' : 'sun')}<span>${dark ? 'Darkroom' : 'Paper'}</span><span class="tb-dial">Alt D</span></button>`;
}
