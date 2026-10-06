import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertOwnerCatalog } from '../../../scripts/verify-production-owner-state.js';
const catalog = [
  { id: 9, fullName: 'mathofdynamic/TRACE' },
  { id: 10, fullName: 'mathofdynamic/other' },
];
const rows = catalog.map((r) => ({
  provider_id: String(r.id),
  full_name: r.fullName,
  state: 'available',
  selected: 0,
  tenant_matches: 1,
  installation_id: '166179374',
  account_login: 'mathofdynamic',
  installation_state: 'active',
  suspended_at: null,
}));
describe('trusted production owner catalog acceptance', () => {
  it('keeps count drift rejected while distinguishing retained inactive history without exposing names', () => {
    const historical = {
      ...rows[1]!,
      provider_id: '11',
      full_name: 'mathofdynamic/private-historical',
      disconnected: 1,
    };
    expect(() => assertOwnerCatalog(catalog, [...rows, historical], false)).toThrow(
      /"historical":1,"historicalInactive":1,"historicalDisconnected":1,"historicalIdentityInvalid":0/,
    );
    try {
      assertOwnerCatalog(catalog, [...rows, historical], false);
    } catch (error) {
      expect(String(error)).not.toContain('private-historical');
    }
    expect(() =>
      assertOwnerCatalog(
        catalog,
        [...rows, { ...historical, selected: 1, state: 'active', tenant_matches: 0 }],
        false,
      ),
    ).toThrow(/"historicalInactive":0.*"historicalIdentityInvalid":1/);
    expect(() => assertOwnerCatalog(catalog, [rows[0]!], false)).toThrow(/"missingCurrent":1/);
  });
  it('identifies a missing repository privately in a 92-repository catalog without relaxing rejection', () => {
    const large = Array.from({ length: 92 }, (_, index) => ({
      id: 100000 + index,
      fullName: `mathofdynamic/synthetic-${index}`,
    }));
    const stored = large.slice(0, 91).map((repository) => ({
      ...rows[0]!,
      provider_id: String(repository.id),
      full_name: repository.fullName,
      synchronized_at: 1700000000,
    }));
    try {
      assertOwnerCatalog(large, stored, false);
      expect.fail('Catalog mismatch must remain rejected');
    } catch (error) {
      const diagnostic = String(error);
      expect(diagnostic).toContain('"github":92,"stored":91,"missingCurrent":1');
      expect(diagnostic).toContain(
        createHash('sha256').update('TRACE repository diagnostic:100091').digest('hex'),
      );
      expect(diagnostic).toContain('"newestSynchronization":1700000000');
      expect(diagnostic).not.toContain('100091');
      expect(diagnostic).not.toContain('synthetic-');
    }
  });
  it('diagnoses a mismatched current name even within the expected owner', () => {
    const historical = { ...rows[1]!, provider_id: '11', disconnected: 1 };
    expect(() =>
      assertOwnerCatalog(
        catalog,
        [{ ...rows[0]!, full_name: 'mathofdynamic/wrong-name' }, rows[1]!, historical],
        false,
      ),
    ).toThrow(/"currentIdentityInvalid":1/);
    expect(() =>
      assertOwnerCatalog(
        catalog,
        [rows[0]!, { ...rows[1]!, selected: 1, state: 'active' }, historical],
        false,
      ),
    ).toThrow(/"currentIdentityInvalid":1/);
  });
  it('accepts an inactive trusted catalog and requires explicit active TRACE for final acceptance', () => {
    expect(assertOwnerCatalog(catalog, rows, false).available).toBe(2);
    expect(() => assertOwnerCatalog(catalog, rows, true)).toThrow(/not active/);
    expect(
      assertOwnerCatalog(catalog, [{ ...rows[0]!, state: 'active', selected: 1 }, rows[1]!], true)
        .active,
    ).toEqual(['mathofdynamic/TRACE']);
  });
  it.each([
    { tenant_matches: 0 },
    { installation_id: '9' },
    { account_login: 'other' },
    { installation_state: 'suspended' },
    { suspended_at: 1 },
    { state: 'active' },
    { selected: 1 },
    { full_name: 'other/TRACE' },
  ])('rejects incoherent selection and tenant identity', (overrides) =>
    expect(() =>
      assertOwnerCatalog(catalog, [{ ...rows[0]!, ...overrides }, rows[1]!], false),
    ).toThrow(),
  );
  it('rejects unrelated activation, missing repository and duplicate persisted identity', () => {
    expect(() =>
      assertOwnerCatalog(catalog, [rows[0]!, { ...rows[1]!, state: 'active', selected: 1 }], false),
    ).toThrow(/unrelated/);
    expect(() => assertOwnerCatalog(catalog, [rows[0]!], false)).toThrow(/count/);
    expect(() => assertOwnerCatalog(catalog, [rows[0]!, rows[0]!], false)).toThrow();
  });
});
