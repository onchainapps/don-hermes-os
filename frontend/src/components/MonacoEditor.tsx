import { apiUrl } from '../lib/api-base';
import { gatewayChatUrl, gatewayHeaders } from '../lib/gateway';
import { hermesGet } from '../lib/hermesApi';
import { onMount, onCleanup, createSignal, createEffect, Show, For } from 'solid-js';
import * as monaco from 'monaco-editor';
import ContextMenu, { type ContextMenuItem } from './ContextMenu';
import CommandPalette, { type Command } from './CommandPalette';
import ProjectSearch from './ProjectSearch';
import { registerCodeCompletions } from './CodeCompletions';
import DiffPreview from './DiffPreview';
import InlineEdit from './InlineEdit';

// Monaco workers — bundled via Vite import
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';

// Wire up workers globally (must happen before any editor is created)
if (!self.MonacoEnvironment) {
  self.MonacoEnvironment = {
    getWorker(_: any, label: string) {
      switch (label) {
        case 'typescript':
        case 'javascript':
          return new tsWorker();
        case 'json':
          return new jsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new cssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new htmlWorker();
        default:
          return new editorWorker();
      }
    },
  };
}

// TypeScript compiler options — strict + modern
// @ts-ignore
(monaco.languages.typescript as any).typescriptDefaults.setCompilerOptions({
  target: (monaco.languages.typescript as any).ScriptTarget.ESNext,
  module: (monaco.languages.typescript as any).ModuleKind.ESNext,
  moduleResolution: (monaco.languages.typescript as any).ModuleResolutionKind.NodeJs,
  jsx: (monaco.languages.typescript as any).JsxEmit.ReactJSX,
  strict: true,
  esModuleInterop: true,
  allowSyntheticDefaultImports: true,
  noUnusedLocals: true,
  noUnusedParameters: true,
  noImplicitReturns: true,
  noFallthroughCasesInSwitch: true,
  skipLibCheck: true,
});

// Extra diagnostics for TypeScript
// @ts-ignore
monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: false,
  noSyntaxValidation: false,
});

// Register the cyberpunk "hermes" theme
monaco.editor.defineTheme('hermes', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6a7a5a', fontStyle: 'italic' },
    { token: 'keyword', foreground: '00f3ff' },
    { token: 'keyword.control', foreground: 'ff00cc' },
    { token: 'string', foreground: '00ff9f' },
    { token: 'string.escape', foreground: 'ffd700' },
    { token: 'number', foreground: 'ffd700' },
    { token: 'type', foreground: '00f3ff' },
    { token: 'type.identifier', foreground: '00f3ff' },
    { token: 'function', foreground: 'e0ffe8' },
    { token: 'variable', foreground: 'e0ffe8' },
    { token: 'variable.predefined', foreground: 'ff00cc' },
    { token: 'constant', foreground: 'ffd700' },
    { token: 'delimiter', foreground: 'aaffcc' },
    { token: 'tag', foreground: '00f3ff' },
    { token: 'attribute.name', foreground: 'ff00cc' },
    { token: 'attribute.value', foreground: '00ff9f' },
    { token: 'delimiter.curly', foreground: '00f3ff' },
    { token: 'delimiter.square', foreground: 'ffd700' },
    { token: 'delimiter.parenthesis', foreground: 'aaffcc' },
  ],
  colors: {
    'editor.background': '#050507',
    'editor.foreground': '#e0ffe8',
    'editor.lineHighlightBackground': '#00f3ff08',
    'editor.selectionBackground': '#00f3ff25',
    'editor.inactiveSelectionBackground': '#00f3ff12',
    'editorCursor.foreground': '#00f3ff',
    'editorWhitespace.foreground': '#00f3ff15',
    'editorIndentGuide.background': '#00f3ff10',
    'editorIndentGuide.activeBackground': '#00f3ff25',
    'editorLineNumber.foreground': '#00f3ff40',
    'editorLineNumber.activeForeground': '#00f3ff',
    'editor.findMatchBackground': '#ffd70030',
    'editor.findMatchHighlightBackground': '#ffd70018',
    'editorBracketMatch.background': '#00f3ff20',
    'editorBracketMatch.border': '#00f3ff80',
    'editorGutter.background': '#050507',
    'editorOverviewRuler.border': '#00f3ff15',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#00f3ff15',
    'scrollbarSlider.hoverBackground': '#00f3ff30',
    'scrollbarSlider.activeBackground': '#00f3ff40',
    'minimap.background': '#050507',
    'minimapSlider.background': '#00f3ff10',
    'minimapSlider.hoverBackground': '#00f3ff20',
    'minimapSlider.activeBackground': '#00f3ff30',
  },
});

// File tab interface
interface FileTab {
  name: string;
  language: string;
  model: monaco.editor.ITextModel;
  /** Server file path (undefined for scratch/default files) */
  filePath?: string;
  /** Dirty state tracking */
  dirty: boolean;
  /** Original content for dirty comparison */
  originalContent: string;
  /** Disposer for dirty tracking listener */
  listenerDisposer?: { dispose: () => void };
}

// ─── Error Lens: inline error/warning decorations ──────────────────────────────

