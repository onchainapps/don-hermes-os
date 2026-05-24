# don-hermes-os Test Suites

## Layout

```
tests/
├── browser-mock_test.ts   — Mock fetch/SSE registry + browser stub helpers
├── bunfig.toml            — Bun test configuration
├── package.json           — devDeps: bun-types, typescript, solid-js
├── tsconfig.json          — TS config for tests
└── profiles-chat/
    └── harness.test.ts    — ProfileChat multi-window bug regression tests
```

## Running

From repo root:  
\`\`\`bash  
cd tests  
bun test               # all suites  
bun test profiles-chat  # just ProfileChat harness  
\`\`\`

## What the ProfileChat Harness Tests

Covers the three bugs that were fixed in ProfileChat.tsx:

| Test\n| Bug proved fixed |
|-------|-----------------|
| each `_sending` guard is per-instance | Module-scope let → per-instance `createSignal` |
| closing one window does NOT remove all windows | `dispatchEvent` now in `queueMicrotask` |
| `<For>` — removing one entry preserves identity | swapped `<Index>` → `<For>` in the window list render |
| E2E: 3 windows open, send independently, close one, others stay intact | all three together |
| Index re-indexing corruption (reproduces bug) | documents the root cause |

NOT a DOM/integration test — tests the **state machine** that ProfileChat
exposes.  If ProfileChat.tsx regresses on any of these points the suite will
catch it before it ever touches an actual browser.

\`_sending\` state per profile window  
→ closing Don Developer CANNOT block Don Auditor from sending  
→ `openProfileChats` array stays clean — closing a window removes only that window  

See also \`profiles-chat/README.md\` for the full bug-by-bug walkthrough.
