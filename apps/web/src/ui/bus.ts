/** Tiny shared state for the shell: is a probe running right now (drives the spine's "running" node). */
type L = () => void;
const ls = new Set<L>();
export const probeState = {
  running: false,
  set(v: boolean) { if (v !== this.running) { this.running = v; ls.forEach(f => f()); } },
  on(f: L) { ls.add(f); return () => ls.delete(f); }
};
