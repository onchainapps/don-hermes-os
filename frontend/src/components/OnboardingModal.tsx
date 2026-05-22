/**
 * OnboardingModal — first-launch tour of Don Hermes OS
 *
 * Shows on first visit (localStorage flag). Dismissable per-section
 * or all-at-once. Persists dismissed state so it never re-appears.
 *
 * Sections:
 *   1. Welcome & Overview  — what Don Hermes OS is
 *   2. Chat               — ProfileChat, slash cmds, voice input
 *   3. Sidebar Tabs       — SYSTEM, SESSIONS, WIKI, PROFILES, CRON
 *   4. Backend & profiles  — what the backend is, how profiles work
 */

import { createSignal, onMount, Show } from 'solid-js';
import { Portal } from 'solid-js/web';

const STORAGE_KEY = 'don-os-onboarding-dismissed';
const TOTAL_STEPS = 4;

interface StepDef {
  num: number;
  title: string;
  icon: string;
  body: string;
  features: string[];
}

const STEPS: StepDef[] = [
  {
    num: 1,
    title: 'Welcome to Don Hermes OS',
    icon: '🜂',
    body: `Don Hermes OS is a self-contained local AI agent workspace. One repo, three layers — clone it, run setup, start PM2. Every part of the system is built to be portable and self-documenting.`,
    features: [
      'Fully self-hosted — no cloud accounts or API keys needed',
      'Real Hermes Agent in the browser chat',
      'Per-agent profiles sharing one gateway',
      'PM2-managed processes for dev and production',
    ],
  },
  {
    num: 2,
    title: 'Chat — Your AI Terminal',
    icon: '💬',
    body: `The floating ProfileChat (bottom-right by default) is your direct line to the active Hermes Agent. Type anything, stream responses, and use slash commands for agentic actions.`,
    features: [
      '<b>Ctrl/Cmd+B</b> — voice input toggle',
      '<b>/help</b> — list all slash commands',
      '<b>/new</b> — start a fresh conversation',
      '<b>/status</b> — live gateway + model info',
      '<b>/steer queue|interrupt|status</b> — control agent busy-mode',
      '<b>/profile [name]</b> — switch Hermes profile from chat',
      'Drag the header to reposition · drag ⤡ to resize',
    ],
  },
  {
    num: 3,
    title: 'Sidebar — Five Panels',
    icon: '◫',
    body: `Each tab is a distinct workspace. Use <b>Ctrl+1</b>…<b>Ctrl+5</b> to jump between them.`,
    features: [
      '<b>SYSTEM</b> — GPU, CPU, memory, gateway health, uptime',
      '<b>SESSIONS</b> — browse Hermes sessions, inspect runs',
      '<b>WIKI</b> — 3D Babylon.js knowledge graph; auto-built from your agent conversations',
      '<b>PROFILES</b> — create / destroy Hermes Agent profiles; each gets its own isolated gateway port',
      '<b>CRON</b> — scheduled autonomous jobs, per-profile overrides',
    ],
  },
  {
    num: 4,
    title: 'Behind the Scenes',
    icon: '⚙',
    body: `Don Hermes OS runs on Bun + SolidJS + PM2. The backend proxies the Hermes Gateway so the browser never needs direct WebSocket access. Everything is local.`,
    features: [
      '<b>Backend</b> (port 3001) — API proxy · profile CRUD · stats · editor context',
      '<b>Gateway</b> (port 8642) — the Hermes Agent itself, one per profile (8650+)',
      '<b>Frontend</b> (dev :5173 / prod :3002) — SolidJS/Vite/Tailwind dashboard',
      'Clone → <b>npm run setup</b> → <b>pm2 start</b> → done',
      '<b>AGENT.md</b> is the agent-readable manual for this repo',
    ],
  },
];

