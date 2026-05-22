# Fix Report

| Change | File | Before → After |
|--------|------|----------------|
| FIX 1 — H1: falsy-gate for gatewayPort:0 / pid:0 | `frontend/src/components/ProfileManager.tsx:377,382` | `when={profile.gatewayPort}` → `when={profile.gatewayPort != null && profile.gatewayPort > 0}` ; same for `pid` |
| FIX 2 — H3: gateway start race condition | `backend/server.ts:791` | Added `await Bun.sleep(2500);` between `execSync` gateway start and status check |
| FIX 3 — M2: silent error swallowing | `frontend/src/components/ProfileManager.tsx:95,102` | Empty `catch {}` → `catch (e) { console.warn('[ProfileManager] fetchProfilesWithRetry attempt failed:', e); }` |
| FIX 4 — M1: stale .env.example | `frontend/.env.example` | Removed active `VITE_GATEWAY_AUTH=`, left commented; updated `VITE_GATEWAY_URL` comment to note dev/debug only |
| FIX 5 — M3: AUDIT_PLAN.md dead-code misidentification | `AUDIT_PLAN.md:19` | `src/lib/gateway.ts — 0 imports` → `src/lib/gatewayClient.ts — marked @deprecated, 0 imports` |
| FIX 6 — L3: /retry edge case | `frontend/src/components/ProfileChat.tsx:225-233` | Unconditional `slice(0, -2)` → check `lastMsg.role === 'user'` and pop 1 or 2 accordingly |

## Verification

- **`npx tsc -p frontend/tsconfig.json --noEmit`**: only pre-existing `baseUrl` deprecation warning (TS5101) — no new errors.
- **`grep -R VITE_GATEWAY_AUTH frontend/src/`**: only hit is in `frontend/src/lib/gateway.ts:7` (file not touched). The `.env.example` line is now commented.
