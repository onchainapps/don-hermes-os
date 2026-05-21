import { createSignal, For, Show, createMemo, createEffect, onMount } from 'solid-js';
import { hermesGet, hermesPost, hermesDelete } from '../lib/hermesApi';

// ─── Types ──────────────────────────────────────────────────────────────────

interface HermesProfile {
  name: string;
  status: 'active' | 'standby' | 'not-yet-created';
  gatewayPort?: number;
}

interface ProfileDetails {
  name: string;
  soulExcerpt: string;
  soulContent: string;
  skills: string[];
  globalSkills: string[];
  skillCount: number;
  globalSkillCount: number;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function ProfileManager() {
  const [profiles, setProfiles] = createSignal<HermesProfile[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  
  const [expandedName, setExpandedName] = createSignal<string | null>(null);
  const [activeTab, setActiveTab] = createSignal<'overview' | 'controls' | 'skills'>('overview');
  const [fetchingProfile, setFetchingProfile] = createSignal<string | null>(null);

  const [configProfile, setConfigProfile] = createSignal<string | null>(null);
  const [configYaml, setConfigYaml] = createSignal('');
  const [configLoading, setConfigLoading] = createSignal(false);
  const [configStatus, setConfigStatus] = createSignal<string | null>(null);
  
  const [newName, setNewName] = createSignal('');
  const [newDescription, setNewDescription] = createSignal('');
  const [newSoul, setNewSoul] = createSignal('');
  const [isCreating, setIsCreating] = createSignal(false);
  const [profileDetails, setProfileDetails] = createSignal<ProfileDetails | null>(null);
  const [loadingDetails, setLoadingDetails] = createSignal(false);

  const fetchProfileDetails = async (name: string) => {
    setFetchingProfile(name);
    setLoadingDetails(true);
    try {
      const data = await hermesGet<ProfileDetails>(`/profiles/details?name=${encodeURIComponent(name)}`);
      // Only set if this is still the profile we're looking at
      if (fetchingProfile() === name) {
        setProfileDetails(data);
      }
    } catch {
      if (fetchingProfile() === name) {
        setProfileDetails(null);
      }
    } finally {
      if (fetchingProfile() === name) {
        setLoadingDetails(false);
      }
    }
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const data = await hermesGet<{ profiles: HermesProfile[] }>('/profiles');
      setProfiles(data.profiles);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchProfiles);

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!newName()) return;
    try {
      setIsCreating(true);
      await hermesPost('/profiles/create', {
        name: newName(),
        description: newDescription(),
        soul: newSoul(),
      });
      setNewName('');
      setNewDescription('');
      setNewSoul('');
      await fetchProfiles();
    } catch (e: any) {
      alert(`Error creating profile: ${e.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleStart = async (name: string) => {
    try {
      await hermesPost('/profiles/start', { name });
      await fetchProfiles();
    } catch (e: any) {
      alert(`Error starting profile: ${e.message}`);
    }
  };

  const handleStop = async (name: string) => {
    try {
      await hermesPost('/profiles/stop', { name });
      await fetchProfiles();
    } catch (e: any) {
      alert(`Error stopping profile: ${e.message}`);
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Are you sure you want to delete profile "${name}"?`)) return;
    try {
      await hermesDelete(`/profiles/delete?name=${encodeURIComponent(name)}`);
      await fetchProfiles();
    } catch (e: any) {
      alert(`Error deleting profile: ${e.message}`);
    }
  };

  // ── Config modal ──
  const loadConfig = async (name: string) => {
    setConfigLoading(true);
    setConfigStatus(null);
    try {
      const data = await hermesGet<{ yaml: string }>(`/profiles/config/raw?name=${encodeURIComponent(name)}`);
      setConfigYaml(data.yaml || '');
    } catch (e: any) {
      setConfigStatus(`Failed to load: ${e.message}`);
    } finally {
      setConfigLoading(false);
    }
  };

