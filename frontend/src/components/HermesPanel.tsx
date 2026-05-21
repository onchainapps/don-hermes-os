import { createSignal, For, Show } from 'solid-js';
import ConfigEditor from './hermes/ConfigEditor';
import ApiKeyManager from './hermes/ApiKeyManager';
import LogViewer from './hermes/LogViewer';
import AnalyticsPanel from './hermes/AnalyticsPanel';
import SkillsManager from './hermes/SkillsManager';
import OAuthManager from './hermes/OAuthManager';

type SubTab = 'config' | 'keys' | 'logs' | 'analytics' | 'skills' | 'oauth';

const TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'config', label: 'CONFIG', icon: '⚙️' },
  { id: 'keys', label: 'API KEYS', icon: '🔑' },
  { id: 'logs', label: 'LOGS', icon: '📋' },
  { id: 'analytics', label: 'ANALYTICS', icon: '📊' },
  { id: 'skills', label: 'SKILLS', icon: '🧩' },
  { id: 'oauth', label: 'OAUTH', icon: '🔐' },
];

export default function HermesPanel() {
  const [activeTab, setActiveTab] = createSignal<SubTab>('config');

  return (
    <div class="h-full flex flex-col overflow-hidden" style={{ background: '#050507' }}>
      {/* Sub-tab bar */}
      <div class="flex items-center gap-0 border-b border-hermes-cyan/20 flex-shrink-0 px-2 bg-hermes-panel">
        <For each={TABS}>
          {(tab) => (
            <button
              class={`px-4 py-2.5 text-[10px] tracking-[0.5px] font-mono transition-all border-b-2 cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeTab() === tab.id
                  ? 'text-hermes-green border-hermes-green bg-hermes-cyan/5'
                  : 'text-hermes-text-dim border-transparent hover:text-hermes-cyan hover:border-hermes-cyan/30'
              }`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span class="opacity-70">{tab.icon}</span> {tab.label}
            </button>
          )}
        </For>
      </div>
      {/* Panel content */}
      <div class="flex-1 overflow-auto p-4">
        <Show when={activeTab() === 'config'}><ConfigEditor /></Show>
        <Show when={activeTab() === 'keys'}><ApiKeyManager /></Show>
        <Show when={activeTab() === 'logs'}><LogViewer /></Show>
        <Show when={activeTab() === 'analytics'}><AnalyticsPanel /></Show>
        <Show when={activeTab() === 'skills'}><SkillsManager /></Show>
        <Show when={activeTab() === 'oauth'}><OAuthManager /></Show>
      </div>
    </div>
  );
}
