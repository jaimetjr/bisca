import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/shared/constants/colors';
import GameCard from '@/components/Card';
import CardSprite from '@/components/CardSprite';
import { GameState } from '@/shared/lib/types';
import { t, getSuitName } from '@/shared/i18n';

interface GameTableProps {
  gameState: GameState;
  humanPlayerId: string;
}

export default function GameTable({ gameState, humanPlayerId }: GameTableProps) {
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

  const getCardPosition = (position: string) => {
    switch (position) {
      case 'bottom': return { bottom: 8, alignSelf: 'center' as const };
      case 'top': return { top: 8, alignSelf: 'center' as const };
      case 'left': return { left: 20, top: '40%' as any };
      case 'right': return { right: 20, top: '40%' as any };
      default: return {};
    }
  };

  return (
    <View style={styles.table}>
      <View style={styles.trickArea}>
        {currentTrick.map((tc, idx) => {
          const position = getPlayerPosition(tc.playerId);
          const player = players.find(p => p.id === tc.playerId);
          return (
            <View key={tc.card.id} style={[styles.playedCard, getCardPosition(position)]}>
              <GameCard card={tc.card} size="medium" />
              <Text style={styles.playerLabel}>{player?.name || ''}</Text>
            </View>
          );
        })}
      </View>

      <View style={styles.deckArea}>
        {(deck.length > 0 || trumpCard) && (
          <View style={styles.deckStack}>
            {trumpCard && (
              <View style={styles.trumpCardContainer}>
                <GameCard card={trumpCard} size="small" />
              </View>
            )}
            {deck.length > 0 && (
              <View style={styles.deckTop}>
                <CardSprite faceDown size="small" />
                <Text style={styles.deckCount}>{deck.length + (trumpCard ? 1 : 0)}</Text>
              </View>
            )}
          </View>
        )}
        {trumpSuit && (
          <View style={styles.trumpIndicator}>
            <Text style={styles.trumpLabel}>{t('table.trump')}</Text>
            <Text style={styles.trumpSuit}>{getSuitName(trumpSuit)}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    flex: 1,
    borderRadius: 16,
    backgroundColor: Colors.tableFelt,
    borderWidth: 3,
    borderColor: Colors.goldDark,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 200,
  },
  trickArea: {
    flex: 1,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playedCard: {
    position: 'absolute',
    alignItems: 'center',
  },
  playerLabel: {
    color: Colors.white,
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  deckArea: {
    position: 'absolute',
    top: 8,
    right: 8,
    alignItems: 'center',
    gap: 4,
  },
  deckStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trumpCardContainer: {
    transform: [{ rotate: '90deg' }],
    marginRight: -20,
    zIndex: 0,
  },
  deckTop: {
    alignItems: 'center',
    zIndex: 1,
  },
  deckCount: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
  },
  trumpIndicator: {
    backgroundColor: Colors.whiteAlpha,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignItems: 'center',
  },
  trumpLabel: {
    color: Colors.textSecondary,
    fontSize: 9,
    fontFamily: 'Inter_400Regular',
  },
  trumpSuit: {
    color: Colors.gold,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
});
