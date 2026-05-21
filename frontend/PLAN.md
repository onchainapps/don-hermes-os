# Don's Dashboard — Hermes Admin + Tooling Upgrade Plan

> **For Hermes:** Use opencode-agent skill to implement this plan. Start Phase 1 (features), then Phase 2 (tooling).

**Goal:** Add 6 Hermes admin features to Don's Dashboard and upgrade to Vite 7 + Tailwind v4.

**Architecture:** Don's Dashboard proxies to the Hermes web dashboard API at localhost:9119 for admin features. New "HERMES" app in the sidebar with 6 sub-panels. All admin data flows through a shared `hermesApi` fetch utility.

**Tech Stack:** SolidJS, Vite, Tailwind CSS, Hermes web dashboard API (FastAPI on :9119)

**Prerequisites:** Hermes web dashboard must be running (`hermes dashboard --no-open --host 0.0.0.0 --port 9119`)

---

## Phase 1: Hermes Admin Features (6 new panels)

### Task 1: Add Hermes API proxy to Vite config

**Objective:** Enable dev server to proxy `/hermes-api/*` to the Hermes web dashboard at localhost:9119.

**Files:**
- Modify: `/home/don/dev/git/dons-dashboard/vite.config.ts`

**Step 1: Add proxy entry**

Add to the `server.proxy` object in `vite.config.ts`:

```typescript
'/hermes-api': {
  target: 'http://localhost:9119',
  changeOrigin: true,
  rewrite: (path) => path.replace(/^\/hermes-api/, '/api'),
},
```

**Step 2: Verify**

Run: `curl -s http://localhost:5173/hermes-api/status | head -5`
Expected: JSON with `version`, `gateway_running`, etc.

---

### Task 2: Create Hermes API utility module

**Objective:** Shared fetch wrapper for all Hermes web dashboard API calls.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/lib/hermesApi.ts`

**Code:**

```typescript
const BASE = '/hermes-api';

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
```

---

### Task 3: Create HermesPanel parent component with sub-navigation

**Objective:** New sidebar app "HERMES" with tabbed sub-panels for the 6 admin features.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/HermesPanel.tsx`

**Code structure:**

```tsx
import { createSignal, For, Show } from 'solid-js';
import ConfigEditor from './hermes/ConfigEditor';
import ApiKeyManager from './hermes/ApiKeyManager';
import LogViewer from './hermes/LogViewer';
import AnalyticsPanel from './hermes/AnalyticsPanel';
import SkillsManager from './hermes/SkillsManager';
import OAuthManager from './hermes/OAuthManager';

type SubTab = 'config' | 'keys' | 'logs' | 'analytics' | 'skills' | 'oauth';

const TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'config', label: 'CONFIG', icon: '⚙️' },
  { id: 'keys', label: 'API KEYS', icon: '🔑' },
  { id: 'logs', label: 'LOGS', icon: '📋' },
  { id: 'analytics', label: 'ANALYTICS', icon: '📊' },
  { id: 'skills', label: 'SKILLS', icon: '🧩' },
  { id: 'oauth', label: 'OAUTH', icon: '🔐' },
];

export default function HermesPanel() {
  const [activeTab, setActiveTab] = createSignal<SubTab>('config');

  return (
    <div class="h-full flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div class="flex items-center gap-0 border-b border-hermes-cyan/20 flex-shrink-0 px-2">
        <For each={TABS}>
          {(tab) => (
            <button
              class={`px-3 py-2 text-[10px] tracking-wider transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab() === tab.id
                  ? 'text-hermes-green border-hermes-green'
                  : 'text-hermes-text-dim border-transparent hover:text-hermes-cyan'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          )}
        </For>
      </div>
      {/* Panel content */}
      <div class="flex-1 overflow-hidden">
        <Show when={activeTab() === 'config'}><ConfigEditor /></Show>
        <Show when={activeTab() === 'keys'}><ApiKeyManager /></Show>
        <Show when={activeTab() === 'logs'}><LogViewer /></Show>
        <Show when={activeTab() === 'analytics'}><AnalyticsPanel /></Show>
        <Show when={activeTab() === 'skills'}><SkillsManager /></Show>
        <Show when={activeTab() === 'oauth'}><OAuthManager /></Show>
      </div>
    </div>
  );
}
```

**Also modify:** `/home/don/dev/git/dons-dashboard/src/components/Sidebar.tsx`
- Add `'HERMES'` to the `AppId` type
- Add sidebar button with icon `🔧` for HERMES

**Also modify:** `/home/don/dev/git/dons-dashboard/src/App.tsx`
- Import HermesPanel
- Add HERMES panel div with CSS visibility toggle (same pattern as SYSTEM/CRON/etc.)

---

### Task 4: ConfigEditor — form-based config viewer/editor

**Objective:** Display all Hermes config.yaml fields in a form. Read/write via `/api/config`.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/hermes/ConfigEditor.tsx`

