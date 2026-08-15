import React, { useRef, useCallback } from 'react';
import { View, Pressable, StyleSheet, Animated } from 'react-native';
import Colors from '@/shared/constants/colors';
import { Card as CardType } from '@/shared/lib/types';
import CardSprite, { CardSize } from '@/components/CardSprite';

interface CardProps {
  card: CardType;
  onPress?: () => void;
  disabled?: boolean;
  size?: CardSize;
  faceDown?: boolean;
  highlighted?: boolean;
  hinted?: boolean;
}

/**
 * Border a hand card reserves, per side — the same number `card-metrics` budgets
 * as `HAND_CARD_BORDER`. `hinted` is the widest state, so it sets the reserve
 * and `highlighted` draws at the same width in a different colour.
 */
const HAND_CARD_BORDER = 3;

export default function GameCard({ card, onPress, disabled, size = 'medium', faceDown, highlighted, hinted }: CardProps) {
  const playAnim = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);
  // Only the hand is ever highlighted, and only the hand has the space budgeted
  // for it — reserving on a played card would push the trick past the table.
  const canHighlight = highlighted !== undefined || hinted !== undefined;

  const handlePress = useCallback(() => {
    if (!onPress || isAnimating.current) return;
    isAnimating.current = true;
    Animated.timing(playAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onPress();
      playAnim.setValue(0);
      isAnimating.current = false;
    });
  }, [onPress, playAnim]);

  const animTranslateY = playAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, -30, -60],
  });
  const animScale = playAnim.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [1, 1.08, 0.85],
  });
  const animOpacity = playAnim.interpolate({
    inputRange: [0, 0.6, 1],
    outputRange: [1, 1, 0.3],
  });

  const content = (
    <View style={[
      styles.cardWrapper,
      // Space for the highlight is held whether or not it is lit. Switching
      // `borderWidth` on instead grew the hand row by 4dp on your turn, the
      // table gave those 4dp up, and `nextTableCorrection` resized the played
      // cards to match — so the trick and the trump changed size every single
      // turn. `card-metrics` has always budgeted `HAND_CARD_BORDER` as present
      // all game; reserving it here is what makes that true.
      canHighlight && styles.highlightReserve,
      highlighted && styles.highlighted,
      hinted && styles.hinted,
      disabled && styles.disabled,
    ]}>
      <CardSprite
        suit={faceDown ? undefined : card.suit}
        rank={faceDown ? undefined : card.rank}
        faceDown={faceDown}
        size={size}
      />
    </View>
  );

  if (onPress && !disabled) {
    return (
      <Animated.View style={{
        transform: [{ translateY: animTranslateY }, { scale: animScale }],
        opacity: animOpacity,
      }}>
        <Pressable
          onPress={handlePress}
          testID={`card-${card.id}`}
          style={({ pressed }) => [
            !isAnimating.current && { transform: [{ scale: pressed ? 0.97 : 1 }] },
          ]}
        >
          {content}
        </Pressable>
      </Animated.View>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  cardWrapper: {
    borderRadius: 6,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  /** Holds the highlight's footprint while it is unlit, so nothing reflows. */
  highlightReserve: {
    borderWidth: HAND_CARD_BORDER,
    borderColor: 'transparent',
    borderRadius: 6,
  },
  highlighted: {
    borderWidth: HAND_CARD_BORDER,
    borderColor: Colors.gold,
    borderRadius: 6,
    shadowColor: Colors.gold,
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },
  // Practice-mode coach hint. Deliberately distinct from `highlighted` (which
  // marks every playable card on your turn): a stronger green "recommended"
  // glow so the single suggested card stands out.
  hinted: {
    borderWidth: HAND_CARD_BORDER,
    borderColor: Colors.success,
    borderRadius: 6,
    shadowColor: Colors.success,
    shadowOpacity: 0.95,
    shadowRadius: 14,
  },
  disabled: {
    opacity: 0.5,
  },
});
