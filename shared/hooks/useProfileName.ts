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
 * seed later launches.
 *
 * The cache is keyed by user id rather than cleared on sign-out: that makes it
 * structurally impossible for one account to be shown another's name.
 *
 * IMPORTANT — nothing refreshes this on its own. The `['profile']` query runs
 * under the app-wide `staleTime: Infinity` (shared/query-client.ts), so it is
 * fetched once and then considered fresh forever, and the effect below only
 * rewrites the stored name when a *new* fetch returns a different one. Whoever
 * edits the profile therefore has to say so: call `cacheProfileName` and
 * invalidate `['profile']` after saving. Missing that left a renamed player
 * showing their old name in every room, permanently — AsyncStorage outlives
 * restarts, so it survived until reinstall.
 */
const cacheKey = (userId: string) => `@bisca:profile_name:${userId}`;

/**
 * Overwrites the stored display name for a user, so a profile edit shows up
 * without waiting on a refetch that may never come (and works offline, since
 * the caller already knows the name the server accepted).
 */
export async function cacheProfileName(userId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  try {
    await AsyncStorage.setItem(cacheKey(userId), trimmed);
  } catch {
    // A failed write only costs a stale name until the next successful fetch.
  }
}

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
