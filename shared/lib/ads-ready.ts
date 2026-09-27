// Settles once the consent step in app/_layout.tsx has finished: true when ads
// may be requested (and the SDK is initialised), false when they may not. Ad
// loads wait on this so no request goes out while the EEA consent form is still
// up. Never settles on web, where nothing loads anyway.

let settle: (canRequestAds: boolean) => void = () => {};
let settled: boolean | undefined;

export const adsReady: Promise<boolean> = new Promise((resolve) => {
  settle = resolve;
});

export function resolveAdsReady(canRequestAds: boolean): void {
  if (settled !== undefined) return;
  settled = canRequestAds;
  settle(canRequestAds);
}

/** Synchronous peek for first render; undefined until settled. */
export function adsReadyValue(): boolean | undefined {
  return settled;
}
