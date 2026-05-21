import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import * as monaco from 'monaco-editor';

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface InlineEditProps {
  proposedCode: string;
  selection: any;
  onAccept: () => void;
  onReject: () => void;
  editor: monaco.editor.IStandaloneCodeEditor;
}

export default function InlineEdit(props: InlineEditProps) {
  const [visible, setVisible] = createSignal(true);
  let widgetRef: HTMLDivElement | undefined;
  let contentWidget: any;

  const handleAccept = () => {
    // Apply the replacement to the editor model
    const model = props.editor.getModel();
    if (model && props.selection) {
      model.pushEditOperations([], [{
        range: props.selection,
        text: props.proposedCode,
      }], () => null);
    }
    props.onAccept();
    setVisible(false);
    disposeWidget();
  };

  const handleReject = () => {
    props.onReject();
    setVisible(false);
    disposeWidget();
  };

  const disposeWidget = () => {
    if (contentWidget) {
      props.editor.removeContentWidget(contentWidget);
    }
  };

  onMount(() => {
    if (!props.editor) return;

    // Create content widget for ghost overlay below selection
    contentWidget = {
      getId: () => 'inline-edit-widget',
      getDomNode: () => {
        if (!widgetRef) {
          widgetRef = document.createElement('div');
          widgetRef.style.background = '#050507';
          widgetRef.style.border = '1px solid #00f3ff';
          widgetRef.style.borderRadius = '4px';
          widgetRef.style.padding = '8px';
          widgetRef.style.boxShadow = '0 0 20px rgba(0, 243, 255, 0.5)';
          widgetRef.style.color = '#e0ffe8';
          widgetRef.style.fontFamily = 'JetBrains Mono, monospace';
          widgetRef.style.fontSize = '13px';
          widgetRef.style.minWidth = '300px';
          widgetRef.innerHTML = `
            <div style="color:#ffd700;margin-bottom:6px;font-size:11px;">DON SUGGESTS REWRITE</div>
            <pre style="background:#0a0a0f;padding:8px;border:1px solid #00ff9f33;white-space:pre-wrap;">${escapeHtml(props.proposedCode)}</pre>
            <div style="display:flex;gap:8px;margin-top:8px;">
              <button onclick="this.closest('.widget').__accept()" style="background:#00ff9f;color:#000;padding:4px 12px;font-size:11px;border:none;border-radius:3px;cursor:pointer;">ACCEPT</button>
              <button onclick="this.closest('.widget').__reject()" style="background:transparent;border:1px solid #ff00cc;color:#ff00cc;padding:4px 12px;font-size:11px;border-radius:3px;cursor:pointer;">REJECT</button>
            </div>
          `;
          widgetRef.className = 'widget';
          (widgetRef as any).__accept = handleAccept;
          (widgetRef as any).__reject = handleReject;
        }
        return widgetRef;
      },
      getPosition: () => ({
        position: props.selection.getEndPosition(),
        preference: [monaco.editor.ContentWidgetPositionPreference.BELOW]
      })
    };

    props.editor.addContentWidget(contentWidget);
  });

  onCleanup(() => {
    disposeWidget();
  });

  return <Show when={visible()}><div style="display:none" /></Show>;
}
