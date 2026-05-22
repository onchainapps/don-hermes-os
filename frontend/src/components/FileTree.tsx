import { apiUrl } from '../lib/api-base';
import { createSignal, createEffect, For, Show, onMount, onCleanup } from 'solid-js';

interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface TreeNode {
  entry: FileEntry;
  children: TreeNode[];
  loaded: boolean;
  expanded: boolean;
}

interface FileTreeProps {
  onFileSelect: (path: string) => void;
  rootPath?: string;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: TreeNode;
  parentPath?: string;
}

type RenameState = { path: string; type: 'rename' } | { path: string; parentPath: string; type: 'new-file' | 'new-folder' } | null;

function FileTreeItem(props: {
  node: TreeNode;
  onFileSelect: (path: string) => void;
  onToggle: (path: string) => void;
  depth: number;
  onContextMenu: (e: MouseEvent, node: TreeNode) => void;
}) {
  const isDir = () => props.node.entry.type === 'directory';

  return (
    <div>
      <button
        class="w-full text-left flex items-center gap-1.5 py-0.5 px-2 text-xs hover:bg-hermes-cyan/10 transition-colors group cursor-pointer"
        style={{ 'padding-left': `${props.depth * 12 + 8}px` }}
        onClick={() => {
          if (isDir()) {
            props.onToggle(props.node.entry.path);
          } else {
            props.onFileSelect(props.node.entry.path);
          }
        }}
        onContextMenu={(e) => props.onContextMenu(e, props.node)}
      >
        <span class="text-[10px] w-3 text-center flex-shrink-0">
          {isDir() ? (props.node.expanded ? '▼' : '►') : ''}
        </span>
        <span class="flex-shrink-0">
          {isDir() ? (props.node.expanded ? '📂' : '📁') : '📄'}
        </span>
        <span class={`truncate ${isDir() ? 'text-hermes-cyan' : 'text-hermes-text-dim group-hover:text-hermes-text'}`}>
          {props.node.entry.name}
        </span>
        <Show when={!isDir()}>
          <button
            class="opacity-0 group-hover:opacity-100 text-[9px] text-hermes-cyan/60 hover:text-hermes-cyan px-1 flex-shrink-0"
            onClick={(e) => { e.stopPropagation(); (window as any).addContextFile?.(props.node.entry.path); }}
            title="Add to Don context"
          >+</button>
        </Show>
      </button>
      <Show when={isDir() && props.node.expanded}>
        <For each={props.node.children}>
          {(child) => (
            <FileTreeItem
              node={child}
              onFileSelect={props.onFileSelect}
              onToggle={props.onToggle}
              depth={props.depth + 1}
              onContextMenu={props.onContextMenu}
            />
          )}
        </For>
        <Show when={props.node.expanded && !props.node.loaded}>
          <div class="text-[10px] text-hermes-text-dim pl-8 py-0.5" style={{ 'padding-left': `${(props.depth + 1) * 12 + 8}px` }}>
            loading...
          </div>
        </Show>
      </Show>
    </div>
  );
}

