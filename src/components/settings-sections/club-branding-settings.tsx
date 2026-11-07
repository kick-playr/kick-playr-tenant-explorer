/* eslint-disable @next/next/no-img-element -- Local upload previews use bounded data URLs, not remote images. */
import { useEffect, useRef, useState } from 'react';
import { Field } from '../ui';
import {
  brandingAssetKeys,
  defaultCustomTheme,
  prepareBrandAsset,
  validateBranding,
  customThemePalette,
  type ClubBranding,
  type BrandingAssetKey,
} from '../../lib/club-branding';
import { themeDefinitions } from '../../lib/theme';
import type { SettingsSectionProps } from './types';
const assets: { key: BrandingAssetKey; label: string; dark: boolean }[] = [
  { key: 'logoLight', label: 'Light logo', dark: false },
  { key: 'logoDark', label: 'Dark logo', dark: true },
  { key: 'faviconLight', label: 'Light favicon', dark: false },
  { key: 'faviconDark', label: 'Dark favicon', dark: true },
];
export function ClubBrandingSettings({
  draft,
  onChange,
  disabled,
  onPendingChange,
}: SettingsSectionProps) {
  const value: ClubBranding = draft.branding ? JSON.parse(draft.branding) : {};
  const latest = useRef(value),
    alive = useRef(true);
  const [error, setError] = useState(''),
    [processing, setProcessing] = useState(false);
  useEffect(() => {
    latest.current = value;
  });
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function change(next: ClubBranding) {
    latest.current = next;
    onChange('branding', JSON.stringify(next, null, 2));
    setError('');
  }
  async function upload(key: BrandingAssetKey, file?: File) {
    if (!file || disabled || processing) return;
    setProcessing(true);
    onPendingChange?.(true);
    setError('');
    try {
      const asset = await prepareBrandAsset(
        file,
        key.startsWith('favicon') ? 'favicon' : 'logo',
      );
      if (alive.current) change({ ...latest.current, [key]: asset });
    } catch (e) {
      if (alive.current)
        setError(e instanceof Error ? e.message : 'Unable to process image.');
    } finally {
      if (alive.current) {
        setProcessing(false);
        onPendingChange?.(false);
      }
    }
  }
  let preview = null;
  try {
    validateBranding(value);
    if (value.customTheme) preview = customThemePalette(value.customTheme);
  } catch {}
  return (
    <section
      className="settings-group club-branding-settings"
      aria-label="Club branding"
    >
      <h3>Club branding</h3>
      <p className="muted">
        Upload your club’s logo and favicon. Optional dark variants improve
        contrast; otherwise the light variant is reused. Images are resized in
        your browser and saved only with Save club settings.
      </p>
      <Field
        label="Club brand name"
        hint="Optional wordmark next to the logo. The club name is used when a logo is uploaded."
      >
        <input
          disabled={disabled || processing}
          value={value.name ?? ''}
          maxLength={60}
          onChange={(e) =>
            change({
              ...value,
              name: e.target.value.trim() ? e.target.value : null,
            })
          }
        />
      </Field>
      {error && <p role="alert">{error}</p>}
      {processing && <p role="status">Preparing image…</p>}
      <div className="branding-assets">
        {assets.map(({ key, label, dark }) => (
          <div key={key} className="branding-asset">
            <label>
              {label}
              <input
                type="file"
                accept={
                  key.startsWith('favicon')
                    ? 'image/png,image/jpeg,image/webp,.ico'
                    : 'image/png,image/jpeg,image/webp'
                }
                disabled={disabled || processing}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  void upload(key, file);
                }}
              />
            </label>
            <div
              className="branding-image-preview"
              style={{
                background: themeDefinitions.find(
                  (t) => t.id === (dark ? 'black' : 'white'),
                )!.palette.surface,
                color: themeDefinitions.find(
                  (t) => t.id === (dark ? 'black' : 'white'),
                )!.palette.text,
              }}
            >
              {value[key] ? (
                <img src={value[key]!.dataUrl} alt={`${label} preview`} />
              ) : (
                <span>Kick Playr fallback</span>
              )}
            </div>
            {value[key] && (
              <>
                <small>{value[key]!.fileName}</small>
                <button
                  type="button"
                  className="text-button"
                  disabled={disabled || processing}
                  onClick={() => change({ ...value, [key]: null })}
                >
                  Remove {label.toLowerCase()}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <label className="checkbox-field">
        <input
          type="checkbox"
          disabled={disabled || processing}
          checked={!!value.customTheme}
          onChange={(e) =>
            change({
              ...value,
              customTheme: e.target.checked ? defaultCustomTheme() : null,
            })
          }
        />
        Enable a custom club theme
      </label>
      {value.customTheme && (
        <fieldset
          disabled={disabled || processing}
          className="branding-custom-theme"
        >
          <Field label="Custom theme name">
            <input
              maxLength={40}
              value={value.customTheme.name}
              onChange={(e) =>
                change({
                  ...value,
                  customTheme: { ...value.customTheme!, name: e.target.value },
                })
              }
            />
          </Field>
          <Field
            label="Custom theme mode"
            hint="Changing mode starts with a readable Kick Playr palette."
          >
            <select
              value={value.customTheme.colorScheme}
              onChange={(e) =>
                change({
                  ...value,
                  customTheme: {
                    ...defaultCustomTheme(e.target.value as 'light' | 'dark'),
                    name: value.customTheme!.name,
                  },
                })
              }
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <div className="branding-colors">
            {Object.entries(value.customTheme.colors).map(([key, color]) => (
              <label key={key}>
                <span>
                  {
                    (
                      {
                        background: 'Page background',
                        surface: 'Panel background',
                        text: 'Main text',
                        muted: 'Secondary text',
                        border: 'Borders',
                        accent: 'Accent',
                        onAccent: 'Text on accent',
                      } as Record<string, string>
                    )[key]
                  }
                </span>
                <input
                  type="color"
                  aria-label={`Choose ${key} color`}
                  value={
                    /^#[0-9a-f]{6}$/i.test(color)
                      ? color
                      : defaultCustomTheme().colors.text
                  }
                  onChange={(e) =>
                    change({
                      ...value,
                      customTheme: {
                        ...value.customTheme!,
                        colors: {
                          ...value.customTheme!.colors,
                          [key]: e.target.value,
                        },
                      },
                    })
                  }
                />
                <input
                  aria-label={`${key} hex color`}
                  spellCheck={false}
                  maxLength={7}
                  value={color}
                  onChange={(e) =>
                    change({
                      ...value,
                      customTheme: {
                        ...value.customTheme!,
                        colors: {
                          ...value.customTheme!.colors,
                          [key]: e.target.value,
                        },
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
          <p className="muted">
            Text/background contrast must be at least 4.5:1. Saving makes Custom
            theme available in the theme switcher; drafts do not change the live
            theme.
          </p>
          {preview ? (
            <div
              className="branding-theme-preview"
              style={{
                background: preview.background,
                color: preview.text,
                borderColor: preview.border,
              }}
            >
              <strong>{value.customTheme.name || 'Club colors'}</strong>
              <p style={{ color: preview.muted }}>Example secondary text</p>
              <div
                style={{
                  background: preview.surface,
                  borderColor: preview.border,
                }}
              >
                Club panel
              </div>
              <span
                style={{ background: preview.accent, color: preview.onAccent }}
              >
                Example action
              </span>
            </div>
          ) : (
            <p role="status">
              Adjust colors for a readable preview. Invalid or low-contrast
              themes cannot be saved.
            </p>
          )}
        </fieldset>
      )}
      {(value.name ||
        value.customTheme ||
        brandingAssetKeys.some((key) => value[key])) && (
        <button
          type="button"
          className="button"
          disabled={disabled || processing}
          onClick={() => change({})}
        >
          Use Kick Playr branding
        </button>
      )}
    </section>
  );
}
