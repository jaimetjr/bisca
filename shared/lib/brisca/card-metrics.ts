/**
 * Card sizing for the game screen.
 *
 * Every card size used to be a hardcoded pixel constant, which wasted ~25% of the
 * available width on a phone and left the played cards on the table *smaller*
 * than the ones in your hand. Sizes are now derived from the viewport so the hand
 * fills the width it has, and so the layout scales onto tablets.
 *
 * Pure and side-effect free — `tests/unit/card-metrics.test.ts` checks that the
 * whole column actually fits on real device sizes. Consumers get it through
 * `useCardMetrics()`.
 */

/** height / width of the card art. Measured from the extracted PNGs (620x1016). */
export const CARD_ASPECT = 1016 / 620;

/**
 * Fixed vertical costs of the game screen, in dp. Measured from the rendered DOM
 * rather than added up from the stylesheet — the two disagreed by 5dp, which was
 * enough to clip the trump suit name off the bottom of the table on a 375x667.
 * If a margin or font size changes in app/game.tsx, re-measure rather than guess.
 */
const CHROME = {
  /** topBar: backBtn 36 + marginBottom 8 */
  topBar: 44,
  /** coachBanner: padding 16 + text 17 + marginBottom 8. Practice mode only. */
  coachBanner: 41,
  /** OpponentHand nameTag + container gap + opponentsRow marginBottom */
  opponentChrome: 32,
  /** tableContainer marginBottom */
  tableMargin: 10,
  /** handTurnLabel line + marginBottom */
  handLabel: 23,
  /**
   * handContainer padding, the 2dp your-turn glow border top and bottom, and the
   * card's own highlight border — see `HAND_CARD_BORDER`.
   */
  handPadding: 20,
  /** GameTable.table minHeight — the table never gets squeezed below this */
  tableMin: 180,
  /**
   * GameTable.table borderWidth, both edges of each axis.
   *
   * Unmodelled until the layout started packing the table exactly: the cards
   * then came out flush against the gold border on a high-end phone, which is
   * the "cards are running past the edge" report. The table clips its overflow,
   * so what this buys is not only air — it is the difference between a card
   * being whole and being shaved.
   */
  tableBorder: 6,
  /** container paddingHorizontal 12, both sides */
  screenHorizontal: 24,
  /**
   * handContainer padding 6 plus the 2dp your-turn glow border, both sides.
   *
   * The border was counted vertically (`handPadding`) and not horizontally, so
   * the three cards were sized 4dp wider than the box and rode over the gold
   * frame — but only while it was lit, which is the one moment it is visible.
   */
  handHorizontal: 16,
  /** GameTable.playedCard inset from the table edge */
  playedInset: 8,
  /** GameScreen container adds 8dp to both the top and bottom safe-area padding */
  screenVertical: 16,
  /**
   * Everything in the deck sidebar that is not a card: 10 top padding, 8 gap,
   * the "Trump"/suit-name pair (27) under the trump card, plus the table's own
   * 3dp border top and bottom. The deck count is drawn *on* its card, so it
   * costs nothing here.
   *
   * The sidebar stacks two cards inside a table that clips its overflow, so
   * getting this wrong loses the trump suit name with no other symptom.
   */
  deckSidebarChrome: 51,
};

/** Cards in hand. Brisca deals three and never holds more. */
const HAND_CARDS = 3;
/**
 * Opponent hands and the deck sidebar, as a fraction of the hand card width.
 *
 * Deliberately low, and lowered again after measuring a 2v2 on a 360x640: the
 * opponents' row was 134dp against a 183dp table — 73% of the whole playing
 * area spent on cards that are face down and carry nothing but a count. Every
 * dp here is a dp the table loses.
 */
const SMALL_RATIO = 0.42;
/** How much of a card stays hidden behind the next one in an opponent's fan. */
const FAN_RATIO = 0.79;
/** Breathing room around the deck sidebar's card. */
const DECK_SIDEBAR_PADDING = 16;

