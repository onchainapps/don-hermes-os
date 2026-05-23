/**
 * Don Backend — standalone Bun API server
 * Pure API with Hermes integration (no static file serving).
 *
 * Env vars:
 *   PORT          — listen port (default: 3001)
 *   HERMES_STATE_DB     — path to hermes state.db (default: ~/.hermes/state.db)
 *   GATEWAY_HOST  — Hermes gateway host (default: 127.0.0.1)
 *   GATEWAY_PORT  — Hermes gateway port (default: 8642)
 *   GATEWAY_AUTH  — Hermes gateway auth token
 *   PROJECT_NAME  — label for logs (default: don-backend)
 *
 * Run: bun run server.ts
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { cpus, freemem, totalmem, loadavg, uptime, hostname } from 'os';
import { randomBytes } from 'crypto';
import YAML from 'yaml';
import { execSync } from 'child_process';
import { Database } from 'bun:sqlite';

const PORT = parseInt(process.env.PORT || '3001');
const HERMES_STATE_DB = process.env.HERMES_STATE_DB || join(process.env.HOME || '/home/don', '.hermes/state.db');
const GATEWAY_HOST = process.env.GATEWAY_HOST || '127.0.0.1';
const GATEWAY_PORT = parseInt(process.env.GATEWAY_PORT || '8642');
const GATEWAY_AUTH = process.env.GATEWAY_AUTH || process.env.HERMES_GATEWAY_TOKEN || '';
const PROJECT_NAME = process.env.PROJECT_NAME || 'don-os-backend';

// ── WebSocket handlers (Bun native) ─────────────────────────────────────────────────────────────────────
const chatRunners = new Map<Bun.ServerWebSocket, {
  runId: string | null;
  label?: string;
  abort: AbortController;
}>();
const terminalProcs = new Map<Bun.ServerWebSocket, ReturnType<typeof Bun.spawn>>();

function handleChatUpgrade(ws: Bun.ServerWebSocket) {
  console.log('[ws] Chat connected');
  const abort = new AbortController();
  chatRunners.set(ws, { runId: null, abort });
  (ws as any).handlerType = 'chat';
}

async function handleChatMessage(ws: Bun.ServerWebSocket, msg: string | ArrayBuffer) {
  const log = (stage: string, data?: any) => {
    console.log(`[chat:${(ws as any).id || 'ws'}] ${stage}`, data ? JSON.stringify(data) : '');
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(typeof msg === 'string' ? msg : msg.toString());
    log('message_received', { type: (parsed as any)?.type });
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
    log('error', { reason: 'invalid_json' });
    return;
  }

  if (typeof parsed === 'object' && parsed !== null && 'type' in parsed) {
    // RPC proxy — forward slash commands / config to gateway
    if (parsed.type === 'rpc') {
      try {
        const method = (parsed as { method: string }).method;
        const params = (parsed as { params?: Record<string, unknown> }).params || {};
        const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/v1/rpc`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(GATEWAY_AUTH ? { Authorization: `Bearer ${GATEWAY_AUTH}` } : {}) },
          body: JSON.stringify({ method, params }),
          signal: AbortSignal.timeout(15000),
        });
        const result = await res.json();
        ws.send(JSON.stringify({ type: 'rpc_result', method, result }));
      } catch (e: unknown) {
        ws.send(JSON.stringify({ type: 'rpc_error', method: (parsed as { method: string }).method, error: (e as Error).message }));
      }
      return;
    }

    if (parsed.type === 'start' || parsed.type === 'chat') {
      chatRunners.get(ws)?.abort.abort();
      const newAbort = new AbortController();
      chatRunners.set(ws, { runId: null, abort: newAbort });

      const input = (parsed as any).input || '';
      const conversation_history = (parsed as any).conversation_history || [];
      const label = (parsed as any).label;
      const profile = (parsed as any).profile;

      log('chat_start', { inputLength: input.length, hasHistory: conversation_history.length > 0, label, profile });

      try {
        const res = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/v1/runs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(GATEWAY_AUTH ? { Authorization: `Bearer ${GATEWAY_AUTH}` } : {}) },
          body: JSON.stringify({
            input,
            conversation_history,
            label,
            profile,
          }),
          signal: newAbort.signal,
        });

        if (!res.ok) {
          ws.send(JSON.stringify({ type: 'error', message: `Gateway ${res.status}` }));
          return;
        }

        const { run_id } = await res.json();
        chatRunners.set(ws, { runId: run_id, label, abort: newAbort });
        ws.send(JSON.stringify({ type: 'run_id', run_id, label }));
        log('run_created', { run_id, label });

        // Stream events from Hermes
        log('streaming_events', { run_id });
        const evtRes = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/v1/runs/${run_id}/events`, {
          headers: GATEWAY_AUTH ? { Authorization: `Bearer ${GATEWAY_AUTH}` } : {},
          signal: newAbort.signal,
        });

        const reader = evtRes.body?.getReader();
        if (!reader) return;

        const dec = new TextDecoder();
        let buf = '';

        const runner = chatRunners.get(ws);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const j = line.slice(6);
            if (!j || j === '[DONE]') continue;

            try {
              const event = JSON.parse(j);
              const eventType = event.event || event.type;
              log('event_received', { type: eventType });

              const context = {
                label: runner?.label,
                run_id: runner?.runId || event.run_id,
              };

              // Map Hermes events to frontend-friendly format with full context
              if (eventType === 'message.delta') {
                const content = event.delta || event.content || '';
                ws.send(JSON.stringify({
                  type: 'event',
                  ...context,
                  data: { type: 'message.delta', content }
                }));
                log('event_forwarded', { type: 'message.delta', length: content.length });
              } else if (eventType === 'message.complete' || eventType === 'run.completed') {
                ws.send(JSON.stringify({
                  type: 'event',
                  ...context,
                  data: { type: 'message.complete' }
                }));
                log('event_forwarded', { type: 'message.complete' });
              } else if (eventType === 'tool.started' || eventType === 'tool.completed') {
                ws.send(JSON.stringify({
                  type: 'event',
                  ...context,
                  data: { type: eventType, ...event }
                }));
                log('event_forwarded', { type: eventType });
              } else if (eventType === 'reasoning.available') {
                ws.send(JSON.stringify({
                  type: 'event',
                  ...context,
                  data: { type: 'reasoning.available', text: event.text }
                }));
                log('event_forwarded', { type: 'reasoning.available' });
              } else {
                ws.send(JSON.stringify({
                  type: 'event',
                  ...context,
                  data: { ...event, type: eventType }
                }));
                log('event_forwarded', { type: eventType });
              }
            } catch (e) {
              log('event_parse_error', { error: (e as Error).message });
            }
          }
        }
      } catch (e: unknown) {
        if ((e as Error).name !== 'AbortError') {
          ws.send(JSON.stringify({ type: 'error', message: (e as Error).message }));
        }
      }
    } else if (parsed.type === 'cancel') {
      chatRunners.get(ws)?.abort.abort();
    }
  }
}

function handleTerminalUpgrade(ws: Bun.ServerWebSocket) {
  const proc = Bun.spawn([process.env.SHELL || '/bin/bash', '-i'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm-256color' },
    cwd: process.env.HOME || '/home/don',
  });
  terminalProcs.set(ws, proc);
  const p = proc as any;
  const readOut = () => { const r = p.stdout.getReader(); (async () => { try { while (true) { const { done, value } = await r.read(); if (done) break; ws.send(value); } } catch {} })(); };
  const readErr = () => { const r = p.stderr.getReader(); (async () => { try { while (true) { const { done, value } = await r.read(); if (done) break; ws.send(value); } } catch {} })(); };
  readOut(); readErr();
  (ws as any).handlerType = 'terminal';
}

async function handleTerminalMessage(ws: Bun.ServerWebSocket, msg: string | ArrayBuffer) {
  const proc = terminalProcs.get(ws);
  const p = proc as any;
  const s = typeof msg === 'string' ? msg : msg.toString();
  if (s[0] === '{') { try { if (JSON.parse(s).type === 'kill') { proc.kill(); return; } } catch {} }
  p.stdin.write(s);
}

const HERMES_HOME = join(process.env.HOME || '/home/don', '.hermes');
const CONFIG_PATH = join(HERMES_HOME, 'config.yaml');
const ENV_PATH = join(HERMES_HOME, '.env');
let editorContext = { filePath: '', fileName: '', language: '', projectRoot: '', updatedAt: 0 };

function getStats() {
  const cpuInfo = cpus();
  const total = totalmem();
  const free = freemem();
  const used = total - free;
  const load = loadavg();
  const up = uptime();
  const hours = Math.floor(up / 3600);
  const mins = Math.floor((up % 3600) / 60);
  const secs = Math.floor(up % 60);

  return {
    timestamp: Date.now(),
    cpu: {
      model: cpuInfo[0]?.model || 'unknown',
      cores: cpuInfo.length,
      load1: Math.round(load[0] * 100) / 100,
      load5: Math.round(load[1] * 100) / 100,
      load15: Math.round(load[2] * 100) / 100,
    },
    memory: {
      total,
      free,
      used,
      percent: parseFloat(((used / total) * 100).toFixed(1)),
    },
    system: {
      uptime: `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`,
      uptimeSeconds: Math.floor(up),
      platform: process.platform,
      arch: process.arch,
      hostname: hostname(),
    },
  };
}

function tailFile(filePath: string, lines: number): string[] {
  if (!existsSync(filePath)) return [];
  try {
    const content = readFileSync(filePath, 'utf-8');
    const allLines = content.split('\n').filter(Boolean);
    return allLines.slice(-lines);
  } catch {
    return [];
  }
}

function redactValue(value: string): string {
  if (!value || value.length <= 4) return '••••';
  return '•'.repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

function jsonOk(data: any): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' },
  });
}

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function handleRequest(req: Request): Response {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const pathname = url.pathname;
  const method = req.method;

  // Health check: verifies DB connectivity and gateway reachability
  if (pathname === '/health') {
    let dbOk = false;
    try {
      const db = new Database(HERMES_STATE_DB);
      db.query('SELECT 1').get();
      db.close();
      dbOk = true;
    } catch {}
    let gwOk = false;
    try {
      const r = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/health`, { signal: AbortSignal.timeout(3000) });
      gwOk = r.ok;
    } catch {}
    const status = dbOk && gwOk ? 'ok' : dbOk ? 'degraded' : 'unhealthy';
    return jsonOk({ status, db: dbOk, gateway: gwOk, service: 'don-os-backend', port: PORT });
  }

  // API: version info
  if (pathname === '/api/version') {
    try {
      const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
      return jsonOk({ backend: pkg.version, name: pkg.name });
    } catch {
      return jsonOk({ backend: '0.0.0', name: 'don-os-backend' });
    }
  }

  // API: system stats
  if (pathname === '/api/stats') {
    return jsonOk(getStats());
  }

  // API: gateway agent status (busy mode, model, queue)
  if (pathname === '/api/gateway/status' && req.method === 'GET') {
    try {
      const r = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/v1/agent/status`, {
        headers: GATEWAY_AUTH ? { Authorization: `Bearer ${GATEWAY_AUTH}` } : {},
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) return jsonOk(await r.json());
      // Fallback: try config.get for model info
      const cRes = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}/v1/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(GATEWAY_AUTH ? { Authorization: `Bearer ${GATEWAY_AUTH}` } : {}) },
        body: JSON.stringify({ method: 'config.get', params: { key: 'model' } }),
        signal: AbortSignal.timeout(5000),
      });
      if (cRes.ok) {
        const cj = await cRes.json();
        return jsonOk({ status: 'unknown', model: cj.result?.value ?? cj.result ?? 'unknown', busy: false });
      }
      return jsonOk({ status: 'degraded', model: 'unknown', busy: false });
    } catch {
      return jsonOk({ status: 'offline', model: 'unknown', busy: false });
    }
  }

  // API: gateway health check
  if (pathname === '/api/gateway/health') {
    const healthUrl = `http://${GATEWAY_HOST}:${GATEWAY_PORT}/health`;
    try {
      const r = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
      return jsonOk({ status: r.ok ? 'online' : 'degraded', gateway: `${GATEWAY_HOST}:${GATEWAY_PORT}` });
    } catch {
      return jsonOk({ status: 'offline', gateway: `${GATEWAY_HOST}:${GATEWAY_PORT}` });
    }
  }

  // HERMES ADMIN API
  if (pathname.startsWith('/api/hermes/')) {
    // Config
    if (pathname === '/api/hermes/config' && method === 'GET') {
      try {
        const yamlText = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf-8') : 'model: claude-3-5-sonnet';
        const config = YAML.parse(yamlText) || {};
        const cleaned: any = {};
        for (const [k, v] of Object.entries(config)) {
          if (!String(k).startsWith('_')) cleaned[k] = v;
        }
        return jsonOk(cleaned);
      } catch (e: any) {
        return jsonErr(500, e.message);
      }

    }

    if (pathname === '/api/hermes/config' && method === 'PUT') {
      {
        try {
          const body = JSON.parse(await req.text());
          if (!body.key || typeof body.key !== 'string') {
            return jsonErr(400, 'key required');
          }
          const partsCheck = body.key.split('.');
          if (partsCheck.some(p => ['__proto__', 'constructor', 'prototype'].includes(p))) {
            return jsonErr(400, 'Invalid config key');
          }
          if (!existsSync(CONFIG_PATH)) {
            return jsonErr(404, 'Config file not found');
          }
          const yamlText = readFileSync(CONFIG_PATH, 'utf-8');
          let config = YAML.parse(yamlText) || {};
          const parts = body.key.split('.');
          let obj: any = config;
          for (let i = 0; i < parts.length - 1; i++) {
            const p = parts[i];
            if (!obj[p] || typeof obj[p] !== 'object') obj[p] = {};
            obj = obj[p];
          }
          obj[parts[parts.length - 1]] = body.value;
          writeFileSync(CONFIG_PATH, YAML.stringify(config, { lineWidth: 120 }));
          return jsonOk({ ok: true });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
      }

    }

    if (pathname === '/api/hermes/config/raw' && method === 'GET') {
      try {
        const yamlText = existsSync(CONFIG_PATH) ? readFileSync(CONFIG_PATH, 'utf-8') : '# No config yet';
        return jsonOk({ yaml: yamlText });
      } catch (e: any) {
        return jsonErr(500, e.message);
      }

    }

    if (pathname === '/api/hermes/config/raw' && method === 'PUT') {
      {
        try {
          const body = JSON.parse(await req.text());
          if (!body.yaml_text) throw new Error('yaml_text required');
          YAML.parse(body.yaml_text); 
          writeFileSync(CONFIG_PATH, body.yaml_text);
          return jsonOk({ ok: true });
        } catch (e: any) {
          return jsonErr(500, e.message || 'Invalid YAML');
        }
      }

    }

    // Profile Management
    if (pathname.startsWith('/api/hermes/profiles')) {
      if (pathname === '/api/hermes/profiles' && method === 'GET') {
        try {
          // Parse `hermes gateway list` output for accurate status
          const hermesBin = `${process.env.HOME || '/home/don'}/.hermes/hermes-agent/venv/bin/hermes`;
          const output = execSync(`${hermesBin} gateway list`, {
            timeout: 10000,
            encoding: 'utf-8',
          });

          const profiles: any[] = [];
          const lines = output.split('\n').filter(l => l.trim() && !l.startsWith('Gateways:') && !l.startsWith('─'));
          const seen = new Set<string>();

          for (const line of lines) {
            // ✓ default (current) — PID 67327
            // ✗ coder-beta               — not running
            const isRunning = line.includes('✓');
            const isCurrent = line.includes('current');
            const pidMatch = line.match(/PID\s+(\d+)/);

            // Extract name: everything before the em-dash, strip emoji & (current)
            const dashIdx = line.indexOf('—');
            let name = dashIdx > 0 ? line.slice(0, dashIdx).trim() : line.trim();
            name = name.replace(/[✓✗]\s*/, '').replace(/\(current\)/g, '').trim();
            if (!name || seen.has(name)) continue;
            seen.add(name);

            const profileDir = `${process.env.HOME || '/home/don'}/.hermes/profiles/${name}`;
            const configPath = `${profileDir}/config.yaml`;

            let gatewayPort: number | null = null;
            let apiKey: string | null = null;

            try {
              // First try config.yaml
              if (existsSync(configPath)) {
                const configContent = readFileSync(configPath, 'utf-8');
                const portMatch = configContent.match(/gateway:\s*[\s\S]*?port:\s*(\d+)/);
                if (portMatch) gatewayPort = parseInt(portMatch[1]);
              }

              // Fallback to .env
              const envPath = `${profileDir}/.env`;
              if (existsSync(envPath)) {
                const envContent = readFileSync(envPath, 'utf-8');

                if (!gatewayPort) {
                  const portMatch = envContent.match(/API_SERVER_PORT=(\d+)/);
                  if (portMatch) gatewayPort = parseInt(portMatch[1]);
                }

                const keyMatch = envContent.match(/API_SERVER_KEY=([^\n\r]+)/);
                if (keyMatch) apiKey = keyMatch[1].trim();
              }
            } catch (e) {
              // ignore read errors
            }

            profiles.push({
              name,
              status: isRunning ? 'active' : 'standby',
              current: isCurrent,
              pid: pidMatch ? parseInt(pidMatch[1]) : null,
              gatewayPort,
              apiKey,
            });
          }

          return jsonOk({ profiles });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
  
      }

      if (pathname === '/api/hermes/profiles/create' && method === 'POST') {
        {
          try {
            const body = JSON.parse(await req.text());
            if (!body.name) {
              return jsonErr(400, 'Name required');
            }

            const name = body.name.trim();
            if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
              return jsonErr(400, 'Profile name can only contain letters, numbers, underscores and hyphens');
            }

            const description = body.description || '';
            const soulContent = body.soul || '';
            const template = body.template || 'default';

            // 1. Create the profile (clone from don-template if it exists, otherwise fresh)
            const profileDir = `${process.env.HOME || '/home/don'}/.hermes/profiles/${name}`;

            if (existsSync(profileDir)) {
              return jsonErr(409, `Profile "${name}" already exists`);
            }

            const templateName = template || 'default';
            const templateDir = `${process.env.HOME || '/home/don'}/.hermes/profiles/${templateName}`;
            const hasTemplate = existsSync(templateDir) && templateName !== 'default';

            if (hasTemplate) {
              execSync(`hermes profile create ${JSON.stringify(name)} --clone --clone-from ${JSON.stringify(templateName)} --no-alias`, {
                timeout: 30000,
                encoding: 'utf-8',
              });
            } else {
              execSync(`hermes profile create ${JSON.stringify(name)} --no-alias`, {
                timeout: 30000,
                encoding: 'utf-8',
              });
            }

            // 2. Write SOUL.md if provided
            if (soulContent) {
              writeFileSync(`${profileDir}/SOUL.md`, soulContent);
            }

            // 3. Set up .env with unique port + fresh API key
            const templateEnvPath = `${process.env.HOME || '/home/don'}/.hermes/profiles/${templateName}/.env`;
            const newEnvPath = `${profileDir}/.env`;

            // Generate a new strong API key
            const newApiKey = randomBytes(32).toString('hex');

            // Assign a unique port (starting from 8650)
            const usedPorts = new Set();
            try {
              const allProfiles = readdirSync(`${process.env.HOME || '/home/don'}/.hermes/profiles`);
              for (const p of allProfiles) {
                const pEnv = `${process.env.HOME || '/home/don'}/.hermes/profiles/${p}/.env`;
                if (existsSync(pEnv)) {
                  const content = readFileSync(pEnv, 'utf-8');
                  const portMatch = content.match(/API_SERVER_PORT=(\d+)/);
                  if (portMatch) usedPorts.add(parseInt(portMatch[1]));
                }
              }
            } catch (_) {}

            let newPort = 8650;
            while (usedPorts.has(newPort)) newPort++;

            if (hasTemplate && existsSync(templateEnvPath)) {
              // Clone from template: copy .env and mutate port + key
              let envContent = readFileSync(templateEnvPath, 'utf-8');
              if (envContent.includes('API_SERVER_KEY=')) {
                envContent = envContent.replace(/API_SERVER_KEY=.*/g, `API_SERVER_KEY=${newApiKey}`);
              } else {
                envContent += `\nAPI_SERVER_KEY=${newApiKey}`;
              }
              if (envContent.includes('API_SERVER_PORT=')) {
                envContent = envContent.replace(/API_SERVER_PORT=.*/g, `API_SERVER_PORT=${newPort}`);
              } else {
                envContent += `\nAPI_SERVER_PORT=${newPort}`;
              }
              // Regenerate CORS_ORIGINS with auto-detected IP + actual ports
              let localIp = '127.0.0.1';
              try {
                const ipResult = execSync('hostname -I', { timeout: 2000, encoding: 'utf-8' });
                const ips = ipResult.trim().split(/\s+/).filter(ip => ip.includes('.'));
                if (ips.length > 0) localIp = ips[0];
              } catch (_) {}
              const backendPort = process.env.PORT || '3001';
              const frontendPort = body.corsPorts || '3001,3002';  // comma-sep, from request
              const corsPorts = String(frontendPort).split(',');
              const corsIps = [localIp, 'localhost', '127.0.0.1'];
              const corsOrigins = [];
              for (const ip of corsIps) {
                for (const cp of corsPorts) {
                  corsOrigins.push(`http://${ip}:${cp.trim()}`);
                }
              }
              if (envContent.includes('API_SERVER_CORS_ORIGINS=')) {
                envContent = envContent.replace(/API_SERVER_CORS_ORIGINS=.*/g, `API_SERVER_CORS_ORIGINS=${corsOrigins}`);
              }
              writeFileSync(newEnvPath, envContent);
            } else {
              // No template: generate fresh .env with defaults
              // Auto-detect local IP + actual ports for CORS origins
              let localIp = '127.0.0.1';
              try {
                const ipResult = execSync('hostname -I', { timeout: 2000, encoding: 'utf-8' });
                const ips = ipResult.trim().split(/\s+/).filter(ip => ip.includes('.'));
                if (ips.length > 0) localIp = ips[0];
              } catch (_) {}
              const corsPortsNt = (body.corsPorts || '3001,3002').split(',');
              const corsIpsNt = [localIp, 'localhost', '127.0.0.1'];
              const corsOrigins = [];
              for (const ip of corsIpsNt) {
                for (const cp of corsPortsNt) {
                  corsOrigins.push(`http://${ip}:${cp.trim()}`);
                }
              }

              writeFileSync(newEnvPath, [
                '#API SERVER SETTINGS',
                'API_SERVER_ENABLED=true',
                'API_SERVER_HOST=0.0.0.0',
                `API_SERVER_PORT=${newPort}`,
                `API_SERVER_KEY=${newApiKey}`,
                `API_SERVER_CORS_ORIGINS=${corsOrigins}`,
                'API_SERVER_CORS_ALLOWED_HEADERS=*',
                'API_SERVER_CORS_EXPOSE_HEADERS=*',
                '',
                '# COMMON SETTINGS',
                'LLM_MODEL=',
                'DEFAULT_MODEL=',
                'TERMINAL_TIMEOUT=60',
                'TERMINAL_LIFETIME_SECONDS=300',
                'BROWSER_SESSION_TIMEOUT=300',
                'BROWSER_INACTIVITY_TIMEOUT=120',
                '',
                '# GATEWAY',
                'GATEWAY_HOST=127.0.0.1',
                'GATEWAY_PORT=8642',
                'GATEWAY_AUTH=',
              ].join('\n') + '\n');
            }
            if (description) {
              const configPath = `${profileDir}/config.yaml`;
              let config = '';

              if (existsSync(configPath)) {
                config = readFileSync(configPath, 'utf-8');
              }

              // Append or update profile description
              const profileSection = `\nprofile:\n  name: ${name}\n  description: "${description.replace(/"/g, '\\"')}"\n`;

              if (!config.includes('profile:')) {
                config += profileSection;
              } else {
                // Simple replacement if profile section already exists
                config = config.replace(/profile:[\s\S]*?(?=\n\w|$)/, profileSection.trim());
              }

              writeFileSync(configPath, config);
            }

            // 4. Set up isolated gateway using hermes -p (reliable, no PATH dependency)
            let gatewayStatus = 'failed';

            try {
              // Install may fail if service already exists — that's fine
              try {
                execSync(`hermes -p ${JSON.stringify(name)} gateway install`, {
                  timeout: 60000,
                  encoding: 'utf-8',
                  stdio: 'pipe',
                });
              } catch (installErr) {
                // ignore - service probably already installed
              }

              execSync(`hermes -p ${JSON.stringify(name)} gateway start`, {
                timeout: 30000,
                encoding: 'utf-8',
                stdio: 'pipe',
              });

              gatewayStatus = 'installed_and_started';
            } catch (gwErr: any) {
              console.error(`[profiles/create] gateway setup failed for ${name}:`, gwErr.message);
              gatewayStatus = 'install_failed';
            }

            return jsonOk({
              ok: true,
              name,
              description,
              gatewayStatus,
              message: gatewayStatus === 'installed_and_started'
                ? `Profile ${name} created with gateway installed and started`
                : `Profile ${name} created (gateway setup had issues)`,
            });
          } catch (e: any) {
            return jsonErr(500, e.message);
          }
        }
  
      }

      if (pathname === '/api/hermes/profiles/delete' && method === 'DELETE') {
        try {
          const name = url.searchParams.get('name');
          if (!name) { return jsonErr(400, 'Name required'); return; }

          execSync(`hermes profile delete -y ${JSON.stringify(name)}`, {
            timeout: 30000,
            encoding: 'utf-8',
          });
          return jsonOk({ ok: true, name });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
  
      }

      if (pathname === '/api/hermes/profiles/start' && method === 'POST') {
        {
          try {
            const body = JSON.parse(await req.text());
            if (!body.name) {
              return jsonErr(400, 'Name required');
            }

            const name = body.name;

            // Activate the profile's own gateway using hermes -p (reliable)
            try {
              // Install with automated answers to the two prompts
              try {
                execSync(`printf "Y\nY\n" | hermes -p ${JSON.stringify(name)} gateway install --force`, {
                  timeout: 120000,
                  encoding: 'utf-8',
                  stdio: 'pipe',
                });
              } catch (installErr: any) {
                // Ignore if already installed or minor issues
                console.log(`[profiles/start] install note for ${name}:`, installErr.message?.split('\n')[0]);
              }

              // Start the gateway service
              execSync(`hermes -p ${JSON.stringify(name)} gateway start`, {
                timeout: 30000,
                encoding: 'utf-8',
                stdio: 'pipe',
              });

              // Short delay to let gateway finish initializing before status check
              await Bun.sleep(2500);
            } catch (gwErr: any) {
              console.error(`[profiles/start] gateway activation failed for ${name}:`, gwErr.message);
              return jsonErr(500, `Failed to start gateway: ${gwErr.message}`);
            }

            // Get status using the profile's command
            const statusOutput = execSync(`${name} gateway status 2>/dev/null || echo "started"`, {
              timeout: 10000,
              encoding: 'utf-8',
            });

            return jsonOk({
              ok: true,
              name,
              message: 'Profile gateway started successfully',
            });
          } catch (e: any) {
            return jsonErr(500, e.message || 'Failed to start profile');
          }
        }
      }

      if (pathname === '/api/hermes/profiles/stop' && method === 'POST') {
        {
          try {
            const body = JSON.parse(await req.text());
            if (!body.name) {
              return jsonErr(400, 'Name required');
            }

            // Stop the profile's gateway service (if it has one)
            execSync(`systemctl --user stop hermes-gateway-${body.name}.service || true`, {
              timeout: 15000,
              encoding: 'utf-8',
            });

            // Switch back to default
            execSync(`hermes profile use "default"`, {
              timeout: 10000,
              encoding: 'utf-8',
            });

            return jsonOk({ ok: true, message: `Stopped ${body.name} gateway and switched to default` });
          } catch (e: any) {
            return jsonErr(500, e.message);
          }
        }
  
      }

      // Profile Details (skills + SOUL.md)
      if (pathname.startsWith('/api/hermes/profiles/') && pathname.endsWith('/details') && method === 'GET') {
        try {
          const name = url.searchParams.get('name');
          if (!name) { return jsonErr(400, 'Name required'); return; }

          // "default" resolves to the root ~/.hermes, not ~/.hermes/profiles/default
          const profileDir = name === 'default' ? HERMES_HOME : join(HERMES_HOME, 'profiles', name);
          const soulPath = join(profileDir, 'SOUL.md');
          const skillsDir = join(profileDir, 'skills');

          let soulExcerpt = '';
          let soulContent = '';
          if (existsSync(soulPath)) {
            try {
              const soul = readFileSync(soulPath, 'utf-8');
              soulContent = soul;
              // Get first 200 chars as description
              soulExcerpt = soul.split('\n').slice(0, 3).join(' ').trim().slice(0, 200);
            } catch {}
          }

          const skills: string[] = [];
          if (existsSync(skillsDir)) {
            try {
              for (const entry of readdirSync(skillsDir)) {
                if (entry.startsWith('.')) continue;
                const stat = readdirSync(join(skillsDir, entry)).length > 0 || true;
                if (stat) {
                  skills.push(entry);
                }
              }
            } catch {}
          }

          // Global skills (shared with all profiles)
          const globalSkillsDir = join(HERMES_HOME, 'skills');
          const globalSkills: string[] = [];
          if (existsSync(globalSkillsDir)) {
            try {
              for (const entry of readdirSync(globalSkillsDir)) {
                if (entry.startsWith('.')) continue;
                globalSkills.push(entry);
              }
            } catch {}
          }

          return jsonOk({
            name,
            soulExcerpt,
            soulContent,
            skills,
            globalSkills,
            skillCount: skills.length,
            globalSkillCount: globalSkills.length
          });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
  
      }

      // Profile config raw YAML
      if (pathname === '/api/hermes/profiles/config/raw' && method === 'GET') {
        try {
          const name = url.searchParams.get('name');
          if (!name) { return jsonErr(400, 'Name required'); return; }
          const configPath = name === 'default'
            ? join(HERMES_HOME, 'config.yaml')
            : join(HERMES_HOME, 'profiles', name, 'config.yaml');
          const yaml = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '# No config yet';
          return jsonOk({ yaml });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
  
      }

      if (pathname === '/api/hermes/profiles/config/raw' && method === 'PUT') {
        try {
          const name = url.searchParams.get('name');
          if (!name) { return jsonErr(400, 'Name required'); return; }
          const body = JSON.parse(await req.text());
          if (!body.yaml_text) throw new Error('yaml_text required');
          const configPath = name === 'default'
            ? join(HERMES_HOME, 'config.yaml')
            : join(HERMES_HOME, 'profiles', name, 'config.yaml');
          // Validate YAML before writing
          YAML.parse(body.yaml_text);
          writeFileSync(configPath, body.yaml_text);
          return jsonOk({ ok: true });
        } catch (e: any) {
          return jsonErr(500, e.message || 'Invalid YAML');
        }
  
      }
    }


      // Profile .env — raw text, respects "default" = root ~/.hermes
      if (pathname === '/api/hermes/profiles/env' && method === 'GET') {
        const name = url.searchParams.get('name');
        if (!name) return jsonErr(400, 'name required');
        const envPath = name === 'default'
          ? join(HERMES_HOME, '.env')
          : join(HERMES_HOME, 'profiles', name, '.env');
        const text = existsSync(envPath) ? readFileSync(envPath, 'utf-8') : '';
        return jsonOk({ env: text });
      }

      if (pathname === '/api/hermes/profiles/env' && method === 'PUT') {
        const name = url.searchParams.get('name');
        if (!name) return jsonErr(400, 'name required');
        const envPath = name === 'default'
          ? join(HERMES_HOME, '.env')
          : join(HERMES_HOME, 'profiles', name, '.env');
        const body = JSON.parse(await req.text());
        writeFileSync(envPath, body.env ?? '');
        return jsonOk({ ok: true });
      }

      // Profile SOUL.md — raw text read/write, respects "default" = root ~/.hermes
      if (pathname === '/api/hermes/profiles/soul' && method === 'GET') {
        const name = url.searchParams.get('name');
        if (!name) return jsonErr(400, 'name required');
        const soulPath = name === 'default'
          ? join(HERMES_HOME, 'SOUL.md')
          : join(HERMES_HOME, 'profiles', name, 'SOUL.md');
        const text = existsSync(soulPath) ? readFileSync(soulPath, 'utf-8') : '';
        return jsonOk({ content: text });
      }

      if (pathname === '/api/hermes/profiles/soul' && method === 'PUT') {
        const name = url.searchParams.get('name');
        if (!name) return jsonErr(400, 'name required');
        const soulPath = name === 'default'
          ? join(HERMES_HOME, 'SOUL.md')
          : join(HERMES_HOME, 'profiles', name, 'SOUL.md');
        const body = JSON.parse(await req.text());
        if (body.content !== undefined) writeFileSync(soulPath, body.content);
        return jsonOk({ ok: true });
      }

      // Env Management

      if (pathname === '/api/hermes/env' && method === 'GET') {
      try {
        const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
        const vars: any[] = [];
        for (const line of envText.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx === -1) continue;
          const key = trimmed.slice(0, eqIdx).trim();
          const value = trimmed.slice(eqIdx + 1).trim();
          vars.push({
            key,
            value: redactValue(value),
            is_set: value.length > 3,
            category: (key.includes('API_KEY') || key.includes('TOKEN')) ? 'tool' : 'setting',
          });
        }
        return jsonOk({ vars });
      } catch (e: any) {
        return jsonErr(500, e.message);
      }

    }

    if (pathname === '/api/hermes/env' && method === 'PUT') {
      {
        try {
          const body = JSON.parse(await req.text());
          let envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
          const lines = envText.split('\n');
          const prefix = body.key + '=';
          let found = false;
          const updated = lines.map(line => {
            if (line.trim().startsWith(prefix)) {
              found = true;
              return `${body.key}=${body.value || ''}`;
            }
            return line;
          });
          if (!found) updated.push(`${body.key}=${body.value || ''}`);
          writeFileSync(ENV_PATH, updated.join('\n').trim() + '\n');
          return jsonOk({ ok: true, key: body.key });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
      }

    }

    if (pathname === '/api/hermes/env' && method === 'DELETE') {
      try {
        const key = url.searchParams.get('key');
        if (!key) { return jsonErr(400, 'key required'); return; }
        if (!existsSync(ENV_PATH)) { return jsonOk({ ok: true, key }); return; }
        const envText = readFileSync(ENV_PATH, 'utf-8');
        const lines = envText.split('\n').filter(line => !line.trim().startsWith(key + '='));
        writeFileSync(ENV_PATH, lines.join('\n').trim() + '\n');
        return jsonOk({ ok: true, key });
      } catch (e: any) {
        return jsonErr(500, e.message);
      }

    }
  }

  // Editor Context
  if (pathname === '/api/editor-context') {
    if (method === 'GET') return jsonOk(editorContext);
    else if (method === 'POST') {
      try {
        const ctx = JSON.parse(await req.text());
        editorContext = { ...editorContext, ...ctx, updatedAt: Date.now() };
        return jsonOk(editorContext);
      } catch { return jsonErr(400, 'Invalid JSON'); }
    }

  }

  // Sessions API
  if (pathname.startsWith('/api/sessions')) {
    try {
      const profileParam = url.searchParams.get('profile') || undefined;

      const resolveStateDb = (prof?: string): string => {
        // Treat "default", empty, or undefined as the main Hermes DB
        if (!prof || prof.toLowerCase() === 'default') {
          return HERMES_STATE_DB;
        }
        return join(process.env.HOME || '/home/don', `.hermes/profiles/${prof}/state.db`);
      };

      const stateDbPath = resolveStateDb(profileParam);

      // GET /api/sessions?limit=100&source=&profile=
      if (pathname === '/api/sessions' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '100');
        const source = url.searchParams.get('source');
        
        const db = new Database(stateDbPath);
        let query = `SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, input_tokens, output_tokens, estimated_cost_usd, title FROM sessions WHERE 1=1`;
        const params: any[] = [];
        
        if (source) {
          query += ` AND source = ?`;
          params.push(source);
        }
        
        query += ` ORDER BY started_at DESC LIMIT ?`;
        params.push(limit);
        
        const sessions = db.query(query).all(...params);
        db.close();
        
        return jsonOk({ sessions, total: sessions.length });
      }
      
      // GET /api/sessions/clustered?limit=200
      if (pathname === '/api/sessions/clustered' && method === 'GET') {
        const limit = parseInt(url.searchParams.get('limit') || '200');
        const db = new Database(HERMES_STATE_DB);
        
        const sessions = db.query(`SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, input_tokens, output_tokens, estimated_cost_usd, title FROM sessions ORDER BY started_at DESC LIMIT ?`).all(limit);
        db.close();
        
        // Simple clustering: group by title
        const clusters: any[] = [];
        const seen = new Set<string>();
        for (const s of sessions) {
          const title = s.title || 'Untitled';
          if (!seen.has(title)) {
            seen.add(title);
            clusters.push({
              root: s,
              children: [],
              title
            });
          } else {
            const cluster = clusters.find(c => c.title === title);
            if (cluster) cluster.children.push(s);
          }
        }
        
        return jsonOk({ clusters });
      }
      
      // GET /api/sessions/search?q=test&limit=30
      if (pathname === '/api/sessions/search' && method === 'GET') {
        const q = url.searchParams.get('q') || '';
        const limit = parseInt(url.searchParams.get('limit') || '30');
        const db = new Database(stateDbPath);

        const sessions = db.query(`SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, input_tokens, output_tokens, estimated_cost_usd, title FROM sessions WHERE title LIKE ? OR id LIKE ? ORDER BY started_at DESC LIMIT ?`).all(`%${q}%`, `%${q}%`, limit);
        db.close();

        return jsonOk({ sessions, total: sessions.length, profile: profileParam || 'default' });
      }
      
      // GET /api/sessions/:id/messages?limit=50&profile=
      const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/messages$/);
      if (sessionMatch && method === 'GET') {
        const sessionId = sessionMatch[1];
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const db = new Database(stateDbPath);

        const messages = db.query(`
          SELECT role, content, tool_name, timestamp 
          FROM messages 
          WHERE session_id = ? 
          ORDER BY timestamp DESC 
          LIMIT ?
        `).all(sessionId, limit);
        db.close();

        const formattedMessages = messages.reverse().map((m: any) => ({
          ...m,
          created_at: m.timestamp
        }));

        return jsonOk({ messages: formattedMessages, profile: profileParam || 'default' });
      }
      
      // GET /api/sessions/:id
      const sessionIdMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
      if (sessionIdMatch && method === 'GET') {
        const sessionId = sessionIdMatch[1];
        const db = new Database(HERMES_STATE_DB);
        
        const session = db.query(`SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, input_tokens, output_tokens, estimated_cost_usd, title FROM sessions WHERE id = ?`).get(sessionId);
        db.close();
        
        if (!session) {
          return jsonErr(404, 'Session not found');
        }
        
        return jsonOk(session);
      }
      
      return jsonErr(404, `Unknown sessions endpoint: ${pathname}`);
    } catch (e: any) {
      return jsonErr(500, e.message);
    }
  }
  
  // Cron Jobs API
  if (pathname.startsWith('/api/jobs')) {
    try {
      // GET /api/jobs
      if (pathname === '/api/jobs' && method === 'GET') {
        try {
          const output = execSync('hermes cron list 2>/dev/null', { timeout: 5000 }).toString();
          const jobs: any[] = [];
          const blocks = output.split(/\n\s*\n/);
          
          for (const block of blocks) {
            const idMatch = block.match(/([a-f0-9]+)\s+\[(active|paused)\]/);
            if (!idMatch) continue;
            
            const job: any = { id: idMatch[1], enabled: idMatch[2] === 'active' };
            const nameMatch = block.match(/Name:\s*(.+)/);
            if (nameMatch) job.name = nameMatch[1].trim();
            const scheduleMatch = block.match(/Schedule:\s*(.+)/);
            if (scheduleMatch) job.schedule = scheduleMatch[1].trim();
            const deliverMatch = block.match(/Deliver:\s*(.+)/);
            if (deliverMatch) job.deliver = deliverMatch[1].trim();
            const lastRunMatch = block.match(/Last run:\s*(.+)/);
            if (lastRunMatch) job.last_run = lastRunMatch[1].trim();
            const nextRunMatch = block.match(/Next run:\s*(.+)/);
            if (nextRunMatch) job.next_run = nextRunMatch[1].trim();
            
            jobs.push(job);
          }
          
          return jsonOk({ jobs });
        } catch (e: any) {
          return jsonOk({ jobs: [] });
        }
  
      }
      
      // POST /api/jobs (create)
      if (pathname === '/api/jobs' && method === 'POST') {
        {
          try {
            const body = JSON.parse(await req.text());
            const args = [
              'cron', 'create',
              '--name', body.name,
              '--schedule', body.schedule,
              '--prompt', body.prompt,
              '--deliver', body.deliver || 'local'
            ];
            execSync(`hermes ${args.join(' ')} 2>&1`, { timeout: 10000 });
            return jsonOk({ success: true });
          } catch (e: any) {
            return jsonErr(500, e.message);
          }
        }
  
      }
      
      // DELETE /api/jobs/:id
      const deleteMatch = pathname.match(/^\/api\/jobs\/([^/]+)$/);
      if (deleteMatch && method === 'DELETE') {
        const jobId = deleteMatch[1];
        try {
          execSync(`hermes cron remove --job-id ${jobId} 2>&1`, { timeout: 10000 });
          return jsonOk({ success: true });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
  
      }
      
      // POST /api/jobs/:id/pause|resume|run
      const actionMatch = pathname.match(/^\/api\/jobs\/([^/]+)\/(pause|resume|run)$/);
      if (actionMatch && method === 'POST') {
        const jobId = actionMatch[1];
        const action = actionMatch[2];
        try {
          execSync(`hermes cron ${action} --job-id ${jobId} 2>&1`, { timeout: 10000 });
          return jsonOk({ success: true });
        } catch (e: any) {
          return jsonErr(500, e.message);
        }
  
      }
      
      return jsonErr(404, `Unknown jobs endpoint: ${pathname}`);
    } catch (e: any) {
      return jsonErr(500, e.message);
    }
  }

  // Projects API
  if (pathname === '/api/projects' && method === 'GET') {
    try {
      const devDir = join(process.env.HOME || '/home/don', 'dev');
      const projects: any[] = [];
      for (const entry of readdirSync(devDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const path = join(devDir, entry.name);
          const hasGit = existsSync(join(path, '.git'));
          const hasPackage = existsSync(join(path, 'package.json'));
          projects.push({
            name: entry.name,
            path,
            hasGit,
            hasPackage
          });
        }
      }
      return jsonOk({ projects });
    } catch (e: any) {
      return jsonErr(500, e.message);
    }

  }
  
  // File tree API
  if (pathname === '/api/files' && method === 'GET') {
    try {
      const targetPath = decodeURIComponent(url.searchParams.get('path') || process.env.HOME || '/home/don');
      const entries: any[] = [];
      for (const entry of readdirSync(targetPath, { withFileTypes: true })) {
        entries.push({
          name: entry.name,
          path: join(targetPath, entry.name),
          isDirectory: entry.isDirectory()
        });
      }
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return jsonOk({ files: entries });
    } catch (e: any) {
      return jsonErr(500, e.message);
    }

  }
  
  // Git status API
  if (pathname === '/api/git/status' && method === 'GET') {
    try {
      const repo = decodeURIComponent(url.searchParams.get('repo') || '');
      const output = execSync(`git -C ${repo} status --porcelain 2>/dev/null || echo ""`, { timeout: 5000 }).toString();
      const branches = execSync(`git -C ${repo} branch --show-current 2>/dev/null || echo "detached"`, { timeout: 5000 }).toString().trim();
      const staged: string[] = [];
      const unstaged: string[] = [];
      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const status = line.substring(0, 2);
        const file = line.substring(3);
        if (status[0] !== ' ') staged.push(file);
        else unstaged.push(file);
      }
      return jsonOk({ branch: branches, staged, unstaged });
    } catch (e: any) {
      return jsonErr(500, e.message);
    }

  }
  
  // Project root detection API
  if (pathname === '/api/project-root' && method === 'GET') {
    try {
      let current = decodeURIComponent(url.searchParams.get('path') || '');
      while (current !== '/') {
        if (existsSync(join(current, '.git'))) {
          return jsonOk({ root: current });
        }
        current = join(current, '..');
      }
      return jsonOk({ root: null });
    } catch (e: any) {
      return jsonErr(500, e.message);
    }

  }
  
  // Gateway proxy - forwards requests to Hermes gateway (GET, POST)
  if (pathname.startsWith('/api/gateway/') && (method === 'POST' || method === 'GET')) {
    try {
      const gatewayPath = pathname.replace('/api/gateway', '');
      
      const incomingSessionId = req.headers.get('x-hermes-session-id');
      const proxyHeaders: Record<string, string> = {
        ...(GATEWAY_AUTH ? { 'Authorization': `Bearer ${GATEWAY_AUTH}` } : {}),
      };
      if (incomingSessionId) {
        proxyHeaders['X-Hermes-Session-Id'] = incomingSessionId;
      }

      const proxyOpts: any = {
        method,
        headers: proxyHeaders,
      };

      // POST requests carry a body; GET requests do not
      if (method === 'POST') {
        proxyOpts.body = await req.text();
        proxyHeaders['Content-Type'] = 'application/json';
      }

      const proxyRes = await fetch(`http://${GATEWAY_HOST}:${GATEWAY_PORT}${gatewayPath}`, proxyOpts);
      
      const responseHeaders: Record<string, string> = {};
      // Set proper content type based on upstream response
      const upstreamContentType = proxyRes.headers.get('content-type') || '';
      if (upstreamContentType.includes('text/event-stream') || gatewayPath.includes('/events')) {
        responseHeaders['Content-Type'] = 'text/event-stream';
        responseHeaders['Cache-Control'] = 'no-cache';
        responseHeaders['Connection'] = 'keep-alive';
      } else {
        responseHeaders['Content-Type'] = upstreamContentType || 'application/json';
      }
      
      const sessionId = proxyRes.headers.get('x-hermes-session-id');
      if (sessionId) responseHeaders['X-Hermes-Session-Id'] = sessionId;
      
      return new Response(proxyRes.body, { status: proxyRes.status, headers: responseHeaders });
    } catch (e: any) {
      return jsonErr(500, e.message);
    }
  }

  // ─── Static file serving (production dist) ──────────────────────────────
  // Serve built frontend from dist/ folder. Falls through to API routes for
  // /api/* and /ws/* paths.
  const DIST_PATH = process.env.DIST_PATH || join(__dirname, '../don-os-frontend/dist');
  const isStaticRequest = !pathname.startsWith('/api/') && pathname !== '/ws/chat' && !pathname.startsWith('/ws/');
  
  if (isStaticRequest) {
    let filePath = join(DIST_PATH, pathname === '/' ? 'index.html' : pathname);
    // Check if file exists and is a file (not directory)
    try {
      const stat = statSync(filePath);
      if (stat.isFile()) {
        // Determine content type
        let contentType = 'application/octet-stream';
        if (filePath.endsWith('.html')) contentType = 'text/html';
        else if (filePath.endsWith('.css')) contentType = 'text/css';
        else if (filePath.endsWith('.js')) contentType = 'application/javascript';
        else if (filePath.endsWith('.json')) contentType = 'application/json';
        else if (filePath.endsWith('.png')) contentType = 'image/png';
        else if (filePath.endsWith('.svg')) contentType = 'image/svg+xml';
        else if (filePath.endsWith('.ico')) contentType = 'image/x-icon';
        
        return new Response(readFileSync(filePath), { status: 200, headers: { 'Content-Type': contentType } });
      }
    } catch {
      // File not found — fall through to 404
    }
  }

  // ── Dynamic Gateway Proxy (profile-aware) ──────────────────────────────
  // Routes requests to the correct profile gateway based on X-Hermes-Profile header.
  // Reads the profile's .env for port and API key. Handles streaming transparently.
  if (pathname.startsWith('/gp/')) {
    return handleGatewayProxy(req, pathname);
  }

  return jsonErr(404, `Unknown endpoint: ${pathname}`);
}

