import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { View, Text, Pressable, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import Colors from "@/shared/constants/colors";
import { t } from '@/shared/i18n';
import TutorialModal from '@/components/Tutorial';
import { useAuth } from '@shared/hooks/useAuth';
import { useGuestMode } from '@shared/hooks/useGuestMode';
import { useLanguage } from '@shared/hooks/useLanguage';
import { useEntitlement } from '@shared/hooks/useEntitlement';
import { useRewards } from '@shared/hooks/useRewards';
import { useRewardedAd } from '@shared/hooks/useRewardedAd';
import { useTutorial } from '@shared/hooks/useTutorial';
import { reportAdLoadError, reportAdGiveUp } from '@shared/lib/ad-monitoring';

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID,
    }) ?? TestIds.BANNER;

// Usable dp height (window minus safe areas and container padding) the fixed-dp
// column was designed for. The home screen must fit without scrolling, so on
// shorter screens every size-driving value is multiplied by usable/REF (floored
// at 0.75 so extreme window sizes don't shrink it into illegibility).
const REF_USABLE_HEIGHT = 800;

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const topPadding = Platform.OS === 'web' ? 67 : insets.top;
    const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
    const { height: windowHeight } = useWindowDimensions();
    const usableHeight = windowHeight - topPadding - bottomPadding - 40;
    const scale = Math.max(0.75, Math.min(1, usableHeight / REF_USABLE_HEIGHT));
    const s = useCallback((n: number) => Math.round(n * scale), [scale]);
    const styles = useMemo(() => makeStyles(s), [s]);
    const { isGuest, isLoaded: guestLoaded, disableGuestMode } = useGuestMode();
    const { isPremium } = useEntitlement();
    const rewards = useRewards();
    const { isLoaded: rewardedLoaded, showAd: showRewardedAd } = useRewardedAd({
        onEarned: () => { void rewards.grantSkipPass(); },
        disabled: isPremium || Platform.OS === 'web',
    });
    useLanguage(); // subscribe to language changes so t() output updates

    const { seen, isLoaded: tutorialLoaded, markSeen } = useTutorial();
    const { isLoaded: authLoaded, isSignedIn } = useAuth();
    const [tutorialVisible, setTutorialVisible] = useState(false);
    const autoShownRef = useRef(false);
    useEffect(() => {
        if (autoShownRef.current) return;
        if (tutorialLoaded && authLoaded && guestLoaded && (isSignedIn || isGuest) && !seen) {
            autoShownRef.current = true;
            setTutorialVisible(true);
        }
    }, [tutorialLoaded, authLoaded, guestLoaded, isSignedIn, isGuest, seen]);
    const closeTutorial = () => {
        setTutorialVisible(false);
        if (!seen) void markSeen();
    };

    const handleCreateAccount = async () => {
        await disableGuestMode();
        router.replace('/(auth)/login');
    };

    const canEarnReward = rewards.canEarnMore();
    const cooldownMs = rewards.timeUntilNextRewardMs();
    const showRewardedTile = !isPremium && Platform.OS !== 'web';
    const skipPasses = rewards.skipPasses;
    const rewardedDesc =
        skipPasses === 0
            ? t('rewards.skipPassDescZero')
            : skipPasses === 1
                ? t('rewards.skipPassDescOne')
                : t('rewards.skipPassDescMany', { count: skipPasses });
    const rewardedDisabled = !rewardedLoaded || !canEarnReward;
    const rewardedSubtext = !canEarnReward
        ? t('rewards.coolingDown', { minutes: Math.max(1, Math.ceil(cooldownMs / 60_000)) })
        : !rewardedLoaded
            ? t('rewards.unavailable')
            : rewardedDesc;
    const handleRewardedPress = () => { void showRewardedAd(); };

    return (
        <View style={[styles.container, { paddingTop: topPadding + s(20), paddingBottom: bottomPadding + s(20) }]}>
            <LinearGradient
                colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
                style={StyleSheet.absoluteFill}
            />

            {isGuest && (
                <Pressable style={styles.guestBanner} onPress={handleCreateAccount}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={s(16)} color={Colors.gold} />
                    <Text style={styles.guestBannerText}>{t('home.guestBanner')}</Text>
                    <Text style={styles.guestBannerCta}>{t('auth.createAccount')}</Text>
                </Pressable>
            )}

            <View style={styles.topActions}>
                <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')} testID="settings-btn">
                    <MaterialCommunityIcons name="cog" size={s(22)} color={Colors.textSecondary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => router.push('/stats')} testID="stats-btn">
                    <MaterialCommunityIcons name="chart-bar" size={s(22)} color={Colors.textSecondary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => router.push('/quests')} testID="quests-btn">
                    <MaterialCommunityIcons name="calendar-check" size={s(22)} color={Colors.textSecondary} />
                </Pressable>
                <Pressable style={styles.iconBtn} onPress={() => router.push('/achievements')} testID="achievements-btn">
                    <MaterialCommunityIcons name="trophy-outline" size={s(22)} color={Colors.textSecondary} />
                </Pressable>
            </View>

            <View style={styles.header}>
                <View style={styles.logoContainer}>
                    <MaterialCommunityIcons name="cards-playing" size={s(56)} color={Colors.gold} />
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
                        <MaterialCommunityIcons name="robot" size={s(28)} color={Colors.textDark} />
                    </View>
                    <View style={styles.menuButtonContent}>
                        <Text style={styles.menuButtonTitle}>{t('home.playAI')}</Text>
                        <Text style={styles.menuButtonDesc}>{t('home.playAIDesc')}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={s(24)} color={Colors.textDark} />
                </Pressable>

                <Pressable
                    style={({ pressed }) => [styles.menuButton, styles.secondaryButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                    onPress={() => router.push({ pathname: '/setup', params: { mode: 'online' } })}
                    testID="play-online-btn"
                >
                    <View style={styles.menuButtonIcon}>
                        <MaterialCommunityIcons name="earth" size={s(28)} color={Colors.gold} />
                    </View>
                    <View style={styles.menuButtonContent}>
                        <Text style={styles.menuButtonTitleLight}>{t('home.playOnline')}</Text>
                        <Text style={styles.menuButtonDescLight}>{t('home.playOnlineDesc')}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={s(24)} color={Colors.textSecondary} />
                </Pressable>
            </View>

            <Pressable
                style={({ pressed }) => [styles.practiceButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                onPress={() => router.push({ pathname: '/game', params: { mode: 'ai', practice: '1', difficulty: 'easy', playerCount: '2', playerName: t('setup.defaultName') } })}
                testID="practice-btn"
            >
                <View style={styles.practiceIcon}>
                    <MaterialCommunityIcons name="school" size={s(24)} color={Colors.success} />
                </View>
                <View style={styles.menuButtonContent}>
                    <Text style={styles.practiceTitle}>{t('home.practice')}</Text>
                    <Text style={styles.menuButtonDescLight}>{t('home.practiceDesc')}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={s(20)} color={Colors.textSecondary} />
            </Pressable>

            <Pressable
                style={({ pressed }) => [styles.rulesCard, pressed && { opacity: 0.85 }]}
                onPress={() => setTutorialVisible(true)}
                testID="how-to-play-btn"
            >
                <MaterialCommunityIcons name="book-open-variant" size={s(18)} color={Colors.gold} />
                <Text style={styles.rulesText}>{t('home.rules')}</Text>
                <MaterialCommunityIcons name="chevron-right" size={s(18)} color={Colors.textSecondary} />
            </Pressable>

            {showRewardedTile && (
                <Pressable
                    style={({ pressed }) => [
                        styles.rewardedTile,
                        rewardedDisabled && styles.rewardedTileDisabled,
                        pressed && !rewardedDisabled && { opacity: 0.85, transform: [{ scale: 0.99 }] },
                    ]}
                    onPress={handleRewardedPress}
                    disabled={rewardedDisabled}
                    testID="rewarded-skip-btn"
                >
                    <MaterialCommunityIcons name="gift-outline" size={s(20)} color={Colors.gold} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.rewardedTileTitle}>{t('rewards.skipPassTitle')}</Text>
                        <Text style={styles.rewardedTileSubtext}>{rewardedSubtext}</Text>
                    </View>
                    {skipPasses > 0 && (
                        <View style={styles.rewardedBadge}>
                            <Text style={styles.rewardedBadgeText}>{skipPasses}</Text>
                        </View>
                    )}
                </Pressable>
            )}

            {!isPremium && Platform.OS !== 'web' && (
                <View style={styles.bannerContainer}>
                    <BannerAd
                        unitId={BANNER_AD_UNIT_ID}
                        size={BannerAdSize.BANNER}
                        onAdFailedToLoad={(error) => {
                            // No retry for the banner — one failure is the give-up.
                            reportAdLoadError('banner', error);
                            reportAdGiveUp('banner', error);
                        }}
                    />
                </View>
            )}

            <View style={styles.footer}>
                <View style={styles.footerDivider} />
                <View style={styles.footerContent}>
                    <View style={styles.footerItem}>
                        <MaterialCommunityIcons name="cards" size={s(16)} color={Colors.textSecondary} />
                        <Text style={styles.footerText}>{t('home.cards')}</Text>
                    </View>
                    <View style={styles.footerDot} />
                    <View style={styles.footerItem}>
                        <MaterialCommunityIcons name="account-group" size={s(16)} color={Colors.textSecondary} />
                        <Text style={styles.footerText}>{t('home.modes')}</Text>
                    </View>
                    <View style={styles.footerDot} />
                    <View style={styles.footerItem}>
                        <MaterialCommunityIcons name="trophy" size={s(16)} color={Colors.textSecondary} />
                        <Text style={styles.footerText}>{t('home.winTarget')}</Text>
                    </View>
                </View>
            </View>

            <TutorialModal visible={tutorialVisible} onClose={closeTutorial} />
        </View>
    )
}


// The BannerAd is intentionally excluded from scaling — AdMob banners render at
// a fixed 320x50, so only its margin shrinks.
const makeStyles = (s: (n: number) => number) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingHorizontal: s(24),
    },
    topActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: s(8),
        marginBottom: s(8),
    },
    iconBtn: {
        width: s(40),
        height: s(40),
        borderRadius: s(20),
        backgroundColor: Colors.whiteAlpha,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: s(40),
    },
    logoContainer: {
        width: s(96),
        height: s(96),
        borderRadius: s(48),
        backgroundColor: Colors.whiteAlpha,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: s(16),
        borderWidth: 2,
        borderColor: Colors.gold,
    },
    title: {
        fontSize: s(44),
        fontFamily: 'Inter_700Bold',
        color: Colors.gold,
        letterSpacing: 2,
    },
    subtitle: {
        fontSize: s(14),
        fontFamily: 'Inter_400Regular',
        color: Colors.textSecondary,
        marginTop: s(4),
    },
    menuContainer: {
        gap: s(14),
        marginBottom: s(28),
    },
    menuButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: s(18),
        paddingHorizontal: s(16),
        borderRadius: s(16),
        gap: s(14),
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
        width: s(48),
        height: s(48),
        borderRadius: s(14),
        backgroundColor: 'rgba(0,0,0,0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    menuButtonContent: {
        flex: 1,
    },
    menuButtonTitle: {
        fontSize: s(18),
        fontFamily: 'Inter_700Bold',
        color: Colors.textDark,
    },
    menuButtonTitleLight: {
        fontSize: s(18),
        fontFamily: 'Inter_700Bold',
        color: Colors.white,
    },
    menuButtonDesc: {
        fontSize: s(12),
        fontFamily: 'Inter_400Regular',
        color: 'rgba(0,0,0,0.5)',
        marginTop: 2,
    },
    menuButtonDescLight: {
        fontSize: s(12),
        fontFamily: 'Inter_400Regular',
        color: Colors.textSecondary,
        marginTop: 2,
    },
    practiceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: s(14),
        paddingHorizontal: s(16),
        borderRadius: s(14),
        gap: s(14),
        backgroundColor: 'rgba(46, 125, 50, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(46, 125, 50, 0.5)',
        marginBottom: s(14),
    },
    practiceIcon: {
        width: s(44),
        height: s(44),
        borderRadius: s(12),
        backgroundColor: 'rgba(0,0,0,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    practiceTitle: {
        fontSize: s(16),
        fontFamily: 'Inter_700Bold',
        color: Colors.white,
    },
    rulesCard: {
        flexDirection: 'row',
        backgroundColor: Colors.whiteAlpha2,
        borderRadius: s(12),
        padding: s(14),
        gap: s(10),
        alignItems: 'flex-start',
        marginBottom: s(28),
    },
    rulesText: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: s(13),
        fontFamily: 'Inter_400Regular',
        lineHeight: s(20),
    },
    footer: {
        marginTop: 'auto',
    },
    footerDivider: {
        height: 1,
        backgroundColor: Colors.whiteAlpha,
        marginBottom: s(16),
    },
    footerContent: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: s(12),
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
        fontSize: s(12),
        fontFamily: 'Inter_500Medium',
    },
    guestBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(8),
        backgroundColor: Colors.whiteAlpha,
        borderWidth: 1,
        borderColor: Colors.gold,
        borderRadius: s(10),
        paddingVertical: s(10),
        paddingHorizontal: s(14),
        marginBottom: s(12),
    },
    guestBannerText: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: s(12),
        fontFamily: 'Inter_400Regular',
    },
    guestBannerCta: {
        color: Colors.gold,
        fontSize: s(12),
        fontFamily: 'Inter_600SemiBold',
    },
    bannerContainer: {
        alignItems: 'center',
        marginBottom: s(8),
    },
    rewardedTile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(12),
        backgroundColor: Colors.whiteAlpha2,
        borderWidth: 1,
        borderColor: Colors.whiteAlpha,
        borderRadius: s(12),
        paddingVertical: s(12),
        paddingHorizontal: s(14),
        marginBottom: s(12),
    },
    rewardedTileDisabled: {
        opacity: 0.5,
    },
    rewardedTileTitle: {
        color: Colors.white,
        fontSize: s(13),
        fontFamily: 'Inter_600SemiBold',
    },
    rewardedTileSubtext: {
        color: Colors.textSecondary,
        fontSize: s(11),
        fontFamily: 'Inter_400Regular',
        marginTop: 2,
    },
    rewardedBadge: {
        backgroundColor: Colors.gold,
        minWidth: s(24),
        height: s(24),
        borderRadius: s(12),
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: s(8),
    },
    rewardedBadgeText: {
        color: Colors.textDark,
        fontSize: s(12),
        fontFamily: 'Inter_700Bold',
    },
});
