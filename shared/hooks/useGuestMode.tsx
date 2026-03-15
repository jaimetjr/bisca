import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';

const GUEST_MODE_KEY = 'guest_mode';

interface GuestModeContextType {
  isGuest: boolean;
  isLoaded: boolean;
  enableGuestMode: () => Promise<void>;
  disableGuestMode: () => Promise<void>;
}

const GuestModeContext = createContext<GuestModeContextType>({
  isGuest: false,
  isLoaded: false,
  enableGuestMode: async () => {},
  disableGuestMode: async () => {},
});

export function GuestModeProvider({ children }: { children: React.ReactNode }) {
  const [isGuest, setIsGuest] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(GUEST_MODE_KEY).then((value) => {
      setIsGuest(value === 'true');
      setIsLoaded(true);
    });
  }, []);

  const enableGuestMode = useCallback(async () => {
    await AsyncStorage.setItem(GUEST_MODE_KEY, 'true');
    setIsGuest(true);
  }, []);

  const disableGuestMode = useCallback(async () => {
    await AsyncStorage.removeItem(GUEST_MODE_KEY);
    setIsGuest(false);
  }, []);

  return (
    <GuestModeContext.Provider value={{ isGuest, isLoaded, enableGuestMode, disableGuestMode }}>
      {children}
    </GuestModeContext.Provider>
  );
}

export function useGuestMode() {
  return useContext(GuestModeContext);
}
