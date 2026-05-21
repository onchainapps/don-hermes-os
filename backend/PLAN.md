# Convert Hermes Admin Features into don-backend

> **For Hermes:** Use opencode-agent skill. Read this plan fully, then implement all tasks.

**Goal:** Move 6 Hermes admin features (Config, API Keys, Logs, Analytics, Skills, OAuth) from the Hermes FastAPI web dashboard into don-backend (Bun). No proxy to :9119 — direct file/DB access to `~/.hermes/`.

**Architecture:** New routes in don-backend under `/api/hermes/*`. Frontend `hermesApi.ts` changes base URL from `/hermes-api` to `/api/hermes`. Zero new npm packages — uses `yaml` (already available) and `bun:sqlite` (built-in).

**Data Sources:**
- Config: `~/.hermes/config.yaml` (YAML)
- Env: `~/.hermes/.env` (KEY=VALUE)
- Logs: `~/.hermes/logs/{agent,gateway,errors}.log`
- Analytics: `~/.hermes/state.db` (SQLite)
- Skills: `~/.hermes/skills/{category}/{name}/SKILL.md`
- OAuth: `~/.hermes/.anthropic_oauth.json`, `~/.claude/.credentials.json`

**don-backend file:** `/home/don/dev/git/don-backend/server.ts`
**Frontend dir:** `/home/don/dev/git/dons-dashboard/src/`

---

## Task 1: Add YAML dependency and route helper

**Objective:** Install `yaml` npm package and add a route prefix helper for `/api/hermes/*` routes.

**Files:**
- Modify: `/home/don/dev/git/don-backend/package.json` — add `"yaml": "^2.7.0"`
- Modify: `/home/don/dev/git/don-backend/server.ts` — add import + route prefix check

**Step 1: Install yaml package**

```bash
cd /home/don/dev/git/don-backend && bun add yaml
```

**Step 2: Add imports at top of server.ts**

```typescript
import YAML from 'yaml';
import { Database } from 'bun:sqlite';
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'fs';
import { join, basename } from 'path';
```

**Step 3: Add helper constants**

```typescript
const HERMES_HOME = `${process.env.HOME}/.hermes`;
const CONFIG_PATH = `${HERMES_HOME}/config.yaml`;
const ENV_PATH = `${HERMES_HOME}/.env`;
const STATE_DB_PATH = `${HERMES_HOME}/state.db`;
const SKILLS_DIR = `${HERMES_HOME}/skills`;
const LOGS_DIR = `${HERMES_HOME}/logs`;

const LOG_FILES: Record<string, string> = {
  agent: 'agent.log',
  gateway: 'gateway.log',
  errors: 'errors.log',
};

// Helper: read last N lines of a file efficiently
function tailFile(filePath: string, lines: number): string[] {
  if (!existsSync(filePath)) return [];
  const content = readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n');
  return allLines.slice(-lines);
}

// Helper: redact env value (show last 4 chars)
function redactValue(value: string): string {
  if (!value || value.length <= 4) return '••••';
  return '•'.repeat(Math.max(0, value.length - 4)) + value.slice(-4);
}

// Helper: JSON response
function jsonOk(res: any, data: any) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Helper: JSON error
function jsonErr(res: any, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: message }));
}

// Helper: read request body as JSON
function readBody(req: any): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: any) => body += chunk);
    req.on('end', () => resolve(body));
  });
}
```

**Step 4: Add route prefix in the main request handler**

Find the `createServer` callback and add a hermes route block near the top (before the existing `/api/stats` check):

```typescript
// Hermes admin API routes
if (url.pathname.startsWith('/api/hermes/')) {
  // Handled below
}
```

We'll add the actual handlers in Tasks 2-7.

**Verification:**
```bash
cd /home/don/dev/git/don-backend && bun run build 2>&1 | tail -3
# Expected: no errors
```

---

## Task 2: Config Editor endpoints

**Objective:** Read/write `~/.hermes/config.yaml`.

**Files:**
- Modify: `/home/don/dev/git/don-backend/server.ts` — add 4 route handlers

**Endpoints:**

```
GET /api/hermes/config
→ { model: "...", providers: {...}, agent: {...}, terminal: {...}, ... }
```

