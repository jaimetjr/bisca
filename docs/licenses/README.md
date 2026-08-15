# Third-party assets

Authoritative record of everything in this repo that someone else owns. The
in-app Credits screen ([app/credits.tsx](../../app/credits.tsx)) mirrors this
list — change one, change the other.

| Asset | In repo | Origin | License | Proof |
|---|---|---|---|---|
| Spanish deck, 40 card faces | `assets/images/spanish/NN-*.webp`, generated from `assets/source/*.ai` | Depositphotos — JuniorB (Adolfo Gregorio Maiorkevich) | Standard License, one per suit sheet | 4 invoices — see *Provenance* below |
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

The Rey de Copas is the only card in the deck whose artwork does not show its
suit anywhere: he holds a fleur-de-lis sceptre and carries no cup, while the 10
and 11 of copas each draw one beside the rank number and every espadas, bastos
and oros figure holds or shows its own. Confirmed against `assets/source/cups.ai`
— it is how the deck was drawn, not something the extraction lost.

`scripts/fix-rey-copas.mjs` gives that card a cup, as the last step of the art
pipeline. It re-uses the deck's own cup off the 11 at full size, and moves the
rank number and the king apart to make room; nothing is redrawn or resized. The
result is an adaptation of a licensed file, not new third-party material.

### Provenance

Every sheet is licensed separately — one Depositphotos File License per suit, all
bought 2 Aug 2026 by Jaime Tasca (jaime.tasca.jr@gmail.com) from Depositphotos
Inc., 115 West 30th Street, Suite 1110B, New York, NY 10001. Author of all four
is **JuniorB (Adolfo Gregorio Maiorkevich)**.

| Sheet | Suit | File ID | Size | License | Invoice | Receipt |
|---|---|---|---|---|---|---|
| `cups.ai` | copas | 22825442 | 2641x1697 | Standard | #362548576 | `cups_license.pdf` |
| `gold.ai` | oros | 22825444 | 2647x1697 | Standard | #362548580 | `gold_license.pdf` |
| `spades.ai` | espadas | 22825446 | 2642x1700 | Standard | #362548582 | `spades_license.pdf` |
| `sticks.ai` | bastos | 22825918 | 2642x1699 | Standard | #362548564 | `sticks_license.pdf` |

Each invoice's preview thumbnail was checked against the suit it is filed under.

(Invoice #362548582 was also seen rendered as 1 Aug 2026 in the web receipt view
against 2 Aug 2026 in the PDF — same invoice number, same File ID, a timezone
artifact. The PDF is the record.)

### What the Standard License covers here

Depositphotos' own FAQ, *"Can I use DepositPhotos images in apps, software, or
video games?"*:

> Yes. With a Standard License, you can use images in your app UI, game design,
> or software interface, and distribute unlimited digital copies. This license
> allows you to include images in user interfaces, backgrounds, menus, and other
> visual elements. However, if the images are used in templates, UI kits, or
> other resellable design assets, you will need an Extended License.

Game design is named explicitly, and the Extended trigger is reselling the
*assets* for others to build with — templates, UI kits. This app renders the deck
as game content and ships no redistributable art, so Standard is the right tier
even though the app is monetised (in-app purchases via RevenueCat, interstitials
via AdMob), since neither the tier nor the copy count turns on revenue.

**Still outstanding:** commit the four `*_license.pdf` receipts named in the table
above into this folder, plus a copy of the Standard License terms and that FAQ
answer as they read on 2 Aug 2026. A vendor FAQ can be reworded later; a dated
copy is what makes this record hold up.

### Previous art — removed

Until this change the deck was the GNU-themed *Baraja española* by **Basquetteur**
from Wikimedia Commons, **CC BY-SA 3.0**, shipped with no attribution anywhere in
the app. That is a license violation, and the cropped cards additionally inherited
share-alike. All of it — the 40 faces, the back, the unused 08/09 cards and the
`Baraja_española_completa.png` source sheet — has been deleted. The asset test
asserts the sheet and the 08/09 files stay gone.
