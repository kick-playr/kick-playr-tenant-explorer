'use client';
import {
  createContext,
  useCallback,
  useMemo,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { customThemeCss, type ClubBranding } from '../lib/club-branding';
import { themeDefinitions, themeFavicon, themeKey } from '../lib/theme';
import {
  applyTheme,
  currentTheme,
  subscribeTheme,
  updateFavicon,
  type ThemeChoice,
} from '../lib/theme-state';
interface BrandingContextValue {
  branding: ClubBranding | null;
  clubName: string;
  favicon: (theme: ThemeChoice) => string;
  customAvailable: boolean;
}
const BrandingContext = createContext<BrandingContextValue | null>(null);
export function useClubBranding() {
  return useContext(BrandingContext);
}
export function ClubBrandingProvider({
  branding,
  clubName,
  scope,
  children,
}: {
  branding: ClubBranding | null;
  clubName: string;
  scope: string;
  children: ReactNode;
}) {
  const theme = useSyncExternalStore(
    subscribeTheme,
    currentTheme,
    () => 'default' as const,
  );
  const customAvailable = !!branding?.customTheme;
  const favicon = useCallback(
    (choice: ThemeChoice) => {
      const dark =
        choice === 'custom'
          ? branding?.customTheme?.colorScheme === 'dark'
          : themeDefinitions.find((t) => t.id === choice)?.colorScheme ===
            'dark';
      const key =
        dark && branding?.faviconDark ? 'faviconDark' : 'faviconLight';
      const asset = branding?.[key];
      if (!asset) return themeFavicon(choice === 'custom' ? 'default' : choice);
      let revision = 2166136261;
      for (let i = 0; i < asset.dataUrl.length; i++)
        revision = Math.imul(revision ^ asset.dataUrl.charCodeAt(i), 16777619);
      return `/api/club-branding/${scope.split('/').slice(1).join('/')}/${key}?v=${(revision >>> 0).toString(16)}`;
    },
    [branding, scope],
  );
  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(themeKey);
    } catch {}
    if (saved === 'custom' && customAvailable && theme !== 'custom')
      applyTheme('custom', favicon('custom'));
    else if (theme === 'custom' && !customAvailable)
      applyTheme('default', favicon('default'));
    else updateFavicon(favicon(theme));
  }, [customAvailable, theme, favicon]);
  useEffect(
    () => () => {
      if (currentTheme() === 'custom') applyTheme('default');
    },
    [],
  );
  const context = useMemo(
    () => ({ branding, clubName, favicon, customAvailable }),
    [branding, clubName, favicon, customAvailable],
  );
  return (
    <BrandingContext.Provider value={context}>
      {branding?.customTheme && (
        <style>{customThemeCss(branding.customTheme)}</style>
      )}
      {children}
    </BrandingContext.Provider>
  );
}
