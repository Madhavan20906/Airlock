/** Tiny safe templating: every interpolated value is escaped unless wrapped in raw(). */
export class Raw { constructor(readonly html: string) {} toString() { return this.html; } }
export const raw = (s: string) => new Raw(s);

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, c => ESC[c]);

function piece(v: unknown): string {
  if (v === null || v === undefined || v === false) return '';
  if (v instanceof Raw) return v.html;
  if (Array.isArray(v)) return v.map(piece).join('');
  return esc(v);
}

export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += piece(vals[i]) + strings[i + 1];
  return new Raw(out);
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null;

export function toast(msg: string) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

export const fmtMs = (ms: number | null | undefined) =>
  ms === null || ms === undefined || !Number.isFinite(ms) ? '—' : ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)} s`;
export const pct = (x: number | null | undefined, d = 0) => (x === null || x === undefined ? '—' : `${(x * 100).toFixed(d)}%`);
export const shortHash = (h: string) => `${h.slice(0, 8)} ${h.slice(8, 16)}`;
