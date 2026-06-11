/**
 * Centralized access-token refresh + 401 auto-retry for Drive/Graph calls.
 *
 * - refreshCurrentToken(): refreshes the access token for the active provider
 *   (Google via GIS silent token, Microsoft via MSAL silent or stored refresh
 *   token) and updates the store. Returns the new token or null on failure.
 * - installAuthRetryInterceptor(): registers a global axios interceptor that,
 *   on a 401 from googleapis.com / graph.microsoft.com, refreshes the token once
 *   and retries the original request with the fresh token. If refresh fails, it
 *   forces a logout so the user can re-authenticate.
 */

import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useStore } from '../store/useStore';
import { msalInstance, MICROSOFT_SCOPES } from '../config/msal';
import { InteractionRequiredAuthError } from '@azure/msal-browser';

const GOOGLE_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

const MS_REFRESH_TOKEN_KEY = 'ms_android_refresh_token';

// Coalesce concurrent refreshes into a single in-flight promise.
let inFlight: Promise<string | null> | null = null;

// ── Google ──────────────────────────────────────────────────────────────────
function refreshGoogleToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gis = (window as any).google?.accounts?.oauth2;
    if (!gis) {
      resolve(null);
      return;
    }
    let settled = false;
    const finish = (token: string | null) => {
      if (!settled) {
        settled = true;
        resolve(token);
      }
    };
    const client = gis.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: (resp: any) => {
        if (resp.error || !resp.access_token) {
          finish(null);
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
        finish(resp.access_token);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      error_callback: () => finish(null),
    });
    client.requestAccessToken({ prompt: 'none' });
    // Safety timeout so a blocked popup never hangs the promise.
    setTimeout(() => finish(null), 15000);
  });
}

// ── Microsoft ───────────────────────────────────────────────────────────────
async function refreshMicrosoftToken(): Promise<string | null> {
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length) {
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
      return res.accessToken;
    } catch (err) {
      if (!(err instanceof InteractionRequiredAuthError)) {
        // transient/network — keep user, signal failure
        return null;
      }
      return null;
    }
  }

  // Android PKCE flow — use stored refresh token
  const stored = localStorage.getItem(MS_REFRESH_TOKEN_KEY);
  if (!stored) return null;
  try {
    const body = new URLSearchParams({
      client_id: import.meta.env.VITE_MICROSOFT_CLIENT_ID as string,
      grant_type: 'refresh_token',
      refresh_token: stored,
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
    };
    if (!data.access_token) return null;
    const cur = useStore.getState().user;
    if (cur) {
      useStore.getState().setUser({
        ...cur,
        accessToken: data.access_token,
        expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
      });
    }
    if (data.refresh_token) localStorage.setItem(MS_REFRESH_TOKEN_KEY, data.refresh_token);
    return data.access_token;
  } catch {
    return null;
  }
}

/** Refresh the token for the active provider. Coalesces concurrent calls. */
export function refreshCurrentToken(): Promise<string | null> {
  if (inFlight) return inFlight;
  const provider = useStore.getState().user?.provider;
  if (!provider) return Promise.resolve(null);
  inFlight = (provider === 'microsoft' ? refreshMicrosoftToken() : refreshGoogleToken()).finally(
    () => {
      inFlight = null;
    }
  );
  return inFlight;
}

// ── Axios 401 retry interceptor ───────────────────────────────────────────────
function isAuthEndpoint(url?: string): boolean {
  if (!url) return false;
  return url.includes('googleapis.com') || url.includes('graph.microsoft.com');
}

let installed = false;

export function installAuthRetryInterceptor(): void {
  if (installed) return;
  installed = true;

  axios.interceptors.response.use(
    (r) => r,
    async (error: AxiosError) => {
      const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
      const status = error.response?.status;

      if (
        original &&
        !original._retried &&
        (status === 401 || status === 403) &&
        isAuthEndpoint(original.url)
      ) {
        original._retried = true;
        const newToken = await refreshCurrentToken();
        if (newToken) {
          original.headers = original.headers ?? {};
          (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
          return axios(original);
        }
        // Refresh failed → session is dead, force re-login.
        useStore.getState().logout();
      }
      return Promise.reject(error);
    }
  );
}
