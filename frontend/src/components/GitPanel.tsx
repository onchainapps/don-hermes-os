import { createSignal, onMount, onCleanup, For, Show } from 'solid-js';
import DiffPreview from './DiffPreview';

type GitTab = 'STATUS' | 'LOG' | 'BRANCHES';

interface GitPanelProps {
  repoPath?: string;
}

interface DiffState {
  file: string;
  original: string;
  modified: string;
}

export default function GitPanel(props: GitPanelProps) {
  const repo = () => props.repoPath || '/home/don/dev';
  const [activeTab, setActiveTab] = createSignal<GitTab>('STATUS');
  const [statusLines, setStatusLines] = createSignal<string[]>([]);
  const [logLines, setLogLines] = createSignal<string[]>([]);
  const [branches, setBranches] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');
  const [diffState, setDiffState] = createSignal<DiffState | null>(null);
  const [commitMessage, setCommitMessage] = createSignal('');
  const [committing, setCommitting] = createSignal(false);

  let pollInterval: ReturnType<typeof setInterval> | undefined;

  const fetchStatus = async () => {
    try {
      const res = await fetch(`/api/git/status?repo=${encodeURIComponent(repo())}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const msg = data.error || `HTTP ${res.status}`;
        if (msg.includes('not a git repository')) {
          setError('Not a git repository');
          setStatusLines([]);
          return; // Stop polling — not a repo
        }
        throw new Error(msg);
      }
      const data = await res.json();
      const output: string = data.output || data.stdout || '';
      setStatusLines(output.split('\n').filter((l: string) => l.trim()));
      setError('');
    } catch (e: any) {
      setError(e.message);
      setStatusLines([]);
    }
  };

  const fetchLog = async () => {
    try {
      const res = await fetch(`/api/git/log?repo=${encodeURIComponent(repo())}&n=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const output: string = data.output || data.stdout || '';
      setLogLines(output.split('\n').filter((l: string) => l.trim()));
    } catch (e: any) {
      setError(e.message);
      setLogLines([]);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch(`/api/git/branches?repo=${encodeURIComponent(repo())}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const output: string = data.output || data.stdout || '';
      setBranches(output.split('\n').filter((l: string) => l.trim()));
    } catch (e: any) {
      setError(e.message);
      setBranches([]);
    }
  };

  const refresh = async () => {
    setLoading(true);
    const tab = activeTab();
    if (tab === 'STATUS') await fetchStatus();
    else if (tab === 'LOG') await fetchLog();
    else if (tab === 'BRANCHES') await fetchBranches();
    setLoading(false);
  };

  const switchTab = (tab: GitTab) => {
    setActiveTab(tab);
    setError('');
    // Fetch data for the new tab immediately
    setLoading(true);
    if (tab === 'STATUS') fetchStatus().then(() => setLoading(false));
    else if (tab === 'LOG') fetchLog().then(() => setLoading(false));
    else if (tab === 'BRANCHES') fetchBranches().then(() => setLoading(false));
  };

  // Color code git status lines
  const statusColor = (line: string): string => {
    const code = line.substring(0, 2);
    if (code.includes('?')) return '#00ff9f'; // untracked = green
    if (code.includes('A')) return '#00ff9f'; // added = green
    if (code.includes('M')) return '#ffd700'; // modified = yellow
    if (code.includes('D')) return '#ff006e'; // deleted = red
    if (code.includes('R')) return '#00f3ff'; // renamed = cyan
    if (code.includes('U')) return '#ff00cc'; // unmerged = magenta
    return '#e0ffe8';
  };

  // Extract file path from status line
  const statusFilePath = (line: string): string => {
    return line.substring(3).trim();
  };

  // Show diff for a file
  const showDiff = async (filePath: string) => {
    try {
      // Get git diff
      const diffRes = await fetch(`/api/git/diff?repo=${encodeURIComponent(repo())}&file=${encodeURIComponent(filePath)}`);
      if (!diffRes.ok) throw new Error(`HTTP ${diffRes.status}`);
      const diffData = await diffRes.json();
      const diffOutput: string = diffData.output || '';

      // Get current file content
      const fullPath = `${repo()}/${filePath}`;
      const fileRes = await fetch(`/api/files?path=${encodeURIComponent(fullPath)}`);
      let modified = '';
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        modified = fileData.content || '';
      }

      // Parse diff to reconstruct original content
      // Simple approach: apply reverse diff to modified to get original
      const original = applyReverseDiff(modified, diffOutput);

      setDiffState({ file: filePath, original, modified });
    } catch (e: any) {
      console.error('Failed to show diff:', e);
      setError(`Failed to show diff: ${e.message}`);
    }
  };

  // Simple reverse diff application
  const applyReverseDiff = (current: string, diff: string): string => {
    if (!diff.trim()) return current;

    const lines = current.split('\n');
    const diffLines = diff.split('\n');

    // Parse hunks from unified diff
    const hunks: { startLine: number; removed: string[]; added: string[] }[] = [];
    let currentHunk: { startLine: number; removed: string[]; added: string[] } | null = null;

    for (const line of diffLines) {
      const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/);
      if (hunkMatch) {
        if (currentHunk) hunks.push(currentHunk);
        currentHunk = { startLine: parseInt(hunkMatch[1]) - 1, removed: [], added: [] };
      } else if (currentHunk) {
        if (line.startsWith('-')) {
          currentHunk.removed.push(line.substring(1));
        } else if (line.startsWith('+')) {
          currentHunk.added.push(line.substring(1));
        }
      }
    }
    if (currentHunk) hunks.push(currentHunk);

    // Apply reverse: remove added lines, add back removed lines
    // Process hunks in reverse order to maintain line numbers
    const result = [...lines];
    for (let i = hunks.length - 1; i >= 0; i--) {
      const hunk = hunks[i];
      // Remove the added lines
      result.splice(hunk.startLine, hunk.added.length, ...hunk.removed);
    }

    return result.join('\n');
  };

  const handleDiffAccept = async () => {
    const diff = diffState();
    if (!diff) return;

    // Accept means keep current (modified) version, no action needed
    setDiffState(null);
    refresh();
  };

  const stageFile = async (file: string) => {
    try {
      const res = await fetch('/api/git/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo(), file }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (e: any) {
      setError(`Stage failed: ${e.message}`);
    }
  };

  const unstageFile = async (file: string) => {
    try {
      const res = await fetch('/api/git/unstage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo(), file }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchStatus();
    } catch (e: any) {
      setError(`Unstage failed: ${e.message}`);
    }
  };

  const commitChanges = async () => {
    const msg = commitMessage().trim();
    if (!msg) return;
    setCommitting(true);
    try {
      const res = await fetch('/api/git/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo: repo(), message: msg }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setCommitMessage('');
      await fetchStatus();
    } catch (e: any) {
      setError(`Commit failed: ${e.message}`);
    }
    setCommitting(false);
  };

  // Determine if a file is staged (index column has a status char)
  const isStaged = (line: string): boolean => {
    const code = line.substring(0, 2);
    return code[0] !== ' ' && code[0] !== '?';
  };

  // Determine if a file has unstaged changes (worktree column has a status char)
  const hasUnstagedChanges = (line: string): boolean => {
    const code = line.substring(0, 2);
    return code[1] !== ' ' && code[1] !== '?';
  };

  const handleDiffReject = async () => {
    const diff = diffState();
    if (!diff) return;

    // Reject means restore original version
    try {
      const fullPath = `${repo()}/${diff.file}`;
      await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: fullPath, content: diff.original }),
      });
    } catch (e) {
      console.error('Failed to reject changes:', e);
    }

    setDiffState(null);
    refresh();
  };

  onMount(() => {
    // Poll git status — fetchStatus will bail if not a git repo
    refresh();
    pollInterval = setInterval(() => {
      if (activeTab() === 'STATUS' && !error()) fetchStatus();
    }, 30000);
  });

  onCleanup(() => {
    if (pollInterval) clearInterval(pollInterval);
  });

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header with tabs */}
      <div class="flex items-center gap-0 px-2 border-b border-hermes-cyan/20">
        <div class="flex gap-0 flex-1">
          {(['STATUS', 'LOG', 'BRANCHES'] as GitTab[]).map((tab) => (
            <button
              class={`px-3 py-1.5 text-[11px] font-bold tracking-wider transition-colors border-b-2 cursor-pointer ${
                activeTab() === tab
                  ? 'text-hermes-green border-hermes-green'
                  : 'text-hermes-text-dim border-transparent hover:text-hermes-cyan'
              }`}
              style={activeTab() === tab ? 'text-shadow: 0 0 4px #00ff9f;' : ''}
              onClick={() => switchTab(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          class="text-[10px] text-hermes-text-dim hover:text-hermes-cyan transition-colors cursor-pointer"
          onClick={refresh}
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* Content */}
      <div class="flex-1 overflow-y-auto p-2 text-xs font-mono" style="scrollbar-width: thin; scrollbar-color: rgba(0,243,255,0.2) transparent;">
        <Show when={error()}>
          <div class="text-hermes-magenta py-1">{error()}</div>
        </Show>

        <Show when={loading()}>
          <div class="text-hermes-text-dim py-2 text-center">loading...</div>
        </Show>

        {/* STATUS */}
        <Show when={activeTab() === 'STATUS' && !loading()}>
          <Show when={statusLines().length === 0 && !error()}>
            <div class="text-hermes-green py-2 text-center">working tree clean</div>
          </Show>
          <For each={statusLines()}>
            {(line) => {
              const filePath = statusFilePath(line);
              const isModified = line.substring(0, 2).includes('M') || line.substring(0, 2).includes('A');
              const staged = isStaged(line);
              const unstaged = hasUnstagedChanges(line);
              return (
                <div
                  class="py-0.5 px-1 rounded group flex items-center gap-1"
                  style={{ color: statusColor(line) }}
                >
                  <div
                    class={`flex-1 flex items-center gap-1 ${isModified ? 'cursor-pointer' : ''}`}
                    onClick={() => isModified && showDiff(filePath)}
                    title={isModified ? 'Click to view diff' : undefined}
                  >
                    <span class="text-hermes-text-dim">{line.substring(0, 3)}</span>
                    <span class="truncate">{line.substring(3)}</span>
                    <Show when={isModified}>
                      <span class="text-[9px] ml-1 opacity-40">diff</span>
                    </Show>
                  </div>
                  <Show when={unstaged && !staged}>
                    <button
                      class="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded border border-hermes-cyan/30 text-hermes-cyan/70 hover:text-hermes-cyan hover:bg-hermes-cyan/10 cursor-pointer flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); stageFile(filePath); }}
                      title="Stage file"
                    >
                      +stage
                    </button>
                  </Show>
                  <Show when={staged}>
                    <button
                      class="opacity-0 group-hover:opacity-100 text-[9px] px-1.5 py-0.5 rounded border border-hermes-magenta/30 text-hermes-magenta/70 hover:text-hermes-magenta hover:bg-hermes-magenta/10 cursor-pointer flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); unstageFile(filePath); }}
                      title="Unstage file"
                    >
                      −unstage
                    </button>
                  </Show>
                </div>
              );
            }}
          </For>
          {/* Commit section */}
          <Show when={statusLines().length > 0}>
            <div class="mt-2 pt-2 border-t border-hermes-cyan/10 flex gap-1">
              <input
                type="text"
                value={commitMessage()}
                onInput={(e) => setCommitMessage((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitChanges(); } }}
                placeholder="commit message..."
                class="flex-1 bg-hermes-cyan/5 text-hermes-text text-[11px] outline-none px-2 py-1 rounded placeholder:text-hermes-text-dim/40 border border-hermes-cyan/10 focus:border-hermes-cyan/30"
                style={{ 'font-family': 'JetBrains Mono, monospace' }}
              />
              <button
                class={`px-2.5 py-1 text-[10px] font-bold tracking-wider rounded border cursor-pointer transition-colors ${
                  commitMessage().trim() && !committing()
                    ? 'border-hermes-green/40 text-hermes-green hover:bg-hermes-green/10'
                    : 'border-hermes-text-dim/20 text-hermes-text-dim/40 cursor-not-allowed'
                }`}
                onClick={commitChanges}
                disabled={!commitMessage().trim() || committing()}
              >
                {committing() ? '...' : 'COMMIT'}
              </button>
            </div>
          </Show>
        </Show>

        {/* LOG */}
        <Show when={activeTab() === 'LOG' && !loading()}>
          <For each={logLines()}>
            {(line) => {
              const spaceIdx = line.indexOf(' ');
              const hash = spaceIdx > 0 ? line.substring(0, spaceIdx) : line;
              const msg = spaceIdx > 0 ? line.substring(spaceIdx + 1) : '';
              return (
                <div class="py-0.5 px-1 hover:bg-hermes-cyan/5 rounded group flex items-center">
                  <div class="flex-1 min-w-0">
                    <span class="text-hermes-cyan">{hash}</span>
                    <span class="text-hermes-text-dim ml-2">{msg}</span>
                  </div>
                  <button
                    class="opacity-0 group-hover:opacity-100 text-[10px] px-1.5 py-0.5 rounded hover:bg-hermes-cyan/10 cursor-pointer flex-shrink-0 ml-1"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(new CustomEvent('don-prompt', {
                        detail: { prompt: `Explain this git commit and what it changes:\n\n${hash}\n\nRun: git show ${hash}` }
                      }));
                    }}
                    title="Ask Don about this commit"
                  >
                    💡
                  </button>
                </div>
              );
            }}
          </For>
        </Show>

        {/* BRANCHES */}
        <Show when={activeTab() === 'BRANCHES' && !loading()}>
          <For each={branches()}>
            {(branch) => {
              const isCurrent = branch.startsWith('*');
              const name = isCurrent ? branch.substring(2) : branch.trim();
              return (
                <div class={`py-0.5 px-1 rounded ${isCurrent ? 'bg-hermes-green/10' : 'hover:bg-hermes-cyan/5'}`}>
                  <span class={isCurrent ? 'text-hermes-green font-bold' : 'text-hermes-text-dim'}>
                    {isCurrent ? '● ' : '  '}
                    {name}
                  </span>
                </div>
              );
            }}
          </For>
        </Show>
      </div>

      {/* Diff preview overlay */}
      <Show when={diffState()}>
        {(diff) => (
          <DiffPreview
            original={diff().original}
            modified={diff().modified}
            filePath={diff().file}
            onAccept={handleDiffAccept}
            onReject={handleDiffReject}
          />
        )}
      </Show>
    </div>
  );
}