const HAND_GAP = 10;

/**
 * Border GameCard draws around a card in your hand, per side.
 *
 * `highlighted` (2dp) goes on every playable card on your turn; `hinted` (3dp)
 * replaces it on the one the coach suggests, so 3 is the worst case and the one
 * to budget. It sits *outside* the card image, and three cards of it is 18dp of
 * the hand's width — which, together with the container's own glow border, is
 * why the cards rode over the gold frame at exactly the moment both appear.
 */
const HAND_CARD_BORDER = 3;

const MIN_HAND_CARD = 84;
const MAX_HAND_CARD = 190;
const MIN_TABLE_CARD = 56;

/**
 * Hand card size the layout will not push below to feed the table.
 *
 * The hand is what you read and tap every turn, so it gets priority — but only
 * up to here. Past this the surplus goes to the table instead. Set above the
 * 90dp fixed size that drew the "cards are too small" complaints, so no device
 * lands back where that started.
 */
const COMFORTABLE_HAND_CARD = 96;

/**
 * Where the phone layout stops being the right shape.
 *
 * Below this the screen is narrow and tall: the cross arrangement matches where
 * the players sit, and the table has no width to spare anyway. Above it the
 * table turns out *wider than tall*, which is the wrong shape for the cross —
 * stacking two cards needs 2 x 1.64 x width of height while three across need
 * only 3 x width, so the height runs out while the sides sit empty. That is why
 * a tablet showed 150dp cards in a 685dp-wide table.
 */
const LARGE_SCREEN_WIDTH = 700;

/**
 * On a large screen the played cards may outgrow the hand. The trick is what the
 * player is reading, and there is room; on a phone the hand card stays the
 * ceiling so the table never dominates a cramped layout.
 */
const MAX_TABLE_CARD_LARGE = 280;

/**
 * How far a played card may outgrow a hand card on a phone.
 *
 * It used to be capped at exactly the hand card, which sounded like proportion
 * and behaved like a leak: whenever the table had more height than that allowed,
 * the surplus could not become card and turned into empty felt instead — first
 * inside an oversized table, then as a band above the hand. The trick is what
 * you are reading while it is on the table, so it gets to be a little larger
 * than what you are holding, and the space stops going nowhere.
 */
const PHONE_TABLE_CEILING = 1.25;

/**
 * Opponent cards are face-down decoration — they carry nothing but a count. At
 * `SMALL_RATIO` of a 190dp hand card they were 95dp and ate 22% of a tablet's
 * height, so they get their own ceiling on big screens.
 */
const MAX_SMALL_CARD_LARGE = 72;

/**
 * The deck sidebar does not follow `MAX_SMALL_CARD_LARGE`. The opponents' cards
 * are face-down and cap low for a reason, but the trump card next to them is
 * live information the player checks all game — at 72dp beside a 280dp trick it
 * reads as an afterthought. Every dp here comes out of the trick area's width,
 * so it stops well short of the played cards.
 */
const MAX_DECK_CARD_LARGE = 120;

/**
 * Deck/trump size on a phone, as a fraction of the hand card.
 *
 * The same argument `MAX_DECK_CARD_LARGE` makes for tablets, finally applied to
 * the phone. The sidebar card used to *start* at `small.width` — the face-down
 * opponent card — and grow from there into whatever width the trick left over.
 * That works in 1v1, where the cross stacks both cards in one column and two
 * thirds of the table go unused, and collapses in 2v2, where three cards across
 * consume the entire trick area: the spare comes out at ~1dp, growth rounds to
 * nothing, and the trump sits at exactly `SMALL_RATIO` — 44dp of live
 * information beside a 105dp hand card, which is the "trunfo pequeno demais"
 * report.
 *
 * A floor tied to the hand card instead of to the opponents' decoration is what
 * makes the 2v2 case survive on its own rather than on leftovers. In 1v1 it is
 * free: the played card there is bound by height, so a wider sidebar costs it
 * nothing. In 2v2 it is paid for out of the played card (~8%), which is the
 * trade that was signed off — the trump is read every trick, the fourth card on
 * the table is not.
 *
 * `deckHeightLimit` still caps it, so the smallest phones are unaffected.
 */
