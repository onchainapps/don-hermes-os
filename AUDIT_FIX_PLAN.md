# Don Hermes OS Audit Fix Plan

Fix ALL findings from AUDIT_REPORT.md (2026-05-21 OpenCode audit).

## Project root: `/home/don/dev/git/don-hermes-os`

## Files to modify

| File | What to change |
|------|---------------|
| `frontend/src/components/ProfileChat.tsx` | ~15 fixes (SSE, abort race, null deref, Portal, styles, model defaults, cleanup) |
| `frontend/src/components/ModalChat.tsx` | ~5 fixes (SSE, abort race, null deref, catch logging) |
| `backend/server.ts` | 3 fixes (hardcoded IP, 120s timeout, dead requireAuth middleware) |
| `frontend/src/components/ProfileManager.tsx` | 1 fix (add `apiKey?: string` to `HermesProfile` interface) |
| `frontend/src/components/SystemPanel.tsx` | 1 fix (import `Component` type from `solid-js`) |
| `frontend/src/components/OnboardingModal.tsx` | 1 fix (add timezone offset to timestamps) |

## Instructions

### CRITICAL FIXES

#### C1 → ProfileChat.tsx — SSE requestCancelled handling (line 535)

Change this:
```typescript
            } catch {}
```
To:
```typescript
            } catch (parseErr) {
              console.warn(`[ProfileChat:${props.profileName}] SSE parse error:`, parseErr);
            }
```

Additionally, BEFORE the try/catch inside the `for (const line of lines)` loop, add a check for `requestCancelled` SSE events:
```typescript
for (const line of lines) {
  if (line.startsWith('data: ')) {
    const data = line.slice(6).trim();
    if (data === '[DONE]') continue;
    // Check for requestCancelled cancellation event
    if (data.includes('"requestCancelled"') || data.includes('"cancelled"')) {
      fullContent += '\n\n*Generation cancelled.*';
      setMessages(prev => {
        const newMessages = [...prev];
        const lastIndex = newMessages.length - 1;
        if (newMessages[lastIndex]?.role === 'assistant') {
          newMessages[lastIndex] = { ...newMessages[lastIndex], content: fullContent };
        }
        return newMessages;
      });
      // Break out of SSE loop — don't wait for more events
      reader?.cancel().catch(() => {});
      reader = null;
      break;
    }
    try {
      ...
```

The outer (stream-level) catch at line 541 also needs the null-deref fix (C3).

#### C1 → ModalChat.tsx — Same SSE requestCancelled handling (line 446)

Same pattern as above. Add requestCancelled detection before the try/catch in the SSE line loop.

#### C2 → ProfileChat.tsx — AbortController race at sendMessage (line 423)

Before creating a new AbortController, add a guard:
```typescript
if (isStreaming()) return;
// Add: if abortController is still active, don't proceed
if (abortController) {
  log('Previous stream still active, preventing concurrent send');
  return;
}
```

This catches the window where `stopStreaming()` fires, sets `isStreaming=false`, but the `finally` block hasn't nulled `abortController` yet.

#### C2 → ModalChat.tsx — Same AbortController race (line 357)

Same fix — add `if (abortController) return;` before creating new one.

#### C3 → ProfileChat.tsx — Null deref in catch block (line 550)

Change `if (last.role === 'assistant')` to `if (last?.role === 'assistant')` (add optional chaining).

#### C3 → ModalChat.tsx — Null deref in catch block (line 457)

Same — change `if (last.role === 'assistant')` to `if (last?.role === 'assistant')`.

#### C4 → backend/server.ts — Hardcoded IP in /gp proxy (line 1446)

Change:
```typescript
      targetHost = '192.168.1.141';
```
To:
```typescript
      // Use the same GATEWAY_HOST for profile-specific ports
      targetHost = GATEWAY_HOST;
```

#### C5 → backend/server.ts — 120s timeout kills SSE streams (line 1468)

Instead of one timeout for all requests, make it conditional on the path:

```typescript
const timeout = targetPath.includes('/events') ? undefined : 120000;
const signal = timeout ? AbortSignal.timeout(timeout) : undefined;

const proxyRes = await fetch(targetUrl, {
  method: req.method,
  headers: proxyHeaders,
  body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
  signal,
});
```

### HIGH FIXES

#### H6 → ProfileManager.tsx — HermesProfile missing apiKey (line 6-10)

