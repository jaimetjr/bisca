import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { t, getSuitName } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import { Card, CARD_POINTS, SUITS } from '@/shared/lib/types';
import GameCard from '@/components/Card';

interface TutorialModalProps {
  visible: boolean;
  onClose: () => void;
}

const PAGE_COUNT = 5;

const VALUE_CARDS: { card: Card; rankKey: string }[] = [
  { card: { suit: 'oros', rank: 1, id: 'tut-val-ace' }, rankKey: 'tutorial.rankAce' },
  { card: { suit: 'copas', rank: 3, id: 'tut-val-three' }, rankKey: 'tutorial.rankThree' },
  { card: { suit: 'espadas', rank: 12, id: 'tut-val-king' }, rankKey: 'tutorial.rankKing' },
  { card: { suit: 'bastos', rank: 11, id: 'tut-val-knight' }, rankKey: 'tutorial.rankKnight' },
  { card: { suit: 'oros', rank: 10, id: 'tut-val-jack' }, rankKey: 'tutorial.rankJack' },
];

const TRUMP_CARD: Card = { suit: 'oros', rank: 7, id: 'tut-trump' };
const TRICK_LEAD_CARD: Card = { suit: 'copas', rank: 12, id: 'tut-trick-lead' };
const TRICK_TRUMP_CARD: Card = { suit: 'oros', rank: 2, id: 'tut-trick-trump' };

function DeckPage() {
  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>{t('tutorial.deckTitle')}</Text>
      <View style={styles.cardRow}>
        {SUITS.map((suit) => (
          <View key={suit} style={styles.cardItem}>
            <GameCard card={{ suit, rank: 1, id: `tut-deck-${suit}` }} size="small" />
            <Text style={styles.cardLabel}>{getSuitName(suit)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.pageBody}>{t('tutorial.deckBody')}</Text>
    </View>
  );
}

function ValuesPage() {
  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>{t('tutorial.valuesTitle')}</Text>
      <View style={styles.cardRow}>
        {VALUE_CARDS.map(({ card, rankKey }) => (
          <View key={card.id} style={styles.cardItem}>
            <GameCard card={card} size="small" />
            <Text style={styles.cardLabel}>{t(rankKey)}</Text>
            <View style={styles.pointsBadge}>
              <Text style={styles.pointsBadgeText}>{t('tutorial.points', { points: CARD_POINTS[card.rank] })}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text style={styles.pageBody}>{t('tutorial.valuesBody')}</Text>
    </View>
  );
}

function TrumpPage() {
  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>{t('tutorial.trumpTitle')}</Text>
      <View style={styles.cardItem}>
        <GameCard card={TRUMP_CARD} size="large" highlighted />
        <Text style={styles.cardLabelGold}>{t('table.trump')}</Text>
      </View>
      <Text style={styles.pageBody}>{t('tutorial.trumpBody')}</Text>
    </View>
  );
}

function TrickPage() {
  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>{t('tutorial.trickTitle')}</Text>
      <View style={styles.cardRow}>
        <View style={styles.cardItem}>
          <GameCard card={TRICK_LEAD_CARD} size="medium" />
          <Text style={styles.cardLabel}>{t('tutorial.trickLead')}</Text>
        </View>
        <View style={styles.cardItem}>
          <GameCard card={TRICK_TRUMP_CARD} size="medium" highlighted />
          <Text style={styles.cardLabelGold}>{t('table.trump')}</Text>
        </View>
      </View>
      <Text style={styles.trickCaption}>{t('tutorial.trickTrumpWins')}</Text>
      <Text style={styles.pageBody}>{t('tutorial.trickBody')}</Text>
    </View>
  );
}

function GoalPage() {
  return (
    <View style={styles.page}>
      <Text style={styles.pageTitle}>{t('tutorial.goalTitle')}</Text>
      <View style={styles.trophyCircle}>
        <MaterialCommunityIcons name="trophy" size={56} color={Colors.gold} />
      </View>
      <Text style={styles.pageBody}>{t('tutorial.goalBody')}</Text>
    </View>
  );
}

export default function TutorialModal({ visible, onClose }: TutorialModalProps) {
  useLanguage(); // subscribe to language changes so t() output updates
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (visible) setPage(0);
  }, [visible]);

  const isLastPage = page === PAGE_COUNT - 1;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal} testID="tutorial-modal">
          <View style={styles.header}>
            <Text style={styles.title}>{t('tutorial.title')}</Text>
            {!isLastPage && (
              <Pressable onPress={onClose} testID="tutorial-skip-btn" hitSlop={8}>
                <Text style={styles.skipText}>{t('tutorial.skip')}</Text>
              </Pressable>
            )}
          </View>

          <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
            {page === 0 && <DeckPage />}
            {page === 1 && <ValuesPage />}
            {page === 2 && <TrumpPage />}
            {page === 3 && <TrickPage />}
            {page === 4 && <GoalPage />}
          </ScrollView>

          <View style={styles.dotsRow}>
            {Array.from({ length: PAGE_COUNT }, (_, i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.footer}>
            {page > 0 ? (
              <Pressable
                style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.85 }]}
                onPress={() => setPage(page - 1)}
                testID="tutorial-back-btn"
              >
                <Text style={styles.backButtonText}>{t('tutorial.back')}</Text>
              </Pressable>
            ) : (
              <View style={styles.footerSpacer} />
            )}
            <Pressable
              style={({ pressed }) => [styles.nextButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={isLastPage ? onClose : () => setPage(page + 1)}
              testID={isLastPage ? 'tutorial-done-btn' : 'tutorial-next-btn'}
            >
              <Text style={styles.nextButtonText}>{isLastPage ? t('tutorial.done') : t('tutorial.next')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    width: '90%',
    maxWidth: 420,
    height: 600,
    maxHeight: '85%',
    backgroundColor: Colors.backgroundDark,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.gold,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
    color: Colors.gold,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  page: {
    alignItems: 'center',
    gap: 16,
    paddingVertical: 8,
  },
  pageTitle: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
    textAlign: 'center',
  },
  pageBody: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  cardRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
  },
  cardItem: {
    alignItems: 'center',
    gap: 6,
  },
  cardLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: Colors.textSecondary,
  },
  cardLabelGold: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
  },
  pointsBadge: {
    backgroundColor: Colors.gold,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  pointsBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    color: Colors.textDark,
  },
  trickCaption: {
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.gold,
    textAlign: 'center',
  },
  trophyCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.whiteAlpha,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.gold,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
    marginBottom: 16,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.whiteAlpha,
  },
  dotActive: {
    backgroundColor: Colors.gold,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  footerSpacer: {
    flex: 1,
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.whiteAlpha,
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.white,
  },
  nextButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.gold,
    alignItems: 'center',
  },
  nextButtonText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.textDark,
  },
});
