/** Tandem's own glyph set, drawn by hand on a 16px grid (no icon pack).
 *  Route identity is carried by silhouette, never colour alone:
 *  disc = on-device, ring = cloud, ring with bars = cloud redacted, hatched square = blocked. */
import { raw } from './dom.js';

const G: Record<string, string> = {
  local: '<circle cx="8" cy="8" r="5.6" fill="currentColor"/>',
  cloud: '<circle cx="8" cy="8" r="5.1" fill="none" stroke="currentColor" stroke-width="1.8"/>',
  redacted: '<circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.1 6.3h5.8M5.1 8h5.8M5.1 9.7h5.8" stroke="currentColor" stroke-width="1.15"/>',
  blocked: '<rect x="2.6" y="2.6" width="10.8" height="10.8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M2.8 7.2 7.2 2.8M2.8 11.4 11.4 2.8M4.6 13.3l8.7-8.7M8.8 13.3l4.5-4.5" stroke="currentColor" stroke-width="1.1"/>',
  /* availability fallback: a bridge carrying the request over a gap, arrow lands on the far side */
  fallback: '<path d="M1.5 12.2h3.1M11.4 12.2h3.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M3.6 12.1C4.3 6.6 11.4 6.2 12.2 10.6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 1.6"/><path d="m10.1 9.7 2.2 1.4 1-2.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>',
  /* quality escalation: a staircase up to a higher grade */
  escalate: '<path d="M1.8 13.6h3.6v-3.4h3.4V6.8h3.4V3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="miter"/><path d="m9.9 4.9 2.3-2.4 2.3 2.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>',
  pass: '<path d="m3.6 8.4 2.9 2.8 5.9-6.3" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="square"/>',
  fail: '<path d="m4.4 4.4 7.2 7.2M11.6 4.4l-7.2 7.2" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  pending: '<circle cx="8" cy="8" r="1.5" fill="currentColor"/>'
};

export type GlyphName = keyof typeof G;
export function glyph(name: GlyphName, label?: string) {
  const a11y = label ? `role="img" aria-label="${label.replace(/"/g, '')}"` : 'aria-hidden="true"';
  return raw(`<svg class="glyph" viewBox="0 0 16 16" ${a11y}>${G[name]}</svg>`);
}
