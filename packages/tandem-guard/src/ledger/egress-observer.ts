/**
 * Egress observer.
 * Wraps globalThis.fetch for the duration of one pipeline run and records every
 * request the page dispatches: method, URL, exact body bytes and the body text
 * (when the body is a string, which is how the Firebase AI Logic SDK sends requests).
 *
 * Scope, stated honestly: this sees requests made through fetch() in this JS realm.
 * It does not see requests made by the browser itself (e.g. model downloads) or by
 * other tabs. Chrome DevTools > Network remains the independent check.
 */

export interface EgressFrame {
  method: string;
  url: string;
  host: string;
  /** Exact byte length of the request body as handed to fetch(). */
  bytes: number;
  /** Request body text as handed to fetch(), when it is a string (else undefined). */
  body?: string;
  startedAt: number;
}

export interface EgressCaptureReport {
  measuredRequests: number;
  measuredBytes: number;
  outboundEndpoints: string[];
  observedDurationMs: number;
  frames: EgressFrame[];
}

const MAX_BODY_CHARS = 200_000;

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return url; }
}

export class EgressObserver {
  private active = false;
  private frames: EgressFrame[] = [];
  private startTime = 0;
  private originalFetch: typeof globalThis.fetch | null = null;

  startCapture(): void {
    this.active = true;
    this.frames = [];
    this.startTime = performance.now();

    if (typeof globalThis.fetch !== 'function' || this.originalFetch) return;
    const self = this;
    const original = globalThis.fetch;
    this.originalFetch = original;
    globalThis.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      if (self.active) {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
        let bytes = 0;
        let body: string | undefined;
        const b = init?.body;
        if (typeof b === 'string') {
          bytes = new TextEncoder().encode(b).length;
          body = b.length > MAX_BODY_CHARS ? b.slice(0, MAX_BODY_CHARS) : b;
        } else if (b instanceof Blob) {
          bytes = b.size;
        } else if (b instanceof ArrayBuffer || ArrayBuffer.isView(b)) {
          bytes = (b as ArrayBuffer).byteLength;
        } else if (b instanceof URLSearchParams) {
          body = b.toString();
          bytes = new TextEncoder().encode(body).length;
        }
        self.frames.push({ method, url, host: hostOf(url), bytes, body, startedAt: Date.now() });
      }
      return original.call(globalThis, input as any, init);
    };
  }

  stopCapture(): EgressCaptureReport {
    this.active = false;
    if (this.originalFetch) {
      globalThis.fetch = this.originalFetch;
      this.originalFetch = null;
    }
    const frames = this.frames;
    return {
      measuredRequests: frames.length,
      measuredBytes: frames.reduce((acc, f) => acc + f.bytes, 0),
      outboundEndpoints: Array.from(new Set(frames.map(f => f.host))),
      observedDurationMs: performance.now() - this.startTime,
      frames
    };
  }
}

export const globalEgressObserver = new EgressObserver();
