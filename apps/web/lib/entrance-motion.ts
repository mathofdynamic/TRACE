/**
 * TRACE Unified Entrance Motion Engine â€” 200ms Physical Runtime
 *
 * Implements the shared TRACE entrance-motion contract:
 * - Opening duration: 200ms
 * - Opening easing: cubic-bezier(.16, 1, .3, 1)
 * - Opening properties: opacity + transform only
 * - Initial transform: translate3d(0, 20px, 0)
 * - Final transform: translate3d(0, 0, 0)
 * - Inter-item gap: 0ms
 * - Next-item lead: ENTRANCE_DURATION_MS / 3 (66.66666666666667ms)
 * - Close duration: 66ms
 * - Close easing: cubic-bezier(.4, 0, 1, 1)
 * - Close transform: translate3d(0, 8px, 0)
 * - Close stagger: none
 */

import type { CSSProperties } from 'react';
import {
  ENTRANCE_DURATION_MS,
  ENTRANCE_LEAD_MS,
  ENTRANCE_DISTANCE_PX,
  ENTRANCE_EASING,
  EXIT_DURATION_MS,
  EXIT_DISTANCE_PX,
  EXIT_EASING,
  STAGGER_DELAY_MS,
} from './motion-tokens';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

// Re-export design tokens & constants
export {
  ENTRANCE_DURATION_MS,
  ENTRANCE_LEAD_MS,
  ENTRANCE_DISTANCE_PX,
  ENTRANCE_EASING,
  EXIT_DURATION_MS,
  EXIT_DISTANCE_PX,
  EXIT_EASING,
  STAGGER_DELAY_MS,
};

// Re-export reduced-motion hook
export { usePrefersReducedMotion };

// Re-export shared presence lifecycle
export { usePresence, getPresenceProps } from './presence';
export type { PresenceState, UsePresenceOptions, UsePresenceReturn } from './presence';

/**
 * WeakSet of elements that have already completed entrance motion or have been revealed.
 * Ensures an element is never animated twice and avoids memory leaks on detached nodes.
 */
export const seenMotionElements = new WeakSet<Element>();

/**
 * Marks an element as seen in the global motion tracker and ensures it is marked revealed.
 */
export function markElementSeen(el: Element): void {
  seenMotionElements.add(el);
  if (el.getAttribute('data-motion-state') !== 'revealed') {
    el.setAttribute('data-motion-state', 'revealed');
  }
}

/**
 * Checks if an element has already been seen / revealed by the motion engine.
 */
export function isElementSeen(el: Element): boolean {
  return seenMotionElements.has(el) || el.getAttribute('data-motion-state') === 'revealed';
}

/**
 * Resets seen tracking state (primarily for test environments).
 */
export function resetSeenTracking(): void {
  // WeakSet cannot be cleared directly, but existing references will be re-evaluated
}

export interface MotionStyleOptions {
  index?: number;
  delayMs?: number;
  durationMs?: number;
  easing?: string;
}

/**
 * Computes inline CSS variables for deterministic DOM-order entrance staggering.
 */
export function getMotionStyle(index: number = 0, options: MotionStyleOptions = {}): CSSProperties {
  const { delayMs, durationMs, easing } = options;
  const style: Record<string, string | number> = {
    '--motion-index': index,
  };

  if (typeof delayMs === 'number') {
    style['--motion-delay'] = `${delayMs}ms`;
  }
  if (typeof durationMs === 'number') {
    style['--motion-duration'] = `${durationMs}ms`;
  }
  if (easing) {
    style['--motion-easing'] = easing;
  }

  return style as CSSProperties;
}

/**
 * Generates semantic props for an entrance item.
 */
export function getMotionItemProps(index: number = 0, options: MotionStyleOptions = {}) {
  return {
    'data-trace-motion': 'item',
    'data-motion-item': 'true',
    style: getMotionStyle(index, options),
  };
}

/**
 * Generates semantic props for an entrance section boundary.
 */
export function getMotionSectionProps(id?: string) {
  return {
    'data-trace-motion': 'section',
    'data-motion-section': id || 'section',
  };
}

/**
 * Generates semantic props for transient surface elements (dialogs, popovers, drawers, backdrops).
 */
export function getMotionSurfaceProps(
  variant: 'dialog' | 'popover' | 'drawer' | 'backdrop' = 'dialog',
) {
  return {
    'data-trace-motion': 'surface',
    'data-motion-variant': variant,
  };
}

/**
 * Global IntersectionObserver manager for coordinate section reveals.
 *
 * Rules:
 * 1. Progressively enhances: Content is visible by default when JS is absent.
 * 2. Positively activates: Marks document.documentElement with data-trace-motion-ready="true".
 * 3. Threshold ~0.05, rootMargin ~'0px 0px -6% 0px'.
 * 4. Above-fold sections reveal immediately on mount.
 * 5. Below-fold sections reveal once when intersecting, then unobserve.
 * 6. Simultaneous entries sorted in document/DOM order.
 * 7. Live reduced-motion listener reconciliation (settles pending sections immediately).
 */
