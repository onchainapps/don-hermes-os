const BASE = '/api/hermes';

export async function hermesGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Hermes API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function hermesPut<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Hermes API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function hermesPost<T = any>(path: string, body?: any): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Hermes API ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function hermesDelete<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Hermes API ${res.status}: ${await res.text()}`);
  return res.json();
}
