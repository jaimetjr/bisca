// expo-router hands every native intent (deep link, app link) to this hook and
// navigates to whatever it returns — on the cold-start path (initial: true)
// and on the already-running path (initial: false) alike. Returning a constant
// here therefore swallows EVERY deep link in the app: that is how the invite
// link's `bisca:///join?code=X` stopped reaching app/join.tsx and dumped the
// invitee on the home screen instead.
//
// We have nothing to rewrite, so hand the URL straight back and let the file
// routes resolve it. Never return a fixed path from here.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path;
}