// ─── Gateway Proxy Function ─────────────────────────────────────────────
// Proxies to a profile's own gateway, reading port + auth key from its .env.

const PROFILE_BASE_DIR = join(process.env.HOME || '/home/don', '.hermes/profiles');

function readProfileEnv(profileName: string): { port?: string; key?: string } {
  const envPath = join(PROFILE_BASE_DIR, profileName, '.env');
  if (!existsSync(envPath)) return {};
  const content = readFileSync(envPath, 'utf-8');
  // Parse line by line, last occurrence wins (supports env files with override order)
  const lines = content.split('\n');
  let port: string | undefined;
  let key: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const portMatch = trimmed.match(/^API_SERVER_PORT=(\d+)/);
    if (portMatch) port = portMatch[1];
    const keyMatch = trimmed.match(/^API_SERVER_KEY=(\S+)/);
    if (keyMatch) key = keyMatch[1];
  }
  return { port, key };
}

async function handleGatewayProxy(req: Request, pathname: string): Promise<Response> {
  const profileName = req.headers.get('X-Hermes-Profile');
  const targetPath = pathname.replace(/^\/gp/, '');

  let targetHost = GATEWAY_HOST;
  let targetPort = GATEWAY_PORT;
  let authKey = GATEWAY_AUTH;

  if (profileName) {
    const profile = readProfileEnv(profileName);
    if (profile.port) {
      targetPort = parseInt(profile.port);
      // Use the same GATEWAY_HOST for profile-specific ports
      targetHost = GATEWAY_HOST;
    }
    if (profile.key) {
      authKey = profile.key;
    }
  }

  // Default/no-profile: read API_SERVER_KEY from root ~/.hermes/.env
  // (HERMES_GATEWAY_TOKEN is the gateway's own auth, not the API key clients use)
  if (!profileName || authKey === GATEWAY_AUTH) {
    try {
      const rootEnv = readFileSync(`${process.env.HOME || '/home/don'}/.hermes/.env`, 'utf-8');
      const keyMatch = rootEnv.match(/^API_SERVER_KEY=(.+)/m);
      if (keyMatch) authKey = keyMatch[1].trim();
    } catch (_) {}
  }

  const targetUrl = `http://${targetHost}:${targetPort}${targetPath}`;

  // Build proxied headers — strip routing headers, add auth
  const proxyHeaders = new Headers(req.headers);
  proxyHeaders.delete('X-Hermes-Profile');
  proxyHeaders.delete('host');
  if (authKey) {
    proxyHeaders.set('Authorization', `Bearer ${authKey}`);
  }

  try {
    const timeout = targetPath.includes('/events') ? undefined : 120000;
    const signal = timeout ? AbortSignal.timeout(timeout) : undefined;

    const proxyRes = await fetch(targetUrl, {
      method: req.method,
      headers: proxyHeaders,
      body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
      signal,
    });

    // For streaming endpoints (SSE), preserve the response body as-is
    const corsHeaders = new Headers(proxyRes.headers);
    corsHeaders.set('Access-Control-Allow-Origin', '*');
    corsHeaders.set('Access-Control-Allow-Headers', '*');
    return new Response(proxyRes.body, {
      status: proxyRes.status,
      statusText: proxyRes.statusText,
      headers: corsHeaders,
    });
  } catch (e: any) {
    console.error(`[gateway-proxy] Error proxying to ${targetUrl}:`, e.message);
    return new Response(JSON.stringify({ error: `Gateway proxy error: ${e.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}

// ─── Bun.serve with native WebSocket ──────────────────────────────────────
// Bun 1.3.x: ws.url is undefined. Use server.upgrade(req, { data }) to pass pathname.
Bun.serve({
  port: PORT,
  fetch(req, server) {
    const pathname = new URL(req.url).pathname;
    if (pathname === '/ws/chat' || pathname === '/terminal') {
      if (pathname === '/terminal') {
        const origin = req.headers.get('origin') || req.headers.get('host') || '';
        const allowed = /^(https?:\/\/)?(localhost|127\.0\.0\.1|\[\:\:1\])(:\d+)?$/.test(origin) || origin.includes(GATEWAY_HOST) || origin === '';
        if (!allowed) {
          console.warn('[terminal] WS upgrade blocked — invalid origin:', origin);
          return new Response('Forbidden', { status: 403 });
        }
      }
      server.upgrade(req, { data: { pathname } });
      return;
    }
    return handleRequest(req);
  },
  websocket: {
    open(ws) {
      const pathname = (ws as any).data?.pathname || '/';
      if (pathname === '/ws/chat') handleChatUpgrade(ws);
      else if (pathname === '/terminal') handleTerminalUpgrade(ws);
    },
    message(ws, msg) {
      const handlerType = (ws as any).handlerType;
      if (handlerType === 'chat') handleChatMessage(ws, msg);
      else if (handlerType === 'terminal') handleTerminalMessage(ws, msg);
    },
    close(ws) {
      const handlerType = (ws as any).handlerType;
      if (handlerType === 'chat') {
        chatRunners.get(ws)?.abort.abort();
        chatRunners.delete(ws);
      } else if (handlerType === 'terminal') {
        const proc = terminalProcs.get(ws);
        if (proc) { proc.kill(); terminalProcs.delete(ws); }
      }
    },
  },
});

console.log(`[${PROJECT_NAME}] Server running on port ${PORT}`);