  const saveConfig = async () => {
    const name = configProfile();
    if (!name) return;
    setConfigStatus('Saving...');
    try {
      await fetch(`/api/hermes/profiles/config/raw?name=${encodeURIComponent(name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml_text: configYaml() }),
      });
      setConfigStatus('Saved ✓');
      setTimeout(() => setConfigStatus(null), 2000);
    } catch (e: any) {
      setConfigStatus(`Error: ${e.message}`);
    }
  };

  createEffect(() => {
    const name = configProfile();
    if (name) loadConfig(name);
  });

  const statusColor = (status: string) => {
    if (status === 'active') return '#00ff9f';
    if (status === 'standby') return '#ffd700';
    return '#ff006e';
  };

  const statusLabel = (status: string) => {
    if (status === 'active') return '● ACTIVE';
    if (status === 'standby') return '◐ STANDBY';
    return '○ NOT YET CREATED';
  };

  return (
    <div class="h-full overflow-y-auto p-6" style={{ background: '#050507' }}>
      {/* Header */}
      <div class="flex items-center justify-between mb-6">
        <div class="flex items-center gap-3">
          <span class="text-lg">🛸</span>
          <h1 class="text-sm font-bold tracking-widest" style={{ color: '#00f3ff', 'text-shadow': '0 0 6px #00f3ff' }}>
            HERMES PROFILES
          </h1>
        </div>
        <div class="text-[10px] text-hermes-text-dim uppercase tracking-tighter">
          System-Level Agent Management
        </div>
      </div>

      {/* Create Profile Form */}
      <form onSubmit={handleCreate} class="mb-8 p-4 rounded-lg border border-dashed border-hermes-cyan/30 bg-hermes-cyan/05">
        <div class="text-[10px] text-hermes-cyan/70 mb-2 font-mono tracking-widest">CREATE NEW AGENT PROFILE</div>
        <div class="text-[9px] text-hermes-text-dim/60 mb-3">New profiles are cloned from <span class="text-hermes-cyan">don-template</span> (config, soul, skills, env).</div>

        <div class="space-y-3">
          {/* Name */}
          <div>
            <label class="block text-[10px] text-hermes-text-dim mb-1">AGENT NAME</label>
            <input
              type="text"
              placeholder="e.g. mirror-trader, unreal-engine-dev, research-agent"
              class="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-hermes-cyan/50"
              value={newName()}
              onInput={(e) => setNewName(e.currentTarget.value)}
              disabled={isCreating()}
            />
          </div>

          {/* Description */}
          <div>
            <label class="block text-[10px] text-hermes-text-dim mb-1">DESCRIPTION (stored in config.yaml)</label>
            <input
              type="text"
              placeholder="Short role description (e.g. Autonomous crypto trading agent with live Kraken execution)"
              class="w-full bg-black/40 border border-white/10 rounded px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-hermes-cyan/50"
              value={newDescription()}
              onInput={(e) => setNewDescription(e.currentTarget.value)}
              disabled={isCreating()}
            />
          </div>

          {/* Soul / System Prompt */}
          <div>
            <label class="block text-[10px] text-hermes-text-dim mb-1">SOUL / SYSTEM PROMPT (written to SOUL.md)</label>
            <textarea
              placeholder="You are an expert autonomous trading agent. Your primary directive is capital preservation while executing high-conviction momentum trades..."
              class="w-full h-24 bg-black/40 border border-white/10 rounded px-3 py-2 text-xs font-mono focus:outline-none focus:border-hermes-cyan/50 resize-y"
              value={newSoul()}
              onInput={(e) => setNewSoul(e.currentTarget.value)}
              disabled={isCreating()}
            />
            <div class="text-[9px] text-hermes-text-dim/60 mt-1">This becomes the agent's core identity and instructions.</div>
          </div>

          <button
            type="submit"
            disabled={isCreating() || !newName()}
            class="w-full px-4 py-2 bg-hermes-cyan/10 border border-hermes-cyan/50 text-hermes-cyan text-[10px] font-bold rounded hover:bg-hermes-cyan/20 transition-all disabled:opacity-50"
          >
            {isCreating() ? 'CREATING PROFILE + GATEWAY...' : 'CREATE PROFILE + INSTALL GATEWAY'}
          </button>
        </div>
      </form>

      {/* Error Message */}
      <Show when={error()}>
        <div class="mb-4 p-3 rounded bg-red-500/10 border border-red-500/50 text-red-500 text-[10px] font-mono">
          ERROR: {error()}
        </div>
      </Show>

      {/* Loading State */}
      <Show when={!loading()} fallback={
        <div class="flex items-center justify-center py-12">
          <div class="text-hermes-cyan text-xs font-mono animate-pulse">LOADING PROFILES...</div>
        </div>
      }>
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <For each={profiles()}>
            {(profile) => {
              const isExpanded = () => expandedName() === profile.name;
              const color = '#00f3ff'; // Default accent

              return (
                <div
                  class="rounded-lg transition-all cursor-pointer overflow-hidden"
                  style={{
                    background: '#0a0a0f',
                    border: `1px solid ${isExpanded() ? `${color}60` : 'rgba(0,243,255,0.12)'}`,
                    'box-shadow': isExpanded() ? `0 0 25px ${color}15, inset 0 0 40px ${color}05` : 'none',
                  }}
                  onClick={() => {
                    if (isExpanded()) {
                      setExpandedName(null);
                      setProfileDetails(null);
                    } else {
                      setExpandedName(profile.name);
                      fetchProfileDetails(profile.name);
                      setActiveTab('overview');
                    }
                  }}
                >
                  {/* Card Header */}
                  <div class="p-4">
                    <div class="flex items-start justify-between">
                      <div class="flex items-center gap-3">
                        <div
                          class="w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
                        >
                          🤖
                        </div>
                        <div>
                          <div class="flex items-center gap-2">
                            <span class="text-sm font-bold" style={{ color: color, 'text-shadow': `0 0 4px ${color}` }}>
                              {profile.name}
                            </span>
                            <span class="text-[9px] font-mono px-1.5 py-0.5 rounded" style={{
                              color: statusColor(profile.status),
                              background: `${statusColor(profile.status)}15`,
                              border: `1px solid ${statusColor(profile.status)}30`,
                            }}>
                              {statusLabel(profile.status)}
                            </span>

                            {/* Gateway port + status indicator */}
                            <Show when={profile.gatewayPort}>
                              <span class="text-[9px] font-mono px-1.5 py-0.5 rounded bg-hermes-cyan/10 text-hermes-cyan border border-hermes-cyan/30">
                                :{profile.gatewayPort}
                              </span>
                            </Show>
                          </div>
                          <div class="text-[10px] text-hermes-text-dim mt-0.5">Hermes Agent Profile</div>
                        </div>
                      </div>
                      <span class="text-[10px] text-hermes-text-dim/40">{isExpanded() ? '▼' : '▶'}</span>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  <Show when={isExpanded()}>
                    <div class="px-4 pb-4 border-t" style={{ 'border-color': `${color}15` }}>
                      <div class="flex items-center gap-3 mt-3 mb-3">
                        <div class="flex gap-0">
                          {(['overview', 'skills', 'controls'] as const).map(tab => (
                            <button
                              class={`px-3 py-1 text-[10px] font-bold tracking-wider transition-colors border-b-2 cursor-pointer ${
                                activeTab() === tab ? 'border-current' : 'border-transparent text-hermes-text-dim hover:text-hermes-cyan'
                              }`}
                              style={activeTab() === tab ? { color: color } : {}}
                              onClick={(e) => { e.stopPropagation(); setActiveTab(tab); }}
                            >
                              {tab.toUpperCase()}
                            </button>
                          ))}

                          {/* Profile Chat - promoted to tab level */}
                          <button
                            class="px-3 py-1 text-[10px] font-bold tracking-wider transition-colors border-b-2 border-transparent text-hermes-cyan hover:text-hermes-cyan cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.dispatchEvent(new CustomEvent('open-profile-chat', {
                                detail: {
                                  profileName: profile.name,
                                  gatewayPort: profile.gatewayPort,
                                  apiKey: profile.apiKey
                                }
                              }));
                            }}
                          >
                            PROFILE CHAT
                          </button>
                          {/* Cron Jobs - per profile */}
                          <button
                            class="px-3 py-1 text-[10px] font-bold tracking-wider transition-colors border-b-2 border-transparent text-hermes-cyan hover:text-hermes-cyan cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.dispatchEvent(new CustomEvent('open-profile-cron', {
                                detail: { profileName: profile.name }
                              }));
                            }}
                          >
                            CRON
                          </button>
                          {/* Config - per profile modal */}
                          <button
                            class="px-3 py-1 text-[10px] font-bold tracking-wider transition-colors border-b-2 border-transparent text-hermes-cyan hover:text-hermes-cyan cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfigProfile(profile.name);
                            }}
                          >
                            CONFIG
                          </button>
                        </div>
                      </div>

                      <Show when={activeTab() === 'overview'}>
                        <div class="space-y-3 text-[11px] opacity-70">
                          <div class="flex justify-between">
                            <span class="text-hermes-text-dim uppercase text-[9px]">Profile ID</span>
                            <span class="font-mono">{profile.name.toLowerCase()}</span>
                          </div>
                          <div class="flex justify-between">
                            <span class="text-hermes-text-dim uppercase text-[9px]">Storage Path</span>
                            <span class="font-mono text-[9px]">~/.hermes/profiles/{profile.name}</span>
                          </div>
                          <Show when={profileDetails()?.soulContent}>
                            <div>
                              <span class="text-hermes-text-dim uppercase text-[9px]">SOUL.md</span>
                              <pre class="mt-1 text-[10px] opacity-60 leading-relaxed whitespace-pre-wrap font-mono" style={{
                                background: 'rgba(0,0,0,0.3)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                padding: '8px',
                                'border-radius': '4px',
                                'max-height': '300px',
                                overflow: 'auto'
                              }}>
                                {profileDetails()?.soulContent}
                              </pre>
                            </div>
                          </Show>
                        </div>
                      </Show>

                      <Show when={activeTab() === 'skills'}>
                        <Show when={loadingDetails()} fallback={
                          <div class="space-y-3 mt-2">
                            <div class="flex items-center justify-between">
                              <span class="text-[9px] text-hermes-text-dim uppercase">Profile Skills</span>
                              <span class="text-[10px] font-mono" style={{ color }}>
                                {profileDetails()?.skillCount || 0} local
                              </span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                              <For each={profileDetails()?.skills}>
                                {(skill) => (
                                  <span class="px-2 py-0.5 text-[9px] font-mono rounded" style={{
                                    background: `${color}10`,
                                    border: `1px solid ${color}20`,
                                    color: `${color}90`
                                  }}>
                                    {skill}
                                  </span>
                                )}
                              </For>
                            </div>
                            <div class="flex items-center justify-between mt-3">
                              <span class="text-[9px] text-hermes-text-dim uppercase">Global Skills (Shared)</span>
                              <span class="text-[10px] font-mono" style={{ color }}>
                                {profileDetails()?.globalSkillCount || 0}
                              </span>
                            </div>
                            <div class="flex flex-wrap gap-1">
                              <For each={profileDetails()?.globalSkills?.slice(0, 30)}>
                                {(skill) => (
                                  <span class="px-2 py-0.5 text-[9px] font-mono rounded" style={{
                                    background: 'rgba(255,255,255,0.03)',
                                    border: '1px solid rgba(255,255,255,0.08)',
                                    color: 'rgba(255,255,255,0.4)'
                                  }}>
                                    {skill}
                                  </span>
                                )}
                              </For>
                              <Show when={(profileDetails()?.globalSkillCount || 0) > 30}>
                                <span class="px-2 py-0.5 text-[9px] font-mono rounded text-hermes-text-dim/40">
                                  +{(profileDetails()?.globalSkillCount || 0) - 30} more
                                </span>
                              </Show>
                            </div>
                          </div>
                        }>
                          <div class="flex items-center justify-center py-4">
                            <div class="text-hermes-cyan text-[10px] font-mono animate-pulse">LOADING...</div>
                          </div>
                        </Show>
                      </Show>

                      <Show when={activeTab() === 'controls'}>
                        <div class="grid grid-cols-3 gap-2 mt-2">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStart(profile.name); }}
                            class="py-2 bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 text-[10px] font-bold rounded hover:bg-emerald-500/20"
                          >
                            START
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStop(profile.name); }}
                            class="py-2 bg-amber-500/10 border border-amber-500/50 text-amber-500 text-[10px] font-bold rounded hover:bg-amber-500/20"
                          >
                            STOP
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(profile.name); }}
                            class="py-2 bg-red-500/10 border border-red-500/50 text-red-500 text-[10px] font-bold rounded hover:bg-red-500/20"
                          >
                            DELETE
                          </button>
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* Config Modal */}
      <Show when={configProfile()}>
        <div
          class="fixed inset-0 z-[99999] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.7)' }}
          onClick={() => setConfigProfile(null)}
        >
          <div
            class="w-[700px] max-h-[80vh] flex flex-col rounded-xl overflow-hidden"
            style={{ background: '#0a0a0f', border: '1px solid rgba(0,243,255,0.2)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div class="flex items-center justify-between px-4 py-3 border-b border-hermes-cyan/20">
              <div class="flex items-center gap-3">
                <span class="text-lg">⚙️</span>
                <span class="text-xs font-bold tracking-wider" style={{ color: '#00f3ff' }}>
                  CONFIG — {configProfile()}
                </span>
              </div>
              <button
                onClick={() => setConfigProfile(null)}
                class="px-2 py-1 text-[10px] border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-400"
              >
                ✕
              </button>
            </div>

            {/* Editor */}
            <div class="flex-1 overflow-auto p-4">
              <Show when={configLoading()} fallback={
                <textarea
                  class="w-full h-[400px] bg-black/40 border border-white/10 rounded p-3 text-xs font-mono focus:outline-none focus:border-hermes-cyan/50 resize-y"
                  style={{ color: '#e4e4e7' }}
                  value={configYaml()}
                  onInput={(e) => setConfigYaml(e.currentTarget.value)}
                />
              }>
                <div class="flex items-center justify-center py-12">
                  <div class="text-hermes-cyan text-[10px] font-mono animate-pulse">LOADING...</div>
                </div>
              </Show>
            </div>

            {/* Footer */}
            <div class="flex items-center justify-between px-4 py-3 border-t border-hermes-cyan/20">
              <Show when={configStatus()}>
                <span class="text-[10px] font-mono" style={{
                  color: configStatus()?.includes('Error') ? '#ff006e' : configStatus() === 'Saved ✓' ? '#00ff9f' : '#00f3ff'
                }}>
                  {configStatus()}
                </span>
              </Show>
              <div class="flex gap-2 ml-auto">
                <button
                  onClick={() => setConfigProfile(null)}
                  class="px-4 py-1.5 text-[10px] border border-zinc-700 rounded hover:bg-zinc-800 text-zinc-400"
                >
                  CANCEL
                </button>
                <button
                  onClick={saveConfig}
                  class="px-4 py-1.5 text-[10px] rounded font-bold"
                  style={{
                    background: 'rgba(0,255,159,0.1)',
                    border: '1px solid rgba(0,255,159,0.3)',
                    color: '#00ff9f',
                  }}
                >
                  SAVE
                </button>
              </div>
            </div>
          </div>
        </div>
      </Show>

      {/* Footer */}
      <div class="mt-6 text-center text-[10px] text-hermes-text-dim/40">
        Real-time synchronization with don-os-backend active
      </div>
    </div>
  );
}
