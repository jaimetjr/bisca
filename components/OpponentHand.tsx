import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { Player } from '@/shared/lib//types';
import CardSprite from '@/components/CardSprite';

interface OpponentHandProps {
  player: Player;
  isCurrentTurn: boolean;
  position: 'top' | 'left' | 'right';
  isTeammate?: boolean;
}

export default function OpponentHand({ player, isCurrentTurn, position, isTeammate }: OpponentHandProps) {
  const isHorizontal = position === 'top';

  return (
    <View style={[
      styles.container,
      isHorizontal ? styles.horizontal : styles.vertical,
    ]}>
      <View style={[
        styles.nameTag,
        isCurrentTurn && styles.activeNameTag,
        isTeammate && styles.teammateNameTag,
      ]}>
        <MaterialCommunityIcons
          name={isTeammate ? 'shield-account' : (player.isAI ? 'robot' : 'account')}
          size={14}
          color={isCurrentTurn ? Colors.gold : isTeammate ? '#4CAF50' : Colors.textSecondary}
        />
        <Text style={[
          styles.name,
          isCurrentTurn && styles.activeName,
        ]} numberOfLines={1}>
          {player.name}
        </Text>
        <Text style={styles.score}>{player.score}</Text>
      </View>
      <View style={[
        styles.cards,
        isHorizontal ? styles.cardsHorizontal : styles.cardsVertical,
      ]}>
        {player.hand.map((_, i) => (
          <View
            key={i}
            style={[
              isHorizontal ? { marginLeft: i > 0 ? -12 : 0 } : { marginTop: i > 0 ? -20 : 0 },
            ]}
          >
            <CardSprite faceDown size="small" />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 4,
  },
  horizontal: {
    flexDirection: 'column',
  },
  vertical: {
    flexDirection: 'column',
  },
  nameTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.whiteAlpha,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  activeNameTag: {
    backgroundColor: 'rgba(212, 168, 67, 0.25)',
    borderWidth: 1,
    borderColor: Colors.gold,
  },
  teammateNameTag: {
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.4)',
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  name: {
    color: Colors.textSecondary,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    maxWidth: 70,
  },
  activeName: {
    color: Colors.gold,
  },
  score: {
    color: Colors.gold,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  cards: {
    flexDirection: 'row',
  },
  cardsHorizontal: {
    flexDirection: 'row',
  },
  cardsVertical: {
    flexDirection: 'column',
  },
});
