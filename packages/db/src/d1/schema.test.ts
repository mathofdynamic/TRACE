import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { normalizeProviderId } from '../domain-types.js';
import * as d1Schema from './schema.js';
import * as postgresSchema from '../schema.js';

function tables(module: Record<string, unknown>) {
  return Object.values(module).filter((value): value is Parameters<typeof getTableName>[0] => {
    try {
      getTableName(value as Parameters<typeof getTableName>[0]);
      return true;
    } catch {
      return false;
    }
  });
}

describe('D1 schema', () => {
  it('maps every PostgreSQL table and column during the dual-schema transition', () => {
    const postgresTables = new Map(
      tables(postgresSchema).map((table) => [
        getTableName(table),
        Object.keys(getTableColumns(table)).sort(),
      ]),
    );
    const d1Tables = new Map(
      tables(d1Schema).map((table) => [
        getTableName(table),
        Object.keys(getTableColumns(table)).sort(),
      ]),
    );

    expect(d1Tables.size).toBe(22);
    expect([...d1Tables.keys()].sort()).toEqual([...postgresTables.keys()].sort());
    for (const [tableName, columns] of postgresTables) {
      expect(d1Tables.get(tableName), tableName).toEqual(columns);
    }
  });

  it('stores provider identifiers without JavaScript precision loss', () => {
    expect(normalizeProviderId('9007199254740993')).toBe('9007199254740993');
    expect(normalizeProviderId(123)).toBe('123');
    expect(() => normalizeProviderId(9_007_199_254_740_992)).toThrow(RangeError);
  });
});
