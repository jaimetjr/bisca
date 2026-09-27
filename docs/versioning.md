# Versioning

## Two numbers, only one of which you choose

| Number | Set by | Purpose |
|---|---|---|
| `android.versionCode` (integer) | **EAS, automatically** | Play requires it to increase on every upload. `eas.json` sets `appVersionSource: "remote"` and `production.autoIncrement: true`, so EAS tracks and bumps it server-side. |
| `expo.version` in `app.json` | **You, by hand** | Shown to users, **and** used as the multiplayer protocol floor. |

**Do not add `versionCode` or `buildNumber` to `app.json`.** Under `appVersionSource: "remote"`
those local values fight the remote counter EAS maintains.

## Why `version` is not cosmetic

`getAppVersion()` (`shared/lib/app-version.ts`) reads `expo.version` and sends it on the three
messages that enter an online room. The server compares it against the `MIN_APP_VERSION` env
var and turns away builds below the floor (`rejectOutdatedApp` in `server/game-rooms.ts`).

So the version string is a protocol compatibility marker, which is exactly what semver was
designed for. The rules below are therefore not arbitrary.

## Which number to bump

| Bump | When | Effect on online play |
|---|---|---|
| **PATCH** — `1.1.0` → `1.1.1` | Nothing new for the player: crash and bug fixes, copy or translation corrections, performance, dependency bumps. | None |
| **MINOR** — `1.1.0` → `1.2.0` | The player can do something they could not before, or visible behaviour changed: a new screen, mode, language, prompt, or an AI/rules tweak. | None — older builds keep playing |
| **MAJOR** — `1.1.0` → `2.0.0` | The WebSocket protocol changed such that old builds **cannot** interoperate. Also a full redesign or an account migration. | You raise `MIN_APP_VERSION` to this version |

**Tie-breaker:** would a player notice without being told? No → patch. Yes → minor.
Would an old build break online? → major.

## Two standing rules

**Server-only changes never bump the app version.** The landing page, store listings, SEO,
screenshots and anything else outside the app binary are not releases of the app. Only changes
under `app/`, `components/`, `shared/` (client-reachable) and `app.json` count.

**Leave `MIN_APP_VERSION` unset unless you genuinely broke the wire format.** It is currently
unset, so `minAppVersion()` returns `0.0.0` and everyone is let in. That fail-open behaviour is
deliberate and documented in `server/game-rooms.ts`: a mistake in this variable locks every
player out of multiplayer, which is worse than the incompatible client it guards against.

When you do raise it, raise it to the MAJOR version that broke compatibility — never to
"latest". Players on the previous minor did nothing wrong and should keep playing.

## Release checklist

1. Decide the bump from the table above; edit `expo.version` in `app.json`.
2. `npx tsc --noEmit && npx expo lint && npx vitest run tests/unit tests/regression`
3. Build: `eas build --profile production --platform android` (EAS assigns `versionCode`).
4. Submit to Play.
5. Only if the protocol broke: set `MIN_APP_VERSION` on the server to the new MAJOR, and
   deploy the server **after** the new build is live in Play — otherwise you lock out players
   who cannot yet update.

## History

| Version | What shipped |
|---|---|
| 1.1.0 | Baseline at the start of the Play Store visibility work. |
| 1.2.0 | In-app review prompt after a won game; Italian subtitle no longer calls Briscola a Spanish game. Protocol untouched. |
| 1.3.0 | Online lobbies survive backgrounding and an app kill: server heartbeat, a grace period before a disconnected host loses the room, reconnect into a waiting lobby, and a persisted room session with a Rejoin prompt. A full lobby nobody starts now warns and closes after 3 minutes instead of hanging for 30. Play Again after an online match rebuilds the same room, keeping its code, and non-hosts are returned to the room list after 15 seconds of silence. Dropping your connection mid-match no longer forfeits on its own: the opponent sees a reconnecting indicator, and only the ordinary AFK clock can end the game once the turn actually reaches you. Protocol changes are additive only — `MIN_APP_VERSION` stays unset. |
| 1.4.1 | Ads: one loaded ad per format shared across screens (AdMob show rate was 12% interstitial / 2.5% rewarded because every screen mount requested a fresh ad), interstitial load retry, personalized ads where consent allows, inline adaptive home banner, no ad request before consent settles. Protocol untouched. |
