import { createSignal, onCleanup, Show } from 'solid-js';
import type { ConnectionState } from '../../gatewayClient';

interface ConnectionStatusProps {
  status: () => string;
  class?: string;
  showLabel?: boolean;
}

export function ConnectionStatus(props: ConnectionStatusProps) {
  const getStatusInfo = () => {
    switch (props.status()) {
      case 'open':
        return {
          color: '#00ff9f',
          label: 'Connected',
          icon: '●',
          pulse: false,
        };
      case 'connecting':
        return {
          color: '#ffaa00',
          label: 'Connecting...',
          icon: '◐',
          pulse: true,
        };
      case 'reconnecting':
        return {
          color: '#ffaa00',
          label: 'Reconnecting',
          icon: '⟳',
          pulse: true,
        };
      case 'error':
        return {
          color: '#ff3366',
          label: 'Disconnected',
          icon: '○',
          pulse: false,
        };
      case 'closed':
      default:
        return {
          color: '#888888',
          label: 'Offline',
          icon: '○',
          pulse: false,
        };
    }
  };

  const info = getStatusInfo();

  return (
    <div
      class={`inline-flex items-center gap-1.5 text-[10px] font-mono tracking-tight ${props.class || ''}`}
      style={{ color: info.color }}
    >
      <span
        class={info.pulse ? 'animate-pulse' : ''}
        style={{ 'font-size': '9px' }}
      >
        {info.icon}
      </span>
      <Show when={props.showLabel !== false}>
        <span class="opacity-80">{info.label}</span>
      </Show>
    </div>
  );
}
