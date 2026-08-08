import { createContext, useContext, useMemo } from 'react';
import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { computeCardMetrics, CardMetrics } from '@shared/lib/brisca/card-metrics';

/**
 * Card sizes for the current viewport.
 *
 * `GameScreen` computes the metrics itself — it is the only place that knows
 * whether practice mode is on, and the coach banner eats 41dp of table height —
 * then publishes them through `CardMetricsProvider`. Cards rendered outside that
 * tree (the tutorial, for instance) fall back to metrics derived from the window.
 */
const CardMetricsContext = createContext<CardMetrics | null>(null);

/** Mirrors the padding GameScreen applies, so both agree on the usable height. */
function useUsableViewport() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const top = Platform.OS === 'web' ? 67 : insets.top;
  const bottom = Platform.OS === 'web' ? 34 : insets.bottom;
  return { width, height: height - top - bottom };
}

/** Derives metrics from the live viewport. Use when you need to *publish* them. */
export function useComputedCardMetrics(
  reserveCoachBanner?: boolean,
  playerCount?: number,
  extraTableHeight?: number,
): CardMetrics {
  const { width, height } = useUsableViewport();
  return useMemo(
    () => computeCardMetrics({ width, height, reserveCoachBanner, playerCount, extraTableHeight }),
    [width, height, reserveCoachBanner, playerCount, extraTableHeight],
  );
}

export function CardMetricsProvider({
  value,
  children,
}: {
  value: CardMetrics;
  children: React.ReactNode;
}) {
  return <CardMetricsContext.Provider value={value}>{children}</CardMetricsContext.Provider>;
}

/** Reads the published metrics, falling back to the window when there's no provider. */
export function useCardMetrics(): CardMetrics {
  const provided = useContext(CardMetricsContext);
  const fallback = useComputedCardMetrics();
  return provided ?? fallback;
}
