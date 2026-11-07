import { themeDefinitions, type ThemePalette } from './theme';
export interface BrandAsset {
  dataUrl: string;
  fileName: string;
}
export interface CustomClubTheme {
  name: string;
  colorScheme: 'light' | 'dark';
  colors: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    onAccent: string;
  };
}
export interface ClubBranding {
  name?: string | null;
  logoLight?: BrandAsset | null;
  logoDark?: BrandAsset | null;
  faviconLight?: BrandAsset | null;
  faviconDark?: BrandAsset | null;
  customTheme?: CustomClubTheme | null;
}
export const brandingAssetKeys = [
  'logoLight',
  'logoDark',
  'faviconLight',
  'faviconDark',
] as const;
export type BrandingAssetKey = (typeof brandingAssetKeys)[number];
export function colorContrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722;
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function defaultCustomTheme(
  mode: 'light' | 'dark' = 'light',
): CustomClubTheme {
  const p = themeDefinitions.find(
    (t) => t.id === (mode === 'dark' ? 'black' : 'white'),
  )!.palette;
  return {
    name: 'Club colors',
    colorScheme: mode,
    colors: {
      background: p.background,
      surface: p.surface,
      text: p.text,
      muted: p.muted,
      border: p.border,
      accent: p.accent,
      onAccent: p.onAccent,
    },
  };
}
export function validateBranding(
  value: unknown,
): asserts value is ClubBranding {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Club branding: enter a branding object.');
  const v = value as ClubBranding;
  if (
    Object.keys(v).some(
      (key) =>
        !['name', 'customTheme', ...brandingAssetKeys].includes(
          key as BrandingAssetKey,
        ),
    )
  )
    throw Error('Club branding: unsupported field.');
  if (
    v.name != null &&
    (typeof v.name !== 'string' ||
      !v.name.trim() ||
      v.name.length > 60 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(v.name))
  )
    throw Error('Club branding: name must contain 1–60 characters.');
  for (const key of brandingAssetKeys) {
    const asset = v[key];
    if (
      asset != null &&
      (typeof asset.dataUrl !== 'string' ||
        !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(
          asset.dataUrl,
        ) ||
        asset.dataUrl.length > 11000 ||
        typeof asset.fileName !== 'string')
    )
      throw Error(
        'Club branding: upload a supported image of at most 8 KiB after resizing.',
      );
  }
  if (v.customTheme) {
    const t = v.customTheme;
    if (
      !['light', 'dark'].includes(t.colorScheme) ||
      typeof t.name !== 'string' ||
      !t.name.trim() ||
      t.name.length > 40 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(t.name) ||
      !t.colors ||
      Object.keys(t.colors).length !== 7 ||
      ![
        'background',
        'surface',
        'text',
        'muted',
        'border',
        'accent',
        'onAccent',
      ].every((key) => Object.prototype.hasOwnProperty.call(t.colors, key)) ||
      Object.values(t.colors).some(
        (c) => typeof c !== 'string' || !/^#[0-9a-f]{6}$/i.test(c),
      )
    )
      throw Error(
        'Club branding: select a theme name, mode and valid six-digit colors.',
      );
    for (const [a, b] of [
      ['text', 'background'],
      ['text', 'surface'],
      ['muted', 'background'],
      ['muted', 'surface'],
      ['onAccent', 'accent'],
    ] as const)
      if (!(colorContrast(t.colors[a], t.colors[b]) >= 4.5))
        throw Error(
          `Club branding: ${a} and ${b} need a contrast ratio of at least 4.5:1.`,
        );
  }
  if (new TextEncoder().encode(JSON.stringify(v)).length > 49152)
    throw Error('Club branding: uploaded images are too large.');
}
function blend(a: string, b: string, ratio: number) {
  return (
    '#' +
    [1, 3, 5]
      .map((i) =>
        Math.round(
          parseInt(a.slice(i, i + 2), 16) * (1 - ratio) +
            parseInt(b.slice(i, i + 2), 16) * ratio,
        )
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}
export function customThemePalette(theme: CustomClubTheme): ThemePalette {
  const base = themeDefinitions.find(
      (t) => t.id === (theme.colorScheme === 'dark' ? 'black' : 'white'),
    )!.palette,
    c = theme.colors;
  return {
    ...base,
    ...c,
    surfaceRaised: blend(c.surface, c.text, 0.06),
    surfaceAlt: blend(c.surface, c.text, 0.03),
    selected: blend(c.surface, c.accent, 0.12),
    accentHover: blend(c.accent, c.onAccent, 0.08),
    brandAccent: colorContrast(c.accent, c.surface) >= 4.5 ? c.accent : c.text,
  };
}
export function customThemeCss(theme: CustomClubTheme) {
  const palette = customThemePalette(theme);
  return `:root[data-theme="custom"]{color-scheme:${theme.colorScheme};--logo-on-light-display:${theme.colorScheme === 'light' ? 'block' : 'none'};--logo-on-dark-display:${theme.colorScheme === 'dark' ? 'block' : 'none'};${Object.entries(
    palette,
  )
    .map(
      ([k, v]) =>
        `--color-${k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}:${v}`,
    )
    .join(';')}}`;
}
export async function prepareBrandAsset(
  file: File,
  kind: 'logo' | 'favicon',
): Promise<BrandAsset> {
  if (
    file.size > 2 * 1024 * 1024 ||
    !(
      /image\/(png|jpeg|webp)/.test(file.type) ||
      (kind === 'favicon' && /\.ico$/i.test(file.name))
    )
  )
    throw Error(
      'Choose a PNG, JPEG or WebP image (or ICO favicon), up to 2 MB.',
    );
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(Error('Unable to decode this image.'));
    image.src = source;
  });
  const canvas = document.createElement('canvas'),
    max = kind === 'logo' ? 256 : 64,
    scale = Math.min(1, max / Math.max(image.width, image.height));
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw Error('Image processing is unavailable.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  if (kind === 'favicon') {
    for (const size of [64, 48, 32]) {
      const ratio = Math.min(1, size / Math.max(image.width, image.height));
      canvas.width = Math.max(1, Math.round(image.width * ratio));
      canvas.height = Math.max(1, Math.round(image.height * ratio));
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      if (Math.ceil(((dataUrl.split(',')[1]?.length ?? 0) * 3) / 4) <= 8192)
        return { dataUrl, fileName: 'favicon.png' };
    }
    throw Error('Choose a simpler favicon image.');
  }
  for (const size of [256, 192, 128, 96]) {
    const ratio = Math.min(1, size / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * ratio));
    canvas.height = Math.max(1, Math.round(image.height * ratio));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.9, 0.75, 0.6, 0.45]) {
      const dataUrl = canvas.toDataURL('image/webp', quality),
        encoded = dataUrl.split(',')[1] ?? '';
      if (Math.ceil((encoded.length * 3) / 4) <= 8192)
        return {
          dataUrl,
          fileName: dataUrl.startsWith('data:image/webp')
            ? 'logo.webp'
            : 'logo.png',
        };
    }
  }
  throw Error(
    'This image is too detailed. Choose a simpler logo or smaller image.',
  );
}
