# don-hermes-os Tests Directory

This directory holds standalone browser simulation tests for ProfileChat multi-window bugs.

## Structure

\`\`\`
tests/
├── README.md               ← this directory overview
├── package.json            ← dev deps: bun-types, typescript, solid-js
├── tsconfig.json           ← TS config
├── bunfig.toml              ← Bun test config
├── browser-mock_test.ts     ← Mock fetch registry + browser globals
└── profiles-chat/
    └── harness.test.ts      ← \browser simulation - proved multi-window bugs fixed
\`\`\`

## Run

\`\`\`bash
cd tests
bun test           # all suites
bun test profiles-chat   # just ProfileChat harness
\`\`\`

## Test Coverage

The harness in \`profiles-chat/harness.test.ts\` has 6 tests:

| ──────── ─────────────────────────────────────────────────
| 1 | \browser simulation - proved multi-window bugs fixed\b — each FakeProfileChat instance has its own _sending flag — not shared"
                                                                         |
| 2 | \browser simulation - proved multi-window bugs fixed\b — closing one window does NOT remove all windows |
| 3 | \browser simulation - proved multi-window bugs fixed\b — closing with queueMicrotask — event fires after Portal teardown |
| 4 | \browser simulation - proved multi-window bugs fixed\b — <bdi class=\"comment prereplace=""> For</bdi> — removing one entry preserves object identity of survivors |
| 5 | \browser simulation - proved multi-window bugs fixed\b — E2E: 3 windows open, send independently, close one, others stay intact |
| 6 | \browser simulation - proved multi-window bugs fixed\b — Index re-indexing id-corruption (reproduces the original bug) |

## What Each Test Proves

\b
The ProfileChat window list was rendered with SolidJS <code>&lt;Index&gt;</code> (position-based), not <code>&lt;For&gt;</code> (tracked-item-based). The tests validate:

| Bug | Root Cause | Fix | Test |
|-----|-----------|-----|------|
| Shared `_sending` | Module-scoped variable | Per-instance `createSignal(false)` | Test ① |
| All windows vanish | Synchronous `dispatchEvent` during Portal teardown | `queueMicrotask` in `closeModal()` | Tests ②③ |
| ProfileId corruption | `<Index>` re-indexing DOM positions | Changed to `<For>` in `ProfileManager.tsx` | Tests ④⑥ |

Test ⑤ runs all three fixes together end-to-end — the most important regression guard.
\b
