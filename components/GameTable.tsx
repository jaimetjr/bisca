import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import GameCard from '@/components/Card';
import CardSprite from '@/components/CardSprite';
import { GameState } from '@/shared/lib/types';
import { t, getSuitName } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import { useCardMetrics } from '@shared/hooks/useCardMetrics';
import { CardMetrics, CARD_METRICS_CHROME } from '@shared/lib/brisca/card-metrics';

interface GameTableProps {
  gameState: GameState;
  humanPlayerId: string;
}

export default function GameTable({ gameState, humanPlayerId }: GameTableProps) {
  useLanguage();
  const metrics = useCardMetrics();
  const styles = useMemo(() => makeStyles(metrics), [metrics]);
  const { currentTrick, deck, trumpCard, trumpSuit, players } = gameState;

  const getPlayerPosition = (playerId: string): string => {
    const humanIndex = players.findIndex(p => p.id === humanPlayerId);
    const playerIndex = players.findIndex(p => p.id === playerId);
    const relativeIndex = (playerIndex - humanIndex + players.length) % players.length;

    if (players.length === 2) {
      return relativeIndex === 0 ? 'bottom' : 'top';
    }
    if (players.length === 3) {
      if (relativeIndex === 0) return 'bottom';
      if (relativeIndex === 1) return 'left';
      return 'right';
    }
    if (relativeIndex === 0) return 'bottom';
    if (relativeIndex === 1) return 'left';
    if (relativeIndex === 2) return 'top';
    return 'right';
  };

  // The cross pins each card to its edge; the gap between the stacked pair is
  // whatever is left over, which is why `card-metrics` has to reserve it when it
  // sizes the card. The inset comes from the metric rather than being repeated
  // here: the two were the same literal in two files, so changing the budget in
  // one would have sized cards for a margin the other never drew.
  const inset = CARD_METRICS_CHROME.playedInset;
  const getCardPosition = (position: string) => {
    switch (position) {
      case 'bottom': return { bottom: inset, alignSelf: 'center' as const };
      case 'top': return { top: inset, alignSelf: 'center' as const };
      // Stretched top-to-bottom and centred, rather than pinned at a magic 40%:
      // with cards sized to the viewport a fixed offset pushes tall cards off
      // the bottom of a short table.
      case 'left': return { left: inset, top: 0, bottom: 0, justifyContent: 'center' as const };
      case 'right': return { right: inset, top: 0, bottom: 0, justifyContent: 'center' as const };
      default: return {};
    }
  };

  // The sidebar stays for the whole game. It used to unmount once the deck ran
  // out and the trump was drawn, which both widened the trick area mid-match and
  // took the trump suit off screen — and the suit still governs every remaining
  // trick. The engine nulls `trumpCard` when a player draws it (that null is
  // load-bearing for the AI's world sampling), so once it's gone the slot shows
  // a placeholder instead of the card.
  const showTable = !!trumpSuit;

  // The cross seats each card where its player sits, and that is what every
  // phone uses. Only a large screen — where the table comes out far wider than
  // it is tall — falls back to a single row in play order.
  const isRow = metrics.trickLayout === 'row';

  const cards = currentTrick.map((tc) => {
    const position = getPlayerPosition(tc.playerId);
    const player = players.find(p => p.id === tc.playerId);
    return (
      <View
        key={tc.card.id}
        style={isRow ? styles.playedCardRow : [styles.playedCard, getCardPosition(position)]}
      >
        {/* Inner wrapper hugs the card so the label anchors to the card
            itself — the left/right slots stretch their outer container
            full height to centre it, which would otherwise drop the label
            at the bottom of the table, detached from its card. */}
        <View style={styles.playedCardInner}>
          <GameCard card={tc.card} size="medium" />
          {/* On the card, not under it: two stacked cards plus two labels
              below them cost 26dp of table height, which on a small phone
              is what forces the played cards to shrink. Anchored to the
              card's *outer* edge so that when the lead and follow cards
              overlap in the middle, neither label ends up beneath the
              other card. */}
          <Text
            style={[
              styles.playerLabel,
              // In a row the cards sit side by side, so nothing can cover a
              // label and they all read best along the bottom edge.
              !isRow && position === 'top' ? styles.labelTop : styles.labelBottom,
            ]}
            numberOfLines={1}
          >
            {player?.name || ''}
          </Text>
        </View>
      </View>
    );
  });

  return (
    <View style={styles.table} testID="game-table">
      {/* Trick area — takes all space except the deck sidebar */}
      <View style={[styles.trickArea, isRow && styles.trickAreaRow]} testID="trick-area">
        {cards}
      </View>

      {/* Deck sidebar — normal flex flow, never clips */}
      {showTable && (
        <View style={styles.deckSidebar}>
          {/* Both slots are always rendered. Dropping a slot when it empties
              moved the trump up by a whole card height mid-match; an outlined
              placeholder holds the position and doubles as the "no cards left to
              draw" signal, which matters in Brisca. */}
          <View style={styles.deckItem}>
            {deck.length > 0 ? (
              <>
                <CardSprite faceDown size="deck" />
                {/* On the card rather than under it — the sidebar stacks two
                    cards inside a table that clips its overflow, and those 16dp
                    are the difference between the trump suit name showing and
                    not. */}
                <Text style={styles.deckCount}>{deck.length + (trumpCard ? 1 : 0)}</Text>
              </>
            ) : (
              <View style={styles.cardGhost} testID="deck-ghost" />
            )}
          </View>

          <View style={styles.deckItem}>
            {trumpCard ? (
              <GameCard card={trumpCard} size="deck" />
            ) : (
              // Dashed and hollow so it reads as "the trump was here and is now
              // in someone's hand", not as a card still waiting to be drawn. The
              // suit label below stays accurate for the rest of the match.
              <View style={styles.cardGhost} testID="trump-ghost">
                <MaterialCommunityIcons
                  name="cards-playing-outline"
                  size={Math.round(metrics.deck.width * 0.42)}
                  color={Colors.gold}
                  style={{ opacity: 0.55 }}
                />
              </View>
            )}
            <Text style={styles.trumpLabel}>{t('table.trump')}</Text>
            <Text style={styles.trumpSuit}>{getSuitName(trumpSuit!)}</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const makeStyles = (m: CardMetrics) => StyleSheet.create({
  table: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: Colors.tableFelt,
    borderWidth: 3,
    borderColor: Colors.goldDark,
    minHeight: 180,
    overflow: 'hidden',
  },
  trickArea: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trickAreaRow: {
    flexDirection: 'row',
    // `gap` is the minimum the sizing reserved; `space-evenly` inside a padded
    // box spreads whatever is left over — a card that hits its ceiling leaves
    // surplus width, and piling all of it against the table edges reads as two
    // cards stuck together with wide empty margins.
    gap: m.trickGap,
    paddingHorizontal: CARD_METRICS_CHROME.playedInset,
    justifyContent: 'space-evenly',
  },
  playedCard: {
    position: 'absolute',
    alignItems: 'center',
  },
  playedCardRow: {
    alignItems: 'center',
  },
  playedCardInner: {
    alignItems: 'center',
  },
  playerLabel: {
    position: 'absolute',
    maxWidth: m.medium.width - 8,
    color: Colors.white,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  labelTop: { top: 4 },
  labelBottom: { bottom: 4 },
  deckSidebar: {
    width: m.deckSidebarWidth,
    paddingTop: 10,
    paddingRight: 8,
    alignItems: 'center',
    gap: 8,
  },
  deckItem: {
    alignItems: 'center',
  },
  cardGhost: {
    width: m.deck.width,
    height: m.deck.height,
    borderRadius: Math.round(m.deck.width * 0.044), // matches the art's corner
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(212, 168, 67, 0.55)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deckCount: {
    position: 'absolute',
    bottom: 3,
    color: Colors.white,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 5,
    borderRadius: 7,
    overflow: 'hidden',
  },
  trumpLabel: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
    marginTop: 2,
  },
  trumpSuit: {
    color: Colors.gold,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
});
