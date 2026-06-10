import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { MsalProvider, useMsal } from '@azure/msal-react';
import { EventType, InteractionStatus, type AuthenticationResult } from '@azure/msal-browser';
import { msalInstance, MICROSOFT_SCOPES } from './config/msal';
import { useState, useEffect } from 'react';
import i18n from './i18n/index';
import { useStore } from './store/useStore';
import { useTheme } from './hooks/useTheme';
import { useTokenRefresh } from './hooks/useTokenRefresh';
import LoginPage from './components/Auth/LoginPage';
import AppLayout from './components/Layout/AppLayout';
import DashboardPage from './components/Dashboard/DashboardPage';
import DocumentsPage from './components/Documents/DocumentsPage';
import CalculationsPage from './components/Calculations/CalculationsPage';
import AssistantPage from './components/Assistant/AssistantPage';
import SettingsPage from './components/Settings/SettingsPage';
import TermsPage from './components/Legal/TermsPage';
import PrivacyPage from './components/Legal/PrivacyPage';
import DownloadPage from './components/Download/DownloadPage';
import { loadSettings as msLoadSettings } from './services/oneDrive';
import { loadSettings } from './services/storage';
import type { AppUser, AppSettings } from './types';

const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;

async function getGraphToken(
  instance: ReturnType<typeof useMsal>['instance'],
  result: AuthenticationResult
): Promise<string> {
  const account = result.account ?? instance.getAllAccounts()[0];
  if (account) {
    try {
      const silent = await instance.acquireTokenSilent({ scopes: MICROSOFT_SCOPES, account });
      if (silent.accessToken) return silent.accessToken;
    } catch {
      // fall through to direct token
    }
  }
  return result.accessToken;
}

async function processMsAuthResult(
  result: AuthenticationResult,
  instance: ReturnType<typeof useMsal>['instance'],
  setUser: (u: AppUser) => void,
  setSettings: (s: AppSettings, id?: string) => void,
  setLoadingSettings: (v: boolean) => void
) {
  const graphToken = await getGraphToken(instance, result);
  if (!graphToken) {
    console.error('MS: no access token obtained');
    return;
  }

  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${graphToken}` },
  });
  const profile = await profileRes.json();

  const user: AppUser = {
    name: profile.displayName ?? profile.userPrincipalName,
    email: profile.mail ?? profile.userPrincipalName,
    picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(
      profile.displayName ?? 'U'
    )}&background=0ea5e9&color=fff&size=96`,
    accessToken: graphToken,
    expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3600000,
    provider: 'microsoft',
  };
  setUser(user);

  setLoadingSettings(true);
  try {
    const loaded = await msLoadSettings(graphToken);
    if (loaded) setSettings(loaded.settings, loaded.fileId);
  } catch {
    // first access
  } finally {
    setLoadingSettings(false);
  }
}

function AppRoutes() {
  const { user, settings, setUser, setSettings, setLoadingSettings } = useStore();
  const { instance, inProgress } = useMsal();
  const [isRestoringAuth, setIsRestoringAuth] = useState(true);

  useEffect(() => {
    if (settings?.language) i18n.changeLanguage(settings.language);
  }, [settings?.language]);

  useTheme();
  useTokenRefresh();

  // Register the LOGIN_SUCCESS listener before MSAL init completes.
  useEffect(() => {
    const cbId = instance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        const result = event.payload as AuthenticationResult;
        if (!useStore.getState().user) {
          processMsAuthResult(result, instance, setUser, setSettings, setLoadingSettings).catch(
            (err) => console.error('MS LOGIN_SUCCESS error:', err)
          );
        }
      }
    });
    return () => {
      if (cbId) instance.removeEventCallback(cbId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance]);

  // Silent re-auth after reload (Microsoft).
  useEffect(() => {
    if (inProgress !== InteractionStatus.None) return;
    if (useStore.getState().user) {
      setIsRestoringAuth(false);
      return;
    }
    const accounts = instance.getAllAccounts();
    if (!accounts.length) {
      setIsRestoringAuth(false);
      return;
    }
    instance
      .acquireTokenSilent({ scopes: MICROSOFT_SCOPES, account: accounts[0] })
      .then((res) => {
        if (!useStore.getState().user) {
          return processMsAuthResult(res, instance, setUser, setSettings, setLoadingSettings).catch(
            (err) => console.error('MS silent re-auth error:', err)
          );
        }
      })
      .catch(() => {})
      .finally(() => setIsRestoringAuth(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance, inProgress]);

  // Reload settings from Drive after a localStorage user restore.
  useEffect(() => {
    if (!user || settings) return;
    setLoadingSettings(true);
    loadSettings(user)
      .then((result) => {
        if (result) setSettings(result.settings, result.fileId);
      })
      .catch(() => {})
      .finally(() => setLoadingSettings(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!user && isRestoringAuth) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/terms" element={<TermsPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/download" element={<DownloadPage />} />
      {!user ? (
        <Route path="*" element={<LoginPage />} />
      ) : (
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/documents" element={<DocumentsPage />} />
          <Route path="/calculations" element={<CalculationsPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}

export default function App() {
  if (!clientId) {
    return (
      <HashRouter>
        <Routes>
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </HashRouter>
    );
  }
  return (
    <MsalProvider instance={msalInstance}>
      <GoogleOAuthProvider clientId={clientId}>
        <HashRouter>
          <AppRoutes />
        </HashRouter>
      </GoogleOAuthProvider>
    </MsalProvider>
  );
}
