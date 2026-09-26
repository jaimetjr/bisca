import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, TextInput, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Colors from '@/shared/constants/colors';
import { t } from '@/shared/i18n';
import { useLanguage } from '@shared/hooks/useLanguage';
import { useAuth } from '@shared/hooks/useAuth';
import { getApiUrl } from '@shared/query-client';
import { friendlyApiError } from '@/shared/lib/api-errors';

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function DeleteAccountModal({ visible, onClose }: DeleteAccountModalProps) {
  useLanguage(); // subscribe to language changes so t() output updates
  const { getToken, signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (visible) {
      setPassword('');
      setError('');
      setDeleting(false);
    }
  }, [visible]);

  const handleDelete = async () => {
    setError('');
    if (!password) {
      setError(t('settings.deleteAccountPassword'));
      return;
    }
    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${getApiUrl()}api/users/me`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(friendlyApiError(data));
        return;
      }
      // Account gone — clear the local session and return to login.
      await signOut();
      onClose();
      router.replace('/(auth)/login');
    } catch {
      setError(t('settings.deleteAccountError'));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      {/* Scrolls rather than clips: this card is ~460dp of icon, body text,
          password field and two buttons, and on a small phone the keyboard
          takes half the screen the moment the field is focused. `flexGrow: 1`
          keeps it centred while it fits. */}
      <ScrollView
        style={styles.overlay}
        contentContainerStyle={styles.overlayContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card} testID="delete-account-modal">
          <View style={styles.iconCircle}>
            <MaterialCommunityIcons name="alert-outline" size={30} color={Colors.dangerText} />
          </View>
          <Text style={styles.title}>{t('settings.deleteAccountTitle')}</Text>
          <Text style={styles.body}>{t('settings.deleteAccountBody')}</Text>

          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('settings.deleteAccountPassword')}
            placeholderTextColor={Colors.textSecondary}
            secureTextEntry
            autoCapitalize="none"
            testID="delete-account-password"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.85 }, deleting && { opacity: 0.6 }]}
            onPress={handleDelete}
            disabled={deleting}
            testID="delete-account-confirm-btn"
          >
            {deleting
              ? <ActivityIndicator color={Colors.white} />
              : <Text style={styles.deleteBtnText}>{t('settings.deleteAccountConfirm')}</Text>}
          </Pressable>

          <Pressable
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.7 }]}
            onPress={onClose}
            disabled={deleting}
            testID="delete-account-cancel-btn"
          >
            <Text style={styles.cancelBtnText}>{t('settings.cancel')}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: Colors.overlay,
  },
  overlayContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: Colors.backgroundDark,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.danger,
    padding: 24,
    alignItems: 'center',
    gap: 14,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(198, 40, 40, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 21,
  },
  input: {
    width: '100%',
    backgroundColor: Colors.whiteAlpha2,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
    color: Colors.white,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  error: {
    color: Colors.dangerText,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
  },
  deleteBtn: {
    width: '100%',
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    color: Colors.white,
  },
  cancelBtn: {
    paddingVertical: 6,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    color: Colors.textSecondary,
  },
});