const MIN_DECK_RATIO = 0.62;

/**
 * Share of the trick area's *unused* width that the deck sidebar may grow into.
 *
 * The sidebar starts at the opponents' card size and grows from there. Tying it
 * to the hand card instead was wrong in both directions: it left the trump at
 * 48dp beside a 107dp played card in 1v1, and then, once raised, it inflated the
 * sidebar in 2v2 where the table is already full and the trump has four played
 * cards to compete with.
 *
 * Spare width is the honest signal for both. A 1v1 cross stacks its two cards in
 * one column and leaves two thirds of the table empty, so the trump can be large
 * for free; a 2v2 grid uses two columns and leaves little, so it stays modest.
 * Growth never exceeds the spare, so the played cards cannot pay for it.
 */
const DECK_SPARE_SHARE = 0.15;
/**
 * How much the two played cards may overlap, as a fraction of card height.
 *
 * A last resort, not the default. On a 375x667 phone the trick area is so
 * shallow that laying both cards out cleanly leaves them at 63dp — smaller than
 * the fixed size they replaced — so there, overlapping is what keeps them
 * legible. Anywhere with real room (any tablet, most phones) the cards are laid
 * out clear of each other instead; overlapping there just hides artwork for
 * nothing. GameTable anchors each name label to the card's outer edge, so an
 * overlap never buries one.
 */
const MAX_TRICK_OVERLAP = 0.3;

/**
 * Below this, a played card is small enough to be worth overlapping to rescue.
 * It is the fixed size the old layout used, so the fallback kicks in exactly
 * where the alternative would be a visible regression.
 */
const COMFORTABLE_TABLE_CARD = 75;

/**
 * Table height worth reserving before the hand grows past comfortable.
 *
 * The hand used to be sized against `tableMin`, so it collected *every* dp above
 * the table's 180dp floor and the table sat at that floor on every phone —
 * 180dp on a 360x640, whatever else changed. Reserving what two comfortable
 * cards actually need makes the split deliberate instead of a side effect.
 */
const TARGET_TABLE_HEIGHT = Math.round(
  2 * COMFORTABLE_TABLE_CARD * CARD_ASPECT + 3 * CHROME.playedInset + CHROME.tableBorder,
);

/**
 * How much bigger an alternative arrangement has to be before it is worth
 * giving up the cross.
 *
 * The cross is the only layout that puts each card where its player sits, which
 * is worth something — but not 40%, which is what stacking two cards in a
 * near-square table was costing in 1v1. A dp or two is not worth it; a third of
 * the card is.
 */
const LAYOUT_SWITCH_MARGIN = 1.1;

/**
 * Space between the played cards, and from them to the table edge, on a large
 * screen.
 *
 * A phone keeps the 8dp inset because its trick area is tight enough that the
 * two cards already overlap to stay legible — there is nothing to give. A
 * tablet's cross is bound by height with ~160dp of width going unused, so the
 * cards ended up touching edge to edge while the table looked half empty.
 * Trading ~6% of card size for a gap the eye can find is the right side of that
 * deal; it is the same reasoning as the hand's `HAND_GAP`.
 */
const LARGE_TRICK_GAP = 24;

export interface CardBox {
  width: number;
  height: number;
}

export type TrickLayout = 'cross' | 'row';

