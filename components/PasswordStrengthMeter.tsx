import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import {
  validatePassword,
  passwordStrengthScore,
  PASSWORD_RULE_IDS,
  MIN_PASSWORD_LENGTH,
  type PasswordRuleId,
  type PasswordContext,
} from '@shared/lib/validation/password';

interface Props {
  password: string;
  context?: PasswordContext;
}

// Index by strength score (0..4). 0 and 1 both read as "Weak".
const STRENGTH_LEVELS = [
  { labelKey: 'auth.pwStrengthWeak', color: Colors.dangerText },
  { labelKey: 'auth.pwStrengthWeak', color: Colors.dangerText },
  { labelKey: 'auth.pwStrengthFair', color: Colors.gold },
  { labelKey: 'auth.pwStrengthGood', color: Colors.goldLight },
  { labelKey: 'auth.pwStrengthStrong', color: Colors.successText },
] as const;

const SEGMENTS = 4;

function ruleLabel(id: PasswordRuleId): string {
  switch (id) {
    case 'minLength':
      return t('auth.pwRuleMinLength', { count: MIN_PASSWORD_LENGTH });
    case 'lower':
      return t('auth.pwRuleLower');
    case 'upper':
      return t('auth.pwRuleUpper');
    case 'number':
      return t('auth.pwRuleNumber');
    case 'noPersonal':
      return t('auth.pwRuleNoPersonal');
  }
}

/**
 * Live password feedback: a strength bar plus a checklist of the deterministic
 * rules. Reads the exact same policy the server enforces
 * (shared/lib/validation/password.ts), so the meter can never disagree with the
 * gate. Renders nothing until the user starts typing.
 */
export default function PasswordStrengthMeter({ password, context }: Props) {
  useLanguage(); // re-render on language change so labels stay localized

  if (!password) return null;

  const { failed } = validatePassword(password, context);
  const failedSet = new Set(failed);
  const score = passwordStrengthScore(password);
  const level = STRENGTH_LEVELS[score];

  return (
    <View style={styles.container}>
      <View style={styles.barRow}>
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.segment,
              { backgroundColor: i < score ? level.color : Colors.whiteAlpha },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.strengthLabel, { color: level.color }]}>
        {t('auth.pwStrengthLabel')}: {t(level.labelKey)}
      </Text>

      <View style={styles.checklist}>
        {PASSWORD_RULE_IDS.map((id) => {
          const passed = !failedSet.has(id);
          return (
            <View key={id} style={styles.ruleRow}>
              <MaterialCommunityIcons
                name={passed ? 'check-circle' : 'circle-outline'}
                size={16}
                color={passed ? Colors.successText : Colors.textSecondary}
              />
              <Text style={[styles.ruleText, passed && styles.ruleTextPassed]}>
                {ruleLabel(id)}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 8, marginTop: -4 },
  barRow: { flexDirection: 'row', gap: 6 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  strengthLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  checklist: { gap: 5 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { fontSize: 12, fontFamily: 'Inter_400Regular', color: Colors.textSecondary },
  ruleTextPassed: { color: Colors.white },
});
