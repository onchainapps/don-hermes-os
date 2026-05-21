# Audit Fix Summary

**Date:** 2026-05-21
**Based on:** AUDIT_FIX_PLAN.md (from AUDIT_REPORT.md 2026-05-21)
**Total fixes applied:** 18 (C1-C5, H6-H10, M11-M15, L16-L18)

---

## TypeScript Verification

```
Total errors: 18
In-scope errors (audited files): 0 ← all resolved
Out-of-scope errors (chat-ui/): 18 ← unchanged (as expected)
```

---

## File-by-File Changes

### `frontend/src/components/ProfileChat.tsx` — 12 fixes

| Fix | Change |
|-----|--------|
| **C1** | Added `requestCancelled` SSE event detection before the try/catch in the SSE parsing loop. When detected, sets error message on assistant placeholder, cancels reader, and breaks the loop. Also changed empty `catch {}` to `catch (parseErr) { console.warn(...) }`. |
| **C2** | Added `if (abortController) { log(...); return; }` guard after `isStreaming()` check to prevent concurrent send when abortController is still active (race window between `stopStreaming()` and `finally` block). |
| **C3** | Changed `if (last.role === 'assistant')` to `if (last?.role === 'assistant')` in catch block to prevent null dereference. |
| **H8** | Added `Portal` import from `solid-js/web`. Wrapped the entire chat container div in `<Portal>` to avoid stacking context issues. |
| **H10** | Removed redundant `stopThinkingAnimation()` call from `onCleanup` — already called by `stopStreaming()`. |
| **M11** | Changed empty `catch {}` in `fetchModelInfo()` to `catch { console.warn(...) }`. |
| **M12** | Changed default model info from `{ name: 'grok-4.3', context: 10000000 }` to `{ name: 'Qwen3.6-27B-FP8', context: 262111 }` to match ModalChat's known-good defaults. |
| **M15** | Removed `gatewayPort` from the `log('Sending message', ...)` call to avoid misleading developers. |
| **L16** | Added `relative` class to container div (done as part of H8 Portal wrapper edit). |
| **L17** | Changed default width from `520` to `720` to match ModalChat. |
| **L18** | Added context size badge to header: `{modelInfo().name} · {Math.floor(modelInfo().context / 1000)}k`. |

### `frontend/src/components/ModalChat.tsx` — 4 fixes

| Fix | Change |
|-----|--------|
| **C1** | Added `requestCancelled` SSE event detection before the try/catch in the SSE parsing loop. Same pattern as ProfileChat. Changed empty `catch {}` to `catch (parseErr) { console.warn(...) }`. |
| **C2** | Added `if (abortController) return;` guard after `isStreaming()` check. |
| **C3** | Changed `if (last.role === 'assistant')` to `if (last?.role === 'assistant')` in catch block. |
| **M11** | Changed empty `catch {}` in `fetchModelInfo()` to `catch { console.warn(...) }`. |
| **M14** | Added `@deprecated — use ProfileChat instead` JSDoc comment at top of file. |

### `backend/server.ts` — 3 fixes

| Fix | Change |
|-----|--------|
| **C4** | Changed `targetHost = '192.168.1.141'` to `targetHost = GATEWAY_HOST` in `/gp` proxy when profile has a port configured. |
| **C5** | Made timeout conditional: `120000ms` for non-SSE requests, `undefined` (no timeout) for `/events` SSE streams. |
| **H9** | Removed the dead `requireAuth` function (lines 243-249) — never called, had unreachable code. |

### `frontend/src/components/ProfileManager.tsx` — 2 fixes

| Fix | Change |
|-----|--------|
| **H6** | Added `apiKey?: string;` to `HermesProfile` interface. |
| **M13** | Changed `saveConfig` from raw `fetch()` to use `hermesPut()` helper from `../lib/hermesApi` for consistent API client usage. Added `hermesPut` to imports. |

### `frontend/src/components/SystemPanel.tsx` — 1 fix

| Fix | Change |
|-----|--------|
| **H7** | Changed `MetricCard` props from `icon: Component` / `children: Component` to `icon: JSX.Element` / `children: JSX.Element`. The `Component` type from solid-js is a function type, not a JSX element type. |

---

## Notes

- L19 (session timestamps) was skipped per the plan — `Date.now()` returns UTC millis, which is correct for storage. Timezone formatting is a display concern.
- The 18 remaining TypeScript errors are all in `frontend/src/lib/chat-ui/` which is out of scope per AUDIT_INSTRUCTIONS.md boundaries.
- No commits were made.
