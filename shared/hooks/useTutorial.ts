import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const TUTORIAL_SEEN_KEY = '@bisca:tutorial_seen';

export function useTutorial() {
  const [seen, setSeen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(TUTORIAL_SEEN_KEY).then((value) => {
      setSeen(value === 'true');
      setIsLoaded(true);
    });
  }, []);

  const markSeen = useCallback(async () => {
    await AsyncStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
    setSeen(true);
  }, []);

  return { seen, isLoaded, markSeen };
}
