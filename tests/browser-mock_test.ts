

/** ──── Fundamental types ─────────────────────────────────────────────────── */

export interface MockResponse {
  status: number;
  body: string | ReadableStream<Uint8Array>;
  headers: Record<string, string>;
  ok: boolean;
  _stream?: ReadableStream<Uint8Array>;
}

/** ──── MockFetchRegistry ────────────────────────────────────────────────────
 *
 *  Replaces `globalThis.fetch` during tests.
 *  .
 *  Usage:
 *    const reg = new MockFetchRegistry();
 *    reg.post('/api/hermes/v1/chat/completions', body => ({
 *      status: 200, body: 'ok', headers: {}, ok: true,
 *    }));
 *    globalThis.fetch = (input, init) => reg.fetch(input, init);
 */

export class MockFetchRegistry {
  private handlers: Map<string, (body: any) => MockResponse | Promise<MockResponse>> = new Map();
  private openHandles: any[] = [];

  get    (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set('GET|' + path, handler); }
  post   (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set('POST|' + path, handler); }
  put    (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set('PUT|' + path, handler); }
  delete (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set('DELETE|' + path, handler); }

  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any;
    try { body = init?.body ? JSON.parse(init.body as string) : {}; } catch { body = {}; }

    // Compare pathname only — handlers are registered with '/api/...' paths,
    // fetch() is called with 'http://localhost:3001/api/...' URLs.
    const url = typeof input === 'string' ? input : input.toString();
    const pathname = (() => { try { return new URL(url).pathname; } catch { return url.split('?')[0]; } })();

    const key = `${method}|${pathname}`;
    const h = this.handlers.get(key);

    if (h) {
      const res = await h(method === 'GET' || method === 'DELETE' ? {} : body);
      if (res._stream instanceof ReadableStream) {
        return new Response(res._stream, {
          status: res.status,
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no', ...res.headers },
        }) as any;
      }
      return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...res.headers } }) as any;
    }

    // Fallback: return 501 not-implemented for unknown endpoints
    return new Response(JSON.stringify({ error: `No handler registered for ${method} ${url}` }), {
      status: 501, headers: { 'Content-Type': 'application/json' },
    }) as any;
  }

  reset() { this.handlers.clear(); this.openHandles.forEach((h: any) => h?.close?.()); this.openHandles = []; }
}

/** ──── Low-level: create an SSE ReadableStream ───────────────────────────────
 *
 *  Usage:
 *    const sse = createSSEResponse([
 *      { delta: 'Hello ', delayMs: 20 },
 *      { delta: 'world!', delayMs: 40 },
 *      { type: 'done',  delayMs: 10 },
 *    ]);
 *    const resp = new Response(sse, {
 *       headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
 *    });
 */

export interface SSEChunk {
  type: 'chunk';
  delta: string;
  delayMs: number;
}

export interface SSEDone {
  type: 'done';
  delayMs: number;
}

export interface SSEError {
  type: 'error';
  message: string;
  delayMs: number;
}

type SSEItem = SSEChunk | SSEDone | SSEError;

export function createSSEResponse(items: SSEItem[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      function pump() {
        if (cancelled) return;
        if (index >= items.length) { controller.close(); return; }
        const item = items[index++];
        const delay = item.delayMs;

        setTimeout(() => {
          if (cancelled) return;
          if (item.type === 'chunk') {
            controller.enqueue(encoder.encode(`data: ${item.delta}\n\n`));
            pump();
          } else if (item.type === 'error') {
            controller.enqueue(encoder.encode(`event: error\ndata: ${item.message}\n\n`));
            pump();
          } else if (item.type === 'done') {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            pump();
          } else {
            pump();
          }
        }, delay);
      }
      pump();
    },
    cancel() { cancelled = true; index = items.length; },
  });
}

/** ──── Low-level: convenience — build a single-shot SSE tool call response ────
 *
 *  Mirrors how the real gateway wraps assistant content in SSE:
 *    data: {"choices":[{"delta":{"content":"first "}}]}
 *  Chunks arrive 40-80ms apart, mimicking network latency.
 */

export function buildSSEToolResponse(
  toolCalls: Array<{ name: string; args: Record<string, any> }>,
  overrides: { chunkDelayMs?: number; insertErrorAt?: number } = {},
): ReadableStream<Uint8Array> {
  const chunkDelay = overrides.chunkDelayMs ?? 60;
  const errAt = overrides.insertErrorAt ?? -1;

  // Build one SSE "data:" line per tool call, rounded
  const chunks: SSEItem[] = toolCalls.map((tc, i) => {
    const delta = `[tool_call id="${i + 2025}" name="${tc.name}"]`;
    return { type: 'chunk', delta, delayMs: 20 + i * chunkDelay } as SSEChunk;
  });

  if (errAt >= 0 && errAt < chunks.length) {
    chunks.splice(errAt, 1, { type: 'error', message: 'tool failed', delayMs: 10 } as SSEError);
  }

  chunks.push({ type: 'done', delayMs: 30 } as SSEDone);
  return createSSEResponse(chunks);
}

