/** Add a theme here; validation, first paint, CSS tokens and the switcher derive from this registry. */
const lightPalette = {
  background: '#ffffff',
  text: '#17252d',
  muted: '#546a75',
  surface: '#ffffff',
  surfaceRaised: '#edf2f4',
  surfaceAlt: '#f1f6f3',
  border: '#c5d2d8',
  brandAccent: '#3c7014',
  accent: '#b5f35b',
  accentHover: '#a4e34b',
  onAccent: '#101820',
  selected: '#edf6e6',
  successSurface: '#edf6e6',
  successText: '#3c7014',
  warningSurface: '#fff4d8',
  warningText: '#705315',
  dangerSurface: '#fff0ec',
  dangerText: '#983f2d',
  shadow: '#1320151a',
  shadowSoft: '#13201514',
  overlay: '#10182099',
  previewPaper: '#ffffff',
};
export type ThemePalette = typeof lightPalette;
interface ThemeDefinition {
  id: string;
  name: string;
  label: string;
  icon: 'desktop' | 'sun' | 'moon' | 'palette';
  logo: 'black' | 'white';
  colorScheme: 'light' | 'dark';
  palette: ThemePalette;
}
export const themeDefinitions = [
  {
    id: 'default',
    name: 'Kick Playr Green',
    label: 'Default theme',
    icon: 'desktop',
    logo: 'black',
    colorScheme: 'light',
    palette: {
      ...lightPalette,
      background: '#f3f8ef',
      surfaceRaised: '#e4f1dc',
      surfaceAlt: '#edf6e6',
      selected: '#e4f1dc',
    },
  },
  {
    id: 'white',
    name: 'Kick Playr White',
    label: 'White theme',
    icon: 'sun',
    logo: 'black',
    colorScheme: 'light',
    palette: lightPalette,
  },
  {
    id: 'black',
    name: 'Kick Playr Black',
    label: 'Black theme',
    icon: 'moon',
    logo: 'white',
    colorScheme: 'dark',
    palette: {
      background: '#101820',
      text: '#f8fafb',
      muted: '#bdcbd0',
      surface: '#1b2931',
      surfaceRaised: '#203039',
      surfaceAlt: '#18262d',
      border: '#41545b',
      brandAccent: '#b5f35b',
      accent: '#b5f35b',
      accentHover: '#c5ff76',
      onAccent: '#101820',
      selected: '#203039',
      successSurface: '#1c302b',
      successText: '#b5f35b',
      warningSurface: '#352f20',
      warningText: '#efd18b',
      dangerSurface: '#392723',
      dangerText: '#ffc3b4',
      shadow: '#00000088',
      shadowSoft: '#00000077',
      overlay: '#000000aa',
      previewPaper: '#ffffff',
    },
  },
] as const satisfies readonly ThemeDefinition[];
export type Theme = (typeof themeDefinitions)[number]['id'];
export const themes: readonly Theme[] = themeDefinitions.map(
  (theme) => theme.id,
);
export const themeKey = 'kick-playr-explorer-theme';
export function validTheme(value: unknown): value is Theme {
  return typeof value === 'string' && themes.some((theme) => theme === value);
}
const tokenName = (key: string) =>
  '--color-' + key.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase());
export const themeCss = themeDefinitions
  .map(
    (theme) =>
      `${theme.id === 'default' ? ':root, ' : ''}:root[data-theme="${theme.id}"]{color-scheme:${theme.colorScheme};--logo-on-light-display:${theme.logo === 'black' ? 'block' : 'none'};--logo-on-dark-display:${theme.logo === 'white' ? 'block' : 'none'};${Object.entries(
        theme.palette,
      )
        .map(([key, value]) => `${tokenName(key)}:${value}`)
        .join(';')}}`,
  )
  .join('\n');
export const faviconId = 'explorer-theme-favicon';
const favicons = Object.fromEntries(
  themeDefinitions.map((theme) => [
    theme.id,
    `/brand/kick-playr-logo-${theme.logo}.png`,
  ]),
) as Record<Theme, string>;
export function themeFavicon(theme: Theme): string {
  return favicons[theme];
}
// Registry constants only; storage never supplies CSS or script source.
export const themeInitScript = `(function(){var t='default';try{var s=localStorage.getItem(${JSON.stringify(themeKey)});if(${JSON.stringify(themes)}.includes(s))t=s}catch(e){}document.documentElement.dataset.theme=t;var icon=document.getElementById(${JSON.stringify(faviconId)});if(!icon){icon=document.createElement('link');icon.id=${JSON.stringify(faviconId)};icon.rel='icon';icon.type='image/png';document.head.appendChild(icon)}icon.setAttribute('href',${JSON.stringify(favicons)}[t])})();`;
