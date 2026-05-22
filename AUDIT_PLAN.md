# Frontend Full Audit Plan for OpenCode

## Scope
- Entire `frontend/src/` tree (35 components + 10 lib files + main entry)
- TypeScript compilation clean, no duplicate import warnings

---

## Phase 1: Dead Code Removal

### Confirmed Dead (zero external consumers, no legend of intent, no import chain)

**Lib files — safe to delete:**
- `src/lib/gatewayClient.ts` — marked `@deprecated` in its own doc; WebSocket client, 0 imports anywhere
- `src/lib/chatClient.ts` — marked `@deprecated` in its own doc; "safe to delete", 0 imports
- `src/lib/chatStore.ts` — contains `ChatMessage` interface + signal-based chat state, 0 imports
- `src/lib/chatStorage.ts` — IndexedDB chat storage with localStorage fallback, 0 imports
- `src/lib/slashRpc.ts` — slash command RPC (`slashRpc()`, `getStatus()`), 0 imports
- `src/lib/gatewayClient.ts` — marked `@deprecated`, 0 imports
- `src/lib/api-base.ts` — Wait, this IS imported by `App.tsx`, `MonacoEditor.tsx`, `CodeCompletions.ts` ✓ Keep

**Components — safe to delete:**
- `src/components/hermes/AnalyticsPanel.tsx` — 0 external imports
- `src/components/hermes/ApiKeyManager.tsx` — 0 external imports
- `src/components/hermes/ConfigEditor.tsx` — 0 external imports
- `src/components/hermes/LogViewer.tsx` — 0 external imports
- `src/components/hermes/OAuthManager.tsx` — 0 external imports
- `src/components/hermes/SkillsManager.tsx` — 0 external imports
- `src/components/hermes/HermesPanel.tsx` — 0 external imports
  - All 7 hermes/* files are in `components/hermes/` — none of them is imported or rendered in `App.tsx` or any router
  - Sidebar has only 5 tabs: CODE, SYSTEM, SESSIONS, WIKI, PROFILES — no HERMES tab
  - There's no `'HERMES'` case in App.tsx tab routing

### Potentially Active but Worth Checking
- `src/lib/chat-persist.ts` — imported in 4 places in MonacoEditor.tsx (for file tab persistence). Keep, but verify the `saveSession`/`loadSession` calls aren't confused with `chatStore` versions.
- `src/lib/graph-layout.ts` — imported by WikiPanel, WikiSearch, WikiGraph3D. Keep.
- `src/lib/hermesApi.ts` — imported by ProfileManager.tsx AND hermes/* (all dead). ProfileManager.tsx consumers: `profiles` API calls. **Can it be moved inline to ProfileManager.tsx instead of dead-coded?** — flag for review, NOT delete yet.

---

## Phase 2: Stale Comments / Docstring Cleanup

- `src/lib/chatStore.ts` line 4 comment: `// Message[] from chat-ui types` — chat-ui is gone, should be `// ChatMessage from ChatMessage interface`
- `src/lib/gatewayClient.ts` lines 3-6: "(ModalChat) uses the pure HTTP Runs API" — ModalChat deleted, update wording
- `src/lib/chatClient.ts` lines 3-5: standalone `@deprecated` notice
- `src/components/MessageContent.tsx` line 3: "Extracted from the retired chat-ui library" — accurate, can stay or update
- `src/components/ProfileChat.tsx` line 6: "Full feature parity with the old ModalChat" — keep as historical note, fine

---

## Phase 3: Review ModalChat/chat-gateway Refs in Non-Obvious Places

Check these files for broken references:
1. `src/lib/gatewayClient.ts` — doc references ModalChat (known, being deleted in Phase 1)
2. `src/lib/chatStore.ts` — stale chat-ui type ref (Phase 2)
3. `src/lib/chatClient.ts` — doc references createHermesChat/chat-ui (Phase 1/2)
4. `src/components/GitPanel.tsx` line 2: imports `DiffPreview` from `./DiffPreview` — NOT from chat-ui. These are different components: `components/DiffPreview.tsx` vs the deleted `chat-ui/components/DiffPreview.tsx`. Verify the live DiffPreview.tsx is correct.
5. `src/components/MonacoEditor.tsx` line 9: imports `DiffPreview` from `./DiffPreview` — same check

---

## Phase 4: TypeScript Raw Scan (confirm zero errors pre-openCode)

Run:
```
cd /home/don/dev/git/don-hermes-os/frontend && npx tsc --noEmit 2>&1 | head -30
```
Expected: `EXIT: 0`, no errors.

---

## Phase 5: Runtime Pattern Review

- `ProfileChat.tsx`: verify no AbortController leaks on SSE streams (gaslight protection on disconnect)
- `ProfileChat.tsx`: `AbortController` timeout on `streamRes` fetch — check it's used correctly
- `App.tsx`: `http://` hardcoded in `apiUrl` — verify `/api/` routes are proxied correctly in dev
- `MonacoEditor.tsx`: `_disposables` cleanup array — verify all disposables are tracked
- `CodeCompletions.ts`: verify stale abbreviations don't reference modal-*

---

## Execution Order

1. **Delete dead code** (Phase 1 items) — ~27 files
2. **Fix stale comments** (Phase 2)
3. **Verify DiffPreview components** (Phase 3)
4. **TS check** (Phase 4)
5. **Report findings from Phase 5** (no cuts, just review notes)

Commit each phase separately with clear CHANGELOG entries.
