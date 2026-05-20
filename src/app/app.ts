import { Component, OnInit, signal, effect, inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';

const THEME_KEY = 'theme';
const DARK_MODE_CLASS = 'dark-mode';
const DARK_VALUE = 'dark';
const LIGHT_VALUE = 'light';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  private readonly platformId = inject(PLATFORM_ID);

  readonly isDarkMode = signal<boolean>(false);

  constructor() {
    effect(() => {
      const dark = this.isDarkMode();
      if (isPlatformBrowser(this.platformId)) {
        const root = document.documentElement;
        if (dark) {
          root.classList.add(DARK_MODE_CLASS);
        } else {
          root.classList.remove(DARK_MODE_CLASS);
        }
        localStorage.setItem(THEME_KEY, dark ? DARK_VALUE : LIGHT_VALUE);
      }
    });
  }

  ngOnInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      const stored = localStorage.getItem(THEME_KEY);
      if (stored === DARK_VALUE) {
        this.isDarkMode.set(true);
      } else if (stored === null) {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.isDarkMode.set(prefersDark);
      }
    }
  }

  toggleDarkMode(): void {
    this.isDarkMode.update(current => !current);
  }
}
