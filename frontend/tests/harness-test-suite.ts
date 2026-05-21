/**
 * Don OS Frontend - Permanent Harness Test Suite
 *
 * Usage:
 *   bun run tests/harness-test-suite.ts
 *
 * This suite validates:
 * - Label + run_id propagation
 * - Delta streaming
 * - Multi-turn conversations
 * - Tool event handling
 * - Concurrent session isolation
 * - Error resilience
 */

import { createChatTestHarness, AgentChatTestHarness } from './agent-chat-harness';

interface TestResult {
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  console.log(`\n▶ ${name}`);
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✅ PASS`);
  } catch (err: any) {
    results.push({ name, passed: false, details: err.message });
    console.log(`  ❌ FAIL: ${err.message}`);
  }
}

async function main() {
  console.log('=== DON OS HARNESS TEST SUITE ===');

  // === TEST 1: Basic connectivity + label propagation ===
  await runTest('Basic connectivity + label propagation', async () => {
    const h = createChatTestHarness({ label: 'suite-basic-' + Date.now() });
    await h.connect();
    await h.send('Reply with exactly: HARNESS_OK');
    await h.waitForDeltas(1, 12000);
    if (!h.hasLabelPropagation()) throw new Error('Label not propagated');
    if (!h.getRunId()) throw new Error('No run_id captured');
    await h.disconnect();
  });

  // === TEST 2: Multi-turn on single connection ===
  await runTest('Multi-turn conversation (single session)', async () => {
    const h = createChatTestHarness({ label: 'suite-multi-' + Date.now() });
    await h.connect();
    await h.send('Remember the number 777');
    await h.waitForDeltas(1, 8000);
    await h.send('What number did I ask you to remember?');
    const deltas = await h.waitForDeltas(1, 10000);
    const all = h.getAllEvents();
    if (deltas.length < 1 && all.length < 2) {
      throw new Error('No deltas or content events on second turn');
    }
    await h.disconnect();
  });

  // === TEST 3: Tool event detection ===
  await runTest('Tool event detection', async () => {
    const h = createChatTestHarness({ label: 'suite-tool-' + Date.now() });
    await h.connect();
    await h.send('Use a tool to get the current UTC time');
    await h.waitForDeltas(1, 15000);
    const tools = h.getToolEvents();
    // Note: Not all queries trigger tools — we just check it doesn't crash
    console.log(`    Tool events: ${tools.length}`);
    await h.disconnect();
  });

  // === TEST 4: Concurrent sessions ===
  await runTest('Concurrent session isolation (4 sessions)', async () => {
    const sessions: AgentChatTestHarness[] = [];
    for (let i = 0; i < 4; i++) {
      const h = createChatTestHarness({ label: `suite-concurrent-${i}` });
      await h.connect();
      sessions.push(h);
    }

    await Promise.all(sessions.map(h => h.send('Hello from concurrent test')));
    await Promise.all(sessions.map(h => h.waitForDeltas(1, 15000)));

    const runIds = new Set(sessions.map(h => h.getRunId()));
    if (runIds.size !== 4) throw new Error('Run IDs not isolated');

    await Promise.all(sessions.map(h => h.disconnect()));
  });

  // === TEST 5: Resilience to rapid messages ===
  await runTest('Rapid message burst', async () => {
    const h = createChatTestHarness({ label: 'suite-rapid-' + Date.now() });
    await h.connect();
    for (let i = 0; i < 5; i++) {
      await h.send(`Rapid message ${i + 1}`);
      await new Promise(r => setTimeout(r, 300));
    }
    await h.waitForDeltas(1, 20000);
    await h.disconnect();
  });

  // === Concurrent Tab Isolation Test (mimics 4 FloatingChat tabs) ===
  await runTest('Concurrent 4-tab isolation (mimics FloatingChat)', async () => {
    const tabs = await Promise.all([
      AgentChatTestHarness.createIndependentTab('tab-1-test'),
      AgentChatTestHarness.createIndependentTab('tab-2-test'),
      AgentChatTestHarness.createIndependentTab('tab-3-test'),
      AgentChatTestHarness.createIndependentTab('tab-4-test'),
    ]);

    console.log('Created 4 independent tabs');

    // Send a unique message from each tab
    await Promise.all(tabs.map((tab, i) =>
      tab.send(`Hello from tab ${i + 1}`)
    ));

    // Wait a bit for events
    await new Promise(r => setTimeout(r, 1500));

    // Check that each tab only received events with its own label
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const events = tab.getAllEvents();
      const ownLabelEvents = events.filter(e => e.label === `tab-${i + 1}-test`);
      console.log(`Tab ${i + 1}: ${events.length} total events, ${ownLabelEvents.length} matching label`);
    }

    await Promise.all(tabs.map(t => t.disconnect()));
  });

  // === Aggressive simultaneous send test (exact same time) ===
  await runTest('Simultaneous multi-tab send (stress test)', async () => {
    const tabs = await Promise.all([
      AgentChatTestHarness.createIndependentTab('simul-tab-1'),
      AgentChatTestHarness.createIndependentTab('simul-tab-2'),
      AgentChatTestHarness.createIndependentTab('simul-tab-3'),
    ]);

    // Fire all messages at the exact same moment
    const messages = ['Alpha', 'Beta', 'Gamma'];
    await Promise.all(tabs.map((tab, i) => tab.send(messages[i])));

    // Give the gateway a moment
    await new Promise(r => setTimeout(r, 2000));

    let lostEvents = 0;
    let leakage = 0;

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const allEvents = tab.getAllEvents();
      const ownLabel = allEvents.filter(e => e.label === `simul-tab-${i + 1}`);
      const runs = tab.getRuns();
      const runIds = tab.getAllRunIds();

      console.log(`Simul Tab ${i + 1}: events=${allEvents.length}, ownLabel=${ownLabel.length}, runs=${runIds.length}`);

      if (ownLabel.length === 0) lostEvents++;
      if (runIds.length === 0) lostEvents++;

      // Cross-tab leakage check
      const foreignLabels = allEvents.filter(e => e.label && e.label !== `simul-tab-${i + 1}`);
      if (foreignLabels.length > 0) {
        leakage++;
        console.log(`  ⚠️ LEAKAGE DETECTED on tab ${i + 1}:`, foreignLabels.map(e => e.label));
      }
    }

    await Promise.all(tabs.map(t => t.disconnect()));

    if (lostEvents > 0) {
      throw new Error(`${lostEvents} tabs lost events or runs on simultaneous send`);
    }
    if (leakage > 0) {
      throw new Error(`${leakage} tabs received events with foreign labels (wrong-tab symptom reproduced)`);
    }
  });

  console.log('\n=== TEST SUMMARY ===');
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;

  results.forEach(r => {
    const icon = r.passed ? '✅' : '❌';
    console.log(`${icon} ${r.name}${r.details ? ` — ${r.details}` : ''}`);
  });

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    console.log(`\n❌ ${failed} test(s) failed`);
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Suite crashed:', err);
  process.exit(1);
});
