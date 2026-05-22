import { createSignal, onMount, onCleanup, Show, For, createEffect } from 'solid-js';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
// @ts-ignore
import '@xterm/xterm/css/xterm.css';
import { wsUrl } from '../lib/api-base';

const TERM_THEME = {
  background: '#0a0a0f',
  foreground: '#00f3ff',
  cursor: '#00f3ff',
  cursorAccent: '#0a0a0f',
  black: '#0a0a0f',
  red: '#ff006e',
  green: '#00ff9f',
  yellow: '#ffd700',
  blue: '#00f3ff',
  magenta: '#ff00cc',
  cyan: '#00f3ff',
  white: '#e0e0e0',
  brightBlack: '#444444',
  brightRed: '#ff4488',
  brightGreen: '#44ff9f',
  brightYellow: '#ffdd44',
  brightBlue: '#44aaff',
  brightMagenta: '#ff44cc',
  brightCyan: '#44ffff',
  brightWhite: '#ffffff',
};

interface TerminalInstance {
  id: string;
  name: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  ws: WebSocket | null;
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
  cwd: string;
  containerRef: HTMLDivElement | undefined;
  resizeObserver: ResizeObserver | null;
  retryCount: number;
  retryTimeout?: ReturnType<typeof setTimeout>;
}

interface EditorTerminalProps {
  projectPath?: string;
}

let termCounter = 0;

