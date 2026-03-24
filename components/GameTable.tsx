import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/shared/constants/colors';
import GameCard from '@/components/Card';
import CardSprite from '@/components/CardSprite';
import { GameState } from '@/shared/lib/types';
import { t, getSuitName } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';

interface GameTableProps {
  gameState: GameState;
  humanPlayerId: string;
}

export default function GameTable({ gameState, humanPlayerId }: GameTableProps) {
  useLanguage();
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
      case 'left': return { left: 8, top: '40%' as any };
      case 'right': return { right: 8, top: '40%' as any };
      default: return {};
    }
  };

  const hasDeck = deck.length > 0 || !!trumpCard;

  return (
    <View style={styles.table}>
      {/* Trick area — takes all space except the deck sidebar */}
      <View style={styles.trickArea}>
        {currentTrick.map((tc) => {
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

      {/* Deck sidebar — normal flex flow, never clips */}
      {hasDeck && (
        <View style={styles.deckSidebar}>
          {deck.length > 0 && (
            <View style={styles.deckItem}>
              <CardSprite faceDown size="small" />
              <Text style={styles.deckCount}>{deck.length + (trumpCard ? 1 : 0)}</Text>
            </View>
          )}
          {trumpCard && (
            <View style={styles.deckItem}>
              <GameCard card={trumpCard} size="small" />
              <Text style={styles.trumpLabel}>{t('table.trump')}</Text>
              <Text style={styles.trumpSuit}>{getSuitName(trumpSuit!)}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    flex: 1,
    flexDirection: 'row',
    borderRadius: 16,
    backgroundColor: Colors.tableFelt,
    borderWidth: 3,
    borderColor: Colors.goldDark,
    minHeight: 200,
    overflow: 'hidden',
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
  deckSidebar: {
    width: 72,
    paddingTop: 10,
    paddingRight: 8,
    alignItems: 'center',
    gap: 8,
  },
  deckItem: {
    alignItems: 'center',
  },
  deckCount: {
    color: Colors.white,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    marginTop: 2,
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
