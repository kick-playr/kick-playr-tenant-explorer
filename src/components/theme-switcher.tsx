'use client';

import { useEffect, useSyncExternalStore } from 'react';
import {
  ComputerDesktopIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { themeKey, validTheme, type Theme } from '../lib/theme';

const eventName = 'explorer-theme-change';
function subscribe(callback: () => void) {
  window.addEventListener(eventName, callback);
  return () => window.removeEventListener(eventName, callback);
}
function snapshot(): Theme {
  const value = document.documentElement.dataset.theme;
  return validTheme(value) ? value : 'default';
}
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new window.Event(eventName));
}
function restore() {
  try {
    const saved = window.localStorage.getItem(themeKey);
    apply(validTheme(saved) ? saved : 'default');
  } catch {
    /* The current theme remains usable when browser storage is disabled. */
  }
}
export function ThemeSwitcher() {
  const theme = useSyncExternalStore(
    subscribe,
    snapshot,
    () => 'default' as Theme,
  );
  useEffect(() => {
    restore();
    const onStorage = (event: StorageEvent) => {
      if (event.key === themeKey || event.key === null) restore();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);
  const choices = [
    { value: 'default', label: 'Default theme', Icon: ComputerDesktopIcon },
    { value: 'white', label: 'White theme', Icon: SunIcon },
    { value: 'black', label: 'Black theme', Icon: MoonIcon },
  ] as const;
  return (
    <div className="theme-switcher" role="group" aria-label="Color theme">
      {choices.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          title={label}
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
      ))}
    </div>
  );
}
