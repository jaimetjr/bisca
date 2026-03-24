import React from "react";
import { View, Text, Pressable, StyleSheet, Platform } from "react-native";
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from "@/shared/constants/colors";
import { t } from '@/shared/i18n';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { useLanguage } from '@shared/hooks/useLanguage';

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const topPadding = Platform.OS === 'web' ? 67 : insets.top;
    const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
    const { isGuest, disableGuestMode } = useGuestMode();
    useLanguage(); // subscribe to language changes so t() output updates

    const handleCreateAccount = async () => {
        await disableGuestMode();
        router.replace('/(auth)/login');
    };

    return (
        <View style={[styles.container, { paddingTop: topPadding + 20, paddingBottom: bottomPadding + 20 }]}>
            <LinearGradient
                colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
                style={StyleSheet.absoluteFill}
            />

            {isGuest && (
                <Pressable style={styles.guestBanner} onPress={handleCreateAccount}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.gold} />
                    <Text style={styles.guestBannerText}>Playing as Guest — stats won't be saved.</Text>
                    <Text style={styles.guestBannerCta}>Create Account</Text>
                </Pressable>
            )}

            <View style={styles.topActions}>
                <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')} testID="settings-btn">
                    <MaterialCommunityIcons name="cog" size={22} color={Colors.textSecondary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => router.push('/stats')} testID="stats-btn">
                    <MaterialCommunityIcons name="chart-bar" size={22} color={Colors.textSecondary} />
                </Pressable>
            </View>

            <View style={styles.header}>
                <View style={styles.logoContainer}>
                    <MaterialCommunityIcons name="cards-playing" size={56} color={Colors.gold} />
                </View>
                <Text style={styles.title}>{t('home.title')}</Text>
                <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
            </View>

            <View style={styles.menuContainer}>
                <Pressable
                    style={({ pressed }) => [styles.menuButton, styles.primaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                    onPress={() => router.push({ pathname: '/setup', params: { mode: 'ai' } })}
                    testID="play-ai-btn"
                >
                    <View style={styles.menuButtonIcon}>
                        <MaterialCommunityIcons name="robot" size={28} color={Colors.textDark} />
                    </View>
                    <View style={styles.menuButtonContent}>
                        <Text style={styles.menuButtonTitle}>{t('home.playAI')}</Text>
                        <Text style={styles.menuButtonDesc}>{t('home.playAIDesc')}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textDark} />
                </Pressable>

                <Pressable
                    style={({ pressed }) => [styles.menuButton, styles.secondaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                    onPress={() => router.push({ pathname: '/setup', params: { mode: 'online' } })}
                    testID="play-online-btn"
                >
                    <View style={styles.menuButtonIcon}>
                        <MaterialCommunityIcons name="earth" size={28} color={Colors.gold} />
                    </View>
                    <View style={styles.menuButtonContent}>
                        <Text style={styles.menuButtonTitleLight}>{t('home.playOnline')}</Text>
                        <Text style={styles.menuButtonDescLight}>{t('home.playOnlineDesc')}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={Colors.textSecondary} />
                </Pressable>
            </View>

            <View style={styles.rulesCard}>
                <MaterialCommunityIcons name="information-outline" size={18} color={Colors.gold} />
                <Text style={styles.rulesText}>{t('home.rules')}</Text>
            </View>

            <View style={styles.footer}>
                <View style={styles.footerDivider} />
                <View style={styles.footerContent}>
                    <View style={styles.footerItem}>
                        <MaterialCommunityIcons name="cards" size={16} color={Colors.textSecondary} />
                        <Text style={styles.footerText}>{t('home.cards')}</Text>
                    </View>
                    <View style={styles.footerDot} />
                    <View style={styles.footerItem}>
                        <MaterialCommunityIcons name="account-group" size={16} color={Colors.textSecondary} />
                        <Text style={styles.footerText}>{t('home.modes')}</Text>
                    </View>
                    <View style={styles.footerDot} />
                    <View style={styles.footerItem}>
                        <MaterialCommunityIcons name="trophy" size={16} color={Colors.textSecondary} />
                        <Text style={styles.footerText}>{t('home.winTarget')}</Text>
                    </View>
                </View>
            </View>
        </View>
    )
}


const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingHorizontal: 24,
    },
    topActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginBottom: 8,
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: Colors.whiteAlpha,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    logoContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        backgroundColor: Colors.whiteAlpha,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
        borderWidth: 2,
        borderColor: Colors.gold,
    },
    title: {
        fontSize: 44,
        fontFamily: 'Inter_700Bold',
        color: Colors.gold,
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
        color: Colors.textSecondary,
        marginTop: 4,
    },
    menuContainer: {
        gap: 14,
        marginBottom: 28,
    },
    menuButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 18,
        paddingHorizontal: 16,
        borderRadius: 16,
        gap: 14,
    },
    primaryButton: {
        backgroundColor: Colors.gold,
        shadowColor: Colors.gold,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 12,
        elevation: 6,
    },
    secondaryButton: {
        backgroundColor: Colors.whiteAlpha,
        borderWidth: 1,
        borderColor: Colors.whiteAlpha,
    },
    menuButtonIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: 'rgba(0,0,0,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuButtonContent: {
        flex: 1,
    },
    menuButtonTitle: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: Colors.textDark,
    },
    menuButtonTitleLight: {
        fontSize: 18,
        fontFamily: 'Inter_700Bold',
        color: Colors.white,
    },
    menuButtonDesc: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        color: 'rgba(0,0,0,0.5)',
        marginTop: 2,
    },
    menuButtonDescLight: {
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
        color: Colors.textSecondary,
        marginTop: 2,
    },
    rulesCard: {
        flexDirection: 'row',
        backgroundColor: Colors.whiteAlpha2,
        borderRadius: 12,
        padding: 14,
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 28,
    },
    rulesText: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: 13,
        fontFamily: 'Inter_400Regular',
        lineHeight: 20,
    },
    footer: {
        marginTop: 'auto',
    },
    footerDivider: {
        height: 1,
        backgroundColor: Colors.whiteAlpha,
        marginBottom: 16,
    },
    footerContent: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    footerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    footerDot: {
        width: 3,
        height: 3,
        borderRadius: 1.5,
        backgroundColor: Colors.textSecondary,
    },
    footerText: {
        color: Colors.textSecondary,
        fontSize: 12,
        fontFamily: 'Inter_500Medium',
    },
    guestBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.whiteAlpha,
        borderWidth: 1,
        borderColor: Colors.gold,
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 14,
        marginBottom: 12,
    },
    guestBannerText: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
    },
    guestBannerCta: {
        color: Colors.gold,
        fontSize: 12,
        fontFamily: 'Inter_600SemiBold',
    },
});
