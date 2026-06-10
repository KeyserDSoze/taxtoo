import { useEffect } from 'react';
import { useStore } from '../store/useStore';

const STORAGE_KEY = 'app-theme';

export function useTheme() {
  const { settings } = useStore();

  useEffect(() => {
    const theme =
      settings?.theme ??
      (localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | 'auto' | null) ??
      'auto';
    // Persist the choice for the anti-flash inline script in index.html
    localStorage.setItem(STORAGE_KEY, theme);

    const html = document.documentElement;

    if (theme === 'dark') {
      html.classList.add('dark');
      return;
    }
    if (theme === 'light') {
      html.classList.remove('dark');
      return;
    }

    // auto: follow system preference
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (e: MediaQueryListEvent | MediaQueryList) => {
      html.classList.toggle('dark', e.matches);
    };
    apply(mq);
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings?.theme]);
}
