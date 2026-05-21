import { createSignal, onCleanup, onMount } from 'solid-js';

interface AutoScrollOptions {
  /** Pixel threshold from bottom to consider "at bottom". Default 50. */
  threshold?: number;
  /** Called when scroll state changes: true = at bottom, false = user scrolled up */
  onScrollStateChange?: (isAtBottom: boolean) => void;
}

export function createAutoScroll(container: () => HTMLElement | undefined, options?: AutoScrollOptions) {
  const threshold = options?.threshold ?? 50;
  const [isAtBottom, setIsAtBottom] = createSignal(true);

  let resizeObserver: ResizeObserver | null = null;
  let observedElements = new Set<Element>();
  let isProgrammaticScroll = false;
  let rafId = 0;

  const getIsAtBottom = (): boolean => {
    const el = container();
    if (!el) return true;
    const { scrollTop, scrollHeight, clientHeight } = el;
    return scrollHeight - scrollTop - clientHeight <= threshold;
  };

  const scrollToBottom = (behavior: 'smooth' | 'instant' = 'smooth') => {
    const el = container();
    if (!el) return;
    isProgrammaticScroll = true;
    el.scrollTo({ top: el.scrollHeight, behavior });
    // Clear the flag after scroll completes
    setTimeout(() => { isProgrammaticScroll = false; }, behavior === 'smooth' ? 300 : 50);
  };

  const onScroll = () => {
    if (isProgrammaticScroll) return;
    const atBottom = getIsAtBottom();
    if (atBottom !== isAtBottom()) {
      setIsAtBottom(atBottom);
      options?.onScrollStateChange?.(atBottom);
    }
  };

  // Observe elements for size changes (streaming text, images)
  const observeElements = (elements: Element[]) => {
    if (!resizeObserver) return;
    // Unobserve removed elements
    for (const el of observedElements) {
      if (!elements.includes(el)) {
        resizeObserver.unobserve(el);
        observedElements.delete(el);
      }
    }
    // Observe new elements
    for (const el of elements) {
      if (!observedElements.has(el)) {
        resizeObserver.observe(el);
        observedElements.add(el);
      }
    }
  };

  onMount(() => {
    const el = container();
    if (!el) return;

    el.addEventListener('scroll', onScroll, { passive: true });

    resizeObserver = new ResizeObserver(() => {
      if (isAtBottom()) {
        cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => scrollToBottom('instant'));
      }
    });

    // Initialize state
    setIsAtBottom(getIsAtBottom());
    options?.onScrollStateChange?.(getIsAtBottom());
  });

  onCleanup(() => {
    const el = container();
    if (el) el.removeEventListener('scroll', onScroll);
    resizeObserver?.disconnect();
    resizeObserver = null;
    observedElements.clear();
    cancelAnimationFrame(rafId);
  });

  return { isAtBottom, scrollToBottom, observeElements };
}