Implementation:
```typescript
if (pathname === '/api/hermes/config' && method === 'GET') {
  try {
    const yamlText = readFileSync(CONFIG_PATH, 'utf-8');
    const config = YAML.parse(yamlText);
    // Strip _ prefixed internal keys
    const cleaned: any = {};
    for (const [k, v] of Object.entries(config || {})) {
      if (!k.startsWith('_')) cleaned[k] = v;
    }
    jsonOk(res, cleaned);
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

```
PUT /api/hermes/config
Body: { key: "agent.max_turns", value: 100 }
→ { ok: true }
```

Implementation:
```typescript
if (pathname === '/api/hermes/config' && method === 'PUT') {
  try {
    const body = JSON.parse(await readBody(req));
    const yamlText = readFileSync(CONFIG_PATH, 'utf-8');
    const config = YAML.parse(yamlText) || {};
    
    // Dot-path setter: "agent.max_turns" → config.agent.max_turns = value
    const parts = body.key.split('.');
    let obj = config;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]] || typeof obj[parts[i]] !== 'object') obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = body.value;
    
    writeFileSync(CONFIG_PATH, YAML.stringify(config, { lineWidth: 120 }));
    jsonOk(res, { ok: true });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

```
GET /api/hermes/config/raw
→ { yaml: "..." }
```

```
PUT /api/hermes/config/raw
Body: { yaml_text: "..." }
→ { ok: true }
```

Implementation for raw endpoints:
```typescript
if (pathname === '/api/hermes/config/raw' && method === 'GET') {
  const yamlText = readFileSync(CONFIG_PATH, 'utf-8');
  jsonOk(res, { yaml: yamlText });
  return;
}

if (pathname === '/api/hermes/config/raw' && method === 'PUT') {
  const body = JSON.parse(await readBody(req));
  // Validate YAML before writing
  YAML.parse(body.yaml_text);
  writeFileSync(CONFIG_PATH, body.yaml_text);
  jsonOk(res, { ok: true });
  return;
}
```

**Verification:**
```bash
curl -s http://localhost:3000/api/hermes/config | head -5
# Expected: JSON with model, providers, agent, etc.

curl -s -X PUT -H "Content-Type: application/json" \
  -d '{"key":"agent.verbose","value":true}' \
  http://localhost:3000/api/hermes/config
# Expected: {"ok":true}
```

---

## Task 3: API Key Manager (Env) endpoints

**Objective:** Read/write `~/.hermes/.env`.

**Files:**
- Modify: `/home/don/dev/git/don-backend/server.ts`

**Endpoints:**

```
GET /api/hermes/env
→ { vars: [{ key, value (redacted), is_set, category }] }
```

