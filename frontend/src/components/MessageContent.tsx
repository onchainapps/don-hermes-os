/**
 * MessageContent — Markdown rendering with code highlighting
 * Extracted from the retired chat-ui library. Standalone component
 * using shiki for syntax highlighting and DOMPurify for safety.
 * Used exclusively by ProfileChat.
 */
import { createSignal, createResource, For, Show } from 'solid-js';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

// ─── Markdown config ──────────────────────────────────────────────────────

marked.setOptions({ gfm: true, breaks: true });

function parseMarkdown(text: string): string {
  return marked.parse(text) as string;
}

// ─── Shiki highlighter singleton ─────────────────────────────────────────┐

let highlighterPromise: Promise<any> | null = null;
let highlighterInstance: any = null;

async function getHighlighter() {
  if (highlighterInstance) return highlighterInstance;
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(async ({ createHighlighter }) => {
      const h = await createHighlighter({
        langs: ['javascript', 'typescript', 'python', 'bash', 'json', 'html', 'css', 'rust', 'go', 'java', 'c', 'cpp'],
        themes: ['github-dark'],
      });
      highlighterInstance = h;
      return h;
    });
  }
  return highlighterPromise;
}

// ─── Parse content into segments (text + code blocks) ────────────────────

interface CodeBlock { type: 'code'; language: string; code: string; id: string; }
interface TextSegment { type: 'text'; text: string; }

type Segment = CodeBlock | TextSegment;

let blockIdCounter = 0;

function splitIntoSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  const fenceRegex = /```(\w*)\n?([\s\S]*?)```/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = fenceRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index);
      if (text.trim()) segments.push({ type: 'text', text });
    }
    const lang = match[1] || 'text';
    const code = match[2] ?? '';
    const cleanCode = code.replace(/^\n/, '').replace(/\n$/, '');
    segments.push({ type: 'code', language: lang, code: cleanCode, id: `cb_${++blockIdCounter}` });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    const text = content.slice(lastIndex);
    if (text.trim()) segments.push({ type: 'text', text });
  }
  if (segments.length === 0 && content.trim()) {
    segments.push({ type: 'text', text: content });
  }
  return segments;
}

// ─── Code highlighting ─────────────────────────────────────────────────────

const langMap: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash',
  shell: 'bash', zsh: 'bash', cmd: 'bash', rb: 'ruby',
  cs: 'csharp', md: 'markdown', yml: 'yaml',
};

