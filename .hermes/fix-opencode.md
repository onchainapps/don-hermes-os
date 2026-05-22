Fix all hardcoded backend URLs and port inconsistencies in don-hermes-os.

## Stack
Frontend: SolidJS/Vite/Tailwind (frontend/src/)
Backend: Bun/Elysia (backend/server.ts)

## Port Scheme
- Backend prod: 3001
- Backend dev: 3003
- Dashboard prod: 3002
- Dashboard dev: 5173

## What to Fix

### 1. gateway.ts (frontend/src/lib/gateway.ts)
The `gatewayChatUrl()` function returns a raw path like `/gp/v1/chat/completions`. 
Wrap it with `apiUrl()` from '../lib/api-base':
- Import `apiUrl` from '../lib/api-base'
- Change return statements to use apiUrl()

### 2. MonacoEditor.tsx (frontend/src/components/MonacoEditor.tsx)
Lines 810 and 971 use raw `fetch('/api/files?...')`.
Import `apiUrl` from '../lib/api-base' and prefix those two fetch calls.
Note: line 626 already uses apiUrl correctly — don't change it.

### 3. FileTree.tsx (frontend/src/components/FileTree.tsx)
All 6 fetch calls use raw `/api/...` paths.
Import `apiUrl` from '../lib/api-base' and prefix ALL fetch calls.
Lines: ~103, 239, 242, 247, 260, 294.

### 4. GitPanel.tsx (frontend/src/components/GitPanel.tsx)
All 9 fetch calls use raw `/api/...` paths.
Import `apiUrl` from '../lib/api-base' and prefix ALL fetch calls.
Lines: 32, 55, 68, 119, 126, 193, 207, 224, 260.

### 5. ProjectSearch.tsx (frontend/src/components/ProjectSearch.tsx)
All 3 fetch calls use raw `/api/...` paths.
Import `apiUrl` from '../lib/api-base' and prefix ALL fetch calls.
Lines: 46, 90, 101.

### 6. SessionPanel.tsx (frontend/src/components/SessionPanel.tsx)
Both fetch calls use raw paths.
Import `apiUrl` from '../lib/api-base' and prefix ALL fetch calls.
Lines: 43, 56.

### 7. CronPanel.tsx (frontend/src/components/CronPanel.tsx)
The `cronUrl()` function returns raw paths. It already imports apiUrl but doesn't use it.
Make `cronUrl()` wrap its return value with apiUrl().

### 8. OnboardingModal.tsx (frontend/src/components/OnboardingModal.tsx)
Line ~77 has `:3101` as the prod frontend port. Change it to `:3002`.

### 9. backend/server.ts line 24
Change `process.env.PORT || '3000'` to `process.env.PORT || '3001'`.
This makes the default port 3001 (matching the port convention) when run without PM2.

## Boundaries
- DO NOT modify any .env files
- DO NOT modify any configs outside the repo
- DO NOT modify PM2 configs
- DO NOT modify tests/
- DO NOT delete any files
- Keep all existing code logic and structure — just wrap fetch URLs with apiUrl()

## Verification
After changes, the production dashboard on port 3002 should be able to call all API routes.
Dev dashboard on port 5173 should still work (Vite proxy unchanged).
