import React from 'react';
import { View, Text, StyleSheet, Platform, Pressable, ScrollView } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/shared/constants/colors';
import { useContentPadding } from '@shared/hooks/useContentPadding';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';

/**
 * Third-party attribution. Only the row labels are translated — author names and
 * license names are proper nouns and stay as published.
 *
 * `docs/licenses/README.md` is the authoritative record; keep the two in sync.
 */
const ENTRIES: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; labelKey: string; detail: string }[] = [
  { icon: 'cards', labelKey: 'credits.cards', detail: 'Baraja española — licensed stock illustration' },
  { icon: 'card-bulleted-outline', labelKey: 'credits.cardBack', detail: 'Original artwork — © Bisca' },
  { icon: 'format-font', labelKey: 'credits.font', detail: 'Inter by Rasmus Andersson — SIL Open Font License 1.1' },
  { icon: 'shape-outline', labelKey: 'credits.icons', detail: 'Material Design Icons — Apache License 2.0' },
];

export default function CreditsScreen() {
  useLanguage(); // re-render when the language changes
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
  const contentPadding = useContentPadding(24);

  return (
    <View style={[styles.container, { paddingTop: topPadding + 16, paddingBottom: bottomPadding + 20, paddingHorizontal: contentPadding }]}>
      <LinearGradient
        colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={() => router.back()} testID="credits-back">
          <MaterialCommunityIcons name="arrow-left" size={24} color={Colors.white} />
        </Pressable>
        <Text style={styles.title}>{t('credits.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {ENTRIES.map((entry) => (
          <View key={entry.labelKey} style={styles.card}>
            <View style={styles.cardHead}>
              <MaterialCommunityIcons name={entry.icon} size={18} color={Colors.gold} />
              <Text style={styles.cardLabel}>{t(entry.labelKey)}</Text>
            </View>
            <Text style={styles.cardDetail}>{entry.detail}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background, paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
  backButton: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center', marginLeft: -8 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: Colors.gold },
  scrollContent: { paddingBottom: 24, gap: 8 },
  card: { backgroundColor: Colors.whiteAlpha, borderRadius: 14, padding: 16, gap: 6 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: Colors.white },
  cardDetail: { fontSize: 13, fontFamily: 'Inter_400Regular', color: Colors.textSecondary, lineHeight: 19 },
});