Add `apiKey?: string;` to the interface:
```typescript
interface HermesProfile {
  name: string;
  status: 'active' | 'standby' | 'not-yet-created';
  gatewayPort?: number;
  apiKey?: string;
}
```

#### H7 → SystemPanel.tsx — Component type not imported (line 1)

Change the import:
```typescript
// From:
import { createSignal, For, Show, onCleanup, onMount } from 'solid-js';
// To:
import { createSignal, For, Show, onCleanup, onMount, Component } from 'solid-js';
```

#### H8 → ProfileChat.tsx — Missing Portal wrapper (line 631-632)

1. At the top of the file, add Portal import:
```typescript
import { Portal } from 'solid-js/web';
```

2. Wrap the chat container in `<Portal>`:
```typescript
return (
  <Show when={isOpen()}>
    <Portal>
      <div class="fixed z-[999999] bg-zinc-950 ..." style={{...}}>
        ... existing content ...
      </div>
    </Portal>
  </Show>
);
```

#### H9 → backend/server.ts — Dead requireAuth function (line 243-249)

Remove the function entirely — it's never called and has unreachable code.
```typescript
// DELETE lines 243-249:
// function requireAuth(req: any, res: any) { ... }
```

#### H10 → ProfileChat.tsx — Redundant stopThinkingAnimation in onCleanup (line 625)

Remove the standalone `stopThinkingAnimation()` call from `onCleanup` — it's already called by `stopStreaming()` on line 626.

### MEDIUM FIXES

#### M11 → Both chat components — Empty catch blocks should at least log

For `fetchModelInfo()` empty catch blocks:
- ProfileChat.tsx line 319: change `catch {}` to `catch { console.warn(...) }`
- ModalChat.tsx line 235: change `catch {}` to `catch { console.warn(...) }`

#### M12 → ProfileChat.tsx — Model fallback mismatch (line 117)

Change default model info to match ModalChat's known-good defaults:
```typescript
const [modelInfo, setModelInfo] = createSignal({ name: 'Qwen3.6-27B-FP8', context: 262111 });
```

#### M13 → ProfileManager.tsx — saveConfig should use hermesPost (line 150-154)

Change the raw fetch to use the component's `hermesPost` helper:
```typescript
// Replace raw fetch with hermesPost
await hermesPost('/api/hermes/profiles/config/raw', { name, config: yaml });
```

#### M14 → ModalChat is dead code — document in a comment

Add a doc comment at the top: `// @deprecated — use ProfileChat instead`

#### M15 → ProfileChat.tsx — Misleading gatewayPort log (line 432)

Change the log message to clarify:
```typescript
log('Sending message', { text }); // removed gatewayPort from log
```

### LOW FIXES

#### L16 → ProfileChat.tsx — Missing `relative` class on container (line 633)

Add `relative` to the container div's class list.

#### L17 → ProfileChat.tsx — Default width too narrow (line 115)

Change from `width: 520` to `width: 720` to match ModalChat's default.

#### L18 → ProfileChat.tsx — Missing context badge in header (line 655-657)

Change the model info display to include context size, like ModalChat:
```typescript
<div class="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-mono">
  {modelInfo().name} · {Math.floor(modelInfo().context / 1000)}k
</div>
```

#### L19 → Session timestamps — add timezone offset

Wherever `Date.now()` is used for timestamps (saveState calls), append the timezone offset:
```typescript
// Already Date.now() — UTC millis are fine. No action needed.
// The timezone is only relevant if displaying dates to users.
// Instead, add to the dashboard UI if needed.
```

Actually, skip L19 — `Date.now()` is UTC, which is correct. Timezone formatting is a display concern, not a storage concern.

---

## IMPORTANT BOUNDARIES

- Do NOT modify files outside the table above
- Do NOT touch `backend/scripts/`, `frontend/src/lib/chat-ui/`, `~/.hermes/`, `.env` files
- Do NOT commit changes — only write the files
- After all fixes: run `npx tsc --noEmit` in `frontend/` and report the error count

## Verification

After all fixes:
1. `cd frontend && npx tsc --noEmit` — must show 0 errors for all audited files
2. The 18 errors in `chat-ui/` (out of scope) should remain unchanged
3. The 3 in-scope errors (ProfileManager, SystemPanel) must be resolved
