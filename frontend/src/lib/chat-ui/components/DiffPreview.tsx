import { createSignal, onMount, onCleanup } from 'solid-js';
import * as monaco from 'monaco-editor';

interface DiffPreviewProps {
  original: string;
  modified: string;
  onAccept: () => void;
  onReject: () => void;
  filePath?: string;
}

export default function DiffPreview(props: DiffPreviewProps) {
  let containerRef: HTMLDivElement | undefined;
  let diffEditor: monaco.editor.IStandaloneDiffEditor | undefined;
  let originalModel: monaco.editor.ITextModel | undefined;
  let modifiedModel: monaco.editor.ITextModel | undefined;
  const [visible, setVisible] = createSignal(true);

  const handleAccept = () => {
    props.onAccept();
    setVisible(false);
  };

  const handleReject = () => {
    props.onReject();
    setVisible(false);
  };

  onMount(() => {
    if (!containerRef) return;

    diffEditor = monaco.editor.createDiffEditor(containerRef, {
      theme: 'hermes',
      fontSize: 13,
      automaticLayout: true,
      minimap: { enabled: false },
      renderSideBySide: true,
      readOnly: true,
    });

    originalModel = monaco.editor.createModel(props.original, 'typescript');
    modifiedModel = monaco.editor.createModel(props.modified, 'typescript');

    diffEditor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });

    // Keyboard shortcuts
    const keyHandler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'Enter') {
        handleAccept();
      }
      if (e.key === 'Escape') {
        handleReject();
      }
    };
    window.addEventListener('keydown', keyHandler);
    onCleanup(() => window.removeEventListener('keydown', keyHandler));
  });

  onCleanup(() => {
    diffEditor?.dispose();
    originalModel?.dispose();
    modifiedModel?.dispose();
  });

  if (!visible()) return null;

  return (
    <div class="diff-preview fixed bottom-4 right-4 z-50 bg-[#050507] border border-[#00f3ff] rounded shadow-2xl" style="width: 80%; max-width: 900px; box-shadow: 0 0 30px rgba(0, 243, 255, 0.3);">
      <div class="flex items-center justify-between px-4 py-2 border-b border-[#00f3ff]/30 bg-[#0a0a0f]">
        <div class="flex items-center gap-2 text-[#00f3ff] text-xs tracking-widest font-bold">
          DIFF PREVIEW — {props.filePath || 'active file'}
        </div>
        <div class="flex gap-2">
          <button onClick={handleReject} class="px-4 py-1 text-xs border border-[#ff00cc] text-[#ff00cc] hover:bg-[#ff00cc]/10 rounded">REJECT (Esc)</button>
          <button onClick={handleAccept} class="px-4 py-1 text-xs bg-[#00ff9f] text-black font-bold hover:bg-[#00ff9f]/90 rounded">ACCEPT (Ctrl+Shift+Enter)</button>
        </div>
      </div>
      <div ref={containerRef} style="height: 400px; border: 1px solid #00f3ff20;"></div>
      <div class="p-2 text-[10px] text-[#ffd700]/70 text-center border-t border-[#00f3ff]/20">
        Use cyberpunk theme colors • Tab to accept in editor context
      </div>
    </div>
  );
}