function setupErrorLens(editor: monaco.editor.IStandaloneCodeEditor) {
  let decorations: string[] = [];

  const updateDecorations = () => {
    const model = editor.getModel();
    if (!model) return;

    const markers = monaco.editor.getModelMarkers({ resource: model.uri });
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = markers
      .filter(m => m.severity >= 4) // Error (8) + Warning (4)
      .map(m => ({
        range: new monaco.Range(m.startLineNumber, m.startColumn, m.endLineNumber, m.endColumn),
        options: {
          after: {
            content: `  ⚠ ${m.message.split('\n')[0]}`,
            color: m.severity === 8 ? '#ff006e80' : '#ffd70080', // Error=red, Warning=yellow
            fontStyle: 'italic',
            fontSize: '11px',
          },
          zIndex: 1000,
          overviewRuler: {
            color: m.severity === 8 ? '#ff006e' : '#ffd700',
            position: monaco.editor.OverviewRulerLane.Right,
          },
        },
      }));

    decorations = editor.deltaDecorations(decorations, newDecorations);
  };

  // Update on marker changes
  const markerDisposable = monaco.editor.onDidChangeMarkers(() => updateDecorations());
  // Also update on model change
  editor.onDidChangeModel(() => updateDecorations());
  // Initial
  updateDecorations();

  return markerDisposable;
}

// Default starter files (used when no session exists)
const DEFAULT_FILES: { name: string; language: string; content: string }[] = [
  {
    name: 'index.ts',
    language: 'typescript',
    content: `// Don's Dashboard — Code Editor
// TypeScript with full IntelliSense

interface DashboardConfig {
  theme: 'hermes' | 'default';
  refreshRate: number;
  features: string[];
}

const config: DashboardConfig = {
  theme: 'hermes',
  refreshRate: 2000,
  features: ['metrics', 'wiki', 'ssh', 'code'],
};

export function initDashboard(cfg: DashboardConfig): void {
  // console.log(\`Initializing \${cfg.theme} dashboard...\`);
  // console.log(\`Features: \${cfg.features.join(', ')}\`);
}

initDashboard(config);
`,
  },
  {
    name: 'utils.ts',
    language: 'typescript',
    content: `// Utility functions

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return \`\${h.toString().padStart(2, '0')}:\${m.toString().padStart(2, '0')}:\${s.toString().padStart(2, '0')}\`;
}

export function bytesToGB(bytes: number): string {
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
`,
  },
  {
    name: 'config.json',
    language: 'json',
    content: `{
  "editor": {
    "theme": "hermes",
    "fontSize": 14,
    "fontFamily": "JetBrains Mono, Fira Code, monospace",
    "minimap": { "enabled": true },
    "cursorBlinking": "smooth",
    "cursorSmoothCaretAnimation": "on",
    "smoothScrolling": true,
    "tabSize": 2
  }
}
`,
  },
];

// --- Session persistence types ---
interface TabSessionEntry {
  name: string;
  language: string;
  filePath?: string;
}

interface EditorSession {
  tabs: TabSessionEntry[];
  activeTab: string;
}

// localStorage keys
const SESSION_KEY_PREFIX = 'don-editor-session:';
const SCRATCH_KEY_PREFIX = 'don-editor:';

function getSessionKey(projectRoot?: string): string {
  if (!projectRoot || projectRoot === '/home/don/dev') {
    return `${SESSION_KEY_PREFIX}default`;
  }
  return `${SESSION_KEY_PREFIX}${projectRoot}`;
}

/** Serialize current tab list + active tab to localStorage */
function saveSession(tabs: FileTab[], activeTab: string, projectRoot?: string) {
  const session: EditorSession = {
    tabs: tabs.map(t => ({ name: t.name, language: t.language, filePath: t.filePath })),
    activeTab,
  };
  try {
    localStorage.setItem(getSessionKey(projectRoot), JSON.stringify(session));
  } catch {}
}

/** Serialize a scratch file's content to localStorage */
function saveScratchContent(tabName: string, content: string) {
  try {
    localStorage.setItem(`${SCRATCH_KEY_PREFIX}${tabName}`, content);
  } catch {}
}

// Detect language from file extension
function langFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', css: 'css', scss: 'scss', less: 'less',
    html: 'html', htm: 'html', md: 'markdown', py: 'python',
    rs: 'rust', go: 'go', sh: 'shell', bash: 'shell',
    yaml: 'yaml', yml: 'yaml', toml: 'ini', xml: 'xml',
    sql: 'sql', c: 'c', cpp: 'cpp', h: 'cpp', java: 'java',
    vue: 'html', svelte: 'html', astro: 'html', env: 'ini', lock: 'json',
    dockerfile: 'dockerfile', tf: 'hcl', hcl: 'hcl', proto: 'protobuf',
    graphql: 'graphql', gql: 'graphql', prisma: 'typescript', wasm: 'wat',
    r: 'r', zig: 'go', odin: 'go', nim: 'python', ex: 'elixir',
    exs: 'elixir', heex: 'html',
  };
  return map[ext] || 'plaintext';
}

interface MonacoEditorProps {
  /** Height of the editor container (default: '700px') */
  height?: string;
  /** Path to a file to load from the server API */
  activeFile?: string;
  /** Callback when user asks Don about selected code */
  onAskDon?: (prompt: string, code: string, filePath: string, language: string) => void;
  /** Current project root */
  projectRoot?: string;
  /** Callback to open file at line from search */
  onOpenFile?: (path: string, line?: number) => void;
  /** Callback when active tab changes */
  onActiveTabChange?: (filePath: string | undefined) => void;
}

