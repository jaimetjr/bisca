import React from 'react';
import { Image } from 'react-native';
import { Suit, Rank } from '@/shared/lib/types';

// Static require map — Metro bundler requires all requires to be statically analyzable
const CARD_IMAGES: Record<string, ReturnType<typeof require>> = {
  '1-oros':     require('@/assets/images/spanish/01-oros.png'),
  '2-oros':     require('@/assets/images/spanish/02-oros.png'),
  '3-oros':     require('@/assets/images/spanish/03-oros.png'),
  '4-oros':     require('@/assets/images/spanish/04-oros.png'),
  '5-oros':     require('@/assets/images/spanish/05-oros.png'),
  '6-oros':     require('@/assets/images/spanish/06-oros.png'),
  '7-oros':     require('@/assets/images/spanish/07-oros.png'),
  '10-oros':    require('@/assets/images/spanish/10-oros.png'),
  '11-oros':    require('@/assets/images/spanish/11-oros.png'),
  '12-oros':    require('@/assets/images/spanish/12-oros.png'),
  '1-copas':    require('@/assets/images/spanish/01-copas.png'),
  '2-copas':    require('@/assets/images/spanish/02-copas.png'),
  '3-copas':    require('@/assets/images/spanish/03-copas.png'),
  '4-copas':    require('@/assets/images/spanish/04-copas.png'),
  '5-copas':    require('@/assets/images/spanish/05-copas.png'),
  '6-copas':    require('@/assets/images/spanish/06-copas.png'),
  '7-copas':    require('@/assets/images/spanish/07-copas.png'),
  '10-copas':   require('@/assets/images/spanish/10-copas.png'),
  '11-copas':   require('@/assets/images/spanish/11-copas.png'),
  '12-copas':   require('@/assets/images/spanish/12-copas.png'),
  '1-espadas':  require('@/assets/images/spanish/01-espadas.png'),
  '2-espadas':  require('@/assets/images/spanish/02-espadas.png'),
  '3-espadas':  require('@/assets/images/spanish/03-espadas.png'),
  '4-espadas':  require('@/assets/images/spanish/04-espadas.png'),
  '5-espadas':  require('@/assets/images/spanish/05-espadas.png'),
  '6-espadas':  require('@/assets/images/spanish/06-espadas.png'),
  '7-espadas':  require('@/assets/images/spanish/07-espadas.png'),
  '10-espadas': require('@/assets/images/spanish/10-espadas.png'),
  '11-espadas': require('@/assets/images/spanish/11-espadas.png'),
  '12-espadas': require('@/assets/images/spanish/12-espadas.png'),
  '1-bastos':   require('@/assets/images/spanish/01-bastos.png'),
  '2-bastos':   require('@/assets/images/spanish/02-bastos.png'),
  '3-bastos':   require('@/assets/images/spanish/03-bastos.png'),
  '4-bastos':   require('@/assets/images/spanish/04-bastos.png'),
  '5-bastos':   require('@/assets/images/spanish/05-bastos.png'),
  '6-bastos':   require('@/assets/images/spanish/06-bastos.png'),
  '7-bastos':   require('@/assets/images/spanish/07-bastos.png'),
  '10-bastos':  require('@/assets/images/spanish/10-bastos.png'),
  '11-bastos':  require('@/assets/images/spanish/11-bastos.png'),
  '12-bastos':  require('@/assets/images/spanish/12-bastos.png'),
  'back':       require('@/assets/images/spanish/reverso.png'),
};

// Sizes scaled from actual image dimensions (209×319 px)
const SIZE_CONFIG = {
  small:  { width: 56,  height: 86  },
  medium: { width: 75,  height: 114 },
  large:  { width: 90,  height: 137 },
};

interface CardSpriteProps {
  suit?: Suit;
  rank?: Rank;
  faceDown?: boolean;
  size?: 'small' | 'medium' | 'large';
}

export default function CardSprite({ suit, rank, faceDown, size = 'medium' }: CardSpriteProps) {
  const dim = SIZE_CONFIG[size];
  const source = (!faceDown && suit && rank)
    ? (CARD_IMAGES[`${rank}-${suit}`] ?? CARD_IMAGES['back'])
    : CARD_IMAGES['back'];

  return (
    <Image
      source={source}
      style={{ width: dim.width, height: dim.height, borderRadius: 4 }}
      resizeMode="stretch"
    />
  );
}
