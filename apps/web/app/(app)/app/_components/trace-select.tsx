'use client';

import React, { useState, useRef, useEffect, useId, useCallback } from 'react';
import { usePresence, getMotionStyle } from '../../../../lib/entrance-motion';

export interface TraceSelectOption {
  value: string;
  label: string;
  count?: number;
  description?: string;
  disabled?: boolean;
}

export interface TraceSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: TraceSelectOption[];
  label?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  minWidth?: string | number;
}

export function TraceSelect({
  id: customId,
  name,
  value,
  onChange,
  options,
  label,
  ariaLabel,
  placeholder = 'Select an option',
  disabled = false,
  className = '',
  size = 'md',
  minWidth,
}: TraceSelectProps) {
  const generatedId = useId();
  const id = customId || `trace-select-${generatedId}`;
  const listboxId = `${id}-listbox`;

  const [isOpen, setIsOpen] = useState(false);
  const presence = usePresence(isOpen);

  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);

  const selectedIndex = options.findIndex((opt) => opt.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  const [highlightedIndex, setHighlightedIndex] = useState(selectedIndex >= 0 ? selectedIndex : 0);

  // Sync highlightedIndex when value changes or when opened
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, selectedIndex]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [isOpen]);

  // Scroll active option into view
  useEffect(() => {
    if (isOpen && listboxRef.current && highlightedIndex >= 0) {
      const activeElement = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement) {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [isOpen, highlightedIndex]);

  const selectOption = useCallback(
    (index: number) => {
      const option = options[index];
      if (option && !option.disabled) {
        onChange(option.value);
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    },
    [options, onChange],
  );

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev + 1;
          if (next >= options.length) next = 0;
          while (options[next]?.disabled && next !== prev) {
            next = (next + 1) % options.length;
          }
          return next;
        });
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setHighlightedIndex((prev) => {
          let next = prev - 1;
          if (next < 0) next = options.length - 1;
          while (options[next]?.disabled && next !== prev) {
            next = (next - 1 + options.length) % options.length;
          }
          return next;
        });
        break;
      }
      case 'Home': {
        e.preventDefault();
        setHighlightedIndex(0);
        break;
      }
      case 'End': {
        e.preventDefault();
        setHighlightedIndex(options.length - 1);
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        selectOption(highlightedIndex);
        break;
      }
      case 'Escape': {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
        break;
      }
      case 'Tab': {
        setIsOpen(false);
        break;
      }
      default:
        break;
    }
  };

  const effectiveAriaLabel = ariaLabel || label || placeholder;

  return (
    <div
      ref={containerRef}
      className={`trace-select-wrapper ${size === 'sm' ? 'trace-select-wrapper--sm' : ''} ${className}`.trim()}
      style={minWidth ? { minWidth } : undefined}
    >
      {/* Hidden input for form submissions / test tools if name is provided */}
      {name && <input type="hidden" name={name} value={value} />}

      <button
        ref={triggerRef}
        id={id}
        type="button"
        className={`trace-select-trigger ${isOpen ? 'trace-select-trigger--open' : ''} ${disabled ? 'trace-select-trigger--disabled' : ''} ${size === 'sm' ? 'trace-select-trigger--sm' : ''}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listboxId}
        aria-label={effectiveAriaLabel}
        aria-activedescendant={
          isOpen && highlightedIndex >= 0 ? `${listboxId}-opt-${highlightedIndex}` : undefined
        }
        disabled={disabled}
      >
        <span className="trace-select-trigger__label">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="trace-select-trigger__icon" aria-hidden="true">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m3 4.5 3 3 3-3" />
          </svg>
        </span>
      </button>

      {presence.isMounted && (
        <ul
          ref={listboxRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          aria-label={effectiveAriaLabel}
          className="trace-select-listbox"
          data-trace-motion="surface"
          data-motion-variant="popover"
          data-presence-state={presence.presenceState}
          data-trace-presence={presence.presenceState}
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIndex;

            return (
              <li
                key={opt.value}
                id={`${listboxId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                data-selected={isSelected}
                data-highlighted={isHighlighted}
                data-trace-motion="item"
                data-motion-item="true"
                style={getMotionStyle(idx, { delayMs: Math.min(idx * 25, 120) })}
                className={`trace-select-option ${isSelected ? 'trace-select-option--selected' : ''} ${isHighlighted ? 'trace-select-option--highlighted' : ''} ${opt.disabled ? 'trace-select-option--disabled' : ''}`}
                onClick={() => selectOption(idx)}
                onMouseEnter={() => !opt.disabled && setHighlightedIndex(idx)}
              >
                <div className="trace-select-option__content">
                  <span className="trace-select-option__label">{opt.label}</span>
                  {opt.description ? (
                    <span className="trace-select-option__desc">{opt.description}</span>
                  ) : null}
                </div>
                {opt.count !== undefined && (
                  <span className="trace-select-option__count">{opt.count}</span>
                )}
                {isSelected && (
                  <span className="trace-select-option__check" aria-hidden="true">
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m2.5 6 2.5 2.5 4.5-5" />
                    </svg>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
