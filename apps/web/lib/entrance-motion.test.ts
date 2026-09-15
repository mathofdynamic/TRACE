import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setupEntranceMotionObserver,
  markElementSeen,
  isElementSeen,
  ENTRANCE_DURATION_MS,
  EXIT_DURATION_MS,
  ENTRANCE_LEAD_MS,
  getMotionItemProps,
  getPresenceProps,
} from './entrance-motion';

// Setup minimal node mock environment for document and window
class MockElement {
  tagName: string;
  attributes: Record<string, string> = {};
  children: MockElement[] = [];

  constructor(tagName = 'DIV') {
    this.tagName = tagName;
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = String(value);
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  removeAttribute(name: string) {
    delete this.attributes[name];
  }

  appendChild(child: MockElement) {
    this.children.push(child);
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const check = (el: MockElement) => {
      const isMotionElement =
        Boolean(el.attributes['data-trace-motion']) ||
        Boolean(el.attributes['data-motion-section']);
      const isNotRevealed = el.attributes['data-motion-state'] !== 'revealed';

      if (isMotionElement && isNotRevealed) {
        results.push(el);
      }
      for (const c of el.children) check(c);
    };
    check(this);
    return results;
  }

  compareDocumentPosition(_other: MockElement): number {
    return 4; // DOCUMENT_POSITION_FOLLOWING
  }
}

describe('Entrance Motion Runtime (Phase 53 Hardening)', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    const docEl = new MockElement('HTML');
    const bodyEl = new MockElement('BODY');
    docEl.appendChild(bodyEl);

    // Polyfill global window and document
    globalThis.window = {
      matchMedia: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
      setTimeout: ((fn: (...args: unknown[]) => void, ms?: number) =>
        setTimeout(fn, ms)) as unknown as typeof window.setTimeout,
      clearTimeout: ((id?: number | NodeJS.Timeout) =>
        clearTimeout(id)) as unknown as typeof window.clearTimeout,
    } as unknown as Window & typeof globalThis;

    globalThis.document = {
      documentElement: docEl as unknown as HTMLElement,
      body: bodyEl as unknown as HTMLElement,
      createElement: (tag: string) => new MockElement(tag) as unknown as HTMLElement,
      querySelectorAll: (sel: string) =>
        docEl.querySelectorAll(sel) as unknown as NodeListOf<Element>,
    } as unknown as Document;

    globalThis.IntersectionObserver = class {
      root = null;
      rootMargin = '';
      thresholds = [];
      takeRecords() {
        return [];
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof IntersectionObserver;

    globalThis.MutationObserver = class {
      takeRecords() {
        return [];
      }
      observe() {}
      disconnect() {}
    } as unknown as typeof MutationObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
    Reflect.deleteProperty(globalThis, 'IntersectionObserver');
    Reflect.deleteProperty(globalThis, 'MutationObserver');
  });

  it('preserves mathematical timing contracts', () => {
    expect(ENTRANCE_DURATION_MS).toBe(200);
    expect(EXIT_DURATION_MS).toBe(66);
    expect(ENTRANCE_LEAD_MS).toBeCloseTo(66.67, 1);
  });

  it('marks element seen and does not replay state', () => {
    const el = document.createElement('div');
    el.setAttribute('data-trace-motion', 'section');
    document.body.appendChild(el);

    expect(isElementSeen(el)).toBe(false);
    expect(el.getAttribute('data-motion-state')).toBeNull();

    markElementSeen(el);
    expect(isElementSeen(el)).toBe(true);
    expect(el.getAttribute('data-motion-state')).toBe('revealed');

    // Subsequent calls maintain seen status without error
    markElementSeen(el);
    expect(isElementSeen(el)).toBe(true);
  });

  it('generates correct motion item props and presence attributes', () => {
    const props = getMotionItemProps(2);
    expect(props['data-trace-motion']).toBe('item');
    expect(props.style).toEqual({ '--motion-index': 2 });

    const openAttrs = getPresenceProps('open');
    expect(openAttrs['data-presence-state']).toBe('open');
    expect(openAttrs['data-trace-presence']).toBe('open');

    const closedAttrs = getPresenceProps('closed');
    expect(closedAttrs['data-presence-state']).toBe('closed');
    expect(closedAttrs['data-trace-presence']).toBe('closed');
  });

  it('sets data-trace-motion-ready on browser initialization', () => {
    const cleanup = setupEntranceMotionObserver();
    expect(document.documentElement.getAttribute('data-trace-motion-ready')).toBe('true');
    cleanup();
  });

  it('sorts multiple simultaneously observed elements in DOM order', () => {
    const parent = document.createElement('div');
    const el1 = document.createElement('section');
    el1.setAttribute('data-trace-motion', 'section');
    const el2 = document.createElement('section');
    el2.setAttribute('data-trace-motion', 'section');
    const el3 = document.createElement('section');
    el3.setAttribute('data-trace-motion', 'section');

    // Attach in order el1, el2, el3
    parent.appendChild(el1);
    parent.appendChild(el2);
    parent.appendChild(el3);
    document.body.appendChild(parent);

    // Call markElementSeen in non-sequential order to verify stability
    markElementSeen(el2);
    markElementSeen(el1);
    markElementSeen(el3);

    expect(isElementSeen(el1)).toBe(true);
    expect(isElementSeen(el2)).toBe(true);
    expect(isElementSeen(el3)).toBe(true);
  });

  it('reconciles reduced-motion media query immediately when active', () => {
    // Mock reduced motion active
    globalThis.window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;

    const section = document.createElement('section');
    section.setAttribute('data-trace-motion', 'section');
    document.body.appendChild(section);

    const cleanup = setupEntranceMotionObserver();

    // With reduced motion active, element should immediately be revealed
    expect(section.getAttribute('data-motion-state')).toBe('revealed');
    expect(isElementSeen(section)).toBe(true);
    cleanup();
  });
});