export default function OnboardingModal() {
  const [dismissedAll, setDismissedAll] = createSignal(false);
  const [currentStep, setCurrentStep] = createSignal(0);
  const [dismissed, setDismissed] = createSignal<boolean[]>(Array(TOTAL_STEPS).fill(false) as boolean[]);
  const [mounted, setMounted] = createSignal(false);

  onMount(() => {
    // hydration-safe: suppress SSR/server mismatch
    setMounted(true);
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'all') setDismissedAll(true);
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY + '-steps') || '[]');
      if (Array.isArray(arr) && arr.length === TOTAL_STEPS && arr.every((v: any) => v))
        setDismissedAll(true);
    } catch { /* malformed — show modal */ }
  });

  if (!mounted() || dismissedAll()) return null;

  const step = STEPS[currentStep()];

  const goNext = () => {
    const next = [...dismissed()];
    next[currentStep()] = true;
    setDismissed(next);
    localStorage.setItem(STORAGE_KEY + '-steps', JSON.stringify(next));
    if (currentStep() < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep() + 1);
    } else {
      localStorage.setItem(STORAGE_KEY, 'all');
      setDismissedAll(true);
    }
  };

  const goPrev = () => {
    if (currentStep() > 0) setCurrentStep(currentStep() - 1);
  };

  const dismissNow = () => {
    localStorage.setItem(STORAGE_KEY, 'all');
    setDismissedAll(true);
  };

  const visibleSteps = STEPS.filter((_, i) => !dismissed()[i]);

  return (
    <Portal>
      {/* Backdrop */}
      <div
        class="fixed inset-0 z-[999998] flex items-center justify-center"
        style={{
          background: 'rgba(0,0,0,0.75)',
          'backdrop-filter': 'blur(6px)',
        }}
        onClick={dismissNow}
      >
        {/* Modal */}
        <div
          class="relative z-[999999] w-[560px] max-w-[90vw] max-h-[85vh] overflow-y-auto rounded-lg"
          style={{
            background: 'linear-gradient(135deg, rgba(8,8,14,0.97) 0%, rgba(4,4,8,0.99) 100%)',
            'border': '1px solid rgba(0,243,255,0.18)',
            'box-shadow': '0 0 0 1px rgba(0,0,0,0.8), 0 24px 80px rgba(0,0,0,0.7), 0 0 40px rgba(0,243,255,0.04)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            class="flex items-center justify-between px-5 py-4 flex-shrink-0"
            style={{ 'border-bottom': '1px solid rgba(0,243,255,0.1)' }}
          >
            <div class="flex items-center gap-2.5">
              <span class="text-lg">{step.icon}</span>
              <span
                class="text-xs font-bold tracking-wider uppercase"
                style={{ color: '#00f3ff', 'letter-spacing': '.12em' }}
              >
                Don Hermes OS
              </span>
              <span
                class="ml-2 text-[10px] font-mono opacity-30"
              >
                Getting started — {currentStep() + 1}/{TOTAL_STEPS}
              </span>
            </div>
            <button
              class="text-[11px] opacity-25 hover:opacity-80 cursor-pointer transition-opacity px-2 py-1 rounded"
              style={{ color: '#00f3ff' }}
              onClick={dismissNow}
            >
              Skip ⊘
            </button>
          </div>

          {/* Step dots */}
          <div class="flex items-center gap-1.5 px-5 py-3 flex-shrink-0">
            {STEPS.map((s, i) => (
              <button
                class="h-1 rounded-full transition-all cursor-pointer"
                style={{
                  width: i === currentStep() ? '24px' : '8px',
                  background:
                    dismissed()[i]
                      ? 'rgba(0,243,255,0.25)'
                      : i === currentStep()
                        ? '#00f3ff'
                        : 'rgba(0,243,255,0.12)',
                  opacity: dismissed()[i] ? 0.5 : 1,
                }}
                onClick={() => {
                  // only allow jumping to already-viewed steps
                  if (dismissed()[i]) setCurrentStep(i);
                }}
                title={s.title}
              />
            ))}
          </div>

          {/* Body */}
          <div class="px-5 pb-5">
            <h2
              class="text-base font-bold mb-2"
              style={{ color: '#00f3ff' }}
            >
              {step.icon} {step.title}
            </h2>
            <p
              class="text-[11px] leading-relaxed opacity-60 mb-4"
              style={{ color: 'rgba(255,255,255,0.6)' }}
              innerHTML={step.body}
            />

            {/* Feature list */}
            {step.features.length > 0 && (
              <div class="flex flex-col gap-1.5 mb-5">
                {step.features.map((f, i) => (
                  <div
                    class="flex items-start gap-2 text-[10.5px] leading-snug"
                    style={{ color: 'rgba(255,255,255,0.5)' }}
                  >
                    <span class="mt-[3px] flex-shrink-0" style={{ color: '#00ff9f' }}>▸</span>
                    <span innerHTML={f} />
                  </div>
                ))}
              </div>
            )}

            {/* Keyboard hint */}
            {step.num === 2 && (
              <div
                class="rounded px-3 py-2 mb-4 text-[10px] font-mono leading-relaxed"
                style={{
                  background: 'rgba(0,243,255,0.05)',
                  border: '1px solid rgba(0,243,255,0.12)',
                  color: 'rgba(0,243,255,0.7)',
                }}
              >
                Tip: type <b>/help</b> inside the chat to see all slash commands.
              </div>
            )}

            {step.num === 3 && (
              <div
                class="rounded px-3 py-2 mb-4 text-[10px] font-mono leading-relaxed"
                style={{
                  background: 'rgba(0,255,159,0.05)',
                  border: '1px solid rgba(0,255,159,0.12)',
                  color: 'rgba(0,255,159,0.7)',
                }}
              >
                Tip: <b>Ctrl+1</b> SYSTEM · <b>Ctrl+2</b> SESSIONS · <b>Ctrl+3</b> WIKI · <b>Ctrl+4</b> PROFILES · <b>Ctrl+5</b> CRON
              </div>
            )}

            {/* Footer nav */}
            <div
              class="flex items-center justify-between pt-3"
              style={{ 'border-top': '1px solid rgba(0,243,255,0.08)' }}
            >
              <button
                class="text-[10px] px-3 py-1.5 rounded transition-opacity cursor-pointer"
                style={{
                  color: 'rgba(0,243,255,0.4)',
                  background: 'transparent',
                }}
                onClick={goPrev}
              >
                ← Back
              </button>
              <button
                class="text-[10px] font-bold px-4 py-1.5 rounded transition-all cursor-pointer"
                style={{
                  color: '#0a0a12',
                  background: '#00f3ff',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#00ff9f';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#00f3ff';
                }}
                onClick={goNext}
              >
                {currentStep() === TOTAL_STEPS - 1 ? "Let's go 🚀" : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
