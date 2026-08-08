/**
 * Card back artwork. One parametric design, six colourways.
 *
 * The variants differ by exactly two values, so this is a table plus a builder
 * rather than six near-identical SVG files. `gen-assets.js` renders each one to
 * `assets/images/spanish/reverso-<id>.png`; keep the ids in sync with
 * `shared/lib/brisca/card-backs.ts` (a test enforces it).
 *
 * Design constraints, all learned the hard way:
 *
 * - The back is drawn on the felt (#2a7a4a, deck sidebar) AND on the screen
 *   background (#1a472a, opponent hands). Any green field alone vanishes against
 *   one of them, so a cream paper edge carries the silhouette the way a real
 *   deck does — that edge is why every colourway stays readable.
 * - Geometry, not illustration. That is how real Spanish backs are built, and it
 *   avoids a card face showing a picture of a card.
 * - The centre medallion is a requirement, not decoration: the back is only ever
 *   drawn at ~45-95dp, and at that size the lattice collapses into flat texture.
 *   Variants without a medallion read as a plain rectangle. Nothing here is
 *   finer than ~1% of the width.
 */

/** Art board. Matches CARD_ASPECT (1016/620) so backs sit flush with the faces. */
const VIEW_W = 620;
const VIEW_H = 1016;

/**
 * Render size. Deliberately far below the 600px the card *faces* need: a back is
 * only ever drawn at the `small`/`deck` metric, and `small` is half of `large`,
 * which is capped at 190dp — a hard ceiling of 95dp, or 285px at @3x. Rendering
 * these at 620px cost ~96KB each for no visible gain.
 */
const OUT_W = 360;
const OUT_H = Math.round((OUT_W * VIEW_H) / VIEW_W);

const PAPER = '#FCFAF1';

/** id -> [field, accent]. Order is the order shown in Settings. */
const VARIANTS = {
  verde:    ['#14401F', '#E4B94C'],
  vermelho: ['#8E1B1B', '#F0CE7A'],
  azul:     ['#17324F', '#D9C489'],
  vinho:    ['#5E1230', '#E8C36B'],
  grafite:  ['#262B2E', '#D8C9A6'],
  roxo:     ['#3B2150', '#DCC077'],
};

/** Eight-point star, echoing the rosette stamped on the deck's own oros. */
function star(cx, cy, outer, inner, fill) {
  const points = [];
  for (let i = 0; i < 16; i++) {
    const angle = ((i * 22.5 - 90) * Math.PI) / 180;
    const r = i % 2 === 0 ? outer : inner;
    points.push(`${(cx + r * Math.cos(angle)).toFixed(1)},${(cy + r * Math.sin(angle)).toFixed(1)}`);
  }
  return `<polygon fill="${fill}" points="${points.join(' ')}"/>`;
}

function svgFor(field, accent) {
  const t = 62; // lattice tile
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW_W} ${VIEW_H}">
  <defs>
    <pattern id="m" width="${t}" height="${t}" patternUnits="userSpaceOnUse">
      <path d="M0 ${t} L${t} 0 M-8 8 L8 -8 M${t - 8} ${t + 8} L${t + 8} ${t - 8}"
            stroke="${accent}" stroke-width="5" fill="none" opacity="0.17"/>
      <path d="M0 0 L${t} ${t} M-8 ${t - 8} L8 ${t + 8} M${t - 8} -8 L${t + 8} 8"
            stroke="${accent}" stroke-width="5" fill="none" opacity="0.17"/>
    </pattern>
    <clipPath id="f"><rect x="22" y="22" width="576" height="972" rx="16"/></clipPath>
  </defs>

  <rect x="0" y="0" width="${VIEW_W}" height="${VIEW_H}" rx="27" fill="${PAPER}"/>
  <rect x="22" y="22" width="576" height="972" rx="16" fill="${field}"/>
  <g clip-path="url(#f)"><rect x="22" y="22" width="576" height="972" fill="url(#m)"/></g>

  <rect x="44" y="44" width="532" height="928" rx="10" fill="none" stroke="${accent}" stroke-width="12"/>
  <rect x="66" y="66" width="488" height="884" rx="6" fill="none" stroke="${accent}" stroke-width="4" opacity="0.55"/>

  <circle cx="310" cy="508" r="145" fill="${field}"/>
  <circle cx="310" cy="508" r="145" fill="none" stroke="${accent}" stroke-width="12"/>
  <circle cx="310" cy="508" r="119" fill="none" stroke="${accent}" stroke-width="4" opacity="0.6"/>
  ${star(310, 508, 93, 38, accent)}
  <circle cx="310" cy="508" r="24" fill="${field}"/>
</svg>`;
}

/** [{ id, svg }] in display order. */
const cardBacks = Object.entries(VARIANTS).map(([id, [field, accent]]) => ({
  id,
  svg: svgFor(field, accent),
}));

module.exports = { cardBacks, OUT_W, OUT_H };