**API endpoints:**
- `GET /hermes-api/config` → full config JSON
- `PUT /hermes-api/config` → save config (body: `{key: "section.field", value: "..."}`)

**Implementation:**
1. Fetch config on mount via `hermesGet('/config')`
2. Render top-level keys as collapsible sections (providers, agent, terminal, display, etc.)
3. For each field: show label + input (text/number/select/switch based on value type)
4. On change: call `hermesPut('/config', { key: dottedPath, value: newValue })`
5. Show save status indicator (saved/pending/error)
6. "Export" button: download config as YAML file
7. "Reset" button: reload from server

**UI pattern:** Section headers with expand/collapse (►/▼), fields as label-input rows, cyberpunk styling matching existing dashboard.

---

### Task 5: ApiKeyManager — .env variable viewer/editor

**Objective:** Display all Hermes .env variables with redacted previews, reveal on click.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/hermes/ApiKeyManager.tsx`

**API endpoints:**
- `GET /hermes-api/env` → all env vars (values redacted for secrets)
- `PUT /hermes-api/env` → set env var (body: `{key: "VAR_NAME", value: "..."}`)
- `DELETE /hermes-api/env?key=VAR_NAME` → delete env var
- `POST /hermes-api/env/reveal` → reveal full value (needs session token)

**Implementation:**
1. Fetch env vars on mount
2. Render as table: Key | Value (redacted) | Actions
3. Click value to reveal (fetch from `/api/env/reveal`)
4. "Add" button at top for new env vars
5. "Delete" button per row with confirmation
6. Category grouping if available (provider, tool, messaging, setting)

---

### Task 6: LogViewer — filtered log tail viewer

**Objective:** Tail Hermes agent/gateway/error logs with filtering.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/hermes/LogViewer.tsx`

**API endpoints:**
- `GET /hermes-api/logs?file=agent&lines=100` → log file lines
- Log files: `agent`, `gateway`, `error`

**Implementation:**
1. Dropdown to select log file (agent/gateway/error)
2. Text area showing log lines, auto-scroll to bottom
3. Search/filter input that highlights matches
4. Auto-refresh toggle (poll every 5s when enabled)
5. "Clear view" button
6. Color-code log levels (INFO=dim, WARN=yellow, ERROR=magenta)

---

### Task 7: AnalyticsPanel — token usage and cost charts

**Objective:** Display token usage and cost analytics with charts.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/hermes/AnalyticsPanel.tsx`

**API endpoints:**
- `GET /hermes-api/analytics/usage?days=30` → daily breakdown, by_model, totals

**Implementation:**
1. Period selector: 7 / 30 / 90 days
2. Summary cards: total tokens (input/output/cache/reasoning), estimated cost, session count
3. Simple bar chart (CSS-only, no chart library): daily token usage
4. Per-model breakdown table: model name, tokens, cost, sessions
5. Use `createSignal` for data, `createEffect` for fetch on period change

**Note:** Use pure CSS bar charts (div height proportional to value) to avoid adding a chart library dependency. Style bars with `bg-hermes-cyan` with opacity.

---

### Task 8: SkillsManager — browse and toggle skills

**Objective:** Browse all installed skills, enable/disable by platform.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/hermes/SkillsManager.tsx`

**API endpoints:**
- `GET /hermes-api/skills` → list of all skills (300+)
- `PUT /hermes-api/skills/toggle` → enable/disable skill
- `GET /hermes-api/tools/toolsets` → list of toolsets

**Implementation:**
1. Search/filter input at top
2. Skills listed as cards: name, description, category, enabled/disabled toggle
3. Category filter tabs
4. Toolset browser section below skills
5. Toggle switch per skill (calls `/api/skills/toggle`)

---

### Task 9: OAuthManager — provider OAuth flow management

**Objective:** View and manage OAuth provider connections.

**Files:**
- Create: `/home/don/dev/git/dons-dashboard/src/components/hermes/OAuthManager.tsx`

**API endpoints:**
- `GET /hermes-api/providers/oauth` → provider status list
- `POST /hermes-api/providers/oauth/{id}/start` → start OAuth flow
- `POST /hermes-api/providers/oauth/{id}/submit` → submit auth code
- `DELETE /hermes-api/providers/oauth/{id}` → disconnect

**Implementation:**
1. List OAuth providers with connection status (connected/disconnected)
2. "Connect" button per disconnected provider → opens OAuth flow
3. "Disconnect" button per connected provider with confirmation
4. Show provider details (name, scopes, last connected)

---

### Task 10: Build and verify Phase 1

**Objective:** Ensure all 6 panels compile and work.

