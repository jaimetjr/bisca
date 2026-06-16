import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RewardsState } from '../lib/rewards/types';
import {
  EMPTY_REWARDS_STATE,
  canEarnMore as canEarnMorePure,
  consumeSkipPass as consumeSkipPassPure,
  grantSkipPass as grantSkipPassPure,
  timeUntilNextRewardMs as timeUntilNextRewardMsPure,
} from '../lib/rewards/grant';

const STORAGE_KEY = 'bisca:rewards:v1';

interface RewardsCtx {
  skipPasses: number;
  canEarnMore: () => boolean;
  timeUntilNextRewardMs: () => number;
  /** Persist a granted skip pass — call from rewarded-ad EARNED_REWARD callback. */
  grantSkipPass: () => Promise<void>;
  /** Returns true if a pass was consumed; the caller should suppress its ad. */
  consumeSkipPass: () => Promise<boolean>;
}

const RewardsContext = createContext<RewardsCtx>({
  skipPasses: 0,
  canEarnMore: () => true,
  timeUntilNextRewardMs: () => 0,
  grantSkipPass: async () => undefined,
  consumeSkipPass: async () => false,
});

async function loadFromStorage(): Promise<RewardsState> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_REWARDS_STATE;
    const parsed = JSON.parse(raw) as Partial<RewardsState>;
    return {
      skipPasses: typeof parsed.skipPasses === 'number' ? parsed.skipPasses : 0,
      recentRewardTimestamps: Array.isArray(parsed.recentRewardTimestamps)
        ? parsed.recentRewardTimestamps.filter((n) => typeof n === 'number')
        : [],
    };
  } catch {
    return EMPTY_REWARDS_STATE;
  }
}

async function saveToStorage(state: RewardsState): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore — non-fatal
  }
}

export function RewardsProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<RewardsState>(EMPTY_REWARDS_STATE);
  // Authoritative copy used by the imperative grant/consume APIs.
  // Avoids stale-closure issues when callbacks fire from outside React.
  const stateRef = useRef<RewardsState>(EMPTY_REWARDS_STATE);
  stateRef.current = state;

  useEffect(() => {
    let mounted = true;
    loadFromStorage().then((loaded) => {
      if (mounted) {
        stateRef.current = loaded;
        setState(loaded);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const grantSkipPass = useCallback(async () => {
    const next = grantSkipPassPure(stateRef.current);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
    await saveToStorage(next);
  }, []);

  const consumeSkipPass = useCallback(async (): Promise<boolean> => {
    const result = consumeSkipPassPure(stateRef.current);
    if (!result.consumed) return false;
    stateRef.current = result.state;
    setState(result.state);
    await saveToStorage(result.state);
    return true;
  }, []);

  const canEarnMore = useCallback(() => canEarnMorePure(state), [state]);
  const timeUntilNextRewardMs = useCallback(() => timeUntilNextRewardMsPure(state), [state]);

  return (
    <RewardsContext.Provider
      value={{
        skipPasses: state.skipPasses,
        canEarnMore,
        timeUntilNextRewardMs,
        grantSkipPass,
        consumeSkipPass,
      }}
    >
      {children}
    </RewardsContext.Provider>
  );
}

export function useRewards(): RewardsCtx {
  return useContext(RewardsContext);
}
