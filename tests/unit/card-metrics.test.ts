import { describe, it, expect } from 'vitest';
import {
  computeCardMetrics,
  columnHeight,
  CARD_ASPECT,
  CARD_METRICS_CHROME as CHROME,
} from '../../shared/lib/brisca/card-metrics';

/**
 * Viewport sizes in dp, already minus safe-area insets — the same value
 * useCardMetrics passes in. The small phones are what the budget is tight on.
 */
const DEVICES = [
  // 375x620 is the tightest case that ships: an iPhone SE viewport on web,
  // where the fixed 67/34 insets cost more than a native status bar.
  { name: 'iPhone SE (web)', width: 375, height: 620 },
  // Android Studio's "Small_Phone" AVD, 360x640 minus a 24dp status bar and a
  // 48dp three-button nav bar. The device the 2v2 table complaint came from.
  { name: 'Small phone', width: 360, height: 568 },
  { name: 'iPhone SE', width: 375, height: 647 },
  { name: 'iPhone 14', width: 390, height: 763 },
  { name: 'Pixel 7', width: 412, height: 830 },
  { name: 'iPhone 15 Pro Max', width: 430, height: 848 },
  { name: 'iPad mini (retrato)', width: 744, height: 1080 },
  { name: 'iPad 10.9 (retrato)', width: 820, height: 1136 },
];