**Steps:**
1. Run `cd /home/don/dev/git/dons-dashboard && NODE_OPTIONS="--max-old-space-size=4096" bun run build`
2. Verify build succeeds
3. Restart PM2: `bunx pm2 restart don-backend`
4. Manual test: open each HERMES sub-tab, verify data loads from :9119

---

## Phase 2: Tooling Upgrade (Vite 7 + Tailwind v4)

### Task 11: Upgrade Vite 5 → 7

**Files:**
- Modify: `package.json`

**Steps:**
1. `bun add vite@^7.0.0`
2. Verify `vite-plugin-solid` 2.11.12 is compatible (already is — peer deps include v7)
3. Run `bun run build` to check for breaking changes
4. Fix any Vite 7 deprecation warnings

---

### Task 12: Upgrade Tailwind v3 → v4

**Files:**
- Delete: `tailwind.config.js`, `postcss.config.js`
- Modify: `package.json` (remove `tailwindcss`, `autoprefixer`, `postcss`; add `@tailwindcss/vite`, `tailwindcss`)
- Modify: `vite.config.ts` (add `@tailwindcss/vite` plugin)
- Modify: `src/index.css` (complete rewrite of Tailwind directives)

**Step 1: Install new deps**

```bash
bun remove tailwindcss autoprefixer postcss
bun add tailwindcss@^4 @tailwindcss/vite
```

**Step 2: Update vite.config.ts**

Add import and plugin:
```typescript
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  // ... rest unchanged
});
```

**Step 3: Rewrite index.css header**

Replace:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

With:
```css
@import "tailwindcss";

@theme {
  --color-hermes-bg: #050507;
  --color-hermes-panel: #111113;
  --color-hermes-cyan: #00f3ff;
  --color-hermes-green: #00ff9f;
  --color-hermes-magenta: #ff00cc;
  --color-hermes-text: #e0ffe8;
  --color-hermes-text-dim: #aaffcc;
  --font-mono: "JetBrains Mono", "Fira Code", monospace;
}
```

**Step 4: Migrate `@apply` directives**

Tailwind v4 still supports `@apply` but some behaviors change. Check each `@apply` in `index.css` and all components for compatibility. Key changes:
- `@apply` with custom classes (e.g., `@apply bg-hermes-bg`) works if defined in `@theme`
- `@layer base` and `@layer components` still work
- Custom utilities (text-shadow, etc.) need to be defined as CSS or use `@utility`

**Step 5: Fix any broken classes**

Common Tailwind v4 breaking changes:
- `shadow-*` → still works
- `text-shadow-*` custom utilities → need `@utility` definition
- Safelist is removed (no longer needed — Tailwind v4 scans all files)
- `ring-*` defaults change slightly

**Step 6: Build and fix**

```bash
NODE_OPTIONS="--max-old-space-size=4096" bun run build
```

Fix any CSS errors. Most will be custom utilities that need `@utility` definitions.

---

### Task 13: Final integration test

**Objective:** Verify everything works end-to-end.

**Steps:**
1. Build: `NODE_OPTIONS="--max-old-space-size=4096" bun run build`
2. Restart: `bunx pm2 restart don-backend`
3. Test all 6 original panels (Chat, Code, System, Cron, Sessions, Wiki)
4. Test all 6 new HERMES panels (Config, Keys, Logs, Analytics, Skills, OAuth)
5. Verify responsive layout, no CSS regressions
6. Check browser console for errors

---

## API Endpoints Reference

| Feature | Endpoint | Method | Purpose |
|---------|----------|--------|---------|
| Status | `/api/status` | GET | Gateway health, version |
| Config | `/api/config` | GET | Full config JSON |
| Config save | `/api/config` | PUT | Save config field |
| Config defaults | `/api/config/defaults` | GET | Default values |
| Config schema | `/api/config/schema` | GET | Field metadata |
| Env list | `/api/env` | GET | All env vars |
| Env set | `/api/env` | PUT | Set env var |
| Env delete | `/api/env` | DELETE | Delete env var |
| Env reveal | `/api/env/reveal` | POST | Show full secret |
| Logs | `/api/logs?file=X&lines=N` | GET | Log tail |
| Analytics | `/api/analytics/usage?days=N` | GET | Token/cost data |
| Skills list | `/api/skills` | GET | All skills |
| Skills toggle | `/api/skills/toggle` | PUT | Enable/disable |
| Toolsets | `/api/tools/toolsets` | GET | All toolsets |
| OAuth list | `/api/providers/oauth` | GET | Provider status |
| OAuth start | `/api/providers/oauth/{id}/start` | POST | Start flow |
| OAuth disconnect | `/api/providers/oauth/{id}` | DELETE | Disconnect |
| Cron list | `/api/cron/jobs` | GET | Cron jobs |
| Cron create | `/api/cron/jobs` | POST | Create job |
