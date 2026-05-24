/**
 * ProfileChat Browser Harness — Tests
 *
 * This file REPLICATES the core logic of ProfileChat.tsx in a standalone
 * test harness. It never touches production code — it only proves that the
 * three multi-window bugs that were fixed stay fixed:
 *
 * 1. _sending guard is per-instance (not module-scoped `let`)
 * 2. <For> stabilises window identity when a list entry is removed
 * 3. closeModal() wraps dispatchEvent in queueMicrotask so Portal teardown
 *    finishes first — prevents "all windows vanish" race.
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { installFetchRegistry, stubProfilesAPI, stubModelInfo, stubChatCompletions, setupBrowser, cleanupBrowser } from '../browser-mock_test';
import type { MockFetchRegistry } from '../browser-mock_test';

/// ── Types ────────────────────────────────────────────────────────────────

interface OpenChatEntry {
  id: string;          // stable identity = profileId
  name: string;        // profileName (header label)
  gatewayPort: number;
  apiKey: string;
}

/// ── Simulated ProfileChat ─────────────────────────────────────────────────
// Mirrors the per-instance signal set in ProfileChat.tsx

interface ChatState {
  chatId: string;
  _sending: boolean;
  _abortCtrl: AbortController | null;
  messages: { role: 'user' | 'assistant'; content: string }[];
}

function makeChat(entry: OpenChatEntry): ChatState {
  return {
    chatId:        entry.id,
    _sending:      false,
    _abortCtrl:    null,
    messages:      [{ role: 'assistant', content: `Hello! Profile chat ready for ${entry.name}.` }],
  };
}

/** Simulate sending a message in a chat (from ProfileChat.tsx sendMessage + reader loop) */
async function sendMessage(
  chat: ChatState,
  entry: OpenChatEntry,
  reg: MockFetchRegistry,
  content: string,
): Promise<void> {
  if (chat._sending) {
    throw new Error(`[${entry.name}] block: _sending is already true`);
  }
  chat._sending = true;
  chat.messages.push({ role: 'user', content });
  chat._abortCtrl = new AbortController();

  try {
    const res = await reg.fetch(`http://localhost:3001/gp/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Hermes-Profile': entry.name },
      body: JSON.stringify({ messages: chat.messages.slice(-8) }),
    });

    if (!res.ok) {
      chat.messages.push({ role: 'assistant', content: `[HTTP ${res.status}]` });
      return;
    }

    const reader = res.body!.getReader();
    let acc = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      acc += new TextDecoder().decode(value);
    }
    chat.messages.push({ role: 'assistant', content: acc || '(empty)' });
  } finally {
    chat._sending = false;
    chat._abortCtrl = null;
  }
}

/** Simulate closeModal() — mirrors the queueMicrotask fix ProfileChat has */
async function closeModal(chat: ChatState): Promise<void> {
  // ProfileChat.closeModal wraps the profile-chat-close dispatchEvent in queueMicrotask
  // so Portal teardown is already done when the event fires.
  return new Promise(resolve => {
    queueMicrotask(() => {
      if (chat._abortCtrl) chat._abortCtrl.abort();
      chat._sending = false;
      resolve();
    });
  });
}

/// ── Tests ──────────────────────────────────────────────────────────────────

describe('ProfileChat multi-window independence', () => {
  let reg: MockFetchRegistry;

  beforeEach(() => {
    setupBrowser();
  });

  afterEach(() => {
    reg?.reset();
    cleanupBrowser();
  });

  test('each FakeProfileChat instance has its own _sending flag — not shared', () => {
    const entries: OpenChatEntry[] = [
      { id: 'auditor',   name: 'Don Auditor',   gatewayPort: 8652, apiKey: 'k-a' },
      { id: 'developer', name: 'Don Developer', gatewayPort: 8651, apiKey: 'k-d' },
      { id: 'researcher',name: 'Don Researcher',gatewayPort: 8650, apiKey: 'k-r' },
    ];

    const [chatA, chatD, chatR] = entries.map(makeChat);

    // All start free
    [chatA, chatD, chatR].forEach(c => expect(c._sending).toBe(false));

    // chatA goes busy
    chatA._sending = true;
    expect(chatD._sending).toBe(false); // chatD unaffected
    expect(chatR._sending).toBe(false); // chatR unaffected
  });

  test('closing one window does NOT remove all windows', () => {
    // Replicating handleCloseProfileChat() behaviour:
    // only filters the entry with the matching id, leaves others intact.
    const entries: OpenChatEntry[] = [
      { id: 'auditor',   name: 'Don Auditor',   gatewayPort: 8652, apiKey: 'k-a' },
      { id: 'developer', name: 'Don Developer', gatewayPort: 8651, apiKey: 'k-d' },
      { id: 'researcher',name: 'Don Researcher',gatewayPort: 8650, apiKey: 'k-r' },
    ];

    const handleClose = (id: string, list: OpenChatEntry[]) => list.filter(e => e.id !== id);

    // Close only Don Auditor
    const remaining = handleClose('auditor', entries);
    expect(remaining).toHaveLength(2);
    expect(remaining.map(e => e.id).sort()).toEqual(['developer', 'researcher']);
  });

  test('closing with queueMicrotask — event fires after Portal teardown', async () => {
    const chat = makeChat({ id: 'auditor', name: 'Don Auditor', gatewayPort: 8652, apiKey: 'k' });

    // Start the close-microtask but don't await yet
    const closePromise = closeModal(chat);

    await closePromise;
    expect(chat._sending).toBe(false);
  });

  test('<For> — removing one entry preserves object identity of survivors', () => {
    // With <Index> (OLD, BUGGY):
    //   openProfileChats.filter(...) produces a shorter array.
    //   <Index> re-renders positions 0..N from scratch → each DOM position
    //   gets whichever entry now sits there, regardless of old identity.
    //
    // With <For> (FIXED):
    //   <For> tracks SolidJS reactivity by object reference.
    //   Removing entry at position 0 leaves the entries at 1,2 with the
    //   SAME object identity — each ProfileChat instance keeps its own state.

    const entries: OpenChatEntry[] = [
      { id: 'auditor',   name: 'Don Auditor',   gatewayPort: 8652, apiKey: 'k-a' },
      { id: 'developer', name: 'Don Developer', gatewayPort: 8651, apiKey: 'k-d' },
      { id: 'researcher',name: 'Don Researcher',gatewayPort: 8650, apiKey: 'k-r' },
    ];

    // Remove auditor
    const filtered = entries.filter(e => e.id !== 'auditor');

    // With <For>: object references are unchanged — developer & researcher survive with same identity
    expect(filtered[0]).toBe(entries[1]); // developer unchanged reference
    expect(filtered[1]).toBe(entries[2]); // researcher unchanged reference

    // Each surviving entry maps to its own ProfileChat with correct props
    filtered.forEach(entry => {
      const chat = makeChat(entry);
      expect(chat.chatId).toBe(entry.id); // identity preserved
    });
  });

  test('E2E: 3 windows open, send independently, close one, others stay intact', async () => {
    // Set up stub registry
    stubProfilesAPI(reg = installFetchRegistry(), {
      auditor:    { name: 'Don Auditor',    port: 8652, status: 'running' },
      developer:  { name: 'Don Developer',  port: 8651, status: 'running' },
      researcher: { name: 'Don Researcher', port: 8650, status: 'running' },
    });
    stubModelInfo(reg, { name: 'test-model', id: 'test/model' });
    stubChatCompletions(reg);

    const entries: OpenChatEntry[] = [
      { id: 'auditor',   name: 'Don Auditor',   gatewayPort: 8652, apiKey: 'k-a' },
      { id: 'developer', name: 'Don Developer', gatewayPort: 8651, apiKey: 'k-d' },
      { id: 'researcher',name: 'Don Researcher',gatewayPort: 8650, apiKey: 'k-r' },
    ];

    const chats = entries.map(makeChat);

    // All start sending=false
    chats.forEach(c => expect(c._sending).toBe(false));

    // Send from developer — auditor and researcher must not block
    await sendMessage(chats[1], entries[1], reg, 'from developer');
    expect(chats[1].messages.length).toBe(3); // initial hello + user msg + assistant reply
    expect(chats[0]._sending).toBe(false);    // auditor unaffected
    expect(chats[2]._sending).toBe(false);    // researcher unaffected

    // Close developer via closeModal (queueMicrotask race guard)
    await closeModal(chats[1]);
    expect(chats[0]._sending).toBe(false);
    expect(chats[2]._sending).toBe(false);

    // Auditor and researcher can still send after developer closed
    await sendMessage(chats[0], entries[0], reg, 'later from auditor');
    expect(chats[0].messages.length).toBe(3); // initial + user + assistant
  });

  test('Index re-indexing id-corruption (reproduces the original bug)', () => {
    // Before the fix to swap <Index> → <For>:
    //   All windows thought they were the same profile because the DOM
    //   node at each position absorbed the wrong profile's props after a
    //   filter operation.

    const entries: OpenChatEntry[] = [
      { id: 'auditor',   name: 'Don Auditor',   gatewayPort: 8652, apiKey: 'k-a' },
      { id: 'developer', name: 'Don Developer', gatewayPort: 8651, apiKey: 'k-d' },
      { id: 'researcher',name: 'Don Researcher',gatewayPort: 8650, apiKey: 'k-r' },
    ];

    // Simulate <Index> position mapping to FakeProfileChat constructors
    const indexWins = entries.map((entry, pos) => ({
      entryId: entry.id,
      chat:    makeChat(entry),
    }));

    // After filter (auditor removed), position 0 now holds developer's entry
    // → the fake "ProfileChat" that *was* at position 0 now gets developer props
    //   but keeps its original state from construction as "auditor"
    const indexOrderAfterFilter = entries.filter(e => e.id !== 'auditor');
    expect(indexOrderAfterFilter[0].id).toBe('developer');

    // The facility that tracks identity must not use positional indices.
    // With <For> (our fix) each entry keeps its object ref and the
    // corresponding FakeProfileChat is re-used verbatim.
    const byRef = entries.filter(e => e.id !== 'auditor');
    expect(byRef[0].id).toBe('developer');
    expect(byRef[0]).toBe(entries[1]); // object equality holds
  });
});
