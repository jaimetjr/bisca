import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CardBackId, DEFAULT_CARD_BACK, toCardBackId } from '../lib/brisca/card-backs';

/**
 * The player's chosen card back.
 *
 * A provider rather than a plain hook, for the same reason `useLanguage` is one:
 * `CardSprite` renders eight or more times per screen, so reading the setting
 * there directly would mean one AsyncStorage round-trip per card, a flash of the
 * default back until each resolves, and no propagation when the choice changes.
 *
 * Reads the same `@bisca:settings` key `useSettings` writes; the Settings screen
 * calls both sides, exactly as it already does for language.
 */
const SETTINGS_KEY = '@bisca:settings';

interface Ctx {
  cardBack: CardBackId;
  changeCardBack: (id: CardBackId) => void;
}

const CardBackContext = createContext<Ctx>({
  cardBack: DEFAULT_CARD_BACK,
  changeCardBack: () => {},
});

export function CardBackProvider({ children }: { children: React.ReactNode }) {
  const [cardBack, setCardBack] = useState<CardBackId>(DEFAULT_CARD_BACK);

  useEffect(() => {
    AsyncStorage.getItem(SETTINGS_KEY).then((raw) => {
      if (!raw) return;
      try {
        const { cardBack: saved } = JSON.parse(raw) as { cardBack?: unknown };
        // toCardBackId narrows: a back removed in a later version, or a hand
        // edited settings file, falls back instead of rendering nothing.
        if (saved !== undefined) setCardBack(toCardBackId(saved));
      } catch {}
    });
  }, []);

  const changeCardBack = useCallback((id: CardBackId) => setCardBack(toCardBackId(id)), []);

  return (
    <CardBackContext.Provider value={{ cardBack, changeCardBack }}>
      {children}
    </CardBackContext.Provider>
  );
}

export function useCardBack() {
  return useContext(CardBackContext);
}
