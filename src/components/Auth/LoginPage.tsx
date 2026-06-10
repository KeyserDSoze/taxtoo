import { GoogleOAuthProvider, useGoogleLogin } from '@react-oauth/google';
import { useMsal } from '@azure/msal-react';
import { FileText, Sparkles, Cloud, ShieldCheck, Calculator } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App as CapApp } from '@capacitor/app';
import { useStore } from '../../store/useStore';
import { loadSettings as gLoadSettings } from '../../services/googleDrive';
import { MICROSOFT_SCOPES } from '../../config/msal';
import type { AppUser, AppSettings } from '../../types';

const GOOGLE_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
].join(' ');

const ANDROID_OAUTH_CALLBACK = 'https://taxtoo.app/oauth-callback.html';
const GOOGLE_ELECTRON_REDIRECT_URI = 'http://localhost:54321/oauth-callback.html';

const isElectron = !!window.electronAPI;
const isCapacitor = Capacitor.isNativePlatform();

// ── PKCE utilities ──────────────────────────────────────────────────────────
function generateCodeVerifier(): string {
  const arr = new Uint8Array(64);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...Array.from(arr)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...Array.from(new Uint8Array(digest))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function buildGoogleAuthUrl(redirectUri: string): string {
  return (
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: GOOGLE_SCOPES,
    }).toString()
  );
}

async function buildMicrosoftAndroidAuthUrl(): Promise<{ url: string; codeVerifier: string }> {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const url =
    'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?' +
    new URLSearchParams({
      client_id: import.meta.env.VITE_MICROSOFT_CLIENT_ID as string,
      response_type: 'code',
      redirect_uri: ANDROID_OAUTH_CALLBACK,
      scope: [...MICROSOFT_SCOPES, 'offline_access'].join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      response_mode: 'query',
      prompt: 'select_account',
    }).toString();
  return { url, codeVerifier };
}

async function exchangeMicrosoftCode(
  code: string
): Promise<{ accessToken: string; refreshToken: string | null; expiresIn: number }> {
  const verifier = localStorage.getItem('ms_android_pkce_verifier') ?? '';
  localStorage.removeItem('ms_android_pkce_verifier');
  const body = new URLSearchParams({
    client_id: import.meta.env.VITE_MICROSOFT_CLIENT_ID as string,
    grant_type: 'authorization_code',
    code,
    redirect_uri: ANDROID_OAUTH_CALLBACK,
    code_verifier: verifier,
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
    error_description?: string;
  };
  if (!data.access_token) throw new Error(data.error_description ?? 'token exchange failed');
  if (data.refresh_token) localStorage.setItem('ms_android_refresh_token', data.refresh_token);
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresIn: data.expires_in ?? 3600,
  };
}

async function handleGoogleToken(
  accessToken: string,
  expiresIn: number,
  setUser: (u: AppUser) => void,
  setSettings: (settings: AppSettings, driveFileId?: string) => void,
  setLoadingSettings: (v: boolean) => void
) {
  const profileRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const profile = (await profileRes.json()) as { name: string; email: string; picture: string };
  const user: AppUser = {
    name: profile.name,
    email: profile.email,
    picture: profile.picture,
    accessToken,
    expiresAt: Date.now() + expiresIn * 1000,
    provider: 'google',
  };
  setUser(user);
  setLoadingSettings(true);
  try {
    const result = await gLoadSettings(accessToken);
    if (result) setSettings(result.settings, result.fileId);
  } catch {
    // first login
  } finally {
    setLoadingSettings(false);
  }
}

function TaxtooLogo() {
  return (
    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-xl shadow-sky-500/30">
      <Calculator className="w-10 h-10 text-white" strokeWidth={2.2} />
    </div>
  );
}

