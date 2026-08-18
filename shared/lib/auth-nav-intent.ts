// Lets a guest-mode "Sign in" / "Create account" tap tell AuthGuard which
// login tab to land on, without racing AuthGuard's own redirect (see
// app/_layout.tsx). Disabling guest mode triggers AuthGuard's effect
// asynchronously, so any router.replace() call made alongside it can be
// clobbered by AuthGuard's own — funneling the mode through here means
// AuthGuard is the only thing that navigates.
export type PendingAuthMode = 'signin' | 'signup';

let pendingMode: PendingAuthMode | null = null;

export function setPendingAuthMode(mode: PendingAuthMode) {
  pendingMode = mode;
}

export function consumePendingAuthMode(): PendingAuthMode | null {
  const mode = pendingMode;
  pendingMode = null;
  return mode;
}
