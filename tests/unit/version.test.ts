import { describe, it, expect } from 'vitest';
import { compareVersions } from '../../shared/lib/version';

describe('compareVersions', () => {
  it('ordena versões consecutivas', () => {
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
  });

  it('trata versões iguais como iguais', () => {
    expect(compareVersions('1.1.0', '1.1.0')).toBe(0);
  });

  it('compara número por número, não como texto', () => {
    // The whole point of not using `<` on strings: '1.10.0' < '1.9.0'
    // lexicographically, which would let an outdated client through.
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('2.0.0', '10.0.0')).toBe(-1);
  });

  it('completa segmentos faltando com zero', () => {
    expect(compareVersions('1.1', '1.1.0')).toBe(0);
    expect(compareVersions('1', '1.0.1')).toBe(-1);
  });

  it('ignora sufixo de pré-release', () => {
    // app.json only ever carries a plain X.Y.Z, so this is a defensive path.
    // Ignoring the suffix fails *open* (1.2.0-beta counts as 1.2.0 and gets in)
    // — deliberately, since locking out a tester build is worse than letting
    // one through.
    expect(compareVersions('1.2.0-beta.1', '1.2.0')).toBe(0);
    expect(compareVersions('1.2.0+build.5', '1.2.0')).toBe(0);
  });

  it('trata entrada inválida como 0.0.0', () => {
    // A client that sends garbage — or nothing at all, like the builds already
    // in the store — must land below any real floor, never above it.
    expect(compareVersions('abc', '0.0.1')).toBe(-1);
    expect(compareVersions('', '0.0.1')).toBe(-1);
    expect(compareVersions(undefined, '0.0.1')).toBe(-1);
    expect(compareVersions(null, '0.0.1')).toBe(-1);
    expect(compareVersions(42 as unknown as string, '0.0.1')).toBe(-1);
  });

  it('deixa qualquer versão passar pelo piso permissivo', () => {
    // The floor ships as '0.0.0' and must be a no-op until it is raised.
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
    expect(compareVersions('abc', '0.0.0')).toBe(0);
    expect(compareVersions(undefined, '0.0.0')).toBe(0);
  });
});
