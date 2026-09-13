import { describe, it, expect } from 'vitest';
import { redirectSystemPath } from '@/app/+native-intent';

// Regression guard for the invite deep link. expo-router runs every native
// intent through redirectSystemPath and navigates to whatever it returns, on
// both the cold-start path (initial: true) and the already-running path
// (initial: false). A hook that returns a constant silently swallows every
// deep link in the app, which is exactly how `bisca:///join?code=X` from the
// invite page stopped reaching app/join.tsx.
describe('redirectSystemPath', () => {
  it('preserves the invite deep link on a cold start', () => {
    expect(redirectSystemPath({ path: 'bisca:///join?code=NWDPC', initial: true }))
      .toBe('bisca:///join?code=NWDPC');
  });

  it('preserves the invite deep link when the app is already running', () => {
    expect(redirectSystemPath({ path: 'bisca:///join?code=NWDPC', initial: false }))
      .toBe('bisca:///join?code=NWDPC');
  });

  it('leaves the launcher URL alone', () => {
    expect(redirectSystemPath({ path: 'bisca:///', initial: true })).toBe('bisca:///');
  });
});