export default function MonacoEditor(props: MonacoEditorProps) {
  let containerRef: HTMLDivElement | undefined;
  let editor: monaco.editor.IStandaloneCodeEditor | undefined;
  let completionDisposer: { dispose: () => void } | undefined;
  let codeActionDisposer: monaco.IDisposable | undefined;
  const commandDisposers: monaco.IDisposable[] = [];
  const [tabs, setTabs] = createSignal<FileTab[]>([]);
  const [activeTab, setActiveTab] = createSignal<string>('index.ts');
  const [isReady, setIsReady] = createSignal(false);
  let fileLoadGeneration = 0; // race condition guard for concurrent file loads

  // Command palette state
  const [showCommandPalette, setShowCommandPalette] = createSignal(false);
  // Project search state
  const [showProjectSearch, setShowProjectSearch] = createSignal(false);

  // Context menu state
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; items: ContextMenuItem[] } | null>(null);

  // Don AI features
  const [diffData, setDiffData] = createSignal<{original: string, modified: string, filePath: string} | null>(null);
  const [inlineEdit, setInlineEdit] = createSignal<{proposedCode: string, selection: any} | null>(null);

  // Profile selector for gateway requests
  const [activeProfile, setActiveProfile] = createSignal<string>('');
  const [availableProfiles, setAvailableProfiles] = createSignal<{name:string}[]>([]);

  onMount(async () => {
    try {
      const data = await hermesGet<{profiles: {name:string,status:string}[]}>('/profiles');
      setAvailableProfiles([{name:''}, ...data.profiles.map(p => ({name:p.name}))]);
    } catch { /* backend not available, leave empty */ }
  });

  /** Restore models from session or defaults. Returns [models, restoredActiveTab] */
  const initModels = (): { models: FileTab[]; restoredActiveTab: string } => {
    // Try to restore from session
    let session: EditorSession | null = null;
    try {
      const raw = localStorage.getItem(getSessionKey(props.projectRoot));
      if (raw) session = JSON.parse(raw);
    } catch {}

    // If no session or empty tabs, use defaults
    const tabEntries = session && session.tabs.length > 0
      ? session.tabs
      : DEFAULT_FILES.map(f => ({ name: f.name, language: f.language, filePath: undefined }));

    const models: FileTab[] = tabEntries.map((entry) => {
      const uri = entry.filePath ? monaco.Uri.file(entry.filePath) : monaco.Uri.parse(`file:///scratch/${entry.name}`);
      const existing = monaco.editor.getModel(uri);
      if (existing) existing.dispose();

      let content = '';
      if (!entry.filePath) {
        const saved = localStorage.getItem(`${SCRATCH_KEY_PREFIX}${entry.name}`);
        const defaultFile = DEFAULT_FILES.find(f => f.name === entry.name);
        content = saved ?? defaultFile?.content ?? `// ${entry.name}\n`;
      } else {
        content = `// Loading ${entry.name}...\n`;
      }

      const model = monaco.editor.createModel(content, entry.language, uri);
      return { name: entry.name, language: entry.language, model, filePath: entry.filePath, dirty: false, originalContent: content };
    });

    setTabs(models);
    // Set up dirty tracking for all initial models
    for (const tab of models) {
      tab.listenerDisposer = setupDirtyTracking(tab);
    }
    const restoredActiveTab = session?.activeTab && models.some(t => t.name === session!.activeTab)
      ? session.activeTab
      : models[0].name;

    return { models, restoredActiveTab };
  };

  // Switch active model
  const switchToTab = (name: string) => {
    if (!editor) return;
    const tab = tabs().find((t) => t.name === name);
    if (!tab) return;
    // Safety net: if model was disposed (zombie tab), remove it and bail
    if (tab.model.isDisposed()) {
      setTabs(prev => {
        const remaining = prev.filter(t => t.name !== name);
        if (remaining.length > 0) {
          queueMicrotask(() => switchToTab(remaining[0].name));
        }
        return remaining;
      });
      return;
    }
    editor.setModel(tab.model);
    editor.layout();
    setActiveTab(name);
    saveSession(tabs(), name, props.projectRoot);
    props.onActiveTabChange?.(tab.filePath);
    window.dispatchEvent(new CustomEvent('monaco-tab-change', { detail: { filePath: tab.filePath } }));
  };

  // Set up dirty tracking for a tab
  const setupDirtyTracking = (tab: FileTab): { dispose: () => void } => {
    const disposer = tab.model.onDidChangeContent(() => {
      const currentContent = tab.model.getValue();
      // Read originalContent from CURRENT signal, not stale closure
      const currentTab = tabs().find(t => t.name === tab.name);
      const original = currentTab?.originalContent ?? tab.originalContent;
      const isDirty = currentContent !== original;
      setTabs(prev => prev.map(t => t.name === tab.name ? { ...t, dirty: isDirty } : t));
    });
    return disposer;
  };

  // Create new file
  const createNewFile = () => {
    const name = prompt('File name (e.g., script.ts):');
    if (!name) return;
    const language = langFromPath(name);
    const uri = monaco.Uri.parse(`file:///scratch/${name}`);
    const content = `// ${name}\n`;
    const model = monaco.editor.createModel(content, language, uri);

    const newTab: FileTab = { name, language, model, dirty: false, originalContent: content };
    const newTabs = [...tabs(), newTab];
    setTabs(newTabs);
    newTab.listenerDisposer = setupDirtyTracking(newTab);
    switchToTab(name);
    saveSession(newTabs, name, props.projectRoot);
  };

  // Close tab
  const closeTab = (name: string, e: MouseEvent) => {
    e.stopPropagation();
    const current = tabs();
    if (current.length <= 1) return; // keep at least one

    const tab = current.find((t) => t.name === name);
    if (tab) {
      if (tab.listenerDisposer) tab.listenerDisposer.dispose();
      const uri = tab.filePath ? monaco.Uri.file(tab.filePath) : monaco.Uri.parse(`file:///scratch/${tab.name}`);
      monaco.editor.getModel(uri)?.dispose();
    }

    const remaining = current.filter((t) => t.name !== name);
    setTabs(remaining);

    let nextActive = activeTab();
    if (activeTab() === name) {
      nextActive = remaining[0].name;
      switchToTab(nextActive);
    }
    saveSession(remaining, nextActive, props.projectRoot);

    if (!tab?.filePath) {
      localStorage.removeItem(`${SCRATCH_KEY_PREFIX}${name}`);
    }
  };

  // Get selected code or current line
  const getSelection = () => {
    if (!editor) return { code: '', range: '' };
    const sel = editor.getSelection();
    if (!sel || sel.isEmpty()) {
      // Get current line
      const pos = editor.getPosition();
      if (pos) {
        const lineContent = editor.getModel()?.getLineContent(pos.lineNumber) || '';
        return { code: lineContent, range: `L${pos.lineNumber}` };
      }
      return { code: '', range: '' };
    }
    const model = editor.getModel();
    if (!model) return { code: '', range: '' };
    const code = model.getValueInRange(sel);
    const range = `L${sel.startLineNumber}${sel.startLineNumber !== sel.endLineNumber ? `-${sel.endLineNumber}` : ''}`;
    return { code, range };
  };

  // AI action: Ask Don about selected code
  const askDon = (action: string) => {
    const { code, range } = getSelection();
    const tab = tabs().find(t => t.name === activeTab());
    const filePath = tab?.filePath || activeTab();
    const language = tab?.language || 'plaintext';

    let prompt = '';
    switch (action) {
      case 'explain':
        prompt = `Explain this ${language} code from ${filePath} (${range}):\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'refactor':
        prompt = `Refactor this ${language} code from ${filePath} (${range}) — suggest improvements:\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'fix':
        prompt = `Find and fix bugs in this ${language} code from ${filePath} (${range}):\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'optimize':
        prompt = `Optimize this ${language} code from ${filePath} (${range}) for performance:\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'test':
        prompt = `Write tests for this ${language} code from ${filePath} (${range}):\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
      case 'docs':
        prompt = `Write documentation (JSDoc/docstring) for this ${language} code from ${filePath} (${range}):\n\`\`\`${language}\n${code}\n\`\`\``;
        break;
    }

    if (props.onAskDon && code) {
      props.onAskDon(prompt, code, filePath, language);
    }
  };

  // Perform non-streaming chat request
  const chatRequest = async (prompt: string): Promise<string> => {
    const profile = activeProfile();
    const res = await fetch(gatewayChatUrl(profile || undefined), {
      method: 'POST',
      headers: gatewayHeaders(profile || undefined),
      body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], stream: false }),
    });
    if (!res.ok) throw new Error('Chat request failed');
    const data = await res.json();
    return data.response || data.content || '';
  };

  // Extract code from diff block or plain response
  const extractCodeFromResponse = (text: string, isDiff = false): string => {
    if (isDiff) {
      const diffMatch = text.match(/```diff\n([\s\S]*?)\n```/);
      if (diffMatch && diffMatch[1]) return diffMatch[1].trim();
      const codeMatch = text.match(/```[\w]*\n([\s\S]*?)\n```/);
      if (codeMatch && codeMatch[1]) return codeMatch[1].trim();
    } else {
      const codeMatch = text.match(/```[\w]*\n?([\s\S]*?)\n?```/);
      if (codeMatch && codeMatch[1]) return codeMatch[1].trim();
      return text.trim();
    }
    return text.trim();
  };

  // Don: Diff Preview
  const performDiffPreview = async () => {
    const sel = getSelection();
    if (!sel.code || !editor) return;
    const tab = tabs().find(t => t.name === activeTab());
    const filePath = tab?.filePath || activeTab();
    const language = tab?.language || 'typescript';

    const prompt = `Provide a rewrite/refactor of this code. Respond ONLY with a diff code block using \`\`\`diff format. No explanation.

File: ${filePath}

\`\`\`${language}
${sel.code}
\`\`\``;

    try {
      const response = await chatRequest(prompt);
      const modified = extractCodeFromResponse(response, true);
      setDiffData({ original: sel.code, modified, filePath });
    } catch (err) {
      console.error('Diff preview failed:', err);
    }
  };

  // Don: Inline Edit
  const performInlineEdit = async () => {
    const selInfo = getSelection();
    if (!selInfo.code || !editor) return;
    const tab = tabs().find(t => t.name === activeTab());
    const filePath = tab?.filePath || activeTab();
    const language = tab?.language || 'typescript';
    const selection = editor.getSelection();

    const prompt = `Rewrite this selected code. Respond ONLY with the replacement code, no markdown fences, no explanation.

File: ${filePath}

\`\`\`${language}
${selInfo.code}
\`\`\``;

    try {
      const response = await chatRequest(prompt);
      let cleaned = extractCodeFromResponse(response, false);
      // Strip any remaining fences
      cleaned = cleaned.replace(/^```[\w]*\n?|\n?```$/g, '').trim();
      setInlineEdit({ proposedCode: cleaned, selection });
    } catch (err) {
      console.error('Inline edit failed:', err);
    }
  };

  // Save current file
  const saveCurrentFile = async () => {
    if (!editor) return;
    const currentTab = tabs().find(t => t.name === activeTab());
    if (!currentTab) return;

    if (currentTab.filePath) {
      try {
        const res = await fetch(apiUrl('/api/files'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: currentTab.filePath, content: currentTab.model.getValue() }),
        });
        if (!res.ok) throw new Error('Save failed');
        // Clear dirty state after successful save
        const newContent = currentTab.model.getValue();
        setTabs(prev => prev.map(t => t.name === currentTab.name ? { ...t, dirty: false, originalContent: newContent } : t));
        showSaveFeedback(true);
      } catch {
        showSaveFeedback(false);
      }
    } else {
      // Save scratch file to localStorage
      saveScratchContent(currentTab.name, currentTab.model.getValue());
      // Clear dirty state after save
      const newContent = currentTab.model.getValue();
      setTabs(prev => prev.map(t => t.name === currentTab.name ? { ...t, dirty: false, originalContent: newContent } : t));
      showSaveFeedback(true);
    }
  };

  const showSaveFeedback = (success: boolean) => {
    if (!containerRef) return;
    const overlay = document.createElement('div');
    overlay.textContent = success ? '✓ Saved' : '✗ Save failed';
    overlay.style.cssText = `position:absolute;top:12px;right:12px;color:${success ? '#00ff9f' : '#ff006e'};font:bold 13px monospace;z-index:99;text-shadow:0 0 4px ${success ? '#00ff9f' : '#ff006e'};pointer-events:none;opacity:1;transition:opacity 0.5s`;
    containerRef?.parentElement?.appendChild(overlay);
    setTimeout(() => { overlay.style.opacity = '0'; }, 800);
    setTimeout(() => { overlay.remove(); }, 1400);
  };

  // Build context menu items
  const buildContextMenu = (): ContextMenuItem[] => {
    const { code } = getSelection();
    const hasSelection = code.length > 0;

    return [
      // Standard edit operations
      { label: 'Undo', icon: '↩', shortcut: 'Ctrl+Z', action: () => editor?.trigger('context', 'undo', undefined) },
      { label: 'Redo', icon: '↪', shortcut: 'Ctrl+Shift+Z', action: () => editor?.trigger('context', 'redo', undefined) },
      { label: '', icon: '', action: () => {}, divider: true },
      { label: 'Cut', icon: '✂', shortcut: 'Ctrl+X', action: () => editor?.trigger('context', 'editor.action.clipboardCutAction', undefined), disabled: !hasSelection },
      { label: 'Copy', icon: '📋', shortcut: 'Ctrl+C', action: () => editor?.trigger('context', 'editor.action.clipboardCopyAction', undefined), disabled: !hasSelection },
      { label: 'Paste', icon: '📄', shortcut: 'Ctrl+V', action: () => editor?.trigger('context', 'editor.action.clipboardPasteAction', undefined) },
      { label: 'Select All', icon: '⊞', shortcut: 'Ctrl+A', action: () => editor?.trigger('context', 'editor.action.selectAll', undefined) },
      { label: '', icon: '', action: () => {}, divider: true },
      // Code navigation
      { label: 'Go to Definition', icon: '→', shortcut: 'F12', action: () => editor?.trigger('context', 'editor.action.revealDefinition', undefined) },
      { label: 'Peek Definition', icon: '👁', shortcut: 'Alt+F12', action: () => editor?.trigger('context', 'editor.action.peekDefinition', undefined) },
      { label: 'Find All References', icon: '🔍', shortcut: 'Shift+F12', action: () => editor?.trigger('context', 'editor.action.goToReferences', undefined) },
      { label: '', icon: '', action: () => {}, divider: true },
      // Code editing
      { label: 'Format Document', icon: '🎨', shortcut: 'Shift+Alt+F', action: () => editor?.trigger('context', 'editor.action.formatDocument', undefined) },
      { label: 'Toggle Line Comment', icon: '💬', shortcut: 'Ctrl+/', action: () => editor?.trigger('context', 'editor.action.commentLine', undefined) },
      { label: 'Fold/Unfold', icon: '📦', action: () => editor?.trigger('context', 'editor.toggleFold', undefined) },
      { label: '', icon: '', action: () => {}, divider: true },
      // File operations
      { label: 'Save', icon: '💾', shortcut: 'Ctrl+S', action: saveCurrentFile },
      { label: 'New File', icon: '📄', shortcut: 'Ctrl+N', action: createNewFile },
      { label: '', icon: '', action: () => {}, divider: true },
      // AI actions — Don
      {
        label: '✦ Ask Don',
        icon: '🤖',
        shortcut: 'Ctrl+D',
        action: () => askDon('explain'),
        children: [
          { label: 'Explain Code', icon: '📖', action: () => askDon('explain') },
          { label: 'Refactor', icon: '♻', action: () => askDon('refactor') },
          { label: 'Find & Fix Bugs', icon: '🐛', action: () => askDon('fix') },
          { label: 'Optimize', icon: '⚡', action: () => askDon('optimize') },
          { label: 'Write Tests', icon: '🧪', action: () => askDon('test') },
          { label: 'Add Documentation', icon: '📝', action: () => askDon('docs') },
        ],
      },
      {
        label: '✦ Don: Diff Preview',
        icon: '📊',
        shortcut: 'Ctrl+Shift+D',
        action: performDiffPreview,
        disabled: !hasSelection,
      },
      {
        label: '✦ Don: Edit Selection',
        icon: '✏️',
        shortcut: 'Ctrl+Shift+E',
        action: performInlineEdit,
        disabled: !hasSelection,
      },
    ];
  };

  // Build command palette commands
  const buildCommands = (): Command[] => {
    const toggleMinimap = () => {
      if (editor) {
        const current = editor.getOption(monaco.editor.EditorOption.minimap);
        editor.updateOptions({ minimap: { enabled: !current.enabled } });
      }
    };
    // Note: breadcrumbs not supported in Monaco 0.55 (VS Code only feature)

    return [
      // File operations
      { id: 'file.new', name: 'New File', icon: '📄', shortcut: 'Ctrl+N', action: createNewFile, category: 'File' },
      { id: 'file.save', name: 'Save', icon: '💾', shortcut: 'Ctrl+S', action: saveCurrentFile, category: 'File' },
      { id: 'file.saveAll', name: 'Save All', icon: '💾', action: saveCurrentFile, category: 'File' },
      // Edit operations
      { id: 'edit.undo', name: 'Undo', icon: '↩', shortcut: 'Ctrl+Z', action: () => editor?.trigger('command', 'undo', undefined), category: 'Edit' },
      { id: 'edit.redo', name: 'Redo', icon: '↪', shortcut: 'Ctrl+Shift+Z', action: () => editor?.trigger('command', 'redo', undefined), category: 'Edit' },
      { id: 'edit.format', name: 'Format Document', icon: '🎨', shortcut: 'Shift+Alt+F', action: () => editor?.trigger('command', 'editor.action.formatDocument', undefined), category: 'Edit' },
      { id: 'edit.comment', name: 'Toggle Line Comment', icon: '💬', shortcut: 'Ctrl+/', action: () => editor?.trigger('command', 'editor.action.commentLine', undefined), category: 'Edit' },
      // View operations
      { id: 'view.minimap', name: 'Toggle Minimap', icon: '🗺', action: toggleMinimap, category: 'View' },
      { id: 'view.breadcrumbs', name: 'Breadcrumbs', icon: '📍', action: () => {}, category: 'View' },
      // Navigation
      { id: 'nav.search', name: 'Project Search', icon: '🔍', shortcut: 'Ctrl+Shift+F', action: () => setShowProjectSearch(true), category: 'Navigation' },
      { id: 'nav.gotoDefinition', name: 'Go to Definition', icon: '→', shortcut: 'F12', action: () => editor?.trigger('command', 'editor.action.revealDefinition', undefined), category: 'Navigation' },
      { id: 'nav.findReferences', name: 'Find All References', icon: '🔗', shortcut: 'Shift+F12', action: () => editor?.trigger('command', 'editor.action.goToReferences', undefined), category: 'Navigation' },
      { id: 'nav.symbol', name: 'Go to Symbol', icon: '🏷', shortcut: 'Ctrl+Shift+O', action: () => editor?.trigger('command', 'editor.action.quickOutline', undefined), category: 'Navigation' },
      // App actions
      { id: 'app.switchProject', name: 'Switch Project', icon: '📂', action: () => window.dispatchEvent(new CustomEvent('app-switch-project')), category: 'App' },
      { id: 'app.gitStatus', name: 'Git Status', icon: '🌿', action: () => window.dispatchEvent(new CustomEvent('app-git-status')), category: 'App' },
    ];
  };

  onMount(() => {
    if (!containerRef) return;

    const { models, restoredActiveTab } = initModels();
    const restoredTab = models.find(t => t.name === restoredActiveTab) || models[0];

    editor = monaco.editor.create(containerRef, {
      model: restoredTab.model,
      theme: 'hermes',
      fontSize: 14,
      fontFamily: 'JetBrains Mono, Fira Code, monospace',
      fontLigatures: true,
      minimap: { enabled: true, scale: 1 },
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      smoothScrolling: true,
      scrollbar: {
        verticalScrollbarSize: 8,
        horizontalScrollbarSize: 8,
        useShadows: false,
      },
      padding: { top: 12, bottom: 12 },
      bracketPairColorization: { enabled: true },
      guides: { bracketPairs: true, indentation: true },
      suggest: {
        showKeywords: true,
        showSnippets: true,
        preview: true,
      },
      quickSuggestions: { other: true, comments: true, strings: true },
      automaticLayout: true,
      tabSize: 2,
      wordWrap: 'on',
      lineHeight: 22,
      renderLineHighlight: 'all',
      glyphMargin: false,
      folding: true,
      lineNumbers: 'on',
      roundedSelection: true,
      scrollBeyondLastLine: false,
      // Disable Monaco's built-in context menu (we use our own)
      contextmenu: false,
      // breadcrumbs not available in Monaco 0.55
    });

    const markerDisposer = setupErrorLens(editor);

    setActiveTab(restoredTab.name);
    const restoredTabData = models.find(t => t.name === restoredTab.name);
    props.onActiveTabChange?.(restoredTabData?.filePath);
    window.dispatchEvent(new CustomEvent('monaco-tab-change', { detail: { filePath: restoredTabData?.filePath } }));

    // Load server-file content for restored tabs (async) with originalContent sync
    for (const tab of models) {
      if (tab.filePath) {
        const currentTab = tab;
        fetch(`/api/files?path=${encodeURIComponent(tab.filePath)}`)
          .then(r => { if (r.ok) return r.json(); throw new Error('fetch failed'); })
          .then(data => {
            if (data.content !== undefined) {
              // Update originalContent in signal BEFORE setValue to avoid dirty flash
              setTabs(prev => prev.map(t =>
                t.name === currentTab.name
                  ? { ...t, originalContent: data.content, dirty: false }
                  : t
              ));
              currentTab.model.setValue(data.content);
            }
          })
          .catch((e) => console.warn('API error loading tab:', e));
      }
    }

    // Auto-save scratch files on content change (debounced)
    const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
    for (const tab of models) {
      if (!tab.filePath) {
        tab.model.onDidChangeContent(() => {
          clearTimeout(saveTimers[tab.name]);
          saveTimers[tab.name] = setTimeout(() => {
            saveScratchContent(tab.name, tab.model.getValue());
          }, 500);
        });
      }
    }

    // Right-click context menu
    const contextMenuHandler = (e: MouseEvent) => {
      e.preventDefault();
      const { code } = getSelection();
      // Only show our custom menu if there's content or an editor
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        items: buildContextMenu(),
      });
    };
    containerRef.addEventListener('contextmenu', contextMenuHandler);

    // Ctrl+S = save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, saveCurrentFile);

    // Ctrl+N = new file
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, createNewFile);

    // Ctrl+D = Ask Don about selection
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, () => askDon('explain'));

    // Ctrl+Shift+D = Diff Preview
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyD,
      performDiffPreview
    );

    // Ctrl+Shift+E = Inline Edit
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE,
      performInlineEdit
    );

    // Register inline code completions (Copilot-style ghost text)
    completionDisposer = registerCodeCompletions(editor);

    // ─── Code Actions (Lightbulb menu) ─────────────────────────────────────
    // Register Don AI commands that dispatch to EditorChat via don-prompt event
    const donCommands = ['don-explain', 'don-refactor', 'don-bugs', 'don-optimize', 'don-tests'] as const;
    for (const cmd of donCommands) {
      const disposable = monaco.editor.registerCommand(cmd, (_accessor: any, code: string) => {
        const action = cmd.replace('don-', '');
        const prompt = `${action.charAt(0).toUpperCase() + action.slice(1)} this code:\n\`\`\`\n${code}\n\`\`\``;
        window.dispatchEvent(new CustomEvent('don-prompt', { detail: { prompt } }));
      });
      commandDisposers.push(disposable);
    }

    // Register CodeActionProvider — shows lightbulb on code selection
    codeActionDisposer = monaco.languages.registerCodeActionProvider('*', {
      provideCodeActions: (model, range) => {
        const selectedText = model.getValueInRange(range);
        if (!selectedText.trim()) return { actions: [], dispose: () => {} };

        const actions = [
          { title: 'Don: Explain', command: 'don-explain' },
          { title: 'Don: Refactor', command: 'don-refactor' },
          { title: 'Don: Find Bugs', command: 'don-bugs' },
          { title: 'Don: Optimize', command: 'don-optimize' },
          { title: 'Don: Write Tests', command: 'don-tests' },
        ].map(a => ({
          title: a.title,
          kind: 'refactor' as const,
          command: { id: a.command, title: a.title, arguments: [selectedText] },
          diagnostics: [],
        }));

        return { actions, dispose: () => {} };
      },
    });

    // Ctrl+Space = manual trigger for inline completions
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space,
      () => {
        editor?.getAction('editor.action.inlineSuggest.trigger')?.run();
      }
    );

    // Ctrl+Shift+P = Command Palette
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP,
      () => setShowCommandPalette(true)
    );

    // Ctrl+Shift+F = Project Search
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyF,
      () => setShowProjectSearch(true)
    );

    setIsReady(true);

    onCleanup(() => {
      completionDisposer?.dispose();
      markerDisposer?.dispose();
      codeActionDisposer?.dispose();
      for (const d of commandDisposers) d.dispose();
      containerRef?.removeEventListener('contextmenu', contextMenuHandler);
      editor?.dispose();
      Object.values(saveTimers).forEach(clearTimeout);
      // Full model sweep to prevent leaks
      monaco.editor.getModels().forEach(model => {
        if (!tabs().some(t => t.model === model && !model.isDisposed())) {
          model.dispose();
        }
      });
      tabs().forEach((t) => {
        if (t.listenerDisposer) t.listenerDisposer.dispose();
        if (!t.model.isDisposed()) t.model.dispose();
      });
    });
  });

  // Load file from server when activeFile prop changes
  createEffect(() => {
    const filePath = props.activeFile;
    if (!filePath || !isReady()) return;

    // Check if already open
    const existing = tabs().find(t => t.filePath === filePath);
    if (existing) {
      switchToTab(existing.name);
      return;
    }

    // Increment generation — any stale fetch that resolves will be ignored
    const gen = ++fileLoadGeneration;

    // Fetch file content from API
    fetch(`/api/files?path=${encodeURIComponent(filePath)}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (gen !== fileLoadGeneration) return; // stale — drop
        if (data.content === undefined) return;
        const baseName = filePath.split('/').pop() || filePath;
        const parts = filePath.split('/');
        const parentDir = parts.length >= 2 ? parts[parts.length - 2] : '';
        // Include parent dir in tab name if another tab already has the same base name
        const hasDuplicate = tabs().some(t => (t.name === baseName || t.name.endsWith('/' + baseName)));
        const name = hasDuplicate && parentDir ? `${parentDir}/${baseName}` : baseName;
        const language = langFromPath(filePath);
        const uri = monaco.Uri.file(filePath);
        const existingModel = monaco.editor.getModel(uri);
        if (existingModel) {
          setTabs(prev => {
            const staleTab = prev.find(t => t.model === existingModel);
            if (staleTab) {
              return prev.filter(t => t.name !== staleTab.name);
            }
            return prev;
          });
          existingModel.dispose();
        }
        const model = monaco.editor.createModel(data.content, language, uri);

        const newTab: FileTab = { name, language, model, filePath, dirty: false, originalContent: data.content };
        setTabs(prev => {
          const updated = [...prev, newTab];
          if (updated.length > 30) {
            console.warn('Tab limit reached (30). Closing oldest non-dirty tab.');
            // Simple limit enforcement - could be improved with LRU
          }
          saveSession(updated, name, props.projectRoot);
          return updated;
        });
        newTab.listenerDisposer = setupDirtyTracking(newTab);
        if (editor && gen === fileLoadGeneration) {
          editor.setModel(model);
          editor.layout();
          setActiveTab(name);
        }
      })
      .catch((e) => console.warn('File load error:', e));
  });

  // Update editor context (share active file with App for Don context)
  createEffect(() => {
    const tab = tabs().find(t => t.name === activeTab());
    if (tab?.filePath) {
      // Update the global editor context via custom event
      window.dispatchEvent(new CustomEvent('editor-context', {
        detail: {
          filePath: tab.filePath,
          fileName: tab.name,
          language: tab.language,
          projectRoot: props.projectRoot,
        }
      }));
    }
  });

  return (
    <div class="panel h-full flex flex-col relative" style={{ padding: 0, 'min-height': props.height === '100%' ? '0' : (props.height || '700px'), height: props.height === '100%' ? '100%' : undefined }}>
      {/* Panel header */}
      <div class="panel-header" style={{ padding: '12px 16px 0 16px', 'margin-bottom': '0' }}>
        <span>⌨️</span>
        <span>CODE EDITOR</span>
        <span class="text-xs text-hermes-text-dim ml-2">TypeScript • Monaco</span>
      </div>

      {/* Tab bar */}
      <div class="flex items-center gap-0 border-b border-hermes-cyan/20" style={{ padding: '0 8px' }}>
        <div class="flex gap-0 overflow-x-auto flex-1">
          {tabs().map((tab) => (
            <button
              class={`flex items-center gap-1 px-3 py-1.5 text-xs transition-colors border-b-2 cursor-pointer whitespace-nowrap ${
                activeTab() === tab.name
                  ? 'text-hermes-green border-hermes-green'
                  : 'text-hermes-text-dim border-transparent hover:text-hermes-cyan'
              }`}
              onClick={() => switchToTab(tab.name)}
            >
              <span class="text-[10px]">
                {tab.language === 'typescript' ? 'TS' : tab.language === 'json' ? '{}' : tab.language === 'css' ? '✦' : '▪'}
              </span>
              {tab.dirty && <span class="text-[8px]" style={{ color: '#00f3ff', 'text-shadow': '0 0 4px #00f3ff' }}>●</span>}
              <span>{tab.name}</span>
              <span
                class="ml-1 text-hermes-text-dim/50 hover:text-hermes-magenta hover:bg-hermes-magenta/10 rounded px-0.5 text-[10px]"
                onClick={(e) => closeTab(tab.name, e)}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <button
          class="px-2 py-1 text-hermes-text-dim hover:text-hermes-cyan text-sm transition-colors"
          onClick={createNewFile}
          title="New file (Ctrl+N)"
        >
          +
        </button>

        {/* Profile selector for gateway requests */}
        <select
          value={activeProfile()}
          onChange={(e) => setActiveProfile((e.target as HTMLSelectElement).value)}
          class="ml-auto px-2 py-1 text-[10px] bg-hermes-bg border border-hermes-cyan/20 text-hermes-cyan rounded hover:border-hermes-cyan/50 cursor-pointer outline-none"
          title="Select profile for Diff Preview / Edit Selection requests"
        >
          <For each={availableProfiles()}>
            {(p) => (
              <option value={p.name}>{p.name || 'Default'}</option>
            )}
          </For>
        </select>
      </div>

      {/* Editor container */}
      <div
        ref={containerRef}
        class="flex-1"
        style={{ 'min-height': '0' }}
      />

      {/* Context menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <ContextMenu
            x={menu().x}
            y={menu().y}
            items={menu().items}
            onClose={() => setContextMenu(null)}
          />
        )}
      </Show>

      {/* Command Palette */}
      <Show when={showCommandPalette()}>
        <CommandPalette
          commands={buildCommands()}
          onClose={() => setShowCommandPalette(false)}
        />
      </Show>

      {/* Project Search (rendered as overlay panel) */}
      <Show when={showProjectSearch()}>
        <div class="absolute inset-0 z-[9997] flex" style={{ background: 'rgba(5,5,7,0.95)' }}>
          <div class="w-[400px] h-full">
            <ProjectSearch
              projectRoot={props.projectRoot || '/home/don/dev'}
              onOpenFile={(path, line) => {
                setShowProjectSearch(false);
                if (props.onOpenFile) props.onOpenFile(path, line);
              }}
              onClose={() => setShowProjectSearch(false)}
            />
          </div>
        </div>
      </Show>

      {/* Don Diff Preview */}
      <Show when={diffData()}>
        <DiffPreview
          original={diffData()!.original}
          modified={diffData()!.modified}
          filePath={diffData()!.filePath}
          onAccept={() => {
            const sel = editor?.getSelection();
            if (sel && editor) {
              editor.executeEdits('don-diff', [{ range: sel, text: diffData()!.modified }]);
            }
            setDiffData(null);
          }}
          onReject={() => setDiffData(null)}
        />
      </Show>

      {/* Don Inline Edit */}
      <Show when={inlineEdit()}>
        <InlineEdit
          proposedCode={inlineEdit()!.proposedCode}
          selection={inlineEdit()!.selection}
          editor={editor!}
          onAccept={() => setInlineEdit(null)}
          onReject={() => setInlineEdit(null)}
        />
      </Show>
    </div>
  );
}
