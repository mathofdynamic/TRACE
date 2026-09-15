/**
 * TRACE Unified Presence Lifecycle Engine â€” 200ms Open / 66ms Close Contract
 *
 * Manages the deterministic presence lifecycle for all transient surfaces:
 * - Menus, popovers, dropdowns, drawers, disclosures, dialogs, modals, prompt builders.
 *
 * Physical Contract:
 * - Open: 200ms duration, cubic-bezier(.16, 1, .3, 1), translate3d(0, 20px, 0) -> 0, opacity 0 -> 1.
 * - Stagger lead: ~66.6667ms (ENTRANCE_LEAD_MS = 200 / 3).
 * - Close: 66ms duration, cubic-bezier(.4, 0, 1, 1), translate3d(0, 0, 0) -> translate3d(0, 8px, 0), opacity 1 -> 0.
 * - Close stagger: NONE (all elements exit together).
 * - Reopen during close: Immediately aborts close timer and cleanly transitions back to opening (200ms).
 * - Reduced motion: Immediate mount / unmount with 0ms transition.
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ENTRANCE_DURATION_MS, EXIT_DURATION_MS } from './motion-tokens';
import { usePrefersReducedMotion } from './use-prefers-reduced-motion';

export type PresenceState = 'closed' | 'opening' | 'open' | 'closing';

export interface UsePresenceOptions {
  openDurationMs?: number;
  closeDurationMs?: number;
  fallbackDurationMs?: number;
  onCloseComplete?: () => void;
}

export interface UsePresenceReturn {
  isMounted: boolean;
  presenceState: PresenceState;
  isOpening: boolean;
  isOpen: boolean;
  isClosing: boolean;
  isClosed: boolean;
  requestClose: () => void;
  surfaceRef: React.RefObject<HTMLDivElement | null>;
  handleTransitionEnd: (e: React.TransitionEvent<HTMLElement> | TransitionEvent) => void;
  presenceProps: {
    'data-presence-state': PresenceState;
    'data-trace-presence': PresenceState;
  };
}

/**
 * Generates DOM attributes for presence state reflection.
 */
export function getPresenceProps(state: PresenceState) {
  return {
    'data-presence-state': state,
    'data-trace-presence': state,
  };
}

/**
 * usePresence hook controls mounting, opening transition, closing transition, and unmounting.
 *
 * Invariants:
 * - 200ms Entrance: cubic-bezier(.16, 1, .3, 1), 20px distance
 * - 66ms Exit: cubic-bezier(.4, 0, 1, 1), 8px distance
 * - Primary completion via transitionend on main surface shell with bounded fallback timer (140ms)
 * - Shared requestClose() trigger initiates closing animation and invokes onCloseComplete on finish
 * - Reopen during close cleanly cancels closing timers and returns to opening
 * - Reduced motion: 0ms immediate open and close with zero transition waits
 */
export function usePresence(
  isOpenInput: boolean,
  options: UsePresenceOptions = {},
): UsePresenceReturn {
  const {
    openDurationMs = ENTRANCE_DURATION_MS,
    closeDurationMs = EXIT_DURATION_MS,
    fallbackDurationMs = 140,
    onCloseComplete,
  } = options;

  const prefersReducedMotion = usePrefersReducedMotion();
  const [presenceState, setPresenceState] = useState<PresenceState>(
    isOpenInput ? (prefersReducedMotion ? 'open' : 'opening') : 'closed',
  );

  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafId1Ref = useRef<number | null>(null);
  const rafId2Ref = useRef<number | null>(null);
  const onCloseCompleteRef = useRef(onCloseComplete);
  onCloseCompleteRef.current = onCloseComplete;

  const cancelPending = useCallback(() => {
    if (closeTimerRef.current !== null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    if (fallbackTimerRef.current !== null) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (rafId1Ref.current !== null) {
      cancelAnimationFrame(rafId1Ref.current);
      rafId1Ref.current = null;
    }
    if (rafId2Ref.current !== null) {
      cancelAnimationFrame(rafId2Ref.current);
      rafId2Ref.current = null;
    }
  }, []);

  const finalizeClose = useCallback(() => {
    cancelPending();
    setPresenceState('closed');
    if (typeof onCloseCompleteRef.current === 'function') {
      onCloseCompleteRef.current();
    }
  }, [cancelPending]);

  const handleTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLElement> | TransitionEvent) => {
      if (presenceState !== 'closing') return;

      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Ensure transitionend originates from the surface shell or designated motion container
      const isExpectedSurface =
        target === surfaceRef.current ||
        target.getAttribute('data-trace-motion') === 'surface' ||
        target.classList.contains('trace-centered-dialog') ||
        target.classList.contains('trace-modal-backdrop') ||
        target.classList.contains('trace-select-listbox') ||
        target.classList.contains('repository-switcher') ||
        target.classList.contains('trace-modal-backdrop-layer');

      if (!isExpectedSurface) return;

      const prop = e.propertyName;
      if (
        prop === 'opacity' ||
        prop === 'transform' ||
        prop.includes('opacity') ||
        prop.includes('transform')
      ) {
        finalizeClose();
      }
    },
    [presenceState, finalizeClose],
  );

  const startClosing = useCallback(() => {
    cancelPending();

    if (prefersReducedMotion) {
      finalizeClose();
      return;
    }

    setPresenceState('closing');

    // Bounded fallback timer (140ms, between 120ms-160ms) if transitionend does not fire
    fallbackTimerRef.current = setTimeout(() => {
      finalizeClose();
    }, fallbackDurationMs);
  }, [cancelPending, prefersReducedMotion, finalizeClose, fallbackDurationMs]);

  const requestClose = useCallback(() => {
    if (presenceState === 'closed' || presenceState === 'closing') {
      return;
    }
    startClosing();
  }, [presenceState, startClosing]);

  // Sync external isOpenInput changes
  useEffect(() => {
    if (isOpenInput) {
      cancelPending();

      if (prefersReducedMotion) {
        setPresenceState('open');
        return;
      }

      // If already open, do not re-trigger opening sequence
      if (presenceState === 'open') {
        return;
      }

      // Start in opening state
      setPresenceState('opening');

      // Double RAF ensures initial layout paint before transition starts
      if (typeof window !== 'undefined') {
        rafId1Ref.current = requestAnimationFrame(() => {
          rafId2Ref.current = requestAnimationFrame(() => {
            setPresenceState('open');
            rafId1Ref.current = null;
            rafId2Ref.current = null;
          });
        });
      } else {
        setPresenceState('open');
      }
    } else {
      // If isOpenInput becomes false from outside while open/opening, start closing sequence
      if (presenceState === 'open' || presenceState === 'opening') {
        startClosing();
      }
    }

    return () => {
      cancelPending();
    };
  }, [isOpenInput, prefersReducedMotion, cancelPending, startClosing]);

  const isMounted = presenceState !== 'closed';

  return {
    isMounted,
    presenceState,
    isOpening: presenceState === 'opening',
    isOpen: presenceState === 'open',
    isClosing: presenceState === 'closing',
    isClosed: presenceState === 'closed',
    requestClose,
    surfaceRef,
    handleTransitionEnd,
    presenceProps: getPresenceProps(presenceState),
  };
}
