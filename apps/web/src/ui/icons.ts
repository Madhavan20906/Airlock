/** Inline SVG icons, 24px grid, 1.75 stroke (Lucide-style geometry, ISC). */
import { raw } from './dom.js';

const P: Record<string, string> = {
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 2.5v3M15 2.5v3M9 18.5v3M15 18.5v3M2.5 9h3M2.5 15h3M18.5 9h3M18.5 15h3"/>',
  cloud: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.92A6 6 0 0 1 19.5 11a4 4 0 0 1-2 8Z"/>',
  mask: '<path d="M17.5 19H7a5 5 0 1 1 .9-9.92A6 6 0 0 1 19.5 11a4 4 0 0 1-2 8Z"/><path d="M8 14h8" stroke-dasharray="2 2"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  shield: '<path d="M12 21s-7.5-3.5-7.5-10V5.5L12 3l7.5 2.5V11c0 6.5-7.5 10-7.5 10Z"/><path d="m9 12 2 2 4-4"/>',
  unplug: '<path d="m19 5 3-3M2 22l3-3M6.3 20.3a2.4 2.4 0 0 1-3.4 0l-.2-.2a2.4 2.4 0 0 1 0-3.4l2.6-2.6 4 4ZM17.7 3.7a2.4 2.4 0 0 1 3.4 0l.2.2a2.4 2.4 0 0 1 0 3.4l-2.6 2.6-4-4ZM8 12l2-2M12 16l2-2M3 3l18 18"/>',
  stepup: '<path d="M12 19V5M6 11l6-6 6 6"/><path d="M5 21h14"/>',
  gauge: '<path d="M12 14 16 9"/><path d="M3.5 18a9 9 0 1 1 17 0"/><circle cx="12" cy="14" r="1.2"/>',
  race: '<path d="M4 7h11M4 17h16"/><circle cx="17" cy="7" r="2.2"/><circle cx="20" cy="17" r="0.1"/><path d="M8 4v6M8 14v6"/>',
  frontier: '<path d="M3 3v18h18"/><path d="M6.5 16.5c3-1 4.5-6 8-8.5 1.4-1 3.2-1.4 5-1.5"/><circle cx="9" cy="13.5" r="1.3"/><circle cx="15" cy="8" r="1.3"/>',
  policy: '<path d="M6 3h9l4 4v14H6Z"/><path d="M15 3v4h4M9 12h7M9 16h5"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z"/>',
  receipt: '<path d="M6 2.5h12v19l-2.5-1.6L13 21.5l-2.5-1.6L8 21.5l-2-1.3Z"/><path d="M9 7.5h6M9 11h6M9 14.5h4"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.6 1.6 0 0 0 6 21h12a1.6 1.6 0 0 0 1.5-2.5L14 9V3"/><path d="M7 15h10"/>',
  play: '<path d="M7 4.5v15l12-7.5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
  alert: '<path d="M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4.5M12 17v.5"/>',
  wifioff: '<path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2-1.5M2 8.8a15 15 0 0 1 4.2-2.6M22 8.8A15 15 0 0 0 10.7 5M12 20h.01"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  notes: '<path d="M5 3h10l4 4v14H5Z"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  home: '<path d="M3 11 12 4l9 7"/><path d="M5 9.5V20h14V9.5"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'
};

export function icon(name: keyof typeof P | string, label?: string) {
  const body = P[name] ?? P.info;
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '')}"` : 'aria-hidden="true"';
  return raw(`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${a11y}>${body}</svg>`);
}

/** The Tandem mark: two lanes converging into one decision point. */
export const brandMark = raw(`<svg class="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
  <rect x="1" y="1" width="30" height="30" rx="2" fill="none" stroke="var(--ink)" stroke-width="1.5"/>
  <path d="M5 11.5h8.5c3.2 0 4.4 1.9 5.6 4.5" stroke="var(--local)" stroke-width="2.4" fill="none"/>
  <path d="M5 20.5h8.5c3.2 0 4.4-1.9 5.6-4.5" stroke="var(--cloud)" stroke-width="2.4" fill="none" stroke-dasharray="3 1.6"/>
  <circle cx="23" cy="16" r="3.4" fill="var(--ink)"/>
</svg>`);
