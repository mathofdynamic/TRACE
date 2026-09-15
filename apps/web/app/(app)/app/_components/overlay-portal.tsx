'use client';

import React, { useEffect, useState, useRef, useCallback, useContext, createContext } from 'react';
import { createPortal } from 'react-dom';
import { usePresence, getPresenceProps } from '../../../../lib/presence';
import type { PresenceState } from '../../../../lib/presence';

export interface OverlayPortalProps {
  children: React.ReactNode;
}

let activeOverlayCount = 0;

/**
 * OverlayPortal renders children into document.body to break out of
 * local CSS stacking contexts, ensuring backdrops blur the entire application
 * (including sidebar, topbar, and project selector).
 */
export function OverlayPortal({ children }: OverlayPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    activeOverlayCount += 1;
    if (typeof document !== 'undefined') {
      document.body.setAttribute('data-overlay-active', 'true');
    }
    return () => {
      setMounted(false);
      activeOverlayCount = Math.max(0, activeOverlayCount - 1);
      if (typeof document !== 'undefined' && activeOverlayCount === 0) {
        document.body.removeAttribute('data-overlay-active');
      }
    };
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="trace-overlay-root" role="presentation">
      {children}
    </div>,
    document.body,
  );
}

export interface PresenceContextValue {
  presenceState: PresenceState;
  requestClose: () => void;
  isMounted: boolean;
  surfaceRef?: React.RefObject<HTMLDivElement | null>;
  handleTransitionEnd?: (e: React.TransitionEvent<HTMLElement> | TransitionEvent) => void;
}

export const PresenceContext = createContext<PresenceContextValue | null>(null);

export type BackdropPresenceState = 'opening' | 'open' | 'closing';
export const BackdropPresenceContext = createContext<BackdropPresenceState>('open');

export interface MotionPresenceProps {
  isOpen: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}

/**
 * MotionPresence provides the single lifecycle ownership context for transient surfaces.
 */
export function MotionPresence({ isOpen, onClose, children }: MotionPresenceProps) {
  const presence = usePresence(isOpen, { onCloseComplete: onClose });

  if (!presence.isMounted) return null;

  return <PresenceContext.Provider value={presence}>{children}</PresenceContext.Provider>;
}

export interface ModalBackdropProps {
  children: React.ReactNode;
  onClose?: () => void;
  onRequestClose?: () => void;
  presenceState?: PresenceState;
  className?: string;
  ariaLabel?: string;
}

/**
 * ModalBackdrop provides a full-viewport fixed layer with systemic background blur.
 * Consumes unified presence state from parent / PresenceContext rather than inventing its own.
 */
export function ModalBackdrop({
  children,
  onClose,
  onRequestClose,
  presenceState: propPresenceState,
  className = '',
  ariaLabel = 'Close dialog',
}: ModalBackdropProps) {
  const context = useContext(PresenceContext);
  const presenceState = propPresenceState ?? context?.presenceState ?? 'open';
  const requestClose = onRequestClose ?? context?.requestClose ?? onClose ?? (() => {});

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if clicking directly on the backdrop layer or scrim
    if (e.target === e.currentTarget) {
      requestClose();
    }
  };

  const handleScrimClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    requestClose();
  };

  const backdropPresenceState: BackdropPresenceState =
    presenceState === 'closed' || presenceState === 'closing' ? 'closing' : presenceState;

  return (
    <BackdropPresenceContext.Provider value={backdropPresenceState}>
      <div
        className={`trace-modal-backdrop-layer ${className}`.trim()}
        role="presentation"
        data-trace-motion="surface"
        data-motion-variant="backdrop"
        data-presence-state={presenceState}
        data-trace-presence={presenceState}
        onClick={handleBackdropClick}
      >
        <div
          className="trace-modal-backdrop"
          aria-hidden="true"
          aria-label={ariaLabel}
          onClick={handleScrimClick}
        />
        {children}
      </div>
    </BackdropPresenceContext.Provider>
  );
}

export interface CenteredDialogProps {
  children: React.ReactNode;
  onClose?: () => void;
  onRequestClose?: () => void;
  presenceState?: PresenceState;
  titleId?: string;
  descriptionId?: string;
  size?: 'sm' | 'md' | 'lg' | 'default';
  className?: string;
  role?: 'dialog' | 'alertdialog';
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * CenteredDialog encapsulates accessible modal behavior:
 * - Centered viewport placement on desktop
 * - Body scroll lock on mount with restoration on unmount
 * - Trap focus within dialog on Tab
 * - Escape key routes to shared requestClose() path
 * - Focus restoration to previous active element on unmount
 * - Consumes presence state and dual data attributes from shared presence owner
 */
export function CenteredDialog({
  children,
  onClose,
  onRequestClose,
  presenceState: propPresenceState,
  titleId,
  descriptionId,
  size = 'default',
  className = '',
  role = 'dialog',
  initialFocusRef,
}: CenteredDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const context = useContext(PresenceContext);
  const legacyPresence = useContext(BackdropPresenceContext);
  const presenceState = propPresenceState ?? context?.presenceState ?? legacyPresence ?? 'open';
  const requestClose = onRequestClose ?? context?.requestClose ?? onClose ?? (() => {});

  // Save previous active element to restore upon close
  useEffect(() => {
    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    }
  }, []);

  // Body scroll lock
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const originalOverflow = document.body.style.overflow;
    const originalPaddingRight = document.body.style.paddingRight;

    // Check scrollbar width to prevent layout shift
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.style.paddingRight = originalPaddingRight;
    };
  }, []);

  // Initial focus management
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus();
      } else if (dialogRef.current) {
        const firstFocusable = dialogRef.current.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (firstFocusable) {
          firstFocusable.focus();
        } else {
          dialogRef.current.focus();
        }
      }
    }, 16);

    return () => clearTimeout(timer);
  }, [initialFocusRef]);

  // Focus restoration on unmount
  useEffect(() => {
    return () => {
      if (
        previousActiveElementRef.current &&
        typeof previousActiveElementRef.current.focus === 'function'
      ) {
        previousActiveElementRef.current.focus();
      }
    };
  }, []);

  // Keyboard navigation: Escape routes to shared requestClose(), Tab cycles focus
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        requestClose();
        return;
      }

      if (e.key === 'Tab') {
        if (!dialogRef.current) return;
        const focusableElements =
          dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        if (focusableElements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = focusableElements[0];
        const lastElement = focusableElements[focusableElements.length - 1];

        if (e.shiftKey) {
          if (
            document.activeElement === firstElement ||
            document.activeElement === dialogRef.current
          ) {
            e.preventDefault();
            lastElement?.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement?.focus();
          }
        }
      }
    },
    [requestClose],
  );

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    if (context?.handleTransitionEnd) {
      context.handleTransitionEnd(e);
    }
  };

  const sizeClass =
    size === 'sm'
      ? 'trace-centered-dialog--sm'
      : size === 'md'
        ? 'trace-centered-dialog--md'
        : size === 'lg'
          ? 'trace-centered-dialog--lg'
          : '';

  return (
    <div
      ref={dialogRef}
      className={`trace-centered-dialog ${sizeClass} ${className}`.trim()}
      role={role}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      tabIndex={-1}
      data-trace-motion="surface"
      data-motion-variant="dialog"
      data-presence-state={presenceState}
      data-trace-presence={presenceState}
      onKeyDown={handleKeyDown}
      onTransitionEnd={handleTransitionEnd}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  );
}