// ── Google login button ───────────────────────────────────────────────────────
function GoogleLoginButton() {
  const { t } = useTranslation();
  const { setUser, setSettings, setLoadingSettings } = useStore();

  useEffect(() => {
    if (!isElectron) return;
    const pending = sessionStorage.getItem('google_oauth_pending');
    if (!pending) return;
    sessionStorage.removeItem('google_oauth_pending');
    try {
      const { access_token, expires_in } = JSON.parse(pending) as {
        access_token: string;
        expires_in: number;
      };
      void handleGoogleToken(access_token, expires_in, setUser, setSettings, setLoadingSettings);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useGoogleLogin({
    scope: GOOGLE_SCOPES,
    onSuccess: (r) =>
      void handleGoogleToken(
        r.access_token,
        r.expires_in ?? 3600,
        setUser,
        setSettings,
        setLoadingSettings
      ),
    onError: (e) => console.error('Google login error:', e),
  });

  const handleClick = async () => {
    if (isElectron) {
      window.location.href = buildGoogleAuthUrl(GOOGLE_ELECTRON_REDIRECT_URI);
    } else if (isCapacitor) {
      await Browser.open({ url: buildGoogleAuthUrl(ANDROID_OAUTH_CALLBACK) });
    } else {
      login();
    }
  };

  return (
    <button
      onClick={() => void handleClick()}
      className="flex items-center gap-3 bg-white text-gray-800 font-semibold px-6 py-3.5 rounded-2xl shadow-lg hover:shadow-xl transition-all active:scale-[0.98] w-full justify-center ring-1 ring-black/5"
    >
      <svg width="20" height="20" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      {t('auth.loginGoogle')}
    </button>
  );
}

// ── Microsoft login button ────────────────────────────────────────────────────
function MicrosoftLoginButton() {
  const { t } = useTranslation();
  const { instance } = useMsal();

  const handleLogin = async () => {
    if (isCapacitor) {
      const { url, codeVerifier } = await buildMicrosoftAndroidAuthUrl();
      localStorage.setItem('ms_android_pkce_verifier', codeVerifier);
      await Browser.open({ url });
    } else {
      instance.loginRedirect({ scopes: MICROSOFT_SCOPES }).catch((err) => {
        console.error('Microsoft loginRedirect error:', err);
      });
    }
  };

  return (
    <button
      onClick={() => void handleLogin()}
      className="flex items-center gap-3 bg-[#0078d4] text-white font-semibold px-6 py-3.5 rounded-2xl shadow-lg hover:bg-[#106ebe] transition-all active:scale-[0.98] w-full justify-center"
    >
      <svg width="20" height="20" viewBox="0 0 23 23">
        <path fill="#f3f3f3" d="M0 0h23v23H0z" />
        <path fill="#f35325" d="M1 1h10v10H1z" />
        <path fill="#81bc06" d="M12 1h10v10H12z" />
        <path fill="#05a6f0" d="M1 12h10v10H1z" />
        <path fill="#ffba08" d="M12 12h10v10H12z" />
      </svg>
      {t('auth.loginMicrosoft')}
    </button>
  );
}

export default function LoginPage() {
  const { t } = useTranslation();
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
  const { setUser, setSettings, setLoadingSettings } = useStore();

  useEffect(() => {
    if (!isCapacitor) return;
    const listener = CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith('taxtoo://oauth')) return;
      await Browser.close().catch(() => {});

      const params = new URLSearchParams(url.split('?')[1] ?? '');
      const provider = params.get('provider');

      if (provider === 'google') {
        const accessToken = params.get('access_token') ?? '';
        const expiresIn = parseInt(params.get('expires_in') ?? '3600', 10);
        if (accessToken) {
          await handleGoogleToken(accessToken, expiresIn, setUser, setSettings, setLoadingSettings);
        }
      } else if (provider === 'microsoft') {
        const code = params.get('code') ?? '';
        if (!code) return;
        try {
          const { accessToken, expiresIn } = await exchangeMicrosoftCode(code);
          const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const profile = (await profileRes.json()) as {
            displayName: string;
            mail?: string;
            userPrincipalName: string;
          };
          const user: AppUser = {
            name: profile.displayName,
            email: profile.mail ?? profile.userPrincipalName,
            picture: '',
            accessToken,
            expiresAt: Date.now() + expiresIn * 1000,
            provider: 'microsoft',
          };
          setUser(user);
        } catch (err) {
          console.error('Microsoft Android login error:', err);
        }
      }
    });

    return () => {
      listener.then((h) => h.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const features = [
    { icon: Cloud, key: 'auth.feature.drive' },
    { icon: Sparkles, key: 'auth.feature.ai' },
    { icon: FileText, key: 'auth.feature.imu' },
    { icon: ShieldCheck, key: 'auth.feature.privacy' },
  ] as const;

  return (
    <GoogleOAuthProvider clientId={clientId ?? ''}>
      <div className="min-h-screen bg-gradient-to-b from-slate-50 to-sky-50 dark:from-slate-950 dark:to-slate-900 flex flex-col items-center justify-center p-6 gap-8">
        <div className="flex flex-col items-center gap-4 animate-fade-in-up">
          <TaxtooLogo />
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
              Taxtoo
            </h1>
            <p className="text-slate-600 dark:text-slate-400 mt-1.5 text-sm max-w-xs">
              {t('app.tagline')}
            </p>
          </div>
        </div>

        <div className="grid gap-2.5 w-full max-w-sm animate-fade-in-up">
          {features.map((f) => (
            <div
              key={f.key}
              className="flex items-center gap-3 bg-white/70 dark:bg-slate-900/60 backdrop-blur rounded-xl px-4 py-3 ring-1 ring-black/5 dark:ring-white/5"
            >
              <f.icon className="w-5 h-5 text-sky-500 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300 text-sm">
                {t(f.key as Parameters<typeof t>[0])}
              </span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 w-full max-w-sm">
          <GoogleLoginButton />
          <div className="flex items-center gap-3 text-slate-400 dark:text-slate-600 text-xs">
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
            {t('auth.or')}
            <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
          </div>
          <MicrosoftLoginButton />
        </div>

        <p className="text-slate-500 dark:text-slate-500 text-xs text-center max-w-xs leading-relaxed">
          {t('auth.consent')}
        </p>
      </div>
    </GoogleOAuthProvider>
  );
}
