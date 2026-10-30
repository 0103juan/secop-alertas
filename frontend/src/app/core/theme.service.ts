import { effect, Injectable, signal } from '@angular/core';

export type ThemePreference = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'secop-theme-preference';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly preference = signal<ThemePreference>(this.readInitial());

  constructor() {
    effect(() => {
      const pref = this.preference();
      try {
        localStorage.setItem(STORAGE_KEY, pref);
      } catch {
        // storage disabled or unavailable
      }
      this.applyTheme(pref);
    });
  }

  toggle(): void {
    const current = this.preference();
    if (current === 'system') {
      const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.preference.set(isDark ? 'light' : 'dark');
    } else if (current === 'dark') {
      this.preference.set('light');
    } else {
      this.preference.set('dark');
    }
  }

  private readInitial(): ThemePreference {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        return stored;
      }
    } catch {
      // fallback
    }
    return 'system';
  }

  private applyTheme(pref: ThemePreference): void {
    const root = document.documentElement;
    if (pref === 'system') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', pref);
    }
  }
}
