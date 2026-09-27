import { useEffect, useState } from 'react';
import { adsReady, adsReadyValue } from '@shared/lib/ads-ready';

/** True once consent is settled and ads may be requested (see ads-ready.ts). */
export function useAdsReady(): boolean {
  const [ready, setReady] = useState(() => adsReadyValue() === true);
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void adsReady.then((ok) => {
      if (alive) setReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [ready]);
  return ready;
}
