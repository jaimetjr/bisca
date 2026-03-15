import React from 'react';
import { View, Image, StyleSheet } from 'react-native';
import { Suit, Rank } from '@/shared/lib/types';

const cardSheet = require('@/assets/images/cards.png');

const SHEET_WIDTH = 909;
const SHEET_HEIGHT = 259;
const TILE_W = SHEET_WIDTH / 14;
const TILE_H = SHEET_HEIGHT / 4;

const SUIT_ROW: Record<Suit, number> = {
  copas: 0,
  oros: 1,
  bastos: 2,
  espadas: 3,
};

const RANK_COL: Record<Rank, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
  7: 6,
  10: 10,
  11: 11,
  12: 12,
};

const BACK_COL = 13;
const BACK_ROW = 0;

const SIZE_CONFIG = {
  small: { width: 56, height: 79 },
  medium: { width: 75, height: 106 },
  large: { width: 90, height: 127 },
};

interface CardSpriteProps {
  suit?: Suit;
  rank?: Rank;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function CardSprite({ suit, rank, faceDown, size = 'medium' }: CardSpriteProps) {
  const dim = SIZE_CONFIG[size];
  const scaleX = dim.width / TILE_W;
  const scaleY = dim.height / TILE_H;

  let col: number;
  let row: number;

  if (faceDown || !suit || !rank) {
    col = BACK_COL;
    row = BACK_ROW;
  } else {
    col = RANK_COL[rank];
    row = SUIT_ROW[suit];
  }

  const offsetX = -(col * TILE_W * scaleX);
  const offsetY = -(row * TILE_H * scaleY);

  return (
    <View style={[styles.container, { width: dim.width, height: dim.height }]}>
      <Image
        source={cardSheet}
        style={{
          width: SHEET_WIDTH * scaleX,
          height: SHEET_HEIGHT * scaleY,
          position: 'absolute',
          left: offsetX,
          top: offsetY,
        }}
        resizeMode="stretch"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderRadius: 4,
  },
});
