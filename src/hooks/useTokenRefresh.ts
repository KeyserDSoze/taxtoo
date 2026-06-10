import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { msalInstance, MICROSOFT_SCOPES } from '../config/msal';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const GOOGLE_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

/** Refresh 5 minutes before expiry. */
const REFRESH_BEFORE_MS = 5 * 60 * 1000;

/** LocalStorage key for the Microsoft refresh token (Android PKCE flow). */
const MS_REFRESH_TOKEN_KEY = 'ms_android_refresh_token';

// ── Microsoft PKCE refresh (Android — no MSAL) ────────────────────────────────
async function refreshMicrosoftWithToken(refreshToken: string): Promise<boolean> {
  const body = new URLSearchParams({
    client_id: import.meta.env.VITE_MICROSOFT_CLIENT_ID as string,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: [...MICROSOFT_SCOPES, 'offline_access'].join(' '),
  });
  const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = (await resp.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!data.access_token) return false;
  const cur = useStore.getState().user;
  if (cur) {
    useStore.getState().setUser({
      ...cur,
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
    });
  }
  if (data.refresh_token) localStorage.setItem(MS_REFRESH_TOKEN_KEY, data.refresh_token);
  return true;
}

// ── Microsoft ────────────────────────────────────────────────────────────────
async function doMicrosoftRefresh(): Promise<void> {
  const user = useStore.getState().user;
  if (!user) return;

  const accounts = msalInstance.getAllAccounts();
  if (!accounts.length) {
    const stored = localStorage.getItem(MS_REFRESH_TOKEN_KEY);
    if (stored) {
      try {
        const ok = await refreshMicrosoftWithToken(stored);
        if (ok) return;
        localStorage.removeItem(MS_REFRESH_TOKEN_KEY);
        useStore.getState().logout();
      } catch (err) {
        console.warn('[tokenRefresh] Microsoft refresh_token request failed (network?):', err);
      }
    }
    return;
  }

  try {
    const res = await msalInstance.acquireTokenSilent({
      scopes: MICROSOFT_SCOPES,
      account: accounts[0],
    });
    const cur = useStore.getState().user;
    if (cur) {
      useStore.getState().setUser({
        ...cur,
        accessToken: res.accessToken,
        expiresAt: res.expiresOn?.getTime() ?? Date.now() + 3_600_000,
      });
    }
  } catch (err) {
    if (err instanceof InteractionRequiredAuthError) {
      useStore.getState().logout();
    } else {
      console.warn('[tokenRefresh] Microsoft silent refresh failed (keeping user):', err);
    }
  }
}

// ── Google ────────────────────────────────────────────────────────────────────
function doGoogleRefresh(): void {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gis = (window as any).google?.accounts?.oauth2;
  if (!gis) {
    console.warn('[tokenRefresh] Google GIS not loaded, skipping refresh');
    return;
  }

  const client = gis.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    callback: (resp: any) => {
      if (resp.error || !resp.access_token) {
        const error = (resp.error ?? 'no token') as string;
        if (error === 'interaction_required' || error === 'access_denied') {
          useStore.getState().logout();
        }
        return;
      }
      const cur = useStore.getState().user;
      if (cur) {
        useStore.getState().setUser({
          ...cur,
          accessToken: resp.access_token,
          expiresAt: Date.now() + (resp.expires_in ?? 3600) * 1000,
        });
      }
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    error_callback: (err: any) => {
      const type = (err?.type ?? '') as string;
      if (type === 'interaction_required') useStore.getState().logout();
    },
  });

  client.requestAccessToken({ prompt: 'none' });
}

/**
 * Automatic access-token refresh (Google + Microsoft):
 * - refresh 5 minutes before expiry
 * - immediate refresh if already expired on open
 * - re-check on app return (visibilitychange)
 */
export function useTokenRefresh(): void {
  const provider = useStore((s) => s.user?.provider);
  const expiresAt = useStore((s) => s.user?.expiresAt);

  useEffect(() => {
    if (!provider || expiresAt == null) return;

    const doRefresh = () => {
      if (provider === 'microsoft') doMicrosoftRefresh();
      else doGoogleRefresh();
    };

    let timerId: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timerId !== undefined) clearTimeout(timerId);

      const u = useStore.getState().user;
      if (!u) return;

      const msLeft = u.expiresAt - Date.now();
      if (msLeft <= REFRESH_BEFORE_MS) {
        doRefresh();
      } else {
        timerId = setTimeout(schedule, msLeft - REFRESH_BEFORE_MS);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    document.addEventListener('visibilitychange', onVisible);
    schedule();

    return () => {
      if (timerId !== undefined) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [provider, expiresAt]);
}
