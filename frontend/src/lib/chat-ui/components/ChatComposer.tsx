import { createSignal, createEffect, onMount, onCleanup, For, Show } from 'solid-js';
import { createAutoResize } from '../hooks/createAutoResize';

interface ChatComposerProps {
  key?: string;
  onSubmit: (text: string, images?: string[]) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder?: string;
  // Slash command handlers
  onSlashCommand?: (command: string, args: string) => Promise<void>;
}

const SLASH_COMMANDS = [
  { cmd: '/help', desc: 'Show available commands' },
  { cmd: '/new', desc: 'Start a new conversation' },
  { cmd: '/clear', desc: 'Clear chat history' },
  { cmd: '/stop', desc: 'Stop streaming response' },
  { cmd: '/retry', desc: 'Retry last user message' },
  { cmd: '/status', desc: 'Show gateway status' },
  { cmd: '/model <name>', desc: 'Change model (e.g. /model qwen3.6)' },
  { cmd: '/steer <mode>', desc: 'Busy mode (queue|steer|interrupt|status)' },
  { cmd: '/bg <prompt>', desc: 'Run prompt in background' },
  { cmd: '/queue <prompt>', desc: 'Queue message for later' },
  { cmd: '/compact', desc: 'Compress current session' },
  { cmd: '/session list', desc: 'List session clusters' },
  { cmd: '/profile [name]', desc: 'Switch or show profile' },
];

