export type JsonObject = Record<string, unknown>;
export type StringMap = Record<string, string>;
export type StringList = string[];

export type ProviderId = string;

export function createTraceId() {
  return crypto.randomUUID();
}

export function normalizeProviderId(value: string | number | bigint): ProviderId {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new RangeError('Provider identifiers must not lose integer precision.');
  }
  return String(value);
}
