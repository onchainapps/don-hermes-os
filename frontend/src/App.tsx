import { apiUrl } from './lib/api-base';
import { createSignal, onMount, onCleanup, For, Show, Index, lazy, ErrorBoundary } from 'solid-js';


import MonacoEditor from './components/MonacoEditor';
import FileTree from './components/FileTree';
import EditorTerminal from './components/EditorTerminal';
import GitPanel from './components/GitPanel';
import ResizableSplitter from './components/ResizableSplitter';
import Sidebar, { type AppId } from './components/Sidebar';
import StatusBar from './components/StatusBar';
import CronPanel from './components/CronPanel';
import SessionPanel from './components/SessionPanel';
import SystemPanel from './components/SystemPanel';
import HermesPanel from './components/HermesPanel';
import ProfileManager from './components/ProfileManager';
import ModalChat from './components/ModalChat';
import ProfileChat from './components/ProfileChat';
const WikiPanel = lazy(() => import('./components/WikiPanel'));

// System stats interface
interface SystemStats {
  timestamp: number;
  cpu: { model: string; cores: number; load1: number; load5: number; load15: number };
  memory: { total: number; free: number; used: number; percent: number };
  system: { uptime: string; uptimeSeconds: number; platform: string; arch: string; hostname: string };
}

interface Project {
  name: string;
  path: string;
  git: boolean;
}

