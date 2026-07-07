# Brand sources

Vector sources for the app icon, splash, adaptive icon, and favicon. The mark is a tilted
Ace-of-Espadas card (cream card, blue sword, gold guard) on green `#1E6F3F`. The PNGs in
`assets/images/` are rendered from these files — edit the SVGs here, then regenerate.

| Source | Output (`assets/images/`) | Size |
|---|---|---|
| `icon.svg` | `icon.png` | 1024×1024, full-bleed |
| `splash.html` + `card-only.svg` | `splash-icon.png` | 1024×1024, transparent (composited on `splash.backgroundColor` #1a472a) |
| `card-fg.svg` | `android-icon-foreground.png` | 512×512, transparent, card inside the ~61% adaptive safe zone |
| `adaptive-bg.svg` | `android-icon-background.png` | 512×512, flat #1E6F3F |
| `card-monochrome.svg` | `android-icon-monochrome.png` | 432×432, white card silhouette (A + sword punched out) on transparent |
| `favicon.svg` | `favicon.png` | 48×48, card enlarged 1.3× for tiny sizes |

The splash wordmark ("BRISCA", gold #E4B94C) uses Inter Bold loaded from
`node_modules/@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf`.

Regenerate: `node assets/brand/gen-assets.js` — renders the SVGs in headless Edge via the
project's Playwright (`channel: 'msedge'`, no browser download needed) and overwrites the PNGs.
Icon/splash changes ship with the next EAS build (they are baked into the native binary, no OTA).
