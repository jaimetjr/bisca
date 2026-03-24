import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AIDifficulty } from '../lib/types';

const SETTINGS_KEY = '@bisca:settings';

export interface AppSettings {
  aiDifficulty: AIDifficulty;
  gameSpeed: 'slow' | 'normal' | 'fast';
  language: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  aiDifficulty: 'medium',
  gameSpeed: 'normal',
  language: 'en',
};

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as Partial<AppSettings>;
          setSettingsState({ ...DEFAULT_SETTINGS, ...parsed });
        } catch {}
      }
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(async (patch: Partial<AppSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, updateSettings, loaded };
}
