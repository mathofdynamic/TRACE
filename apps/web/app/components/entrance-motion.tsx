'use client';

import React, { createContext, useContext } from 'react';
import { getMotionStyle } from '../../lib/entrance-motion';

interface MotionGroupContextValue {
  baseIndex?: number;
}

const MotionGroupContext = createContext<MotionGroupContextValue>({});

export interface MotionSectionProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  children: React.ReactNode;
  sectionId?: string;
  className?: string;
}

/**
 * MotionSection wraps a major section, registering it with the IntersectionObserver
 * and coordinating child MotionItems.
 */
export function MotionSection({
  as: Component = 'section',
  children,
  sectionId,
  className = '',
  ...props
}: MotionSectionProps) {
  return (
    <Component
      data-trace-motion="section"
      data-motion-section={sectionId || 'section'}
      className={`trace-motion-section ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface MotionGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
  children: React.ReactNode;
  startIndex?: number;
  className?: string;
}

/**
 * MotionGroup provides context for sequential indexing across a collection of items.
 */
export function MotionGroup({
  as: Component = 'div',
  children,
  startIndex = 0,
  className = '',
  ...props
}: MotionGroupProps) {
  return (
    <MotionGroupContext.Provider value={{ baseIndex: startIndex }}>
      <Component className={className} {...props}>
        {children}
      </Component>
    </MotionGroupContext.Provider>
  );
}

export interface MotionItemProps extends React.HTMLAttributes<HTMLElement> {
  as?: React.ElementType;
  children: React.ReactNode;
  index?: number;
  delayMs?: number;
  className?: string;
}

/**
 * MotionItem wraps a single meaningful visual unit (card, row, toolbar, callout, header).
 */
export function MotionItem({
  as: Component = 'div',
  children,
  index = 0,
  delayMs,
  className = '',
  style,
  ...props
}: MotionItemProps) {
  const groupContext = useContext(MotionGroupContext);
  const effectiveIndex = (groupContext.baseIndex ?? 0) + index;
  const motionStyle = getMotionStyle(effectiveIndex, { delayMs });

  return (
    <Component
      data-trace-motion="item"
      className={`trace-motion-item ${className}`.trim()}
      style={{ ...motionStyle, ...style }}
      {...props}
    >
      {children}
    </Component>
  );
}

export interface MotionSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  as?: React.ElementType;
  children: React.ReactNode;
  variant?: 'dialog' | 'popover' | 'drawer' | 'backdrop';
  className?: string;
}

/**
 * MotionSurface wraps transient surfaces (dialogs, popovers, drawers, backdrops).
 */
export function MotionSurface({
  as: Component = 'div',
  children,
  variant = 'dialog',
  className = '',
  ...props
}: MotionSurfaceProps) {
  return (
    <Component
      data-trace-motion="surface"
      data-motion-variant={variant}
      className={`trace-motion-surface trace-motion-surface--${variant} ${className}`.trim()}
      {...props}
    >
      {children}
    </Component>
  );
}
