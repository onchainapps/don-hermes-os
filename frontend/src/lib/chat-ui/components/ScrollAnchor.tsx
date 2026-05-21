import { Show } from 'solid-js';

interface ScrollAnchorProps {
  visible: boolean;
  onClick: () => void;
}

export default function ScrollAnchor(props: ScrollAnchorProps) {
  return (
    <Show when={props.visible}>
      <button
        onClick={props.onClick}
        aria-label="Scroll to bottom"
        style={{
          position: 'absolute',
          bottom: '80px',
          right: '16px',
          width: '40px',
          height: '40px',
          'border-radius': '50%',
          border: '1px solid rgba(0,243,255,0.3)',
          background: 'rgba(0,243,255,0.1)',
          color: 'rgba(0,243,255,0.9)',
          'font-size': '18px',
          cursor: 'pointer',
          display: 'flex',
          'align-items': 'center',
          'justify-content': 'center',
          'z-index': 10,
          transition: 'opacity 0.25s ease, box-shadow 0.25s ease, background 0.25s ease',
          opacity: props.visible ? '1' : '0',
          'pointer-events': props.visible ? 'auto' : 'none',
          'backdrop-filter': 'blur(8px)',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,243,255,0.2)';
          (e.currentTarget as HTMLElement).style.boxShadow =
            '0 0 12px rgba(0,243,255,0.4), 0 0 24px rgba(0,243,255,0.15)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'rgba(0,243,255,0.1)';
          (e.currentTarget as HTMLElement).style.boxShadow = 'none';
        }}
      >
        ↓
      </button>
    </Show>
  );
}
