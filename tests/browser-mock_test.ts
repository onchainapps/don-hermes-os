import type { MockResponse } from './types';

export interface MockResponse {
  status: number;
  body: string;
  headers: Record<string, string>;
  ok: boolean;
}

export class MockFetchRegistry {
  private handlers: Map<string, (req: any) => MockResponse | Promise<MockResponse>> = new Map();
  private openSSE: any[] = [];

  get   (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set(path, handler); }
  post  (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set(path, handler); }
  put   (path: string, handler: (body: any) => MockResponse | Promise<MockResponse>) { this.handlers.set(path, handler); }
  delete(path: string, handler: (body?: any) => MockResponse | Promise<MockResponse>) { this.handlers.set(path, handler); }

  async fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const url    = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: any;
    try { body = init?.body ? JSON.parse(init.body as string) : undefined; } catch { body = {}; }

    for (const [key, h] of this.handlers)
      if (url.startsWith(key)) {
        const res = await h(method === 'GET' || method === 'DELETE' ? {} : body);
        return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json', ...res.headers } }) as any;
      }

    return new Response(JSON.stringify({ error: `No handler for ${url}` }), {
      status: 404, headers: { 'Content-Type': 'application/json' },
    }) as any;
  }

  _registerSSE(conn: any) { this.openSSE.push(conn); }
  getSSEConnections() { return [...this.openSSE]; }
  reset() { this.handlers.clear(); this.openSSE.forEach((c: any) => c.close()); this.openSSE = []; }
}

let _reg: MockFetchRegistry | null = null;

export function setupBrowser() {
  (globalThis as any).fetch = (i: any, o?: any) => _reg!.fetch(i, o);
}

export function cleanupBrowser() { delete (globalThis as any).fetch; _reg = null; }

export function installFetchRegistry(r?: MockFetchRegistry): MockFetchRegistry {
  _reg?.reset();
  _reg = r ?? new MockFetchRegistry();
  (globalThis as any).fetch = (i: any, o?: any) => _reg!.fetch(i, o);
  return _reg;
}

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

export function stubChatCompletions(reg: MockFetchRegistry) {
  reg.post('/api/hermes/v1/chat/completions', (body: any) => ({
    status: 200, body: JSON.stringify({ choices: [{ message: { 
      role: 'assistant', content: `ack: ${body.messages?.slice(-1)[0]?.content?.slice(0, 30) ?? ''}...` 
    } }] }),
    headers: { 'Content-Type': 'application/json' }, ok: true,
  }));
}
