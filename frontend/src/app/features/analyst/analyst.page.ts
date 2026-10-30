import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

import { ThemeService } from '../../core/theme.service';

const ANALYST_ORIGIN = 'https://secop-analyst-271042683183.us-central1.run.app';

@Component({
  selector: 'app-analyst-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-head">
      <div class="head-badge-row">
        <span class="head-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10"/>
            <path d="M12 2a10 10 0 0 1 10 10"/>
            <circle cx="12" cy="12" r="3" fill="currentColor"/>
          </svg>
          MICROFRONTEND · LANGGRAPH REACT
        </span>
        <span class="head-status">
          <span class="status-dot"></span>
          35.718 Contratos indexados
        </span>
      </div>

      <div class="head-title-row">
        <div>
          <h1>Analista Inteligente</h1>
          <p class="lead">
            Consulta en lenguaje natural sobre la contratación pública de SECOP II en el Cauca.
            El agente autónomo formula SQL de solo lectura, realiza búsqueda híbrida y espera aprobación
            en consultas computacionalmente costosas.
          </p>
        </div>

        <div class="head-actions">
          <button
            type="button"
            class="button button--quiet"
            (click)="reloadFrame()"
            title="Reiniciar microfrontend del analista"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16"/>
              <path d="M3 21v-5h5"/>
            </svg>
            <span>Reiniciar</span>
          </button>

          <a
            [href]="analystStandaloneUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="button"
            title="Abrir el analista en una pestaña independiente"
          >
            <span>Pestaña completa</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </a>
        </div>
      </div>

      <!-- Feature pills -->
      <div class="feature-strip">
        <div class="pill">
          <span class="pill__icon">⚡</span>
          <span>Búsqueda Híbrida (Vectorial + BM25)</span>
        </div>
        <div class="pill">
          <span class="pill__icon">📊</span>
          <span>Generación de SQL con Cuotas</span>
        </div>
        <div class="pill">
          <span class="pill__icon">🛡️</span>
          <span>Supervisión de Costo Human-in-the-Loop</span>
        </div>
        <div class="pill">
          <span class="pill__icon">🤖</span>
          <span>Gemini 2.5 Flash en Vertex AI</span>
        </div>
      </div>
    </header>

    <div class="frame-container card card--raised">
      @if (isLoading()) {
        <div class="frame-loader" aria-live="polite">
          <div class="spinner" aria-hidden="true"></div>
          <p class="muted">Conectando con el microfrontend de SECOP Analyst...</p>
        </div>
      }

      <iframe
        #analystIframe
        [src]="safeUrl()"
        title="SECOP Analyst Microfrontend"
        class="analyst-frame"
        [class.analyst-frame--loaded]="!isLoading()"
        (load)="onIframeLoad()"
        allow="clipboard-write"
      ></iframe>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }

    .head-badge-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .head-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: var(--accent);
      background: var(--accent-soft);
      border: 1px solid var(--accent-border);
      padding: 3px 8px;
      border-radius: var(--radius-sm);
    }

    .head-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.76rem;
      color: var(--muted);
      font-weight: 500;
    }

    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 0 2px var(--ok-soft);
    }

    .head-title-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
    }

    .head-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 4px;
    }

    .feature-strip {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 14px;
    }

    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 0.78rem;
      font-weight: 500;
      color: var(--text-secondary);
      background: var(--surface-2);
      border: 1px solid var(--line);
      padding: 5px 10px;
      border-radius: var(--radius-pill);
    }

    .pill__icon {
      font-size: 0.85rem;
    }

    .frame-container {
      position: relative;
      margin-top: 20px;
      padding: 0;
      overflow: hidden;
      min-height: 780px;
      height: calc(100vh - 220px);
      border-radius: var(--radius-lg);
      border: 1px solid var(--line-strong);
      background: var(--surface);
      display: flex;
      flex-direction: column;
    }

    .frame-loader {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: var(--surface);
      z-index: 10;
    }

    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid var(--line);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .analyst-frame {
      width: 100%;
      height: 100%;
      flex: 1;
      border: 0;
      opacity: 0;
      transition: opacity 0.25s ease;
    }

    .analyst-frame--loaded {
      opacity: 1;
    }

    @media (max-width: 768px) {
      .frame-container {
        height: calc(100vh - 260px);
        min-height: 600px;
      }
    }
  `,
})
export class AnalystPage {
  private readonly theme = inject(ThemeService);
  private readonly sanitizer = inject(DomSanitizer);

  readonly iframeEl = viewChild<ElementRef<HTMLIFrameElement>>('analystIframe');
  readonly isLoading = signal(true);
  readonly analystStandaloneUrl = ANALYST_ORIGIN;

  readonly safeUrl = computed<SafeResourceUrl>(() => {
    const currentTheme = this.theme.preference();
    const url = `${ANALYST_ORIGIN}/?embedded=true&theme=${currentTheme}`;
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    // Synchronize host theme changes into the embedded microfrontend
    effect(() => {
      const currentTheme = this.theme.preference();
      this.syncTheme(currentTheme);
    });
  }

  onIframeLoad(): void {
    this.isLoading.set(false);
    this.syncTheme(this.theme.preference());
  }

  reloadFrame(): void {
    const iframe = this.iframeEl()?.nativeElement;
    if (iframe) {
      this.isLoading.set(true);
      iframe.src = `${ANALYST_ORIGIN}/?embedded=true&theme=${this.theme.preference()}&t=${Date.now()}`;
    }
  }

  private syncTheme(theme: string): void {
    const iframe = this.iframeEl()?.nativeElement;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: 'THEME_CHANGE', theme },
        '*'
      );
    }
  }
}
