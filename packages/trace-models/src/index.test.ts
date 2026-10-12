import { afterEach, expect, it, vi } from 'vitest';
import {
  configuredMetadataProvider,
  createOpenAICompatibleProvider,
  semanticAnalysisSchema,
} from './index.js';
const key = 'PRIVATE_PROVIDER_KEY_SENTINEL_123456789';
const value = {
  summary: 'A bounded metadata review.',
  intent: null,
  affectedBehaviors: [],
  incompleteWork: [],
  conflictCandidates: [],
  questions: [],
};
const provider = () =>
  createOpenAICompatibleProvider({
    apiKey: key,
    baseUrl: 'https://fixture.example.test/v1',
    model: 'fixture-model',
    sourceCodeSent: false,
  });
const request = { task: 'Metadata review', context: { count: 1 }, schema: semanticAnalysisSchema };
afterEach(() => vi.unstubAllGlobals());
it('requires explicit configuration without selecting a vendor or fake provider', () => {
  expect(() => configuredMetadataProvider({})).toThrow(/No semantic provider/);
  for (const env of [
    { TRACE_AI_PROVIDER: 'fake' },
    { TRACE_AI_PROVIDER: 'openai-compatible', TRACE_AI_API_KEY: key },
    {
      TRACE_AI_PROVIDER: 'openai-compatible',
      TRACE_AI_API_KEY: key,
      TRACE_AI_MODEL: 'model',
      TRACE_AI_DATA_POLICY: 'metadata-only',
      TRACE_AI_BASE_URL: 'http://fixture.example.test',
    },
    {
      TRACE_AI_PROVIDER: 'openai-compatible',
      TRACE_AI_API_KEY: key,
      TRACE_AI_MODEL: 'model',
      TRACE_AI_DATA_POLICY: 'metadata-only',
      TRACE_AI_BASE_URL: 'https://fixture.example.test/?key=' + key,
    },
  ]) {
    try {
      configuredMetadataProvider(env);
      expect.fail('Invalid configuration accepted');
    } catch (error) {
      expect(String(error)).not.toContain(key);
      expect(String(error)).toContain('Invalid AI configuration');
    }
  }
});
it('bounds requests and rejects malicious structured content', async () => {
  expect(
    semanticAnalysisSchema.safeParse({ ...value, summary: '```private code```' }).success,
  ).toBe(false);
  vi.stubGlobal('fetch', vi.fn());
  await expect(
    provider().generateStructured({ ...request, context: 'x'.repeat(70000) }),
  ).rejects.toMatchObject({ code: 'AI_CONTEXT_LIMIT' });
});
it('aborts a timed-out request and maps errors without leaking provider text', async () => {
  let aborted = false;
  vi.stubGlobal(
    'fetch',
    (_url: unknown, init: RequestInit) =>
      new Promise((_resolve, reject) =>
        init.signal!.addEventListener('abort', () => {
          aborted = true;
          reject(new Error(key));
        }),
      ),
  );
  await expect(provider().generateStructured({ ...request, timeoutMs: 10 })).rejects.toMatchObject({
    code: 'AI_TIMEOUT',
  });
  expect(aborted).toBe(true);
});
it('maps network failures to a static safe error', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new Error(key);
    }),
  );
  await expect(provider().generateStructured(request)).rejects.toMatchObject({
    code: 'AI_UNAVAILABLE',
  });
});
it('bounds response bytes before parsing', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('x'.repeat(70000))),
  );
  await expect(provider().generateStructured(request)).rejects.toMatchObject({
    code: 'AI_CONTEXT_LIMIT',
  });
});
it('rejects malformed envelopes without returning raw responses', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{ invalid raw response')),
  );
  await expect(provider().generateStructured(request)).rejects.toMatchObject({
    code: 'AI_INVALID_RESPONSE',
  });
});
it('honors bounded transient retries without fake fallback', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] })),
    );
  vi.stubGlobal('fetch', fetcher);
  expect((await provider().generateStructured({ ...request, maxRetries: 1 })).value).toEqual(value);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('rejects encoded credential echoes after JSON decoding', async () => {
  const content = JSON.stringify({ ...value, summary: key }).replaceAll('_', '\\u005f');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content } }] }))),
  );
  await expect(provider().generateStructured(request)).rejects.toMatchObject({
    code: 'AI_INVALID_RESPONSE',
  });
});
it('keeps retry/timeout configuration bounded for nonfinite values', async () => {
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    provider().generateStructured({ ...request, maxRetries: NaN }),
  ).rejects.toMatchObject({ code: 'AI_INVALID_CONFIG' });
  await expect(
    provider().generateStructured({ ...request, timeoutMs: Infinity }),
  ).rejects.toMatchObject({ code: 'AI_INVALID_CONFIG' });
  expect(fetcher).not.toHaveBeenCalled();
});
it('aborts a stalled response body within the same deadline', async () => {
  vi.stubGlobal('fetch', (_url: unknown, init: RequestInit) =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            init.signal!.addEventListener('abort', () => controller.error(new Error(key)));
          },
        }),
      ),
    ),
  );
  await expect(provider().generateStructured({ ...request, timeoutMs: 10 })).rejects.toMatchObject({
    code: 'AI_TIMEOUT',
  });
});
it('does not call a provider for an already cancelled request', async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher = vi.fn();
  vi.stubGlobal('fetch', fetcher);
  await expect(
    provider().generateStructured({ ...request, signal: controller.signal }),
  ).rejects.toMatchObject({ code: 'AI_CANCELLED' });
  expect(fetcher).not.toHaveBeenCalled();
});

it.each([
  '# Review https://attacker.example',
  '**Emphasis**',
  'src/private.ts',
  'https://attacker.example',
  'www.attacker.example',
  'Safe text\u0001',
  '- New list',
  '1. New list',
  'console.log("source");',
  'def foo(): return 42',
  'DROP TABLE private',
  'print ("source")',
])('rejects nonprose provider text %s', (summary) => {
  expect(semanticAnalysisSchema.safeParse({ ...value, summary }).success).toBe(false);
  expect(semanticAnalysisSchema.safeParse({ ...value, questions: [summary] }).success).toBe(false);
});
it('accepts bounded multilingual prose without markup', () => {
  expect(
    semanticAnalysisSchema.safeParse({
      ...value,
      summary: 'Metadata review complete; implementation remains unverified.',
    }).success,
  ).toBe(true);
  expect(
    semanticAnalysisSchema.safeParse({ ...value, summary: 'بررسی اطلاعات انجام شد.' }).success,
  ).toBe(true);
});
