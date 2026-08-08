import { useWindowDimensions } from 'react-native';

/**
 * Widest a column of content is allowed to get. Past this, a settings row or a
 * form field stops reading as a control and starts reading as a stretched bar —
 * which is what every screen did once `ios.supportsTablet` was turned on.
 */
export const CONTENT_MAX_WIDTH = 480;

/**
 * Horizontal padding that keeps content centred and readable on wide screens.
 *
 * Deliberately padding rather than a `maxWidth` wrapper: every screen already
 * sets `paddingHorizontal` on its root container, so this is a one-value
 * override instead of an extra nesting level in fourteen files. The full-bleed
 * background gradients keep working because they use `absoluteFill`, which
 * ignores padding.
 *
 * The game screen is intentionally not a consumer — its table is meant to use
 * the whole width, and card sizes are handled by `useCardMetrics`.
 */
export function useContentPadding(base: number): number {
  const { width } = useWindowDimensions();
  return Math.max(base, Math.round((width - CONTENT_MAX_WIDTH) / 2));
}
