import { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { getApiUrl } from '../query-client';

/**
 * The signed-in player's display name, resolved as fast as it can be.
 *
 * The setup screen used to read this straight from a `['profile']` query with no
 * persistence, so on every cold start the name was blank until `/api/users/me`
 * came back — and blank falls through to the "Player" placeholder. Slow network
 * meant a visibly late name; a failed request (queries here are `retry: false`)
 * meant the whole match was labelled "Player" with no hint anything went wrong.
 *
 * So the name is cached locally after the first successful fetch and used to
 * seed later launches, with the request still going out in the background to
 * pick up profile edits.
 *
 * The cache is keyed by user id rather than cleared on sign-out: that makes it
 * structurally impossible for one account to be shown another's name.
 */
const cacheKey = (userId: string) => `@bisca:profile_name:${userId}`;

interface ProfileResponse {
  firstName: string;
  lastName: string;
}

export function useProfileName(enabled: boolean) {
  const { getToken, userId } = useAuth();
  const [cached, setCached] = useState<string | null>(null);
  const [cacheChecked, setCacheChecked] = useState(false);

  useEffect(() => {
    if (!userId) {
      setCached(null);
      setCacheChecked(true);
      return;
    }
    let active = true;
    AsyncStorage.getItem(cacheKey(userId))
      .then((v) => { if (active) setCached(v); })
      .catch(() => {})
      .finally(() => { if (active) setCacheChecked(true); });
    return () => { active = false; };
  }, [userId]);

  const { data, isFetching, isError } = useQuery<ProfileResponse>({
    queryKey: ['profile'],
    enabled: enabled && !!userId,
    queryFn: async () => {
      const token = await getToken();
      const res = await fetch(`${getApiUrl()}api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load profile');
      return res.json();
    },
  });

  useEffect(() => {
    if (!data || !userId) return;
    const full = `${data.firstName ?? ''} ${data.lastName ?? ''}`.trim();
    if (!full || full === cached) return;
    setCached(full);
    void AsyncStorage.setItem(cacheKey(userId), full).catch(() => {});
  }, [data, cached, userId]);

  return {
    /** Full name, or null while genuinely unknown. */
    name: cached,
    /**
     * True only while the name is unknown *and* still worth waiting for. Goes
     * false once the request fails, so a dead API degrades to the placeholder
     * instead of blocking play.
     */
    isPending: enabled && cached === null && (!cacheChecked || (isFetching && !isError)),
  };
}
