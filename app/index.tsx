import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, Platform, useWindowDimensions } from "react-native";
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import Colors from "@/shared/constants/colors";
import { useContentPadding } from "@shared/hooks/useContentPadding";
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
import { setPendingAuthMode } from '@shared/lib/auth-nav-intent';

const BANNER_AD_UNIT_ID = __DEV__
  ? TestIds.BANNER
  : Platform.select({
      ios: process.env.EXPO_PUBLIC_ADMOB_BANNER_IOS,
      android: process.env.EXPO_PUBLIC_ADMOB_BANNER_ANDROID,
    }) ?? TestIds.BANNER;

// Usable dp height (window minus safe areas and container padding) this column
// was laid out for. Shorter screens compress towards `MIN_AIR_SCALE`.
const REF_USABLE_HEIGHT = 800;

/**
 * How far the vertical air may compress on a short screen.
 *
 * This used to be 0.75 and it scaled *everything* — type, icons and touch
 * targets included — which shrank the buttons on any phone that was merely a
 * bit short, and still overflowed on a small one, where the screen had no
 * ScrollView and simply cut the content off. The screen scrolls now, so
 * compression only has to keep the primary buttons above the fold; it does not
 * have to make the whole column fit, and it can go further when it helps.
 */
const MIN_AIR_SCALE = 0.6;