export interface CardMetrics {
  small: CardBox;
  medium: CardBox;
  large: CardBox;
  /**
   * Deck and trump card in the table's sidebar. Sized separately from `small`
   * because two of them plus their labels have to fit inside the table box,
   * which is a tighter constraint than the opponents' row.
   */
  deck: CardBox;
  handGap: number;
  /** Negative marginLeft that overlaps the cards in an opponent's fan. */
  fanOverlap: number;
  deckSidebarWidth: number;
  tableMaxHeight: number;
  /**
   * Gap between played cards and from them to the table edge. Sized here rather
   * than in the stylesheet because it comes out of the same budget as the cards
   * themselves — a gap the layout did not reserve is a gap that does not exist.
   */
  trickGap: number;
  /**
   * How GameTable arranges the played cards. `cross` seats each card on the side
   * its player sits and is what every phone uses; `row` gives that up for play
   * order on a large screen, where the table is far wider than it is tall.
   */
  trickLayout: TrickLayout;
}

export interface CardMetricsInput {
  /** Viewport width in dp. */
  width: number;
  /** Viewport height in dp, already minus the safe-area insets. */
  height: number;
  /**
   * Reserve room for the practice-mode coach banner. Reserved rather than measured
   * so the table doesn't resize when a hint appears mid-turn.
   */
  reserveCoachBanner?: boolean;
  /**
   * Players at the table. From three players up, GameTable places cards left and
   * right of the centre column, so the trick area has to fit three cards across
   * instead of one — a much tighter constraint. Defaults to 2 (1v1).
   */
  playerCount?: number;
  /**
   * Height GameScreen measured as unused after laying the column out, fed back
   * so the table can claim it.
   *
   * Every other value here is modelled from constants, and on a real device the
   * model can be pessimistic — a top bar a few dp shorter, an inset reported
   * differently — which showed up as a band of empty felt between the table and
   * the hand that the arithmetic said was 4dp and the screenshots said was 70.
   * Measuring is the only way to know; this is where the answer comes back in.
   * It reaches the table only: the hand and the opponents are already sized, and
   * feeding it into them would make the measurement chase itself.
   */
  extraTableHeight?: number;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const box = (width: number): CardBox => ({ width, height: Math.round(width * CARD_ASPECT) });

export function computeCardMetrics({
  width,
  height,
  reserveCoachBanner,
  playerCount = 2,
  extraTableHeight = 0,
}: CardMetricsInput): CardMetrics {
  const banner = reserveCoachBanner ? CHROME.coachBanner : 0;

  // Width available to the hand, split across three cards, two gaps and the
  // border each card draws around itself when it is playable.
  const handWidth = width - CHROME.screenHorizontal - CHROME.handHorizontal;
  const widthCap =
    (handWidth - HAND_GAP * (HAND_CARDS - 1) - HAND_CARDS * 2 * HAND_CARD_BORDER) / HAND_CARDS;

  // Height available to the hand. The hand and the opponents' row both scale with
  // the hand card width, so solve for the width at which everything still fits
  // beside a table of a given height:
  //   fixed + small.height + hand.height <= usable
  //   where small.height = w * SMALL_RATIO * ASPECT and hand.height = w * ASPECT
  const fixedBesides =
    CHROME.screenVertical + CHROME.topBar + banner + CHROME.tableMargin +
    CHROME.opponentChrome + CHROME.handLabel + CHROME.handPadding;
  const heightCapFor = (table: number) =>
    (height - fixedBesides - table) / ((1 + SMALL_RATIO) * CARD_ASPECT);

  // Three-way split, in priority order. The hand holds at a comfortable size
  // even when that leaves the table short of its target, but never so far that
  // the table drops through its floor; and once the table *has* its target, any
  // remaining height goes back to the hand.
  const handForTargetTable = heightCapFor(TARGET_TABLE_HEIGHT);
  const handForMinimumTable = heightCapFor(CHROME.tableMin);
  const heightCap = Math.max(
    handForTargetTable,
    Math.min(COMFORTABLE_HAND_CARD, handForMinimumTable),
  );

  const isLargeScreen = width >= LARGE_SCREEN_WIDTH;

  const large = box(clamp(Math.floor(Math.min(widthCap, heightCap)), MIN_HAND_CARD, MAX_HAND_CARD));
  const small = box(Math.min(
    Math.round(large.width * SMALL_RATIO),
    isLargeScreen ? MAX_SMALL_CARD_LARGE : Infinity,
  ));

  // One card tall on every seat. The left and right seats used to fan their
  // cards *vertically* inside a row that runs horizontally anyway, which bought
  // nothing and made the 2v2 opponents row 42% taller than the 1v1 one.
  const opponentBlock = small.height + CHROME.opponentChrome;
  const handBlock = CHROME.handLabel + large.height + CHROME.handPadding;
  // Height the table *may* use. What it ends up taking is decided at the bottom,
  // once the arrangement is known — a row of two needs one card of height, and
  // handing it the whole remainder is what left a 383dp box holding 215dp of
  // cards on a mid-range phone.
  const tableAvailable = Math.max(
    CHROME.tableMin,
    height - CHROME.screenVertical - CHROME.topBar - banner
      - opponentBlock - handBlock - CHROME.tableMargin,
  ) + extraTableHeight;

  // The sidebar stacks the deck and the trump card inside the table, which clips
  // its overflow, so the table box caps it however wide the screen is. This is
  // only its *floor* — it grows into spare width once the trick is laid out,
  // which cannot happen until the card size is known.
  const deckHeightLimit = Math.floor(
    (tableAvailable - CHROME.deckSidebarChrome) / 2 / CARD_ASPECT,
  );
  // A large screen starts at its fixed cap and does not grow: its sidebar was
  // already sized deliberately, and letting it trade width with the trick area
  // would quietly redistribute a tablet layout nobody asked to change.
  //
  // The phone floor is a share of the *hand* card, not of the opponents' card —
  // see MIN_DECK_RATIO. Growth into spare width still applies on top, so 1v1
  // keeps the large trump it already had.
  const deckFloor = Math.min(
    isLargeScreen ? MAX_DECK_CARD_LARGE : Math.round(large.width * MIN_DECK_RATIO),
    deckHeightLimit,
  );
  const deckSidebarFloor = deckFloor + DECK_SIDEBAR_PADDING;

  // Played cards are sized from the table box, not from a ratio of the hand card.
  // The player name sits *on* the card rather than under it — stacking two labels
  // below the cards costs 26dp, which on a small phone is the difference between
  // the played cards growing and shrinking.
  // Gap *between* played cards. The inset from the table edge stays at
  // `playedInset` on every screen: the table's own gold border already separates
  // a card from the outside, and on the cross the vertical axis is the binding
  // one — widening the edges too would charge for the gap three times over and
  // cost a tablet 13% of its card size to buy nothing visible.
  // Everything below works in the table's *inner* box: `tableMaxHeight` is the
  // outer one and the 3dp border on each edge is not usable space.
  const trickGap = isLargeScreen ? LARGE_TRICK_GAP : CHROME.playedInset;
  const trickAreaWidth =
    width - CHROME.screenHorizontal - CHROME.tableBorder - deckSidebarFloor;
  const stackHeight = tableAvailable - CHROME.tableBorder - 2 * CHROME.playedInset;

  // --- Cross: each card on the side its player sits. Two of them stack (lead
  // and follow), so height is the binding constraint; with 3-4 players the left
  // and right cards share the row with the centred pair, so three must fit
  // across. Lay them clear of each other when the table can hold them, and only
  // fall back to overlapping when that would leave them too small to read.
  //
  // The stack is two cards *and the gap between them*. Dividing the height by
  // two flat is what left a tablet's played cards touching edge to edge.
  const clear = (stackHeight - trickGap) / 2 / CARD_ASPECT;
  const overlapped = stackHeight / (2 - MAX_TRICK_OVERLAP) / CARD_ASPECT;
  const crossByHeight = clear >= COMFORTABLE_TABLE_CARD ? clear : overlapped;
  // Two players put both cards in the *same* centred column, one above the
  // other — modelling it as two across reserved a column that is never used and
  // hid how much width a 1v1 table actually has spare.
  const crossAcross = playerCount >= 3 ? 3 : 1;
  const crossByWidth =
    (trickAreaWidth - 2 * CHROME.playedInset - (crossAcross - 1) * trickGap) / crossAcross;
  const cross = Math.min(crossByHeight, crossByWidth);

  // --- Row: every card side by side. Trades the seating metaphor for the one
  // thing the cross cannot do — turn spare width into card size.
  const rowByHeight = stackHeight / CARD_ASPECT;
  const rowByWidth =
    (trickAreaWidth - 2 * CHROME.playedInset - (playerCount - 1) * trickGap) / playerCount;
  const row = Math.min(rowByHeight, rowByWidth);

  // On a phone the cross always wins, and not on arithmetic: it is the only
  // arrangement that puts each card where its player sits, and that is what the
  // table is *for*. Both alternatives were tried and both were rejected on
  // sight — two cards side by side in 1v1 read as unrelated rather than as one
  // facing the other, and a 2x2 block in 2v2 loses which opponent played what.
  // Each was arithmetically better (153dp against 109dp, 117dp against 101dp)
  // and neither was worth it. The empty felt the cross leaves is the price.
  //
  // The row survives on large screens only, where a table much wider than it is
  // tall makes the cross genuinely unusable — that layout was signed off
  // separately.
  let trickLayout: TrickLayout = 'cross';
  let best = cross;
  if (isLargeScreen && row > best * LAYOUT_SWITCH_MARGIN) { trickLayout = 'row'; best = row; }

  const ceiling = isLargeScreen
    ? MAX_TABLE_CARD_LARGE
    : Math.round(large.width * PHONE_TABLE_CEILING);
  const medium = box(clamp(Math.floor(best), MIN_TABLE_CARD, ceiling));

  // With the arrangement settled, the sidebar grows into the width the trick
  // leaves over — and only into that, so the played cards never pay for it.
  const trickCols = trickLayout === 'row' ? playerCount : crossAcross;
  const trickUsesWidth =
    trickCols * medium.width + 2 * CHROME.playedInset + (trickCols - 1) * trickGap;
  const spareWidth = Math.max(0, trickAreaWidth - trickUsesWidth);
  const deckGrowth = isLargeScreen
    ? 0
    : Math.min(Math.round(spareWidth * DECK_SPARE_SHARE), spareWidth);
  const deck = box(Math.min(deckFloor + deckGrowth, deckHeightLimit));
  const deckSidebarWidth = deck.width + DECK_SIDEBAR_PADDING;

  // The table keeps the whole remainder rather than being trimmed to its
  // contents. Trimming it was an attempt to stop it reading as an empty green
  // box, and it only moved the emptiness outside the felt, where it read worse —
  // a hole between the table and the hand instead of a margin around the cards.
  // Leftover is unavoidable in 2v2 on a phone: three cards across bind the width
  // long before the height runs out. Inside the felt it looks like a table.
  const tableMaxHeight = tableAvailable;

  return {
    small,
    medium,
    large,
    deck,
    handGap: HAND_GAP,
    fanOverlap: -Math.round(small.width * FAN_RATIO),
    trickLayout,
    deckSidebarWidth,
    tableMaxHeight,
    trickGap,
  };
}

/** Vertical space the game screen needs at these metrics. Used by the layout test. */
export function columnHeight(m: CardMetrics, reserveCoachBanner?: boolean): number {
  return (
    CHROME.screenVertical +
    CHROME.topBar +
    (reserveCoachBanner ? CHROME.coachBanner : 0) +
    m.small.height + CHROME.opponentChrome +
    m.tableMaxHeight + CHROME.tableMargin +
    CHROME.handLabel + m.large.height + CHROME.handPadding
  );
}

export const CARD_METRICS_CHROME = CHROME;
