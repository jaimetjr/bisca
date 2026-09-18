/**
 * Decides whether it's safe to warm the whole card deck's decoded bitmaps into
 * memory on boot, versus only the backs (see `app/_layout.tsx`). A production
 * device crashed with `OutOfMemoryError` on a 128MB Android heap class — well
 * under the ~100MB the full deck costs once decoded — even though the device
 * itself had 7.6GB of RAM. Total device RAM is not the right signal; the
 * per-app heap ceiling (`react-native-device-info`'s `getMaxMemory()`) is.
 */
export const MIN_HEAP_MB_FOR_FULL_PRELOAD = 192;

export function shouldPreloadFullDeck(maxMemoryMB: number | null): boolean {
  if (maxMemoryMB === null) return false;
  return maxMemoryMB >= MIN_HEAP_MB_FOR_FULL_PRELOAD;
}
