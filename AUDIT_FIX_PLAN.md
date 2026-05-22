# OpenCode Fix Plan — AUDIT_REPORT.md Issues (EXCLUDING SSE TIMEOUT)

## REQUIRED DESIGN CONSTRAINT (NON-NEGOTIABLE)

```
SSE streams must NOT have a timeout.
Con: if the gateway stalls, reader.read() blocks forever. User must type /stop.
Reason: long-lived SSE connections are architectural pillars — they stay open until the user closes them explicitly.
```

Do NOT add any timeout, AbortSignal.timeout, or deadline to:
- `frontend/src/components/ProfileChat.tsx` — stream fetch / reader.read() loop
- `backend/server.ts` — `/gp` proxy handler for `/events` path
- Any other SSE or long-lived fetch connection

H2 from the audit is **OVERRIDDEN BY DESIGN PREFERENCE** — do not touch it.

---

## What to Fix

### H1: falsy-gate for port 0 / pid 0 in ProfileManager
**File:** `frontend/src/components/ProfileManager.tsx`
**Fix:** Change `Show when={profile.gatewayPort}` → `Show when={profile.gatewayPort != null && profile.gatewayPort > 0}` (and same for `pid`)

### H3: gateway start race (backend adds sleep + verify before returning)
**File:** `backend/server.ts`
**Fix:** After `execSync("hermes -p <name> gateway start")`, add a short async delay (e.g., `await Bun.sleep(2000)`) before calling `gateway list` so systemd has time to flip the state. Confirm it returns correct state after the delay.

Alternatively, add a `while` loop polling `systemctl is-active --user hermes-<name>` once before the list call.

### M2: fetchProfilesWithRetry silent errors
**File:** `frontend/src/components/ProfileManager.tsx:95,102`
**Fix:** Add a console.warn or a `refreshingProfile()` visual state (or at minimum a log line) so that 5 consecutive 500s are not completely invisible. Minimal fix: `console.warn('[ProfileManager] fetchProfilesWithRetry attempt failed')` inside catch.

### M1: .env.example stale VITE_GATEWAY_AUTH
**File:** `frontend/.env.example`
**Fix:** Replace with relevant profile-actual env vars or minify to only `VITE_GATEWAY_URL` (or remove entirely if Vite doesn't use it anymore).

### M3: AUDIT_PLAN.md gateway.ts dead-code misidentification
**File:** `AUDIT_PLAN.md`
**Fix:** Correct line that says `src/lib/gateway.ts` has 0 imports. The dead file is `src/lib/gatewayClient.ts` (with `Client` suffix). Update AUDIT_PLAN.md to reflect this.

### M4: Dead file cleanup (document only)
Create a DEAD_FILE_CLEANUP_PLAN.md listing all confirmed dead files with their import counts and the target commit that retired them. Do NOT delete without explicit "please delete" — leave cleanup as a separate issue.

### L3: /retry edge case fix
**File:** `frontend/src/components/ProfileChat.tsx:225-233`
**Fix:** Check if last message is a `user` message (no assistant response). If so, only pop the user message.

---

## Con of SSE Timeout — Why it must stay

If a fetch gets a timeout on an SSE stream, the connection is killed by the client even if the server is just slow. For `/events` endpoints that can produce data minutes after the last chunk, a timeout is anti-pattern. The correct recovery path is the user typing `/stop` and resending.

This is an architectural decision, not a bug. H2 is CANCELLED by this preference principle documented in AUDIT_FIX_PLAN.md.
