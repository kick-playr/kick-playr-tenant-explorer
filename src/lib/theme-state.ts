import { faviconId, themeFavicon, validTheme, type Theme } from './theme';
export type ThemeChoice = Theme | 'custom';
export const themeEvent = 'explorer-theme-change';
export function subscribeTheme(callback: () => void) {
  window.addEventListener(themeEvent, callback);
  return () => window.removeEventListener(themeEvent, callback);
}
export function currentTheme(): ThemeChoice {
  const v = document.documentElement.dataset.theme;
  return validTheme(v) || v === 'custom' ? v : 'default';
}
export function applyTheme(theme: ThemeChoice, favicon?: string) {
  document.documentElement.dataset.theme = theme;
  updateFavicon(
    favicon ?? themeFavicon(theme === 'custom' ? 'default' : theme),
  );
  window.dispatchEvent(new window.Event(themeEvent));
}
export function updateFavicon(href: string) {
  document.getElementById(faviconId)?.setAttribute('href', href);
}