export default function FileTree(props: FileTreeProps) {
  const rootPath = () => props.rootPath || '/home/don/dev';
  const [tree, setTree] = createSignal<TreeNode[]>([]);
  const [error, setError] = createSignal('');
  const [contextMenu, setContextMenu] = createSignal<ContextMenuState | null>(null);
  const [renameState, setRenameState] = createSignal<RenameState>(null);
  const [renameValue, setRenameValue] = createSignal('');
  const [deleteConfirm, setDeleteConfirm] = createSignal<string | null>(null);

  const fetchDir = async (path: string): Promise<FileEntry[]> => {
    try {
      const res = await fetch(apiUrl(`/api/files?path=${encodeURIComponent(path)}`));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.entries) {
        return data.entries.sort((a: FileEntry, b: FileEntry) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
      }
      return [];
    } catch (e: any) {
      setError(e.message);
      return [];
    }
  };

  const loadRoot = async () => {
    const entries = await fetchDir(rootPath());
    setTree(
      entries.map((e) => ({
        entry: e,
        children: [],
        loaded: false,
        expanded: false,
      }))
    );
  };

  const toggleDir = async (path: string) => {
    const updateNodes = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.entry.path === path) {
          if (!node.expanded && !node.loaded) {
            const entries = await fetchDir(path);
            result.push({
              ...node,
              expanded: true,
              loaded: true,
              children: entries.map((e) => ({
                entry: e,
                children: [],
                loaded: false,
                expanded: false,
              })),
            });
          } else {
            result.push({ ...node, expanded: !node.expanded });
          }
        } else if (node.children.length > 0) {
          result.push({ ...node, children: await updateNodes(node.children) });
        } else {
          result.push(node);
        }
      }
      return result;
    };
    setTree(await updateNodes(tree()));
  };

  // Refresh a specific directory's children
  const refreshDir = async (dirPath: string) => {
    const updateNodes = async (nodes: TreeNode[]): Promise<TreeNode[]> => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.entry.path === dirPath && node.entry.type === 'directory') {
          const entries = await fetchDir(dirPath);
          result.push({
            ...node,
            loaded: true,
            expanded: true,
            children: entries.map((e) => ({
              entry: e,
              children: [],
              loaded: false,
              expanded: false,
            })),
          });
        } else if (node.children.length > 0) {
          result.push({ ...node, children: await updateNodes(node.children) });
        } else {
          result.push(node);
        }
      }
      return result;
    };
    setTree(await updateNodes(tree()));
  };

  // Context menu handler
  const handleContextMenu = (e: MouseEvent, node: TreeNode) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, node });
  };

  // Close context menu on click outside
  const handleClickOutside = (e: MouseEvent) => {
    if (contextMenu()) {
      setContextMenu(null);
    }
  };

  // File operations
  const createNewFileIn = async (parentPath: string) => {
    setRenameState({ path: '', parentPath, type: 'new-file' });
    setRenameValue('');
    setContextMenu(null);
  };

  const createNewFolderIn = async (parentPath: string) => {
    setRenameState({ path: '', parentPath, type: 'new-folder' });
    setRenameValue('');
    setContextMenu(null);
  };

  const startRename = (path: string) => {
    setRenameState({ path, type: 'rename' });
    const name = path.split('/').pop() || '';
    setRenameValue(name);
    setContextMenu(null);
  };

  const confirmRename = async () => {
    const state = renameState();
    if (!state) return;

    if (state.type === 'rename') {
      const oldPath = state.path;
      const parts = oldPath.split('/');
      parts.pop();
      const parentDir = parts.join('/');
      const newPath = `${parentDir}/${renameValue()}`;

      try {
        // Read file content, create new file, delete old
        const res = await fetch(apiUrl(`/api/files?path=${encodeURIComponent(oldPath)}`));
        if (res.ok) {
          const data = await res.json();
          await fetch(apiUrl('/api/files'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: newPath, content: data.content || '' }),
          });
          await fetch(apiUrl('/api/files/delete'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: oldPath, recursive: false }),
          });
        }
        await refreshDir(parentDir);
      } catch (e) {
        console.error('Rename failed:', e);
      }
    } else if (state.type === 'new-file' || state.type === 'new-folder') {
      const newPath = `${state.parentPath}/${renameValue()}`;
      try {
        await fetch(apiUrl('/api/files/create'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: newPath,
            type: state.type === 'new-folder' ? 'directory' : 'file',
          }),
        });
        await refreshDir(state.parentPath);
      } catch (e) {
        console.error('Create failed:', e);
      }
    }

    setRenameState(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenameState(null);
    setRenameValue('');
  };

  const confirmDelete = async (path: string) => {
    setDeleteConfirm(path);
    setContextMenu(null);
  };

  const doDelete = async () => {
    const path = deleteConfirm();
    if (!path) return;

    try {
      const isDir = path.endsWith('/') || tree().some(n => n.entry.path === path && n.entry.type === 'directory');
      await fetch(apiUrl('/api/files/delete'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, recursive: true }),
      });
      // Refresh parent directory
      const parts = path.split('/');
      parts.pop();
      const parentDir = parts.join('/');
      await refreshDir(parentDir || rootPath());
    } catch (e) {
      console.error('Delete failed:', e);
    }

    setDeleteConfirm(null);
  };

  const copyPath = (path: string) => {
    navigator.clipboard.writeText(path).catch((e) => console.warn('Clipboard error:', e));
    setContextMenu(null);
  };

  const handleRenameKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      confirmRename();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelRename();
    }
  };

  onMount(() => {
    loadRoot();
    document.addEventListener('click', handleClickOutside);
    onCleanup(() => document.removeEventListener('click', handleClickOutside));
  });

  // Re-load when rootPath changes
  let lastRoot = rootPath();
  createEffect(() => {
    const current = rootPath();
    if (current !== lastRoot) {
      lastRoot = current;
      loadRoot();
    }
  });

  return (
    <div class="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div class="flex items-center justify-between px-3 py-2 border-b border-hermes-cyan/20">
        <span class="text-xs text-hermes-cyan font-bold tracking-wider" style="text-shadow: 0 0 4px #00f3ff;">
          FILES
        </span>
        <div class="flex gap-1">
          <button
            class="text-[10px] text-hermes-text-dim hover:text-hermes-cyan transition-colors"
            onClick={() => createNewFileIn(rootPath())}
            title="New file"
          >
            📄+
          </button>
          <button
            class="text-[10px] text-hermes-text-dim hover:text-hermes-cyan transition-colors"
            onClick={() => createNewFolderIn(rootPath())}
            title="New folder"
          >
            📁+
          </button>
          <button
            class="text-[10px] text-hermes-text-dim hover:text-hermes-cyan transition-colors"
            onClick={loadRoot}
            title="Refresh"
          >
            ↻
          </button>
        </div>
      </div>

      {/* Root path */}
      <div class="px-3 py-1 text-[10px] text-hermes-text-dim border-b border-hermes-cyan/10 truncate">
        {rootPath()}
      </div>

      {/* Inline rename/create input */}
      <Show when={renameState()}>
        {(state) => (
          <div class="px-3 py-1 border-b border-hermes-cyan/10">
            <input
              type="text"
              value={renameValue()}
              onInput={(e) => setRenameValue((e.target as HTMLInputElement).value)}
              onKeyDown={handleRenameKeyDown}
              placeholder={state().type === 'rename' ? 'New name...' : state().type === 'new-file' ? 'File name...' : 'Folder name...'}
              class="w-full bg-hermes-cyan/10 text-hermes-text text-xs outline-none px-2 py-1 rounded placeholder:text-hermes-text-dim/50"
              style={{ 'font-family': 'JetBrains Mono, monospace' }}
              ref={(el) => { setTimeout(() => el?.focus(), 50); }}
            />
            <div class="flex gap-1 mt-1">
              <button
                class="px-2 py-0.5 text-[9px] text-hermes-green hover:bg-hermes-green/10 rounded cursor-pointer"
                onClick={confirmRename}
              >
                ✓ Confirm
              </button>
              <button
                class="px-2 py-0.5 text-[9px] text-hermes-text-dim hover:text-hermes-magenta rounded cursor-pointer"
                onClick={cancelRename}
              >
                ✕ Cancel
              </button>
            </div>
          </div>
        )}
      </Show>

      {/* Tree */}
      <div class="flex-1 overflow-y-auto overflow-x-hidden py-1" style="scrollbar-width: thin; scrollbar-color: rgba(0,243,255,0.2) transparent;">
        <Show when={error()}>
          <div class="px-3 py-2 text-xs text-hermes-magenta">{error()}</div>
        </Show>
        <For each={tree()}>
          {(node) => (
            <FileTreeItem
              node={node}
              onFileSelect={props.onFileSelect}
              onToggle={toggleDir}
              depth={0}
              onContextMenu={handleContextMenu}
            />
          )}
        </For>
        <Show when={tree().length === 0 && !error()}>
          <div class="px-3 py-4 text-xs text-hermes-text-dim text-center">Loading...</div>
        </Show>
      </div>

      {/* Context menu */}
      <Show when={contextMenu()}>
        {(menu) => {
          const node = menu().node;
          const isDir = node.entry.type === 'directory';
          const parentPath = (() => {
            const parts = node.entry.path.split('/');
            parts.pop();
            return parts.join('/');
          })();

          return (
            <div
              class="fixed z-[9999] min-w-[180px] py-1 rounded-lg"
              style={{
                left: `${Math.min(menu().x, window.innerWidth - 200)}px`,
                top: `${Math.min(menu().y, window.innerHeight - 250)}px`,
                background: 'linear-gradient(135deg, #0d0d14 0%, #0a0a10 100%)',
                border: '1px solid rgba(0, 243, 255, 0.2)',
                'box-shadow': '0 8px 32px rgba(0,0,0,0.6), 0 0 1px rgba(0,243,255,0.3)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <Show when={!isDir}>
                <button
                  class="w-full text-left px-3 py-1.5 text-xs text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan cursor-pointer flex items-center gap-2"
                  onClick={() => { props.onFileSelect(node.entry.path); setContextMenu(null); }}
                >
                  <span class="w-4 text-center">📄</span> Open
                </button>
              </Show>
              <button
                class="w-full text-left px-3 py-1.5 text-xs text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan cursor-pointer flex items-center gap-2"
                onClick={() => startRename(node.entry.path)}
              >
                <span class="w-4 text-center">✏️</span> Rename
              </button>
              <button
                class="w-full text-left px-3 py-1.5 text-xs text-hermes-text-dim hover:bg-hermes-magenta/10 hover:text-hermes-magenta cursor-pointer flex items-center gap-2"
                onClick={() => confirmDelete(node.entry.path)}
              >
                <span class="w-4 text-center">🗑</span> Delete
              </button>
              <button
                class="w-full text-left px-3 py-1.5 text-xs text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan cursor-pointer flex items-center gap-2"
                onClick={() => copyPath(node.entry.path)}
              >
                <span class="w-4 text-center">📋</span> Copy Path
              </button>
              <div class="mx-2 my-1 border-t border-hermes-cyan/10" />
              <button
                class="w-full text-left px-3 py-1.5 text-xs text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan cursor-pointer flex items-center gap-2"
                onClick={() => createNewFileIn(isDir ? node.entry.path : parentPath)}
              >
                <span class="w-4 text-center">📄</span> New File
              </button>
              <button
                class="w-full text-left px-3 py-1.5 text-xs text-hermes-text-dim hover:bg-hermes-cyan/10 hover:text-hermes-cyan cursor-pointer flex items-center gap-2"
                onClick={() => createNewFolderIn(isDir ? node.entry.path : parentPath)}
              >
                <span class="w-4 text-center">📁</span> New Folder
              </button>
            </div>
          );
        }}
      </Show>

      {/* Delete confirmation */}
      <Show when={deleteConfirm()}>
        {(path) => (
          <div class="fixed inset-0 z-[10000] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
            <div class="p-4 rounded-lg text-center max-w-sm" style={{ background: '#0d0d14', border: '1px solid rgba(0,243,255,0.3)' }}>
              <div class="text-xs text-hermes-text mb-1">Delete this item?</div>
              <div class="text-[10px] text-hermes-text-dim mb-3 truncate">{path()}</div>
              <div class="flex gap-2 justify-center">
                <button
                  class="px-3 py-1 text-xs border border-hermes-text-dim/30 text-hermes-text-dim hover:text-hermes-text rounded cursor-pointer"
                  onClick={() => setDeleteConfirm(null)}
                >
                  Cancel
                </button>
                <button
                  class="px-3 py-1 text-xs bg-hermes-magenta/20 text-hermes-magenta hover:bg-hermes-magenta/30 rounded cursor-pointer"
                  onClick={doDelete}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </Show>
    </div>
  );
}