export function setupEntranceMotionObserver(rootMargin = '0px 0px -6% 0px'): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  let raf1: number | null = null;
  let raf2: number | null = null;
  let observer: IntersectionObserver | null = null;
  let mutationObserver: MutationObserver | null = null;
  let mediaQuery: MediaQueryList | null = null;
  let handleReducedMotionChange: ((e: MediaQueryListEvent | MediaQueryList) => void) | null = null;

  try {
    // Positively mark runtime ready
    document.documentElement.setAttribute('data-trace-motion-ready', 'true');

    // Fallback: If IntersectionObserver is unsupported, reveal all immediately
    const ObserverClass =
      (typeof window !== 'undefined' &&
        (window as unknown as { IntersectionObserver?: typeof IntersectionObserver })
          .IntersectionObserver) ||
      (typeof IntersectionObserver !== 'undefined' ? IntersectionObserver : undefined);

    if (!ObserverClass) {
      const sections = document.querySelectorAll(
        '[data-trace-motion="section"], [data-motion-section], [data-trace-motion-observed]',
      );
      sections.forEach((sec) => markElementSeen(sec));
      return () => {};
    }

    observer = new ObserverClass(
      (entries) => {
        // Sort simultaneous entries in document order and filter out already seen elements
        const intersectingEntries = entries
          .filter((entry) => entry.isIntersecting && !seenMotionElements.has(entry.target))
          .sort((a, b) => {
            const pos = a.target.compareDocumentPosition(b.target);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
          });

        intersectingEntries.forEach((entry) => {
          const target = entry.target as HTMLElement;
          seenMotionElements.add(target);
          target.setAttribute('data-motion-state', 'revealed');
          observer?.unobserve(target);
        });
      },
      {
        rootMargin,
        threshold: 0.05,
      },
    );

    const observeElements = () => {
      const sections = document.querySelectorAll(
        '[data-trace-motion="section"]:not([data-motion-state="revealed"]), [data-motion-section]:not([data-motion-state="revealed"]), [data-trace-motion-observed]:not([data-motion-state="revealed"])',
      );

      sections.forEach((el) => {
        if (seenMotionElements.has(el)) {
          if (el.getAttribute('data-motion-state') !== 'revealed') {
            el.setAttribute('data-motion-state', 'revealed');
          }
          return;
        }

        const rect = el.getBoundingClientRect();
        // Above-the-fold elements reveal immediately
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          seenMotionElements.add(el);
          el.setAttribute('data-motion-state', 'revealed');
        } else {
          observer?.observe(el);
        }
      });
    };

    const scheduleRaf = (cb: () => void): number => {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        return window.requestAnimationFrame(cb);
      }
      if (typeof requestAnimationFrame === 'function') {
        return requestAnimationFrame(cb);
      }
      return setTimeout(cb, 16) as unknown as number;
    };

    const cancelRaf = (id: number): void => {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(id);
      } else if (typeof cancelAnimationFrame === 'function') {
        cancelAnimationFrame(id);
      } else {
        clearTimeout(id);
      }
    };

    // Synchronize initial reveal with safe paint frame
    raf1 = scheduleRaf(() => {
      raf2 = scheduleRaf(() => {
        observeElements();
        raf1 = null;
        raf2 = null;
      });
    });

    // Observe dynamically added sections (client-side route navigation)
    if (typeof MutationObserver !== 'undefined' && document.body) {
      mutationObserver = new MutationObserver(() => {
        observeElements();
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }

    // Live Reduced-Motion Reconciliation:
    // If the preference switches to reduce at runtime, immediately reveal all pending sections
    mediaQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    handleReducedMotionChange = (e: MediaQueryListEvent | MediaQueryList) => {
      if (e.matches) {
        const unrevealed = document.querySelectorAll(
          '[data-trace-motion="section"]:not([data-motion-state="revealed"]), [data-motion-section]:not([data-motion-state="revealed"])',
        );
        unrevealed.forEach((el) => markElementSeen(el));
      }
    };

    if (mediaQuery) {
      if (mediaQuery.matches) {
        handleReducedMotionChange(mediaQuery);
      }
      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleReducedMotionChange);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleReducedMotionChange);
      }
    }

    return () => {
      if (raf1 !== null) cancelRaf(raf1);
      if (raf2 !== null) cancelRaf(raf2);
      observer?.disconnect();
      mutationObserver?.disconnect();
      if (mediaQuery && handleReducedMotionChange) {
        if (mediaQuery.removeEventListener) {
          mediaQuery.removeEventListener('change', handleReducedMotionChange);
        } else if (mediaQuery.removeListener) {
          mediaQuery.removeListener(handleReducedMotionChange);
        }
      }
    };
  } catch (error) {
    // Fail-safe error handling: Reveal all content and remove any blockers
    const unrevealed = document.querySelectorAll(
      '[data-trace-motion="section"]:not([data-motion-state="revealed"]), [data-motion-section]:not([data-motion-state="revealed"])',
    );
    unrevealed.forEach((el) => {
      el.setAttribute('data-motion-state', 'revealed');
    });
    return () => {};
  }
}
