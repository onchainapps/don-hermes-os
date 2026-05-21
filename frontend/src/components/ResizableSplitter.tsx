import { createSignal, onCleanup, JSX } from 'solid-js';

interface SplitterProps {
  left?: JSX.Element;
  right?: JSX.Element;
  direction?: 'horizontal' | 'vertical';
  initialSplit: number; // percentage 0-100
  minLeft?: number; // min px for left panel
  minRight?: number; // min px for right panel
  minA?: number; // legacy alias
  minB?: number; // legacy alias
  children?: [JSX.Element, JSX.Element];
}

export default function ResizableSplitter(props: SplitterProps) {
  const [split, setSplit] = createSignal(props.initialSplit);
  let containerRef: HTMLDivElement | undefined;
  let dragging = false;

  // Resolve panels from left/right props or children tuple
  const panelA = () => props.left ?? props.children?.[0];
  const panelB = () => props.right ?? props.children?.[1];
  const dir = () => props.direction ?? 'horizontal';
  const minA = () => props.minLeft ?? props.minA ?? 100;
  const minB = () => props.minRight ?? props.minB ?? 100;

  const onMouseDown = (e: MouseEvent) => {
    e.preventDefault();
    dragging = true;
    document.body.style.cursor = dir() === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const onMouseMove = (e: MouseEvent) => {
    if (!dragging || !containerRef) return;
    const rect = containerRef.getBoundingClientRect();
    const mA = minA();
    const mB = minB();

    if (dir() === 'horizontal') {
      const x = e.clientX - rect.left;
      const pct = Math.max(mA / rect.width * 100, Math.min(100 - mB / rect.width * 100, (x / rect.width) * 100));
      setSplit(pct);
    } else {
      const y = e.clientY - rect.top;
      const pct = Math.max(mA / rect.height * 100, Math.min(100 - mB / rect.height * 100, (y / rect.height) * 100));
      setSplit(pct);
    }
  };

  const onMouseUp = () => {
    dragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  };

  onCleanup(() => {
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
  });

  const isHoriz = () => dir() === 'horizontal';

  return (
    <div
      ref={containerRef}
      class="flex w-full h-full"
      style={{ 'flex-direction': isHoriz() ? 'row' : 'column' }}
    >
      {/* Panel A */}
      <div
        style={{
          [isHoriz() ? 'width' : 'height']: `${split()}%`,
          [isHoriz() ? 'min-width' : 'min-height']: `${props.minA || 100}px`,
          'flex-shrink': '0',
          overflow: 'hidden',
        }}
      >
        {panelA()}
      </div>

      {/* Drag handle */}
      <div
        class="flex-shrink-0 relative group"
        style={{
          [isHoriz() ? 'width' : 'height']: '4px',
          background: 'rgba(0, 243, 255, 0.15)',
          cursor: isHoriz() ? 'col-resize' : 'row-resize',
          transition: 'background 0.2s',
        }}
        onMouseDown={onMouseDown}
        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0, 243, 255, 0.5)')}
        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(0, 243, 255, 0.15)')}
      >
        {/* Grip dots */}
        <div
          class="absolute"
          style={{
            top: isHoriz() ? '50%' : '0',
            left: isHoriz() ? '0' : '50%',
            transform: isHoriz() ? 'translateY(-50%)' : 'translateX(-50%)',
            [isHoriz() ? 'width' : 'height']: '4px',
            [isHoriz() ? 'height' : 'width']: '30px',
            display: 'flex',
            'flex-direction': isHoriz() ? 'column' : 'row',
            gap: '3px',
            'align-items': 'center',
            'justify-content': 'center',
          }}
        >
          {[0, 1, 2].map(() => (
            <div
              style={{
                width: '2px',
                height: '2px',
                'border-radius': '50%',
                background: 'rgba(0, 243, 255, 0.6)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Panel B */}
      <div
        class="flex-1 min-h-0 min-w-0"
        style={{
          overflow: 'hidden',
        }}
      >
        {panelB()}
      </div>
    </div>
  );
}
