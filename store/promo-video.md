# Promo video — 30 seconds

Google Play renders the promo video *above* the screenshots on the listing, which makes it the
single largest conversion element on the page. It is hosted on YouTube and linked per locale,
so one silent cut can serve every language by swapping only the caption burn-ins.

## Requirements

- **Hosting:** YouTube, public or unlisted (not private). Play takes a URL, not an upload.
- **Length:** 30 seconds. Play allows up to 2 minutes; nobody watches that.
- **No YouTube branding in-frame**, no ads enabled on the video, no end screens or cards —
  Play rejects listings whose video shows ad overlays.
- **Silent by default.** Play autoplays muted, so the video must read with no audio. Do not
  put information in a voiceover. Background music is optional and must not be copyrighted.
- **Portrait or landscape both work**; portrait matches this app and the existing 860×1864
  screenshot set.

## Shot list

Timings are cumulative. Every frame below is reachable from
`scripts/capture-store-screenshots.mjs` — run it with `--headed` and screen-record, or extend
the script to drive the same states while a recorder runs.

| Time | Shot | On-screen caption | Why it is here |
|------|------|-------------------|----------------|
| 0–3s | App icon → home screen resolves | *Brisca / Briscola / Bisca* (localized name) | Establishes the game by its native name inside 3 seconds |
| 3–7s | Tap **Play vs AI**, setup screen, pick 1v1 | "1v1 or 2v2" | Shows choice immediately |
| 7–14s | Live 1v1 trick: player plays a card, AI responds, trick resolves, points tick up | "Smart AI opponents" | The core loop — the longest single beat, because this is the product |
| 14–19s | Cut to 2v2 board with three named opponents | "Team play, 2v2" | Differentiator most competitors bury |
| 19–23s | Online lobby with a room code, share sheet opening | "Play online with friends" | The social hook |
| 23–27s | Settings: language grid scrolling past 12 languages, card backs | "12 languages · 6 card backs" | Proof of the listing's headline claim |
| 27–30s | Home screen, Play badge, app name | "Free · Offline · No sign-up needed" | Removes the three biggest install objections at once |

## Caption burn-in text

Reuse the strings already localized in `scripts/capture-store-screenshots.mjs` (the `T` table)
so video captions and screenshot captions stay identical. Prioritize the locales with real
demand: **it, pt, es** first, then en/fr/de. The Tier 3 locales can share the English cut —
see the priority note in `listing.md`.

## Recording notes

- Record at 1080×2340 or higher and let YouTube downscale; do not upscale the 860×1864 shots.
- Set `gameSpeed: 'fast'` in the seeded settings so the AI plays without dead air. The default
  600–1000ms AI delay plus the 1500ms trick delay wastes about a third of a 30-second cut.
- Hide the caption overlay the screenshot script injects (`#__shot_caption`) if you are adding
  captions in an editor instead.
- The interstitial ad fires on Play Again / Exit. Do not record through it.

## Status

Not produced yet. This is a script, not an asset — nothing has been uploaded to YouTube and no
video URL is set on any listing.
