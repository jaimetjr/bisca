import { describe, it, expect, vi, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { isPasswordPwned } from '../../server/lib/password-policy';

function sha1Upper(input: string): { prefix: string; suffix: string } {
  const hash = createHash('sha1').update(input).digest('hex').toUpperCase();
  return { prefix: hash.slice(0, 5), suffix: hash.slice(5) };
}

/** Build a fake HIBP range response body for the given suffixes. */
function rangeBody(suffixes: Array<[string, number]>): string {
  return suffixes.map(([s, count]) => `${s}:${count}`).join('\r\n');
}

function mockFetch(body: string) {
  return vi.fn(async (_url: string) => ({ ok: true, text: async () => body }) as unknown as Response);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('isPasswordPwned', () => {
  it('returns true when the hash suffix is present in the range response', async () => {
    const { prefix, suffix } = sha1Upper('hunter2password');
    const fetchMock = mockFetch(rangeBody([['0000000000000000000000000000000000A', 3], [suffix, 42]]));
    vi.stubGlobal('fetch', fetchMock);

    expect(await isPasswordPwned('hunter2password')).toBe(true);
    // Only the 5-char prefix is ever sent to the API (k-anonymity).
    expect(String(fetchMock.mock.calls[0][0])).toContain(prefix);
    expect(String(fetchMock.mock.calls[0][0])).not.toContain(suffix);
  });

  it('returns false when the suffix is absent from the range response', async () => {
    vi.stubGlobal('fetch', mockFetch(rangeBody([['0000000000000000000000000000000000A', 3]])));
    expect(await isPasswordPwned('a-unique-passphrase-9182')).toBe(false);
  });

  it('matches the suffix case-insensitively', async () => {
    const { suffix } = sha1Upper('CaseTest123456');
    vi.stubGlobal('fetch', mockFetch(rangeBody([[suffix.toLowerCase(), 5]])));
    expect(await isPasswordPwned('CaseTest123456')).toBe(true);
  });

  it('fails open (returns false) when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    expect(await isPasswordPwned('whatever-9999')).toBe(false);
  });

  it('fails open (returns false) on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => '' }) as unknown as Response));
    expect(await isPasswordPwned('whatever-9999')).toBe(false);
  });
});