async function highlightCode(language: string, code: string): Promise<string> {
  const highlighter = await getHighlighter();
  const resolved = langMap[language.toLowerCase()] || language.toLowerCase();
  if (!highlighter.getLoadedLanguages().includes(resolved)) {
    try { await highlighter.loadLanguage(resolved); }
    catch { return `<code class="shiki-plain">${escapeHtml(code)}</code>`; }
  }
  return highlighter.codeToHtml(code, { lang: resolved, theme: 'github-dark' });
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface MessageContentProps {
  content: string;
  /** Only the LAST streaming message gets a cursor. Parent controls this. */
  streaming?: boolean;
}

// ─── CodeBlock component ──────────────────────────────────────────────────────

function CodeBlockView(props: { language: string; code: string }) {
  const [copied, setCopied] = createSignal(false);
  const [highlighted] = createResource(
    () => ({ lang: props.language, code: props.code }),
    async ({ lang, code }) => highlightCode(lang, code)
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(props.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = props.code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleRun = () => {
    window.dispatchEvent(new CustomEvent('terminal-run', {
      detail: { code: props.code, language: props.language },
    }));
  };

  return (
    <div class="mc-code-block">
      <div class="mc-code-header">
        <span class="mc-code-lang">{props.language}</span>
        <div class="flex gap-2">
          <button class="mc-run-btn" onClick={handleRun} title="Run in terminal">▶ run</button>
          <button class="mc-copy-btn" onClick={handleCopy}>{copied() ? '✓ copied' : '⎘ copy'}</button>
        </div>
      </div>
      <div class="mc-code-body" innerHTML={highlighted() || '<div class="mc-code-loading">highlighting…</div>'} />
    </div>
  );
}

// ─── StreamingCursor ─────────────────────────────────────────────────────────

function StreamingCursor() {
  return <span class="mc-cursor" />;
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function MessageContent(props: MessageContentProps) {
  const segments = () => splitIntoSegments(props.content);

  return (
    <div class="mc-root">
      <For each={segments()}>
        {(segment) => (
          segment.type === 'text' ? (
            <div class="mc-markdown" innerHTML={DOMPurify.sanitize(parseMarkdown(segment.text))} />
          ) : (
            <CodeBlockView language={(segment as CodeBlock).language} code={(segment as CodeBlock).code} />
          )
        )}
      </For>
      <Show when={props.streaming}><StreamingCursor /></Show>

      <style>{`
        .mc-root {
          font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
          font-size: 13px;
          line-height: 1.7;
          color: #e0ffe8;
          word-break: break-word;
        }
        .mc-markdown :global(p) { margin: 6px 0; }
        .mc-markdown :global(h1),
        .mc-markdown :global(h2),
        .mc-markdown :global(h3) { color: #00f3ff; margin: 12px 0 6px; font-weight: 600; }
        .mc-markdown :global(h1) { font-size: 1.3em; }
        .mc-markdown :global(h2) { font-size: 1.15em; }
        .mc-markdown :global(h3) { font-size: 1.05em; }
        .mc-markdown :global(strong) { color: #fff; }
        .mc-markdown :global(em) { color: rgba(170, 255, 204, 0.8); }
        .mc-markdown :global(a) { color: #00f3ff; text-decoration: underline; text-underline-offset: 2px; }
        .mc-markdown :global(a:hover) { color: #00ff9f; text-shadow: 0 0 6px rgba(0,255,159,0.4); }
        .mc-markdown :global(code) { background: rgba(0,255,159,0.08); border: 1px solid rgba(0,255,159,0.15); border-radius: 3px; padding: 1px 5px; font-size: 0.92em; color: #00ff9f; }
        .mc-markdown :global(ul), .mc-markdown :global(ol) { padding-left: 22px; margin: 6px 0; }
        .mc-markdown :global(li) { margin: 3px 0; }
        .mc-markdown :global(blockquote) { border-left: 2px solid rgba(0,243,255,0.3); padding-left: 12px; margin: 6px 0; color: rgba(170,255,204,0.6); }
        .mc-markdown :global(table) { border-collapse: collapse; margin: 8px 0; width: 100%; }
        .mc-markdown :global(th) { background: rgba(0,243,255,0.08); border: 1px solid rgba(0,255,159,0.15); padding: 6px 10px; text-align: left; color: #00f3ff; font-weight: 600; }
        .mc-markdown :global(td) { border: 1px solid rgba(0,255,159,0.1); padding: 5px 10px; }
        .mc-markdown :global(tr:hover td) { background: rgba(0,255,159,0.03); }
        .mc-markdown :global(hr) { border: none; border-top: 1px solid rgba(0,255,159,0.12); margin: 12px 0; }
        .mc-markdown :global(img) { max-width: 100%; border-radius: 6px; border: 1px solid rgba(0,255,159,0.1); }
        .mc-code-block { background: rgba(0,0,0,0.4); border: 1px solid rgba(0,255,159,0.12); border-radius: 6px; margin: 10px 0; overflow: hidden; }
        .mc-code-header { display: flex; justify-content: space-between; align-items: center; padding: 5px 12px; background: rgba(0,243,255,0.05); border-bottom: 1px solid rgba(0,255,159,0.1); }
        .mc-code-lang { font-size: 11px; color: #00f3ff; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; }
        .mc-copy-btn { background: rgba(0,255,159,0.08); border: 1px solid rgba(0,255,159,0.2); color: #00ff9f; font-family: "JetBrains Mono", monospace; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: all 0.15s ease; }
        .mc-copy-btn:hover { background: rgba(0,255,159,0.15); box-shadow: 0 0 8px rgba(0,255,159,0.2); }
        .mc-run-btn { background: rgba(0,255,159,0.15); border: 1px solid #00ff9f; color: #00ff9f; font-family: "JetBrains Mono", monospace; font-size: 11px; padding: 2px 8px; border-radius: 4px; cursor: pointer; transition: all 0.15s ease; }
        .mc-run-btn:hover { background: #00ff9f; color: #050507; box-shadow: 0 0 8px #00ff9f; }
        .mc-code-body { padding: 10px 12px; overflow-x: auto; }
        .mc-code-body :global(pre) { margin: 0; background: none !important; padding: 0 !important; }
        .mc-code-body :global(code) { background: none !important; border: none !important; padding: 0 !important; font-size: 12.5px; line-height: 1.6; color: inherit; }
        .mc-code-body :global(.shiki-plain) { color: #e0ffe8; white-space: pre; }
        .mc-code-loading { color: rgba(170,255,204,0.3); font-style: italic; font-size: 12px; }
        .mc-cursor { display: inline-block; width: 2px; height: 1.1em; background: #00ff9f; vertical-align: text-bottom; margin-left: 1px; animation: mc-blink 0.7s step-end infinite; box-shadow: 0 0 6px rgba(0,255,159,0.5); }
        @keyframes mc-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