export default function App() {
  const [stats, setStats] = createSignal<SystemStats | null>(null);
  const savedApp = localStorage.getItem('don-last-app') as AppId | null;
  const [activeApp, setActiveAppRaw] = createSignal<AppId>(savedApp && savedApp !== 'CHAT' ? savedApp : 'SYSTEM');
  const setActiveApp = (app: AppId) => {
    setActiveAppRaw(app);
    localStorage.setItem('don-last-app', app);
  };

  // Remap CHAT sidebar click -> toggle modal chat
  const handleAppSelect = (app: AppId) => {
    if (app === 'CHAT') {
      window.dispatchEvent(new CustomEvent('floating-chat-toggle'));
      return;
    }
    setActiveApp(app);
  };
  const [gatewayOnline, setGatewayOnline] = createSignal(false);
  const [sessionId, setSessionId] = createSignal<string | null>(null);

  // Code IDE state
  const [activeFilePath, setActiveFilePath] = createSignal<string | undefined>();
  const [projectRoot, setProjectRoot] = createSignal<string>('/home/don/dev');
  const [projects, setProjects] = createSignal<Project[]>([]);
  const [showProjectPicker, setShowProjectPicker] = createSignal(false);
  const [donPrompt, setDonPrompt] = createSignal<string>('');
  // ProfileChat multi-instance state + unread tracking
  const [openProfileChats, setOpenProfileChats] = createSignal<Array<{
    id: string;
    name: string;
    gatewayPort?: number;
    apiKey?: string;
  }>>([]);

  const [unreadProfiles, setUnreadProfiles] = createSignal<Set<string>>(new Set());

  const openProfileChat = (profileName: string, gatewayPort?: number, apiKey?: string) => {
    const profileId = profileName.toLowerCase();
    const current = openProfileChats();
    if (!current.find(p => p.id === profileId)) {
      setOpenProfileChats([...current, { id: profileId, name: profileName, gatewayPort, apiKey }]);
    }
    window.dispatchEvent(new CustomEvent('profile-chat-toggle'));
  };

  // Monaco tab change → update activeFilePath for EditorChat per-tab sessions
  const handleTabChange = (filePath: string | undefined) => {
    setActiveFilePath(filePath);
  };

  // Fetch available projects on mount
  const fetchProjects = () => {
    fetch(apiUrl('/api/projects'))
      .then(r => r.json())
      .then(data => setProjects(data.projects || []))
      .catch((e) => console.warn('API error:', e));
  };

  // Detect project root from a file path
  const detectProjectRoot = (filePath: string) => {
    fetch(`${apiUrl('/api/project-root')}?path=${encodeURIComponent(filePath)}`)
      .then(r => r.json())
      .then(data => {
        if (data.root) {
          setProjectRoot(data.root);
        }
      })
      .catch((e) => console.warn('API error:', e));
  };

  // Handle file selection — also detect project root
  const handleFileSelect = (path: string) => {
    setActiveFilePath(path);
    detectProjectRoot(path);
  };

  // Select a project from the picker
  const selectProject = (project: Project) => {
    setAndSaveProjectRoot(project.path);
    setShowProjectPicker(false);
  };

  // Gateway health check
  const checkGateway = () => {
    fetch(apiUrl('/api/gateway/health'))
      .then(r => { setGatewayOnline(r.ok); return r.json(); })
      .catch(() => setGatewayOnline(false));
  };

  // Handle "Ask Don" from editor context menu
  const handleAskDon = (prompt: string, _code: string, _filePath: string, _language: string) => {
    setDonPrompt(prompt);
    // EditorChat will pick this up and send it
  };

  // Load data on mount
  onMount(() => {
    let statsInterval: ReturnType<typeof setInterval>;
    let gwInterval: ReturnType<typeof setInterval>;

    // System stats — poll every 5s
    const fetchStats = () => {
      fetch(apiUrl('/api/stats')).then(r => r.json()).then(setStats).catch((e) => console.warn('API error:', e));
    };
    fetchStats();
    statsInterval = setInterval(fetchStats, 5000);

    // Gateway health — poll every 10s
    checkGateway();
    gwInterval = setInterval(checkGateway, 10000);

    // Projects
    fetchProjects();

    // Listen for editor context changes (active file/project)
    const handleEditorContext = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail) {
        fetch(apiUrl('/api/editor-context'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(detail),
        }).catch((e) => console.warn('API error:', e));
      }
    };
    window.addEventListener('editor-context', handleEditorContext);

    // Listen for ProfileChat open requests from ProfileManager (keeps ProfileChat standalone)
    const handleOpenProfileChat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.profileName) {
        openProfileChat(detail.profileName, detail.gatewayPort, detail.apiKey);
      }
    };
    window.addEventListener('open-profile-chat', handleOpenProfileChat);

    // Listen for ProfileChat close events to remove from open list
    const handleCloseProfileChat = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.id) {
        setOpenProfileChats(prev => prev.filter(p => p.id !== detail.id));
      }
    };
    window.addEventListener('profile-chat-close', handleCloseProfileChat);

    onCleanup(() => {
      clearInterval(statsInterval);
      clearInterval(gwInterval);
      window.removeEventListener('editor-context', handleEditorContext);
      window.removeEventListener('open-profile-chat', handleOpenProfileChat);
      window.removeEventListener('profile-chat-close', handleCloseProfileChat);
      window.removeEventListener('keydown', handleKeydown);
    });

    // Restore last project from localStorage
    const lastProject = localStorage.getItem('don-last-project');
    if (lastProject) {
      setProjectRoot(lastProject);
    }

    // Keyboard shortcuts: Ctrl+1-8, Ctrl+Shift+D (floating chat)
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const apps: AppId[] = ['SYSTEM', 'CODE', 'SYSTEM', 'CRON', 'SESSIONS', 'WIKI', 'HERMES', 'PROFILES'];
        const num = parseInt(e.key);
        if (num >= 1 && num <= 8) {
          e.preventDefault();
          if (num === 1) {
            window.dispatchEvent(new CustomEvent('floating-chat-toggle'));
          } else {
            setActiveApp(apps[num - 1]);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeydown);
  });
  const setAndSaveProjectRoot = (path: string) => {
    setProjectRoot(path);
    localStorage.setItem('don-last-project', path);
  };

  return (
    <>
      <div class="h-screen flex flex-col overflow-hidden bg-hermes-bg">
      {/* Main area: sidebar + content */}
      <div class="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          activeApp={activeApp()}
          onAppSelect={handleAppSelect}
          gatewayOnline={gatewayOnline()}
        />

        {/* Content area — all apps mounted, CSS visibility toggle */}
        <ErrorBoundary fallback={(err) => (
          <div class="flex items-center justify-center h-full text-hermes-error">
            <div class="text-center">
              <svg class="w-8 h-8 mx-auto mb-3 text-hermes-error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div class="text-sm text-hermes-text-dim mb-1">{err.message}</div>
              <div class="text-xs text-hermes-text-muted mb-4">Something went wrong</div>
              <button class="px-4 py-2 border border-hermes-border text-hermes-text-dim rounded-md hover:border-hermes-accent hover:text-hermes-accent transition-colors text-sm" onClick={() => window.location.reload()}>Reload</button>
            </div>
          </div>
        )}>
          <main class="flex-1 overflow-hidden relative">
            {/* Header bar */}
            <header
            class="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-hermes-border bg-hermes-surface/50"
            >
            <div class="flex items-center gap-2">
              <span
                class="text-sm font-semibold text-hermes-text tracking-tight"
              >
                DON OS
              </span>
              <span class="text-[10px] text-hermes-text-muted">/</span>
              <span class="text-[10px] text-hermes-accent font-medium uppercase tracking-wider">
                {activeApp()}
              </span>
            </div>
            <div class="flex items-center gap-3 text-[10px] text-hermes-text-muted">
              <span>{new Date().toISOString().split('T')[0]}</span>
              <Clock />
            </div>
          </header>

          {/* App panels — all mounted, only visible one shows */}
          <div class="absolute inset-0 top-[37px] bottom-0">
            {/* CODE — CSS toggle to keep editor/terminal/chat alive */}
            <div
              class="absolute inset-0 overflow-hidden flex"
              style={{ display: activeApp() === 'CODE' ? 'flex' : 'none' }}
            >
              <ResizableSplitter
                direction="horizontal"
                initialSplit={20}
                minA={200}
                minB={400}
              >
                {[
                  <div class="flex flex-col h-full">
                    {/* Project selector */}
                    <div
                      class="flex items-center justify-between px-3 py-1.5 border-b border-hermes-border flex-shrink-0 relative bg-hermes-surface/50"
                    >
                      <button
                        class="text-xs text-hermes-accent font-medium cursor-pointer flex items-center gap-1.5 hover:text-hermes-accent-hover transition-colors"
                        onClick={() => setShowProjectPicker(!showProjectPicker())}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                        </svg>
                        <span class="truncate max-w-[140px]">{projectRoot().split('/').pop() || 'dev'}</span>
                        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="opacity-50">
                          <polyline points="6 9 12 15 18 9"/>
                        </svg>
                      </button>
                      <Show when={showProjectPicker()}>
                        {/* Project dropdown */}
                        <div
                          class="absolute top-full left-0 right-0 z-50 max-h-[300px] overflow-y-auto border border-hermes-border rounded-md"
                          style={{
                            background: '#131315',
                          }}
                        >
                          <For each={projects()}>
                            {(proj) => (
                              <button
                                class={`w-full text-left px-3 py-2 text-xs cursor-pointer transition-colors flex items-center gap-2 ${
                                  projectRoot() === proj.path
                                    ? 'bg-hermes-accent-subtle text-hermes-accent'
                                    : 'text-hermes-text-dim hover:bg-hermes-elevated'
                                }`}
                                onClick={() => selectProject(proj)}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="opacity-50">
                                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                                </svg>
                                <div class="flex flex-col min-w-0">
                                  <span class="truncate">{proj.name}</span>
                                  <span class="text-[9px] opacity-40 truncate">
                                    {proj.git ? '' : <span class="opacity-60">no git · </span>}
                                    {proj.path}
                                  </span>
                                </div>
                              </button>
                            )}
                          </For>
                          <Show when={projects().length === 0}>
                            <div class="px-3 py-2 text-xs text-hermes-text-muted">Loading projects...</div>
                          </Show>
                        </div>
                      </Show>
                    </div>
                    <ResizableSplitter
                      direction="vertical"
                      initialSplit={60}
                      minA={100}
                      minB={80}
                    >
                      {[
                        <FileTree
                          onFileSelect={handleFileSelect}
                          rootPath={projectRoot()}
                        />,
                        <GitPanel repoPath={projectRoot()} />,
                      ]}
                    </ResizableSplitter>
                  </div>,
                  <div class="flex flex-col h-full">
                    <ResizableSplitter
                      direction="vertical"
                      initialSplit={70}
                      minA={200}
                      minB={200}
                    >
                      {[
                        <MonacoEditor
                          activeFile={activeFilePath()}
                          onAskDon={handleAskDon}
                          projectRoot={projectRoot()}
                          onOpenFile={handleFileSelect}
                          onActiveTabChange={handleTabChange}
                        />,
                        <EditorTerminal projectPath={projectRoot()} />,
                      ]}
                    </ResizableSplitter>
                  </div>,
                ]}
              </ResizableSplitter>
            </div>

            {/* SYSTEM */}
            <div
              class="absolute inset-0 overflow-hidden"
              style={{ display: activeApp() === 'SYSTEM' ? 'block' : 'none' }}
            >
              <SystemPanel stats={stats()} gatewayOnline={gatewayOnline()} />
            </div>

            {/* CRON */}
            <div
              class="absolute inset-0 overflow-hidden"
              style={{ display: activeApp() === 'CRON' ? 'block' : 'none' }}
            >
              <CronPanel />
            </div>

            {/* SESSIONS */}
            <div
              class="absolute inset-0 overflow-hidden"
              style={{ display: activeApp() === 'SESSIONS' ? 'block' : 'none' }}
            >
              <SessionPanel />
            </div>

            {/* WIKI */}
            <Show when={activeApp() === 'WIKI'}>
              <div
                class="absolute inset-0 overflow-hidden"
              >
                <WikiPanel />
              </div>
            </Show>

            {/* HERMES */}
            <div
              class="absolute inset-0 overflow-hidden"
              style={{ display: activeApp() === 'HERMES' ? 'block' : 'none' }}
            >
              <HermesPanel />
            </div>

            {/* PROFILES */}
            <div
              class="absolute inset-0 overflow-hidden"
              style={{ display: activeApp() === 'PROFILES' ? 'block' : 'none' }}
            >
              <ProfileManager />
            </div>
          </div>
        </main>
        </ErrorBoundary>
      </div>

      {/* Status bar */}
      <StatusBar
        stats={stats()}
        gatewayOnline={gatewayOnline()}
        sessionId={sessionId()}
      />
    </div>

    {/* Floating chat - moved outside main layout so it can't get trapped in footer */}
    <ModalChat />
    {/* Multiple independent ProfileChat instances (standalone, per-profile state) */}
    <Index each={openProfileChats()}>
      {(chat) => (
        <ProfileChat
          profileId={chat().id}
          profileName={chat().name}
          gatewayPort={chat().gatewayPort}
          apiKey={chat().apiKey}
        />
      )}
    </Index>
    </>
  );
}

// Live clock component
function Clock() {
  const [time, setTime] = createSignal(new Date().toTimeString().slice(0, 8));
  onMount(() => {
    const i = setInterval(() => setTime(new Date().toTimeString().slice(0, 8)), 1000);
    onCleanup(() => clearInterval(i));
  });
  return <span class="text-hermes-text-dim font-mono">{time()}</span>;
}
