import { createSignal, onMount, For, Show } from 'solid-js';
import { hermesGet, hermesPost, hermesDelete } from '../../lib/hermesApi';

interface OAuthProvider {
  id: string;
  name: string;
  connected: boolean;
  last_connected?: string;
  scopes: string[];
  status?: string;
}

export default function OAuthManager() {
  const [providers, setProviders] = createSignal<OAuthProvider[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [status, setStatus] = createSignal('');

  const fetchProviders = async () => {
    try {
      setLoading(true);
      const data = await hermesGet<OAuthProvider[] | {providers: OAuthProvider[]}>('/providers/oauth');
      setProviders(Array.isArray(data) ? data : data.providers || []);
    } catch (err) {
      setStatus('Failed to load OAuth providers');
      // Demo data
      setProviders([
        { id: 'google', name: 'Google', connected: true, last_connected: '2026-04-10', scopes: ['email', 'profile'] },
        { id: 'github', name: 'GitHub', connected: false, scopes: ['repo', 'user'] },
        { id: 'discord', name: 'Discord', connected: true, last_connected: '2026-04-12', scopes: ['identify'] },
      ]);
    } finally {
      setLoading(false);
    }
  };

  onMount(fetchProviders);

  const startOAuth = async (id: string) => {
    try {
      setStatus(`Starting OAuth flow for ${id}...`);
      await hermesPost(`/providers/oauth/${id}/start`);
      setStatus('OAuth flow initiated - check browser for redirect');
      setTimeout(fetchProviders, 2000);
    } catch (err) {
      setStatus('Failed to start OAuth. Check console.');
    }
  };

  const disconnect = async (id: string) => {
    if (!confirm(`Disconnect ${id}?`)) return;
    try {
      await hermesDelete(`/providers/oauth/${id}`);
      setStatus(`Disconnected ${id}`);
      fetchProviders();
    } catch (err) {
      setStatus('Disconnect failed');
    }
  };

  const submitCode = async (id: string) => {
    const code = prompt('Enter OAuth authorization code:');
    if (!code) return;
    try {
      await hermesPost(`/providers/oauth/${id}/submit`, { code });
      setStatus('Code submitted successfully');
      fetchProviders();
    } catch (e) {
      setStatus('Code submission failed');
    }
  };

  return (
    <div class="h-full flex flex-col">
      <div class="panel-header mb-6">🔐 OAUTH PROVIDER MANAGEMENT</div>
      
      <Show when={status()}>
        <div class="mb-6 p-4 border border-hermes-cyan/30 bg-hermes-cyan/5 text-xs text-hermes-cyan rounded font-mono">
          {status()}
        </div>
      </Show>

      <div class="space-y-4 flex-1 overflow-auto">
        <For each={providers()}>
          {(provider) => (
            <div class="panel p-6 flex items-center justify-between group">
              <div class="flex items-center gap-5">
                <div class={`w-4 h-4 rounded-full flex-shrink-0 ${provider.connected ? 'bg-hermes-green shadow-[0_0_8px_#00ff9f]' : 'bg-hermes-text-dim/40'}`}></div>
                <div>
                  <div class="text-lg font-bold text-hermes-text">{provider.name}</div>
                  <div class="text-xs text-hermes-text-dim font-mono flex items-center gap-2">
                    {provider.id}
                    <Show when={provider.connected && provider.last_connected}>
                      <span class="text-[10px] text-hermes-green">• last: {provider.last_connected}</span>
                    </Show>
                  </div>
                  <div class="flex gap-1 mt-2">
                    <For each={provider.scopes.slice(0, 3)}>
                      {(scope) => (
                        <span class="text-[9px] px-2 py-px bg-black/60 text-hermes-cyan/80 rounded">{scope}</span>
                      )}
                    </For>
                  </div>
                </div>
              </div>

              <div class="flex flex-col items-end gap-3">
                <Show when={provider.connected}>
                  <button
                    onClick={() => disconnect(provider.id)}
                    class="px-6 py-2 text-xs border border-hermes-magenta/60 hover:border-hermes-magenta text-hermes-magenta rounded hover:bg-hermes-magenta/5 transition-colors"
                  >
                    DISCONNECT
                  </button>
                </Show>
                <Show when={!provider.connected}>
                  <button
                    onClick={() => startOAuth(provider.id)}
                    class="px-8 py-2.5 text-sm font-bold bg-hermes-green text-black rounded hover:brightness-110 transition-all flex items-center gap-2"
                  >
                    CONNECT VIA OAUTH
                  </button>
                  <button
                    onClick={() => submitCode(provider.id)}
                    class="text-[10px] text-hermes-text-dim hover:text-hermes-cyan underline"
                  >
                    manual code submit
                  </button>
                </Show>
                <div class={`text-[10px] font-mono ${provider.connected ? 'text-hermes-green' : 'text-hermes-text-dim'}`}>
                  {provider.connected ? 'CONNECTED' : 'DISCONNECTED'}
                </div>
              </div>
            </div>
          )}
        </For>
      </div>

      <div class="mt-auto pt-6 text-[10px] text-center text-hermes-text-dim border-t border-hermes-cyan/10">
        OAuth flows open in new tabs. Some providers may require manual code entry for local dev.
      </div>
    </div>
  );
}
