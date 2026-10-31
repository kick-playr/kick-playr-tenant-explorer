'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { useClubBranding } from './club-branding-provider';
import {
  applyTheme,
  currentTheme,
  subscribeTheme,
  type ThemeChoice,
} from '../lib/theme-state';
import {
  ComputerDesktopIcon,
  SunIcon,
  MoonIcon,
  SwatchIcon,
} from '@heroicons/react/24/outline';
import { themeDefinitions, themeKey, validTheme } from '../lib/theme';

export function ThemeSwitcher() {
  const club = useClubBranding();
  const theme = useSyncExternalStore(
    subscribeTheme,
    currentTheme,
    () => 'default' as ThemeChoice,
  );
  const apply = useCallback(
    (choice: ThemeChoice) => applyTheme(choice, club?.favicon(choice)),
    [club],
  );
  const restore = useCallback(() => {
    try {
      const saved = window.localStorage.getItem(themeKey);
      apply(
        validTheme(saved)
          ? saved
          : saved === 'custom' && club?.customAvailable
            ? 'custom'
            : 'default',
      );
    } catch {}
  }, [apply, club]);
  useEffect(() => {
    restore();
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeKey || event.key === null) restore();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [restore]);
  const icons = {
    desktop: ComputerDesktopIcon,
    sun: SunIcon,
    moon: MoonIcon,
    palette: SwatchIcon,
  };
  return (
    <div className="theme-switcher" role="group" aria-label="Color theme">
      {[
        ...themeDefinitions,
        ...(club?.customAvailable
          ? [
              {
                id: 'custom' as const,
                label: 'Custom theme',
                name: club.branding?.customTheme?.name ?? 'Club colors',
                icon: 'palette' as const,
              },
            ]
          : []),
      ].map(({ id: value, label, name, icon }) => {
        const Icon = icons[icon];
        return (
          <button
            key={value}
            type="button"
            aria-label={label}
            title={name}
            aria-pressed={theme === value}
            onClick={() => {
              try {
                window.localStorage.setItem(themeKey, value);
              } catch {
                /* Preference is optional. */
              }
              apply(value);
            }}
          >
            <Icon aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