describe('computeCardMetrics', () => {
  describe.each(DEVICES)('$name ($width x $height)', ({ width, height }) => {
    // 2v2 is the tight case for the trick area: four cards instead of two.
    it.each([
      [false, 2], [true, 2], [false, 4], [true, 4],
    ])('cabe na tela com banner=%s e %i jogadores', (reserveCoachBanner, playerCount) => {
      const m = computeCardMetrics({ width, height, reserveCoachBanner, playerCount });
      expect(columnHeight(m, reserveCoachBanner)).toBeLessThanOrEqual(height);
    });

    it('a mão cabe dentro da moldura, não em cima dela', () => {
      // Measured on a 430dp phone: inner box 390dp, cards taking 401. Two
      // borders were missing from the budget — the container's 2dp your-turn
      // glow, and the 2-3dp GameCard draws around each playable card. Both
      // appear on your turn, which is exactly when the frame is visible.
      //
      // The card box is the image plus its own border on each side, at the
      // hinted width because any of the three may be the suggested one.
      const m = computeCardMetrics({ width, height });
      const cardBox = m.large.width + 2 * 3;
      const handWidth = 3 * cardBox + 2 * m.handGap;
      const innerBox = width - CHROME.screenHorizontal - (2 * 6 + 2 * 2);

      expect(CHROME.handHorizontal, 'moldura do container fora da conta').toBe(2 * 6 + 2 * 2);
      expect(handWidth, 'a mão passou por cima da moldura').toBeLessThanOrEqual(innerBox);
    });

    it.each([2, 4])('a vaza cabe na mesa com %i jogadores', (playerCount) => {
      const m = computeCardMetrics({ width, height, playerCount });
      const trickAreaWidth = width - CHROME.screenHorizontal - m.deckSidebarWidth;

      // Cards are inset from the table edge by `playedInset` and separated from
      // each other by `trickGap` — the two are only equal on a phone.
      const edges = 2 * CHROME.playedInset;

      if (m.trickLayout === 'row') {
        // Side by side: every card in one line, one card tall.
        const across =
          playerCount * m.medium.width + edges + (playerCount - 1) * m.trickGap;
        expect(across, 'fileira estourou a largura').toBeLessThanOrEqual(trickAreaWidth);
        expect(m.medium.height + edges).toBeLessThanOrEqual(m.tableMaxHeight);
      } else {
        // Cross: two cards stack, and from three players up three share the row
        // — the left and right seats plus the centred pair between them.
        const cols = playerCount >= 3 ? 3 : 1;
        const across = cols * m.medium.width + edges + (cols - 1) * m.trickGap;
        expect(across, 'cruz estourou a largura').toBeLessThanOrEqual(trickAreaWidth);

        const stacked = 2 * m.medium.height + edges;
        const overlap = Math.max(0, stacked - m.tableMaxHeight);
        expect(overlap, 'sobrepôs mais de 30%').toBeLessThanOrEqual(m.medium.height * 0.3);

        // Overlapping is a rescue for shallow phone tables. With room to spare,
        // the cards are laid out clear of each other — and "clear" has to mean a
        // gap you can see: dividing the table height by two flat is what left a
        // tablet's played cards touching edge to edge.
        const clearFit = (m.tableMaxHeight - edges - m.trickGap) / 2 / CARD_ASPECT;
        if (clearFit >= 75) {
          expect(stacked + m.trickGap, 'as cartas se encostaram')
            .toBeLessThanOrEqual(m.tableMaxHeight);
        }
      }
    });

    it.each([2, 4])('o baralho e o trunfo cabem na mesa com %i jogadores', (playerCount) => {
      // GameTable clips its overflow, so a sidebar that does not fit loses the
      // trump suit name with no other symptom — which is exactly what happened
      // on a 375x667 once the model was off by a few dp.
      const m = computeCardMetrics({ width, height, playerCount });
      const sidebar = 2 * m.deck.height + CHROME.deckSidebarChrome;
      expect(sidebar).toBeLessThanOrEqual(m.tableMaxHeight);
    });

    it.each([3, 4])('com %i jogadores as três cartas da cruz cabem lado a lado', (playerCount) => {
      // GameTable pins one card left, one right, and centres the top/bottom card
      // *between* them — all three share one row. Checking only the left/right
      // pair passed while a 2v2 table piled every played card on the next.
      const m = computeCardMetrics({ width, height, playerCount });
      if (m.trickLayout !== 'cross') return;

      const across = 3 * m.medium.width + 2 * CHROME.playedInset + 2 * m.trickGap;
      expect(across).toBeLessThanOrEqual(width - CHROME.screenHorizontal - m.deckSidebarWidth);
    });

    it('com 2 jogadores a coluna centrada cabe na largura', () => {
      // Both cards sit in the *same* centred column, one above the other, so the
      // width to check is one card and not two.
      const m = computeCardMetrics({ width, height });
      if (m.trickLayout !== 'cross') return;
      const across = m.medium.width + 2 * CHROME.playedInset;
      expect(across).toBeLessThanOrEqual(width - CHROME.screenHorizontal - m.deckSidebarWidth);
    });
  });

  // The closed-test complaint: hand 90dp, table 75dp, opponents 56dp — all fixed
  // regardless of screen size.
  it('a carta da mão cresce em todo aparelho', () => {
    for (const { name, width, height } of DEVICES) {
      expect(computeCardMetrics({ width, height }).large.width, name).toBeGreaterThan(90);
    }
  });

  it('a carta da mesa cresce em todo aparelho, inclusive em 2v2', () => {
    // 2v2 used to be far worse than 1v1 — 59dp against 73dp on the same phone —
    // because the opponents' row was sized for vertical fans it no longer uses.
    // The two are within a few dp of each other now, so the check is one number.
    for (const { name, width, height } of DEVICES) {
      for (const playerCount of [2, 4]) {
        const m = computeCardMetrics({ width, height, playerCount });
        // 568dp of usable height is a 5" phone with a three-button nav bar, and
        // it honestly does not contain 75dp of played card once the hand has a
        // comfortable size and the opponents have a countable one. It reaches
        // 68, against 59 before — the exception is documented, not hidden.
        // 75dp is the fixed size this layout replaced — the invariant is that no
        // device ends up back there, not that every device clears it by a
        // margin. An iPhone SE lands exactly on it in 1v1 and stops overlapping
        // its two played cards to do so, which is the better of the two.
        //
        // 568dp of usable height is a 5" phone with a three-button nav bar. In
        // 2v2 it reaches 65 against 59 before. It lost a few dp on the way to
        // borders the model had been spending as if they were free — the
        // table's own 3dp frame, and the one GameCard draws around a playable
        // card — which is what had the cards overlapping both.
        const floor = height <= 568 ? 64 : 74;
        expect(m.medium.width, `${name} ${playerCount}p`).toBeGreaterThan(floor);
      }
    }
  });

  it('o trunfo não segue a carta do oponente', () => {
    // These shared `SMALL_RATIO` once, and lowering the opponents' share to give
    // the table height dragged the trump down to 48dp beside a 107dp played
    // card. They are not the same kind of thing: one is a face-down count, the
    // other is live information whose rank you read every trick.
    // Both table sizes, and 2v2 is the one that matters. This loop used to run on
    // the default `playerCount` (2) alone, and that is exactly how the trump got
    // back down to decoration size without a single test going red: in 2v2 three
    // cards go across the trick area, the spare width the sidebar grew into came
    // out at ~1dp, and the deck card sat at *exactly* `small.width` — 44dp beside
    // a 105dp hand card. `toBeGreaterThan` on equal numbers is the failure this
    // case never got to report.
    for (const playerCount of [2, 4]) {
      for (const { name, width, height } of DEVICES) {
        const m = computeCardMetrics({ width, height, playerCount });
        const at = `${name} ${playerCount}p`;
        expect(m.deck.width, `${at}: trunfo no tamanho de decoração`)
          .toBeGreaterThan(m.small.width);
        // On a phone it also has to hold its own against what is on the table.
        // A tablet caps it lower on purpose — there the played card runs to 280dp
        // and every dp of sidebar comes straight out of the trick area.
        if (width < 700) {
          expect(m.deck.width / m.medium.width, `${at}: trunfo ilegível ao lado da vaza`)
            .toBeGreaterThan(0.45);
        }
      }
    }

    // It is deliberately bigger in 1v1 than in 2v2 on the same phone: the sidebar
    // grows into the width the trick leaves unused, and a 1v1 cross stacks both
    // cards in one column while a 2v2 grid uses two. Scaling it off the hand card
    // instead ignored that and inflated the 2v2 sidebar to compete with four
    // played cards.
    for (const { name, width, height } of DEVICES.filter(d => d.width < 700 && d.height > 568)) {
      const solo = computeCardMetrics({ width, height, playerCount: 2 });
      const teams = computeCardMetrics({ width, height, playerCount: 4 });
      expect(solo.deck.width, `${name}: trunfo não aproveitou a mesa vazia do 1v1`)
        .toBeGreaterThan(teams.deck.width);
    }
  });

  it('a carta do oponente segue contável', () => {
    // Face-down cards only have to be countable, so they take the smallest share
    // of the column — but a sliver of a card is not a card. 38 is the 5" phone,
    // which pays for every border the layout has to respect.
    for (const { name, width, height } of DEVICES) {
      expect(computeCardMetrics({ width, height }).small.width, name).toBeGreaterThanOrEqual(38);
    }
  });

  it('no celular a carta da mesa fica perto da da mão, sem passar muito', () => {
    // Capping it at exactly the hand card sounded like proportion and behaved
    // like a leak: any table height beyond that could not become card and turned
    // into empty felt, first inside an oversized table and then as a band above
    // the hand. A quarter over is enough for the surplus to have somewhere to go
    // while the two still read as the same deck.
    for (const { name, width, height } of DEVICES.filter(d => d.width < 700)) {
      for (const playerCount of [2, 4]) {
        const m = computeCardMetrics({ width, height, playerCount });
        expect(m.medium.width, name).toBeLessThanOrEqual(Math.round(m.large.width * 1.25));
      }
    }
  });

  it('a folga medida vira carta, não feltro vazio', () => {
    // The model can be pessimistic about a real device's chrome, and GameScreen
    // measures what the column did not use and feeds it back here. The point is
    // that it actually lands on the cards.
    // 1v1, where the cross is bound by height and so can spend it. In 2v2 the
    // three-across width binds first and the extra becomes felt instead.
    const modelled = computeCardMetrics({ width: 430, height: 839, playerCount: 2 });
    const measured = computeCardMetrics({
      width: 430, height: 839, playerCount: 2, extraTableHeight: 70,
    });
    expect(measured.medium.width).toBeGreaterThan(modelled.medium.width);
    // ...and only on the table. Re-sizing the hand from a measurement taken
    // after the hand was laid out would make the measurement chase itself.
    expect(measured.large.width).toBe(modelled.large.width);
    expect(measured.small.width).toBe(modelled.small.width);
  });

  it('no celular o 1v1 fica carta contra carta, não lado a lado', () => {
    // Side by side is arithmetically better on a phone — 153dp against 109dp,
    // because stacking needs 3.3 card-widths of height and 1 of width in a table
    // that is close to square. It is still wrong: in a head-to-head game the two
    // cards facing each other is the interaction, and shoulder to shoulder reads
    // as two unrelated cards. The empty width is the price and it is accepted.
    for (const { name, width, height } of DEVICES.filter(d => d.width < 700)) {
      expect(computeCardMetrics({ width, height, playerCount: 2 }).trickLayout, name).toBe('cross');
    }
    // A tablet is the exception on purpose: its table is wide enough that the
    // row nearly doubles the card, and that is the layout already signed off.
    for (const { name, width, height } of DEVICES.filter(d => d.width >= 700)) {
      expect(computeCardMetrics({ width, height, playerCount: 2 }).trickLayout, name).toBe('row');
    }
  });

  it('a mesa fica com a sobra da coluna, e a sobra fica dentro do feltro', () => {
    // Trimming the table to its contents and spreading the leftover around it
    // was tried: it only moved the emptiness outside the felt, where a hole
    // between the table and the hand read worse than a margin around the cards.
    // Leftover is unavoidable in 2v2 on a phone — three cards across bind the
    // width long before the height runs out — so it lives inside the table.
    for (const { name, width, height } of DEVICES) {
      for (const playerCount of [2, 4]) {
        const m = computeCardMetrics({ width, height, playerCount });
        expect(columnHeight(m), `${name} ${playerCount}p: coluna deixou buraco`)
          .toBe(height);
      }
    }
  });

  it('o celular usa a cruz, quantos jogadores forem', () => {
    // Both alternatives were built, measured and rejected on sight: side by side
    // in 1v1 (153dp against 109dp) reads as two unrelated cards instead of one
    // facing the other, and a 2x2 block in 2v2 (117dp against 101dp) loses which
    // opponent played what. Seating beats card size on a phone; the empty felt
    // the cross leaves is the price, and it is paid deliberately.
    for (const { name, width, height } of DEVICES.filter(d => d.width < 700)) {
      for (const playerCount of [2, 3, 4]) {
        expect(computeCardMetrics({ width, height, playerCount }).trickLayout, `${name} ${playerCount}p`)
          .toBe('cross');
      }
    }
  });

  it('a tela grande afasta as cartas da vaza', () => {
    // The complaint from the tablet: cards touching edge to edge in a table that
    // still looked half empty. A phone keeps the tight 8dp — there the two cards
    // already overlap to stay legible, so there is nothing to give.
    for (const { name, width, height } of DEVICES) {
      const m = computeCardMetrics({ width, height });
      expect(m.trickGap, name).toBe(width >= 700 ? 24 : CHROME.playedInset);
    }
  });

  it('o vão sai da margem da mesa, não do tamanho da carta', () => {
    // The tablet 2v2 cross is the case the user reported, and it is bound by
    // height — so a gap costs card size, and paying for it at both edges as well
    // as in the middle charges three times over (128dp -> 118dp on this device
    // for space against a border that already separates the card from the
    // outside). Both halves matter: a visible gap, and a card that stays big.
    const m = computeCardMetrics({ width: 744, height: 1080, playerCount: 4 });
    const visibleGap = m.tableMaxHeight - 2 * m.medium.height - 2 * CHROME.playedInset;

    expect(m.trickLayout).toBe('cross');
    expect(visibleGap, 'sem vão visível').toBeGreaterThanOrEqual(m.trickGap);
    expect(m.medium.width, 'carta pagou o vão duas vezes').toBeGreaterThanOrEqual(125);
  });

  it('cresce monotonicamente com a largura da tela', () => {
    let previous = 0;
    for (let width = 280; width <= 1400; width += 20) {
      const { large } = computeCardMetrics({ width, height: 1400 });
      expect(large.width).toBeGreaterThanOrEqual(previous);
      previous = large.width;
    }
  });

  it('respeita os limites nos extremos', () => {
    expect(computeCardMetrics({ width: 240, height: 400 }).large.width).toBe(84);
    expect(computeCardMetrics({ width: 1400, height: 2000 }).large.width).toBe(190);
  });

  it('todas as caixas seguem o aspect ratio da arte', () => {
    const m = computeCardMetrics({ width: 390, height: 763 });
    for (const b of [m.small, m.medium, m.large]) {
      expect(b.height).toBe(Math.round(b.width * CARD_ASPECT));
    }
  });

  it('o banner do coach sai do espaço livre e da mesa, nunca da mão', () => {
    // Practice mode is 1v1, where the cross fills the table's height, so there
    // is no slack to absorb the banner and the played card pays for it.
    const plain = computeCardMetrics({ width: 390, height: 763 });
    const practice = computeCardMetrics({ width: 390, height: 763, reserveCoachBanner: true });
    expect(practice.large.width).toBe(plain.large.width);
    expect(practice.medium.width).toBeLessThan(plain.medium.width);

    // Where there is no slack left, something has to give — but the hand gives
    // least, and never past its floor.
    const tight = computeCardMetrics({ width: 360, height: 568 });
    const tightPractice = computeCardMetrics({ width: 360, height: 568, reserveCoachBanner: true });
    expect(tightPractice.large.width).toBeGreaterThan(tight.large.width * 0.9);
    expect(tightPractice.large.width).toBeGreaterThanOrEqual(84);
  });
});
