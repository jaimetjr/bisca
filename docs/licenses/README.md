# Third-party assets

Authoritative record of everything in this repo that someone else owns. The
in-app Credits screen ([app/credits.tsx](../../app/credits.tsx)) mirrors this
list — change one, change the other.

| Asset | In repo | Origin | License | Proof |
|---|---|---|---|---|
| Spanish deck, 40 card faces | `assets/images/spanish/NN-*.webp`, generated from `assets/source/*.ai` | Purchased stock illustration | Commercial stock license | `receipt.*` in this folder |
| Card backs, 6 colourways | `assets/images/spanish/reverso-*.webp`, generated from `assets/brand/card-backs.js` | Original — geometric, drawn for this deck | Owned | — |
| Inter | `@expo-google-fonts/inter` | Rasmus Andersson | SIL Open Font License 1.1 | npm package |
| Material Design Icons | `@expo/vector-icons` | Google / Pictogrammers | Apache License 2.0 | npm package |

## Card art

The deck ships as four Illustrator sheets (one per suit, each a 5×2 grid of
ranks 1-7, 10, 11, 12 — Spanish decks skip 8 and 9, so the sheets are exactly the
Brisca deck). `assets/source/` holds them plus the JPG previews, outside
`assets/images/` so Metro never bundles them.

Regenerate the faces with `node scripts/extract-cards.mjs`, the backs with
`node assets/brand/gen-assets.js`. Both write PNG; `node scripts/webp-cards.mjs`
re-encodes the folder to the `.webp` the app actually loads, so it runs last.
`tests/unit/card-assets.test.ts` enforces the output contract (46 files — 40
faces plus 6 backs — ≥600px wide, one consistent aspect ratio).

**Save the purchase receipt and the license terms into this folder.** Without
them there is no evidence of what was bought or what it permits — which is
exactly the hole the previous art left.

### Previous art — removed

Until this change the deck was the GNU-themed *Baraja española* by **Basquetteur**
from Wikimedia Commons, **CC BY-SA 3.0**, shipped with no attribution anywhere in
the app. That is a license violation, and the cropped cards additionally inherited
share-alike. All of it — the 40 faces, the back, the unused 08/09 cards and the
`Baraja_española_completa.png` source sheet — has been deleted. The asset test
asserts the sheet and the 08/09 files stay gone.
