export const themeKey = 'kick-playr-explorer-theme';
export const themes = ['default', 'black', 'white'] as const;
export type Theme = (typeof themes)[number];
export function validTheme(value: unknown): value is Theme {
  return themes.includes(value as Theme);
}
// Constant source only; runs before rendering to avoid a flash of the wrong theme.
export const themeInitScript = `(function(){try{var t=localStorage.getItem('${themeKey}');document.documentElement.dataset.theme=['default','black','white'].includes(t)?t:'default'}catch(e){document.documentElement.dataset.theme='default'}})();`;
