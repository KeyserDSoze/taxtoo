import { PublicClientApplication, type Configuration } from '@azure/msal-browser';

const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID as string,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const MICROSOFT_SCOPES = ['User.Read', 'Files.ReadWrite'];

// ── Microsoft 365 Copilot (separate app registration) ────────────────────────
// Uses the 2nd app registration dedicated to Copilot. Kept independent from the
// storage/OneDrive auth so a Google-storage user can still use Copilot, and so
// Copilot scopes/consent are isolated. Calls are gated behind VITE_ENABLE_COPILOT.
const copilotClientId = import.meta.env.VITE_MICROSOFT_COPILOT_CLIENT_ID as string | undefined;

export const copilotMsalInstance = copilotClientId
  ? new PublicClientApplication({
      auth: {
        clientId: copilotClientId,
        authority: 'https://login.microsoftonline.com/common',
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: 'localStorage' },
    })
  : null;

// Delegated scopes for the Copilot Retrieval API. The signed-in user must hold a
// Microsoft 365 Copilot licence. Adjust here if testing reveals different scopes.
export const COPILOT_SCOPES = ['Files.Read.All', 'Sites.Read.All'];

export const COPILOT_ENABLED =
  (import.meta.env.VITE_ENABLE_COPILOT as string | undefined) === 'true' && !!copilotMsalInstance;

