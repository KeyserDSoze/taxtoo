import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { refreshCurrentToken } from '../services/tokenManager';

/** Refresh 5 minutes before expiry. */
const REFRESH_BEFORE_MS = 5 * 60 * 1000;

/**
 * Automatic access-token refresh (Google + Microsoft) via the shared token manager:
 * - refresh 5 minutes before expiry
 * - immediate refresh if already expired on open
 * - re-check on app return (visibilitychange)
 * Hard failures are handled by the token manager / 401 interceptor (forces logout).
 */
export function useTokenRefresh(): void {
  const provider = useStore((s) => s.user?.provider);
  const expiresAt = useStore((s) => s.user?.expiresAt);

  useEffect(() => {
    if (!provider || expiresAt == null) return;

    let timerId: ReturnType<typeof setTimeout> | undefined;

    const schedule = () => {
      if (timerId !== undefined) clearTimeout(timerId);

      const u = useStore.getState().user;
      if (!u) return;

      const msLeft = u.expiresAt - Date.now();
      if (msLeft <= REFRESH_BEFORE_MS) {
        void refreshCurrentToken().then((token) => {
          // On success expiresAt changes → effect re-runs and reschedules.
          if (token) schedule();
        });
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