export default function EditorTerminal(props: EditorTerminalProps) {
  const [terminals, setTerminals] = createSignal<TerminalInstance[]>([]);
  const [activeId, setActiveId] = createSignal<string>('');
  const [confirmClose, setConfirmClose] = createSignal<string | null>(null);

  const createTerminal = (cwd?: string) => {
    const id = `term-${++termCounter}`;
    const termCwd = cwd || props.projectPath || '/home/don/dev';

    const terminal = new Terminal({
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
      fontSize: 13,
      theme: TERM_THEME,
      scrollback: 5000,
      cursorBlink: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    const instance: TerminalInstance = {
      id,
      name: `Terminal ${termCounter}`,
      terminal,
      fitAddon,
      ws: null,
      status: 'connecting',
      cwd: termCwd,
      containerRef: undefined,
      resizeObserver: null,
      retryCount: 0,
    };

    setTerminals(prev => [...prev, instance]);
    setActiveId(id);

    // Defer connection until container is mounted
    requestAnimationFrame(() => {
      if (instance.containerRef) {
        terminal.open(instance.containerRef);
        requestAnimationFrame(() => {
          try { fitAddon.fit(); } catch (e) { console.warn('Fit failed on open:', e); }
          connectTerminal(instance);
        });

        instance.resizeObserver = new ResizeObserver(() => {
          try { fitAddon.fit(); } catch (e) { /* terminal may be hidden */ }
          if (instance.ws?.readyState === WebSocket.OPEN) {
            instance.ws.send(JSON.stringify({ type: 'resize', cols: instance.terminal.cols, rows: instance.terminal.rows }));
          }
        });
        instance.resizeObserver.observe(instance.containerRef);
      }
    });

    terminal.onData((data) => {
      if (instance.ws?.readyState === WebSocket.OPEN) {
        instance.ws.send(new TextEncoder().encode(data));
      }
    });

    return instance;
  };

  const connectTerminal = (instance: TerminalInstance, isRetry = false) => {
    if (instance.retryTimeout) clearTimeout(instance.retryTimeout);
    const url = `${wsUrl('/terminal')}?cwd=${encodeURIComponent(instance.cwd)}`;
    const ws = new WebSocket(url);
    instance.ws = ws;
    instance.status = isRetry ? 'reconnecting' : 'connecting';
    setTerminals(prev => prev.map(t => t.id === instance.id ? { ...t, status: instance.status, retryCount: isRetry ? t.retryCount : 0 } : t));

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      instance.status = 'connected';
      instance.retryCount = 0;
      setTerminals(prev => prev.map(t => t.id === instance.id ? { ...t, status: 'connected', retryCount: 0 } : t));
      instance.terminal.writeln('\r\n\x1b[90m— connected —\x1b[0m');
      ws.send(JSON.stringify({ type: 'resize', cols: instance.terminal.cols, rows: instance.terminal.rows }));
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        instance.terminal.write(new Uint8Array(event.data));
      } else if (typeof event.data === 'string') {
        instance.terminal.write(event.data);
      }
    };

    ws.onclose = () => {
      instance.status = 'disconnected';
      setTerminals(prev => prev.map(t => t.id === instance.id ? { ...t, status: 'disconnected' } : t));
      instance.terminal.writeln('\r\n\x1b[90m— terminal disconnected —\x1b[0m');
      if (instance.retryCount < 5) {
        instance.retryCount++;
        const delay = Math.min(1000 * Math.pow(2, instance.retryCount - 1), 30000);
        instance.terminal.writeln(`\x1b[90mReconnecting in ${delay/1000}s (attempt ${instance.retryCount}/5)...\x1b[0m`);
        instance.retryTimeout = setTimeout(() => {
          instance.terminal.clear();
          connectTerminal(instance, true);
        }, delay);
      } else {
        instance.terminal.writeln('\x1b[91mTerminal failed to reconnect after 5 attempts. Click "+" to create new.\x1b[0m');
      }
    };

    ws.onerror = (err) => {
      console.warn('Terminal WS error:', err);
      if (instance.ws === ws) {
        instance.ws = null;
      }
    };
  };

  const closeTerminal = (id: string) => {
    const term = terminals().find(t => t.id === id);
    if (!term) return;

    // Check if process might be running (connected status)
    if (term.status === 'connected') {
      setConfirmClose(id);
      return;
    }

    doCloseTerminal(id);
  };

  const doCloseTerminal = (id: string) => {
    const term = terminals().find(t => t.id === id);
    if (!term) return;

    if (term.retryTimeout) clearTimeout(term.retryTimeout);
    term.ws?.close();
    term.resizeObserver?.disconnect();
    term.terminal.dispose();

    const remaining = terminals().filter(t => t.id !== id);
    setTerminals(remaining);
    setConfirmClose(null);

    if (activeId() === id && remaining.length > 0) {
      setActiveId(remaining[remaining.length - 1].id);
    }
  };

  const reconnectTerminal = (id: string) => {
    const term = terminals().find(t => t.id === id);
    if (!term) return;
    if (term.retryTimeout) clearTimeout(term.retryTimeout);
    term.ws?.close();
    term.terminal.clear();
    term.retryCount = 0;
    connectTerminal(term);
  };

  const killTerminal = (id: string) => {
    const term = terminals().find(t => t.id === id);
    if (!term || !term.ws) return;
    try {
      term.ws.send(JSON.stringify({ type: 'kill' }));
    } catch {}
    setTimeout(() => doCloseTerminal(id), 500);
  };

  // Switch to active terminal's visible container
  const switchToTerminal = (id: string) => {
    setActiveId(id);
    const term = terminals().find(t => t.id === id);
    if (term) {
      requestAnimationFrame(() => {
        try { term.fitAddon.fit(); } catch {}
        if (term.ws?.readyState === WebSocket.OPEN) {
          term.ws.send(JSON.stringify({ type: 'resize', cols: term.terminal.cols, rows: term.terminal.rows }));
        }
      });
    }
  };

  // Create first terminal on mount + listen for run events from chat
  onMount(() => {
    createTerminal(props.projectPath);

    const handleTerminalRun = (e: any) => {
      const detail = e.detail;
      if (!detail?.code) return;
      const activeTerm = terminals().find(t => t.id === activeId());
      if (activeTerm?.ws?.readyState === WebSocket.OPEN) {
        // Send code to terminal (multi-line supported by backend WS)
        const toSend = detail.code.includes('\n') 
          ? `cat > /tmp/don_run.sh << 'EOF'\n${detail.code}\nEOF\nbash /tmp/don_run.sh\n`
          : detail.code + '\n';
        activeTerm.ws.send(new TextEncoder().encode(toSend));
      }
    };
    window.addEventListener('terminal-run', handleTerminalRun);
    onCleanup(() => window.removeEventListener('terminal-run', handleTerminalRun));
  });

  // React to projectPath changes — reconnect all terminals
  createEffect(() => {
    const newPath = props.projectPath;
    if (!newPath) return;
    for (const term of terminals()) {
      if (term.cwd !== newPath) {
        term.cwd = newPath;
        if (term.retryTimeout) clearTimeout(term.retryTimeout);
        term.ws?.close();
        term.terminal.clear();
        connectTerminal(term);
      }
    }
  });

  onCleanup(() => {
    for (const term of terminals()) {
      if (term.retryTimeout) clearTimeout(term.retryTimeout);
      term.ws?.close();
      term.resizeObserver?.disconnect();
      term.terminal.dispose();
    }
  });

  const getStatusColor = (status: string) => {
    if (status === 'connected') return { bg: 'bg-hermes-green', shadow: 'box-shadow: 0 0 4px #00ff9f;' };
    if (status === 'connecting' || status === 'reconnecting') return { bg: 'bg-hermes-cyan animate-pulse', shadow: 'box-shadow: 0 0 4px #00f3ff;' };
    return { bg: 'bg-hermes-magenta', shadow: 'box-shadow: 0 0 4px #ff00cc;' };
  };

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div class="flex items-center gap-0 px-1 border-b border-hermes-cyan/20 flex-shrink-0">
        <div class="flex gap-0 overflow-x-auto flex-1">
          <For each={terminals()}>
            {(term) => {
              const statusStyle = getStatusColor(term.status);
              return (
                <button
                  class={`flex items-center gap-1 px-2 py-1 text-[10px] transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
                    activeId() === term.id
                      ? 'text-hermes-green border-hermes-green'
                      : 'text-hermes-text-dim border-transparent hover:text-hermes-cyan'
                  }`}
                  onClick={() => switchToTerminal(term.id)}
                >
                  <span
                    class={`w-1.5 h-1.5 rounded-full ${statusStyle.bg}`}
                    style={statusStyle.shadow}
                  />
                  <span>{term.name}</span>
                  <span
                    class="ml-1 text-hermes-text-dim/50 hover:text-hermes-magenta hover:bg-hermes-magenta/10 rounded px-0.5 text-[9px]"
                    onClick={(e) => { e.stopPropagation(); closeTerminal(term.id); }}
                  >
                    ×
                  </span>
                </button>
              );
            }}
          </For>
        </div>
        <button
          class="px-2 py-1 text-hermes-text-dim hover:text-hermes-cyan text-xs transition-colors"
          onClick={() => createTerminal(props.projectPath)}
          title="New terminal"
        >
          +
        </button>
      </div>

      {/* Terminal containers */}
      <div class="flex-1 min-h-0 relative">
        <For each={terminals()}>
          {(term) => (
            <div
              ref={(el) => { term.containerRef = el; }}
              class="absolute inset-0"
              style={{
                display: activeId() === term.id ? 'block' : 'none',
                padding: '4px',
              }}
            />
          )}
        </For>
      </div>

      {/* Confirm close dialog */}
      <Show when={confirmClose()}>
        {(id) => {
          const term = terminals().find(t => t.id === id());
          return (
            <div class="absolute inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
              <div class="p-4 rounded-lg text-center" style={{ background: '#0d0d14', border: '1px solid rgba(0,243,255,0.3)' }}>
                <div class="text-xs text-hermes-text mb-3">Close "{term?.name}"? Process may still be running.</div>
                <div class="flex gap-2 justify-center">
                  <button
                    class="px-3 py-1 text-xs border border-hermes-text-dim/30 text-hermes-text-dim hover:text-hermes-text rounded cursor-pointer"
                    onClick={() => setConfirmClose(null)}
                  >
                    Cancel
                  </button>
                  <button
                    class="px-3 py-1 text-xs bg-hermes-magenta/20 text-hermes-magenta hover:bg-hermes-magenta/30 rounded cursor-pointer"
                    onClick={() => killTerminal(id())}
                  >
                    Kill & Close
                  </button>
                  <button
                    class="px-3 py-1 text-xs border border-hermes-text-dim/30 text-hermes-text-dim hover:text-hermes-text rounded cursor-pointer"
                    onClick={() => doCloseTerminal(id())}
                  >
                    Force Close
                  </button>
                </div>
              </div>
            </div>
          );
        }}
      </Show>
    </div>
  );
}