export default function HomeScreen() {
    const insets = useSafeAreaInsets();
    const topPadding = Platform.OS === 'web' ? 67 : insets.top;
    const bottomPadding = Platform.OS === 'web' ? 34 : insets.bottom;
    const { height: windowHeight } = useWindowDimensions();
    const contentPadding = useContentPadding(24);
    const usableHeight = windowHeight - topPadding - bottomPadding - 40;
    const scale = Math.max(MIN_AIR_SCALE, Math.min(1, usableHeight / REF_USABLE_HEIGHT));
    // Vertical air and the decorative header only. Font sizes, icons inside
    // controls and touch targets stay at full size on every device: a button is
    // no easier to read or hit on a small phone for having been shrunk, and the
    // screen scrolls if the result does not fit.
    const air = useCallback((n: number) => Math.round(n * scale), [scale]);
    const styles = useMemo(() => makeStyles(air), [air]);
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
        setPendingAuthMode('signup');
        await disableGuestMode();
        // AuthGuard detects isGuest=false outside the auth group and
        // navigates to login, consuming the pending mode set above.
    };

    const handleSignIn = async () => {
        setPendingAuthMode('signin');
        await disableGuestMode();
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
        <View style={styles.root}>
            <LinearGradient
                colors={[Colors.backgroundDark, Colors.background, Colors.backgroundDark]}
                style={StyleSheet.absoluteFill}
            />

            {/* `flexGrow: 1` on the content keeps the tall-screen layout exactly as
                it was — the footer's `marginTop: 'auto'` still pins it to the
                bottom. On a short screen the column scrolls instead of being
                clipped, which is what left the small phone unable to reach the
                rewarded tile or the footer at all. */}
            <ScrollView
                contentContainerStyle={[styles.content, {
                    paddingTop: topPadding + air(20),
                    paddingBottom: bottomPadding + air(20),
                    paddingHorizontal: contentPadding,
                }]}
                showsVerticalScrollIndicator={false}
            >
                {isGuest && (
                    <View style={styles.guestBanner}>
                        <View style={styles.guestBannerRow}>
                            <MaterialCommunityIcons name="alert-circle-outline" size={16} color={Colors.gold} />
                            <Text style={styles.guestBannerText}>{t('home.guestBanner')}</Text>
                        </View>
                        <View style={styles.guestBannerActions}>
                            <Pressable onPress={handleSignIn} hitSlop={8}>
                                <Text style={styles.guestBannerCta}>{t('auth.signIn')}</Text>
                            </Pressable>
                            <Text style={styles.guestBannerDivider}>·</Text>
                            <Pressable onPress={handleCreateAccount} hitSlop={8}>
                                <Text style={styles.guestBannerCta}>{t('auth.createAccount')}</Text>
                            </Pressable>
                        </View>
                    </View>
                )}

                <View style={styles.topActions}>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/settings')} testID="settings-btn">
                        <MaterialCommunityIcons name="cog" size={22} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/stats')} testID="stats-btn">
                        <MaterialCommunityIcons name="chart-bar" size={22} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/quests')} testID="quests-btn">
                        <MaterialCommunityIcons name="calendar-check" size={22} color={Colors.textSecondary} />
                    </Pressable>
                    <Pressable style={styles.iconBtn} onPress={() => router.push('/achievements')} testID="achievements-btn">
                        <MaterialCommunityIcons name="trophy-outline" size={22} color={Colors.textSecondary} />
                    </Pressable>
                </View>

                <View style={styles.header}>
                    <View style={styles.logoContainer}>
                        {/* The logo and the wordmark are the only *content* that
                            compresses: together they are ~160dp of pure brand on a
                            screen whose job is to start a game. */}
                        <MaterialCommunityIcons name="cards-playing" size={air(56)} color={Colors.gold} />
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

                <Pressable
                    style={({ pressed }) => [styles.practiceButton, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
                    onPress={() => router.push({ pathname: '/game', params: { mode: 'ai', practice: '1', difficulty: 'easy', playerCount: '2', playerName: t('setup.defaultName') } })}
                    testID="practice-btn"
                >
                    <View style={styles.practiceIcon}>
                        <MaterialCommunityIcons name="school" size={24} color={Colors.success} />
                    </View>
                    <View style={styles.menuButtonContent}>
                        <Text style={styles.practiceTitle}>{t('home.practice')}</Text>
                        <Text style={styles.menuButtonDescLight}>{t('home.practiceDesc')}</Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color={Colors.textSecondary} />
                </Pressable>

                <Pressable
                    style={({ pressed }) => [styles.rulesCard, pressed && { opacity: 0.85 }]}
                    onPress={() => setTutorialVisible(true)}
                    testID="how-to-play-btn"
                >
                    <MaterialCommunityIcons name="book-open-variant" size={18} color={Colors.gold} />
                    <Text style={styles.rulesText}>{t('home.rules')}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color={Colors.textSecondary} />
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
                        <MaterialCommunityIcons name="gift-outline" size={20} color={Colors.gold} />
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
            </ScrollView>

            <TutorialModal visible={tutorialVisible} onClose={closeTutorial} />
        </View>
    )
}


// `air()` compresses vertical rhythm and the brand header on short screens.
// Everything else is a fixed dp value on purpose: font sizes, the icons inside
// controls, and anything that is a touch target. The BannerAd is untouched
// either way — AdMob banners render at a fixed 320x50, so only its margin moves.
const makeStyles = (air: (n: number) => number) => StyleSheet.create({
    root: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    content: {
        flexGrow: 1,
    },
    topActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 8,
        marginBottom: air(8),
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
        marginBottom: air(40),
    },
    logoContainer: {
        width: air(96),
        height: air(96),
        borderRadius: air(48),
        backgroundColor: Colors.whiteAlpha,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: air(16),
        borderWidth: 2,
        borderColor: Colors.gold,
    },
    title: {
        fontSize: air(44),
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
        gap: air(14),
        marginBottom: air(28),
    },
    menuButton: {
        flexDirection: 'row',
        alignItems: 'center',
        // Only the padding compresses; the 48dp icon inside keeps the button a
        // comfortable target however short the screen is.
        paddingVertical: air(18),
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
    practiceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: air(14),
        paddingHorizontal: 16,
        borderRadius: 14,
        gap: 14,
        backgroundColor: 'rgba(46, 125, 50, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(46, 125, 50, 0.5)',
        marginBottom: air(14),
    },
    practiceIcon: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(0,0,0,0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    practiceTitle: {
        fontSize: 16,
        fontFamily: 'Inter_700Bold',
        color: Colors.white,
    },
    rulesCard: {
        flexDirection: 'row',
        backgroundColor: Colors.whiteAlpha2,
        borderRadius: 12,
        padding: 14,
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: air(28),
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
        paddingTop: air(16),
    },
    footerDivider: {
        height: 1,
        backgroundColor: Colors.whiteAlpha,
        marginBottom: air(16),
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
        gap: 6,
        backgroundColor: Colors.whiteAlpha,
        borderWidth: 1,
        borderColor: Colors.gold,
        borderRadius: 10,
        paddingVertical: air(10),
        paddingHorizontal: 14,
        marginBottom: air(12),
    },
    guestBannerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    guestBannerText: {
        flex: 1,
        color: Colors.textSecondary,
        fontSize: 12,
        fontFamily: 'Inter_400Regular',
    },
    guestBannerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 24,
    },
    guestBannerCta: {
        color: Colors.gold,
        fontSize: 12,
        fontFamily: 'Inter_600SemiBold',
    },
    guestBannerDivider: {
        color: Colors.textSecondary,
        fontSize: 12,
    },
    bannerContainer: {
        alignItems: 'center',
        marginBottom: air(8),
    },
    rewardedTile: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: Colors.whiteAlpha2,
        borderWidth: 1,
        borderColor: Colors.whiteAlpha,
        borderRadius: 12,
        paddingVertical: air(12),
        paddingHorizontal: 14,
        marginBottom: air(12),
    },
    rewardedTileDisabled: {
        opacity: 0.5,
    },
    rewardedTileTitle: {
        color: Colors.white,
        fontSize: 13,
        fontFamily: 'Inter_600SemiBold',
    },
    rewardedTileSubtext: {
        color: Colors.textSecondary,
        fontSize: 11,
        fontFamily: 'Inter_400Regular',
        marginTop: 2,
    },
    rewardedBadge: {
        backgroundColor: Colors.gold,
        minWidth: 24,
        height: 24,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 8,
    },
    rewardedBadgeText: {
        color: Colors.textDark,
        fontSize: 12,
        fontFamily: 'Inter_700Bold',
    },
});