/** ──── Browser setup / teardown ────────────────────────────────────────────── */

let _reg: MockFetchRegistry | null = null;

export function setupBrowser() {
  (globalThis as any).fetch = (i: any, o?: any) => _reg!.fetch(i, o);
}

export function cleanupBrowser() {
  delete (globalThis as any).fetch;
  _reg?.reset();
  _reg = null;
}

export function installFetchRegistry(r?: MockFetchRegistry): MockFetchRegistry {
  _reg?.reset();
  _reg = r ?? new MockFetchRegistry();
  (globalThis as any).fetch = (i: any, o?: any) => _reg!.fetch(i, o);
  return _reg;
}

/** ──── Stub helpers (used by tests) ─────────────────────────────────────────
 *
 *  These return a `MockResponse` with SSE body directly.
 *  The `stubChatCompletions` now returns SSE by default — more realistic.
 */

export function stubProfilesAPI(reg: MockFetchRegistry, profiles: Record<string, any>) {
  const mapped = Object.entries(profiles).map(([_, v]) => v);
  reg.get('/api/hermes/profiles', () => ({
    status: 200, body: JSON.stringify({ profiles: mapped }),
    headers: { 'Content-Type': 'application/json' }, ok: true,
  }));
}

export function stubModelInfo(reg: MockFetchRegistry, model: { name: string; id?: string }) {
  reg.get('/api/hermes/models', () => ({
    status: 200, body: JSON.stringify({ data: [{ id: model.id ?? model.name, name: model.name }] }),
    headers: { 'Content-Type': 'application/json' }, ok: true,
  }));
}

/** Stub chat/completions — SSE by default.
 *
 *  `makeDialoguer` controls what the assistant "says" back.
 *  If you pass a function: `contentFn: (body:any) => string`.
 *  If you pass a string (or array of strings): played back as SSE chunks.
 */
export function stubChatCompletions(
  reg: MockFetchRegistry,
  content?: ReadableStream<Uint8Array> | string | string[] | ((body: any) => string),
  opts?: { chunkDelayMs?: number },
): void {
  const delay = opts?.chunkDelayMs ?? 50;

  reg.post('/api/hermes/v1/chat/completions', (body: any) => {
    // If content is already a ReadableStream (SSE fixture), use it as-is
    const stream = (() => {
      if (content instanceof ReadableStream) return content as ReadableStream<Uint8Array>;
      const delay = opts?.chunkDelayMs ?? 50;
      let text: string;
      if (typeof content === 'function') text = content(body);
      else if (Array.isArray(content)) text = content.join('');
      else text = content ?? `ack: ${body.messages?.slice(-1)[0]?.content?.slice(0, 30) ?? ''}...`;
      return createSSEResponse([{ delta: text, delayMs: delay }]);
    })();
    return {
      status: 200, body: '', headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      }, ok: true,
      _stream: stream, // special: browser-mock fetch layer will use this if present
    } as any;
  });
}

/** ──── Advanced stub: routing by X-Hermes-Profile header ────────────────────
 *
 *  Maps profileId → SSE response so each named profile gets its own
 *  canned response, exactly matching the gateway's per-profile routing.
 */

export type ProfileResponder = (profileId: string, body: any) => MockResponse | Promise<MockResponse>;

export function stubProfileRoutedCompletions(
  reg: MockFetchRegistry,
  handlers: Map<string, SSEItem[] | ((body: any) => string | string[])>,
  opts?: { chunkDelayMs?: number },
): void {
  const delay = opts?.chunkDelayMs ?? 50;

  reg.post('/api/hermes/v1/chat/completions', (body: any) => {
    // X-Hermes-Profile header is only set when opening a named-profile chat;
    // default sends just "default" or omits it entirely
    const profileId = (body?.headers?.['X-Hermes-Profile'] ?? body?.profile ?? 'default') as string;
    const handler   = handlers.get(profileId) ?? handlers.get('default');

    if (!handler) {
      return { status: 404, body: JSON.stringify({ error: `No handler for profile ${profileId}` }), headers: { 'Content-Type': 'application/json' }, ok: false } as any;
    }

    let items: SSEItem[];
    if (typeof handler === 'function') {
      const text = handler(body);
      items = [{ type: 'chunk', delta: typeof text === 'string' ? text : text.join(''), delayMs: delay }];
    } else {
      items = handler;
    }

    const stream = createSSEResponse(items);
    return {
      status: 200, body: '', headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' }, ok: true,
      _stream: stream,
    } as any;
  });
}