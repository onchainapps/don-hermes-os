export function createAutoResize(
  textarea: () => HTMLTextAreaElement | undefined,
  options?: { minRows?: number; maxRows?: number }
) {
  const minRows = options?.minRows ?? 1;
  const maxRows = options?.maxRows ?? 6;

  const resize = () => {
    const el = textarea();
    if (!el) return;

    // Reset to get accurate scrollHeight
    el.style.height = 'auto';

    const computed = getComputedStyle(el);
    const lineHeight = parseFloat(computed.lineHeight) || parseFloat(computed.fontSize) * 1.2;
    const paddingTop = parseFloat(computed.paddingTop) || 0;
    const paddingBottom = parseFloat(computed.paddingBottom) || 0;
    const borderTop = parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = parseFloat(computed.borderBottomWidth) || 0;

    const minHeight = lineHeight * minRows + paddingTop + paddingBottom + borderTop + borderBottom;
    const maxHeight = lineHeight * maxRows + paddingTop + paddingBottom + borderTop + borderBottom;

    const scrollHeight = el.scrollHeight;
    const newHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    el.style.height = `${newHeight}px`;
    el.style.overflowY = scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  const attach = () => {
    const el = textarea();
    if (!el) return;
    el.addEventListener('input', resize);
    resize(); // Initial resize
  };

  const detach = () => {
    const el = textarea();
    if (!el) return;
    el.removeEventListener('input', resize);
  };

  return { resize, attach, detach };
}
