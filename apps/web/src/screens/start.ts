import type { Screen } from '../main.js';
import { html } from '../ui/dom.js';
import { routeBadge, fallbackFlag, escalationFlag } from '../ui/components.js';
import { tandem } from '../services/tandem.js';

const STEPS: Array<[string, string, string, string, string]> = [
  ['1', 'Device check', '#/device', 'Whether your Chrome can run Gemini Nano.', 'If not, nothing breaks: the honest status and how to enable it.'],
  ['2', 'Quick probe', '#/probe', 'Two lanes race 12 synthetic tasks, about 2 minutes.', 'Without Nano the cloud lane runs alone and the local lane says why.'],
  ['3', 'Frontier and Policy', '#/frontier', 'Your run, or the labelled reference run.', 'Click any point or rule: its evidence opens in the margin. Print the certificate.'],
  ['4', 'Tandem Notes', '/notes/', 'Summarise, Rewrite, Extract, Translate.', 'Each answer is stamped with where it ran and why, with a receipt.'],
  ['5', 'Receipts and Guard Lab', '#/receipts', 'Verify the SHA-256 chain; run the tamper test.', 'Then watch 263 disguised identifiers attack the redactor.'],
  ['6', 'Hybrid Atlas', '#/atlas', 'Optionally add your device, anonymously.', 'See how many devices can actually run local AI.']
];

function getVisited(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem('tandem-visited') || '[]')); } catch { return new Set(); }
}
function markVisited(href: string) {
  const v = getVisited(); v.add(href);
  try { sessionStorage.setItem('tandem-visited', JSON.stringify([...v])); } catch { /* ignore */ }
}

const screen: Screen = {
  title: 'Judge quick start',
  crumb: 'Orientation · Judge quick start',
  render(root) {
    const c = tandem.capability;
    const visited = getVisited();
    const done = STEPS.filter(([, , href]) => visited.has(href)).length;
    root.innerHTML = html`
      <header class="page-head">
        <h1 class="title">What to click, <em>and what you should see.</em></h1>
        <p class="lede">Five minutes, no sign-in, no tokens. Your Chrome ${c.state === 'available' ? html`<b>can</b> run Gemini Nano right now, so you will see real on-device results.` : html`reports <span class="mono">${c.raw}</span> for on-device AI. That is fine: every screen works, the on-device lane says why it is idle, and the reference run shows real measurements from the author's laptop, labelled as such.`}</p>
      </header>
      <div class="folio">
        <div>
          <div class="sec" style="margin-top:0"><h2>The route</h2><span class="caps num">${done} of ${STEPS.length} visited</span></div>
          <ol class="checklist">${STEPS.map(([n, t, href, a, b]) => html`<li class="${visited.has(href) ? 'is-done' : ''}">
            <a href="${href}" data-track="${href}"><span class="pn num" aria-hidden="true">${visited.has(href) ? '✓' : n}</span><span class="cl-t">${t}</span><span class="cl-a">${a}</span><span class="cl-b">${b}</span><span class="sr">${visited.has(href) ? ', visited' : ''}</span></a></li>`)}</ol>
        </div>
        <aside class="margin">
          <div class="mnote"><span class="caps">The stamps</span>
            <span class="kv-l">${routeBadge('LOCAL')}<span>Gemini Nano answered, on this device</span></span>
            <span class="kv-l">${routeBadge('CLOUD')}<span>gemini-3.5-flash-lite via Firebase AI Logic</span></span>
            <span class="kv-l">${routeBadge('CLOUD_REDACTED')}<span>sent with identifiers replaced by placeholders</span></span>
            <span class="kv-l">${routeBadge('BLOCKED')}<span>sensitive and no local model; nothing sent</span></span></div>
          <div class="mnote"><span class="caps">Why the cloud was used</span>
            ${fallbackFlag()}<span>The local model could not run.</span>
            ${escalationFlag()}<span>The local model ran, but its answer failed a check. The cloud rescued it.</span></div>
          <div class="mnote"><span class="caps">Honesty</span><span>All data is synthetic. Every number comes from a real call or a committed result file in <span class="mono">eval/results/</span>. Costs are labelled estimates.</span></div>
        </aside>
      </div>`.html;
    root.addEventListener('click', e => {
      const a = (e.target as Element).closest('[data-track]') as HTMLElement | null;
      if (a) markVisited(a.dataset.track!);
    });
  }
};
export default screen;