Implementation:
```typescript
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
        is_set: value.length > 0,
        category: key.includes('API_KEY') ? 'tool' : 
                  key.includes('TOKEN') ? 'tool' : 'setting',
      });
    }
    
    jsonOk(res, { vars });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

```
PUT /api/hermes/env
Body: { key: "OPENAI_API_KEY", value: "sk-..." }
→ { ok: true, key }
```

Implementation:
```typescript
if (pathname === '/api/hermes/env' && method === 'PUT') {
  try {
    const body = JSON.parse(await readBody(req));
    let envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
    const lines = envText.split('\n');
    
    // Find and update existing key, or append
    const prefix = body.key + '=';
    let found = false;
    const updated = lines.map(line => {
      if (line.trim().startsWith(prefix)) {
        found = true;
        return `${body.key}=${body.value}`;
      }
      return line;
    });
    
    if (!found) {
      updated.push(`${body.key}=${body.value}`);
    }
    
    writeFileSync(ENV_PATH, updated.join('\n'));
    jsonOk(res, { ok: true, key: body.key });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

```
DELETE /api/hermes/env?key=VAR_NAME
→ { ok: true, key }
```

```typescript
if (pathname === '/api/hermes/env' && method === 'DELETE') {
  try {
    const key = url.searchParams.get('key');
    if (!key) return jsonErr(res, 400, 'key required');
    
    let envText = readFileSync(ENV_PATH, 'utf-8');
    const lines = envText.split('\n').filter(line => {
      const trimmed = line.trim();
      return !trimmed.startsWith(key + '=');
    });
    
    writeFileSync(ENV_PATH, lines.join('\n'));
    jsonOk(res, { ok: true, key });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

**Verification:**
```bash
curl -s http://localhost:3000/api/hermes/env | python3 -m json.tool | head -20
# Expected: { vars: [{ key: "NOUS_BASE_URL", value: "••••••••••••", ... }, ...] }
```

---

## Task 4: Log Viewer endpoint

**Objective:** Tail log files from `~/.hermes/logs/`.

**Files:**
- Modify: `/home/don/dev/git/don-backend/server.ts`

**Endpoint:**

```
GET /api/hermes/logs?file=agent&lines=200
→ { file: "agent", lines: ["line1", "line2", ...] }
```

Implementation:
```typescript
if (pathname === '/api/hermes/logs' && method === 'GET') {
  try {
    const file = url.searchParams.get('file') || 'agent';
    const lineCount = parseInt(url.searchParams.get('lines') || '200', 10);
    const search = url.searchParams.get('search') || '';
    
    const logFile = LOG_FILES[file];
    if (!logFile) return jsonErr(res, 400, `Unknown log file: ${file}`);
    
    const filePath = join(LOGS_DIR, logFile);
    let lines = tailFile(filePath, lineCount);
    
    // Optional search filter
    if (search) {
      const lowerSearch = search.toLowerCase();
      lines = lines.filter(l => l.toLowerCase().includes(lowerSearch));
    }
    
    jsonOk(res, { file, lines });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

**Verification:**
```bash
curl -s "http://localhost:3000/api/hermes/logs?file=agent&lines=10" | python3 -m json.tool
# Expected: { file: "agent", lines: ["...last 10 lines..."] }
```

---

## Task 5: Analytics endpoint

**Objective:** Query `~/.hermes/state.db` for token usage and cost data.

**Files:**
- Modify: `/home/don/dev/git/don-backend/server.ts`

**Endpoint:**

```
GET /api/hermes/analytics/usage?days=30
→ {
    daily: [{ date, tokens, cost }],
    by_model: [{ model, tokens, cost, sessions }],
    totals: { total_input, total_output, total_cache_read, total_reasoning, total_estimated_cost, total_sessions },
    period_days: 30
  }
```

Implementation:
```typescript
if (pathname === '/api/hermes/analytics/usage' && method === 'GET') {
  try {
    const days = parseInt(url.searchParams.get('days') || '30', 10);
    const cutoff = Math.floor(Date.now() / 1000) - (days * 86400);
    
    const db = new Database(STATE_DB_PATH, { readonly: true });
    
    // Daily breakdown
    const daily = db.prepare(`
      SELECT 
        date(started_at, 'unixepoch') as date,
        SUM(input_tokens + output_tokens) as tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as cost
      FROM sessions 
      WHERE started_at > ? 
      GROUP BY date ORDER BY date
    `).all(cutoff);
    
    // Per-model breakdown
    const byModel = db.prepare(`
      SELECT 
        model,
        SUM(input_tokens + output_tokens) as tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as cost,
        COUNT(*) as sessions
      FROM sessions 
      WHERE started_at > ? AND model IS NOT NULL 
      GROUP BY model ORDER BY tokens DESC
    `).all(cutoff);
    
    // Totals
    const totals = db.prepare(`
      SELECT 
        COALESCE(SUM(input_tokens), 0) as total_input,
        COALESCE(SUM(output_tokens), 0) as total_output,
        COALESCE(SUM(cache_read_tokens), 0) as total_cache_read,
        COALESCE(SUM(reasoning_tokens), 0) as total_reasoning,
        COALESCE(SUM(estimated_cost_usd), 0) as total_estimated_cost,
        COUNT(*) as total_sessions
      FROM sessions 
      WHERE started_at > ?
    `).get(cutoff);
    
    db.close();
    
    jsonOk(res, { daily, by_model: byModel, totals, period_days: days });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

**IMPORTANT:** Check the actual column names in state.db first:
```bash
sqlite3 ~/.hermes/state.db ".schema sessions"
```

The column names may differ (e.g., `input_tokens` vs `input_tokens_used`). Adjust SQL accordingly.

**Verification:**
```bash
curl -s "http://localhost:3000/api/hermes/analytics/usage?days=30" | python3 -m json.tool | head -20
```

---

## Task 6: Skills Manager endpoints

**Objective:** Scan `~/.hermes/skills/` directories and list/toggle skills.

**Files:**
- Modify: `/home/don/dev/git/don-backend/server.ts`

**Endpoints:**

```
GET /api/hermes/skills
→ { skills: [{ name, description, category, enabled }] }
```

Implementation:
```typescript
if (pathname === '/api/hermes/skills' && method === 'GET') {
  try {
    const skills: any[] = [];
    
    if (existsSync(SKILLS_DIR)) {
      const categories = readdirSync(SKILLS_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory());
      
      for (const cat of categories) {
        const catDir = join(SKILLS_DIR, cat.name);
        const skillDirs = readdirSync(catDir, { withFileTypes: true })
          .filter(d => d.isDirectory());
        
        for (const skill of skillDirs) {
          const skillMd = join(catDir, skill.name, 'SKILL.md');
          let description = '';
          
          if (existsSync(skillMd)) {
            const content = readFileSync(skillMd, 'utf-8');
            // Extract description from frontmatter or first paragraph
            const descMatch = content.match(/description:\s*["']?(.+?)["']?\s*\n/);
            if (descMatch) {
              description = descMatch[1];
            } else {
              // First non-empty, non-header line
              const lines = content.split('\n');
              for (const line of lines) {
                const t = line.trim();
                if (t && !t.startsWith('#') && !t.startsWith('---') && t !== '---') {
                  description = t.slice(0, 200);
                  break;
                }
              }
            }
          }
          
          skills.push({
            name: skill.name,
            description,
            category: cat.name,
            enabled: true, // TODO: check config.yaml skills.disabled list
          });
        }
      }
    }
    
    // Sort by category then name
    skills.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    
    jsonOk(res, { skills });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

```
PUT /api/hermes/skills/toggle
Body: { name: "skill-name", enabled: false }
→ { ok: true }
```

Implementation:
```typescript
if (pathname === '/api/hermes/skills/toggle' && method === 'PUT') {
  try {
    const body = JSON.parse(await readBody(req));
    const yamlText = readFileSync(CONFIG_PATH, 'utf-8');
    const config = YAML.parse(yamlText) || {};
    
    if (!config.skills) config.skills = {};
    if (!config.skills.disabled) config.skills.disabled = [];
    
    if (body.enabled) {
      config.skills.disabled = config.skills.disabled.filter((s: string) => s !== body.name);
    } else {
      if (!config.skills.disabled.includes(body.name)) {
        config.skills.disabled.push(body.name);
      }
    }
    
    writeFileSync(CONFIG_PATH, YAML.stringify(config, { lineWidth: 120 }));
    jsonOk(res, { ok: true });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

**Verification:**
```bash
curl -s http://localhost:3000/api/hermes/skills | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'{len(d[\"skills\"])} skills')"
# Expected: "300+ skills"
```

---

## Task 7: OAuth Status endpoint (read-only)

**Objective:** Show OAuth provider connection status by reading credential files.

**Files:**
- Modify: `/home/don/dev/git/don-backend/server.ts`

**Endpoint:**

```
GET /api/hermes/providers/oauth
→ { providers: [{ id, name, flow, status: { logged_in, source, token_preview } }] }
```

Implementation:
```typescript
if (pathname === '/api/hermes/providers/oauth' && method === 'GET') {
  try {
    const providers: any[] = [];
    
    // Anthropic OAuth
    const anthropicPath = `${HERMES_HOME}/.anthropic_oauth.json`;
    const claudeCredsPath = `${process.env.HOME}/.claude/.credentials.json`;
    
    let anthropicLoggedIn = false;
    let anthropicPreview = '';
    if (existsSync(anthropicPath)) {
      try {
        const creds = JSON.parse(readFileSync(anthropicPath, 'utf-8'));
        if (creds.accessToken) {
          anthropicLoggedIn = true;
          anthropicPreview = '…' + creds.accessToken.slice(-6);
        }
      } catch {}
    }
    
    let claudeLoggedIn = false;
    let claudePreview = '';
    if (existsSync(claudeCredsPath)) {
      try {
        const creds = JSON.parse(readFileSync(claudeCredsPath, 'utf-8'));
        if (creds.accessToken || creds.apiKey) {
          claudeLoggedIn = true;
          const token = creds.accessToken || creds.apiKey || '';
          claudePreview = '…' + token.slice(-6);
        }
      } catch {}
    }
    
    providers.push({
      id: 'anthropic',
      name: 'Anthropic',
      flow: 'pkce',
      status: { logged_in: anthropicLoggedIn, source: anthropicPath, token_preview: anthropicPreview },
    });
    
    providers.push({
      id: 'claude-code',
      name: 'Claude Code',
      flow: 'external',
      status: { logged_in: claudeLoggedIn, source: claudeCredsPath, token_preview: claudePreview },
    });
    
    // Add more providers as needed (nous, openai-codex, qwen-oauth)
    // For now, check if their credential files exist
    
    jsonOk(res, { providers });
  } catch (e: any) {
    jsonErr(res, 500, e.message);
  }
  return;
}
```

**Verification:**
```bash
curl -s http://localhost:3000/api/hermes/providers/oauth | python3 -m json.tool
```

---

## Task 8: Update frontend to use don-backend instead of Hermes web dashboard

**Objective:** Change `hermesApi.ts` to point to don-backend routes, remove Vite proxy for `/hermes-api`.

**Files:**
- Modify: `/home/don/dev/git/dons-dashboard/src/lib/hermesApi.ts` — change base URL
- Modify: `/home/don/dev/git/dons-dashboard/vite.config.ts` — remove `/hermes-api` proxy
- Modify: `/home/don/dev/git/dons-dashboard/src/components/hermes/*.tsx` — adjust response field names if needed

**Step 1: Update hermesApi.ts**

```typescript
const BASE = '/api/hermes';

// rest stays the same
```

**Step 2: Remove Vite proxy**

Remove from `vite.config.ts`:
```typescript
'/hermes-api': {
  target: 'http://localhost:9119',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/hermes-api/, '/api'),
},
```

**Step 3: Adjust frontend response parsing if field names differ**

The don-backend endpoints return slightly different shapes than the Hermes FastAPI. Check each component:

- `ConfigEditor.tsx`: expects flat object from `GET /config` → same ✓
- `ApiKeyManager.tsx`: expects `{ vars: [...] }` from `GET /env` → was `{ env: [...] }` in FastAPI. **Update component to use `data.vars` instead of `data.env`.**
- `LogViewer.tsx`: expects `{ file, lines }` → same ✓
- `AnalyticsPanel.tsx`: expects `{ daily, by_model, totals, period_days }` → same ✓
- `SkillsManager.tsx`: expects `{ skills: [...] }` → same ✓
- `OAuthManager.tsx`: expects `{ providers: [...] }` → same ✓

**Step 4: Build and verify**

```bash
cd /home/don/dev/git/don-backend && bun run build
cd /home/don/dev/git/dons-dashboard && NODE_OPTIONS="--max-old-space-size=4096" bun run build
```

---

## Task 9: Restart and integration test

**Objective:** Deploy and verify everything works end-to-end.

**Steps:**

1. Restart don-backend:
```bash
cd /home/don/dev/git/don-backend && bunx pm2 restart don-backend
```

2. Test each endpoint:
```bash
# Config
curl -s http://localhost:3000/api/hermes/config | head -3

# Env
curl -s http://localhost:3000/api/hermes/env | head -3

# Logs
curl -s "http://localhost:3000/api/hermes/logs?file=agent&lines=5"

# Analytics
curl -s "http://localhost:3000/api/hermes/analytics/usage?days=7" | head -10

# Skills
curl -s http://localhost:3000/api/hermes/skills | python3 -c "import json,sys; print(len(json.load(sys.stdin)['skills']))"

# OAuth
curl -s http://localhost:3000/api/hermes/providers/oauth
```

3. Open dashboard, test all 6 HERMES tabs visually.

4. Show `git diff --stat` for both repos.

---

## Implementation Order

| Order | Task | Complexity |
|-------|------|-----------|
| 1 | YAML dep + route helpers | Low |
| 2 | Config endpoints | Medium |
| 3 | Env/Keys endpoints | Low-Medium |
| 4 | Logs endpoint | Low |
| 5 | Analytics endpoint | Low |
| 6 | Skills endpoints | Medium |
| 7 | OAuth status endpoint | Low |
| 8 | Frontend update | Low |
| 9 | Integration test | — |