/** Convert file to base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ChatComposer(props: ChatComposerProps) {
  let textareaRef: HTMLTextAreaElement | undefined;
  let fileInputRef: HTMLInputElement | undefined;
  const [text, setText] = createSignal('');
  const [showCommands, setShowCommands] = createSignal(false);
  const [selectedIdx, setSelectedIdx] = createSignal(0);
  const [attachedImages, setAttachedImages] = createSignal<string[]>([]);

  const { attach, detach, resize } = createAutoResize(
    () => textareaRef,
    { minRows: 1, maxRows: 6 }
  );

  onMount(() => attach());
  onCleanup(() => detach());

  createEffect(() => {
    text(); // track
    resize();
  });

  const filteredCommands = () => {
    const t = text();
    if (!t.startsWith('/')) return [];
    const partial = t.toLowerCase();
    return SLASH_COMMANDS.filter((c) => c.cmd.startsWith(partial));
  };

  createEffect(() => {
    const cmds = filteredCommands();
    setShowCommands(cmds.length > 0 && text().startsWith('/'));
    if (selectedIdx() >= cmds.length) setSelectedIdx(0);
  });

  const canSubmit = () => text().trim() || attachedImages().length > 0;

  const handleSubmit = async () => {
    const t = text().trim();
    const images = attachedImages();
    if ((!t && images.length === 0) || props.streaming) return;

    setText('');
    setAttachedImages([]);
    if (textareaRef) textareaRef.value = '';
    if (fileInputRef) fileInputRef.value = '';
    resize();
    setShowCommands(false);

    // Route slash commands
    if (t.startsWith('/')) {
      const parts = t.split(' ', 2);
      const cmd = parts[0].toLowerCase();
      const args = parts[1] || '';
      if (props.onSlashCommand) {
        await props.onSlashCommand(cmd, args);
        return;
      }
    }

    props.onSubmit(t || '(image)', images.length > 0 ? images : undefined);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (showCommands()) {
      const cmds = filteredCommands();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => (i + 1) % cmds.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => (i - 1 + cmds.length) % cmds.length);
        return;
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          const cmd = cmds[selectedIdx()];
          if (cmd) {
            setText(cmd.cmd + ' ');
            if (textareaRef) textareaRef.value = cmd.cmd + ' ';
            setShowCommands(false);
            resize();
          }
          return;
        }
      }
      if (e.key === 'Escape') {
        setShowCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e: InputEvent) => {
    setText((e.target as HTMLTextAreaElement).value);
  };

  const selectCommand = (cmd: string) => {
    setText(cmd + ' ');
    if (textareaRef) textareaRef.value = cmd + ' ';
    setShowCommands(false);
    textareaRef?.focus();
    resize();
  };

  const handleFileChange = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || files.length === 0) return;

    const images = [...attachedImages()];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      if (file.size > 10 * 1024 * 1024) {
        console.warn('Image too large (>10MB):', file.name);
        continue;
      }
      try {
        const base64 = await fileToBase64(file);
        images.push(base64);
      } catch (err) {
        console.error('Failed to load image:', err);
      }
    }
    setAttachedImages(images);
    if (fileInputRef) fileInputRef.value = '';
  };

  const removeImage = (index: number) => {
    setAttachedImages(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Slash command dropdown */}
      <Show when={showCommands()}>
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: '0',
            right: '0',
            'margin-bottom': '4px',
            background: 'rgba(10,10,20,0.97)',
            border: '1px solid rgba(0,243,255,0.2)',
            'border-radius': '8px',
            overflow: 'hidden',
            'backdrop-filter': 'blur(12px)',
            'z-index': '20',
          }}
        >
          <For each={filteredCommands()}>
            {(item, i) => (
              <div
                onClick={() => selectCommand(item.cmd)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  'align-items': 'center',
                  gap: '10px',
                  background: i() === selectedIdx() ? 'rgba(0,243,255,0.1)' : 'transparent',
                  'font-family': "'JetBrains Mono', monospace",
                  'font-size': '13px',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={() => setSelectedIdx(i())}
              >
                <span style={{ color: '#00f3ff', 'font-weight': '600' }}>{item.cmd}</span>
                <span style={{ color: '#666', 'font-size': '12px' }}>{item.desc}</span>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Image preview strip */}
      <Show when={attachedImages().length > 0}>
        <div
          style={{
            display: 'flex',
            gap: '6px',
            padding: '4px 0',
            overflow: 'hidden',
            'flex-wrap': 'wrap',
          }}
        >
          <For each={attachedImages()}>
            {(imgUrl, idx) => (
              <div
                style={{
                  position: 'relative',
                  width: '60px',
                  height: '60px',
                  'border-radius': '6px',
                  overflow: 'hidden',
                  border: '1px solid rgba(0,243,255,0.3)',
                  'flex-shrink': 0,
                }}
              >
                <img
                  src={imgUrl}
                  alt="Preview"
                  style={{ width: '100%', height: '100%', 'object-fit': 'cover' }}
                />
                <button
                  onClick={() => removeImage(idx())}
                  style={{
                    position: 'absolute',
                    top: '2px',
                    right: '2px',
                    width: '16px',
                    height: '16px',
                    'border-radius': '50%',
                    background: 'rgba(255,68,68,0.8)',
                    border: 'none',
                    color: 'white',
                    'font-size': '10px',
                    cursor: 'pointer',
                    display: 'flex',
                    'align-items': 'center',
                    'justify-content': 'center',
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      {/* Input area */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          'align-items': 'flex-end',
          padding: '8px',
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(0,243,255,0.2)',
          'border-radius': '10px',
          transition: 'border-color 0.2s, box-shadow 0.2s',
        }}
        onFocusIn={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = 'rgba(0,243,255,0.5)';
          el.style.boxShadow = '0 0 12px rgba(0,243,255,0.15)';
        }}
        onFocusOut={(e) => {
          const el = e.currentTarget as HTMLElement;
          el.style.borderColor = 'rgba(0,243,255,0.2)';
          el.style.boxShadow = 'none';
        }}
      >
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* Attach image button */}
        <button
          type="button"
          onClick={() => fileInputRef?.click()}
          title="Attach image"
          style={{
            'flex-shrink': 0,
            width: '32px',
            height: '32px',
            'border-radius': '6px',
            border: '1px solid rgba(0,243,255,0.2)',
            background: 'rgba(0,243,255,0.05)',
            color: 'rgba(0,243,255,0.6)',
            'font-size': '14px',
            cursor: 'pointer',
            display: 'flex',
            'align-items': 'center',
            'justify-content': 'center',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,243,255,0.15)';
            (e.currentTarget as HTMLElement).style.color = '#00f3ff';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'rgba(0,243,255,0.05)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(0,243,255,0.6)';
          }}
        >
          📎
        </button>

        <textarea
          ref={textareaRef}
          value={text()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={props.placeholder ?? 'Type a message... (/ for commands)'}
          rows={1}
          style={{
            flex: '1',
            resize: 'none',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#ddd',
            'font-family': "'JetBrains Mono', monospace",
            'font-size': '14px',
            'line-height': '1.5',
            padding: '4px 0',
            'min-height': '24px',
            opacity: props.streaming ? '0.5' : '1',
          }}
        />

        <Show
          when={!props.streaming}
          fallback={
            <button
              onClick={props.onStop}
              title="Stop generation"
              style={{
                'flex-shrink': '0',
                width: '36px',
                height: '36px',
                'border-radius': '8px',
                border: '1px solid rgba(255,68,68,0.4)',
                background: 'rgba(255,68,68,0.1)',
                color: '#ff4444',
                'font-size': '16px',
                cursor: 'pointer',
                display: 'flex',
                'align-items': 'center',
                'justify-content': 'center',
                transition: 'background 0.2s',
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = 'rgba(255,68,68,0.2)')
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = 'rgba(255,68,68,0.1)')
              }
            >
              ■
            </button>
          }
        >
          <button
            onClick={handleSubmit}
            disabled={!canSubmit()}
            title="Send message"
            style={{
              'flex-shrink': '0',
              width: '36px',
              height: '36px',
              'border-radius': '8px',
              border: '1px solid rgba(0,243,255,0.3)',
              background: canSubmit() ? 'rgba(0,243,255,0.15)' : 'rgba(0,243,255,0.05)',
              color: canSubmit() ? '#00f3ff' : 'rgba(0,243,255,0.3)',
              'font-size': '16px',
              cursor: canSubmit() ? 'pointer' : 'default',
              display: 'flex',
              'align-items': 'center',
              'justify-content': 'center',
              transition: 'background 0.2s, box-shadow 0.2s',
            }}
            onMouseEnter={(e) => {
              if (canSubmit()) {
                (e.currentTarget as HTMLElement).style.background = 'rgba(0,243,255,0.25)';
                (e.currentTarget as HTMLElement).style.boxShadow =
                  '0 0 10px rgba(0,243,255,0.3)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = canSubmit()
                ? 'rgba(0,243,255,0.15)'
                : 'rgba(0,243,255,0.05)';
              (e.currentTarget as HTMLElement).style.boxShadow = 'none';
            }}
          >
            ▶
          </button>
        </Show>
      </div>
    </div>
  );
}
