import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { Player } from '@/shared/lib//types';
import CardSprite from '@/components/CardSprite';
import { useCardMetrics } from '@shared/hooks/useCardMetrics';
import { toPersona } from '@shared/lib/brisca/opponents';
import { t } from '@/shared/i18n';

interface OpponentHandProps {
  player: Player;
  isCurrentTurn: boolean;
  isTeammate?: boolean;
  /** Their connection dropped; not a loss. */
  isAway?: boolean;
}

export default function OpponentHand({ player, isCurrentTurn, isTeammate, isAway }: OpponentHandProps) {
  const metrics = useCardMetrics();
  // Offline bots carry a persona and get its own face; online players never do
  // and keep the generic icons this had before.
  const persona = toPersona(player.personaId);

  const icon = persona?.icon ?? (isTeammate ? 'shield-account' : (player.isAI ? 'robot' : 'account'));
  // The turn colour still wins: knowing whose turn it is matters more than
  // knowing who they are, and the teammate green is a team cue, not an identity.
  const iconColor = isCurrentTurn
    ? Colors.gold
    : isTeammate
      ? '#4CAF50'
      : persona?.color ?? Colors.textSecondary;

  return (
    <View style={styles.container}>
      <View style={[
        styles.nameTag,
        isCurrentTurn && styles.activeNameTag,
        isTeammate && styles.teammateNameTag,
        isAway && styles.awayNameTag,
      ]}>
        <MaterialCommunityIcons
          name={isAway ? 'wifi-off' : (icon as any)}
          size={14}
          color={isAway ? Colors.textSecondary : iconColor}
        />
        <Text style={[
          styles.name,
          isCurrentTurn && styles.activeName,
        ]} numberOfLines={1}>
          {isAway ? t('game.opponentAway', { name: player.name }) : player.name}
        </Text>
      </View>
      {/* One overlapping horizontal fan on every seat. The left and right seats
          used to stack their cards vertically — inside an opponents row that is
          itself horizontal — which read no differently and made the row 42%
          taller. On a 360x640 in 2v2 that row was costing more height than the
          whole table. The cards are face down: their only job is to be
          countable, and 21% of each is enough for that. */}
      {/* Keeps a card's height once the hand runs out, on the last trick of
          every match. Letting it collapse handed the freed height to the table,
          which is flex: 1, and the whole layout reflowed at the one moment the
          player is reading the final trick. */}
      <View style={[styles.cards, { minHeight: metrics.small.height }]}>
        {player.hand.map((_, i) => (
          <View key={i} style={i > 0 ? { marginLeft: metrics.fanOverlap } : undefined}>
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
  awayNameTag: {
    opacity: 0.6,
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
  cards: {
    flexDirection: 'row',
  },
});
