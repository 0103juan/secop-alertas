import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Session } from './core/auth/session';
import { ThemeService } from './core/theme.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="bar">
      <nav class="bar__inner" aria-label="Principal">
        <a class="brand" routerLink="/">
          <svg
            class="brand__icon"
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="2"
              stroke-opacity="0.25"
            />
            <circle
              cx="12"
              cy="12"
              r="6"
              stroke="currentColor"
              stroke-width="2"
              stroke-opacity="0.5"
            />
            <circle cx="12" cy="12" r="2.5" fill="var(--accent)" />
            <path
              d="M12 2C17.5228 2 22 6.47715 22 12"
              stroke="var(--accent)"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </svg>
          <span class="brand__text">SECOP <span>alertas</span></span>
          <span class="brand__badge">OBSERVATORIO</span>
        </a>

        <ul class="links">
          <li><a routerLink="/contratos" routerLinkActive="active">Contratos</a></li>
          <li>
            <a routerLink="/lecturas/fraccionamiento" routerLinkActive="active">Fraccionamiento</a>
          </li>
          <li><a routerLink="/lecturas/atipicos" routerLinkActive="active">Atípicos</a></li>
          <li><a routerLink="/alertas" routerLinkActive="active">Mis alertas</a></li>
          <li>
            <a routerLink="/analista" routerLinkActive="active" class="link--ai">
              <span>Analista AI</span>
              <span class="nav-chip">AGENTE</span>
            </a>
          </li>
        </ul>

        <div class="actions">
          <button
            type="button"
            class="theme-toggle"
            (click)="theme.toggle()"
            [attr.aria-label]="
              theme.preference() === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'
            "
            [title]="theme.preference() === 'dark' ? 'Modo claro' : 'Modo oscuro'"
          >
            @if (theme.preference() === 'dark') {
              <!-- Sun Icon -->
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
              </svg>
            } @else {
              <!-- Moon Icon -->
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            }
          </button>

          <div class="account">
            @if (session.user(); as user) {
              <span class="who" [title]="user.email">{{ user.username }}</span>
              <button type="button" class="button button--quiet" (click)="logout()">Salir</button>
            } @else {
              <a class="button button--quiet" routerLink="/ingresar">Ingresar</a>
              <a class="button" routerLink="/registro">Crear cuenta</a>
            }
          </div>
        </div>
      </nav>
    </header>

    <main id="contenido" class="page">
      <router-outlet />
    </main>

    <footer class="foot">
      <div class="foot__inner">
        <div class="foot__info">
          <div class="foot__brand">
            <strong>SECOP alertas</strong> · Monitoreo y analítica cívica de contratación pública en
            Colombia
          </div>
          <p class="foot__note">
            Datos abiertos oficiales de SECOP II (Colombia Compra Eficiente) en datos.gov.co. Las
            lecturas describen patrones estadísticos objetivos en los datos; no juzgan
            intencionalidad de ninguna entidad.
          </p>
        </div>
        <div class="foot__links">
          <a href="/api/docs/" target="_blank" rel="noopener">Documentación API</a>
          <span class="foot__sep" aria-hidden="true">·</span>
          <a href="https://github.com/0103juan/secop-alertas" target="_blank" rel="noopener"
            >Código en GitHub</a
          >
        </div>
      </div>
    </footer>
  `,
  styles: `
    .skip {
      position: absolute;
      left: -999px;
      top: 12px;
      z-index: 50;
      background: var(--surface);
      color: var(--text);
      padding: 8px 14px;
      border-radius: var(--radius);
      border: 1px solid var(--line);
      box-shadow: var(--shadow-md);
      font-weight: 500;
    }
    .skip:focus {
      left: 16px;
    }

    .bar {
      position: sticky;
      top: 0;
      z-index: 20;
      backdrop-filter: saturate(180%) blur(16px);
      -webkit-backdrop-filter: saturate(180%) blur(16px);
      background: color-mix(in srgb, var(--surface) 85%, transparent);
      border-bottom: 1px solid var(--line);
    }
    .bar__inner {
      max-width: var(--width);
      margin: 0 auto;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      flex-wrap: wrap;
    }

    .brand {
      display: inline-flex;
      align-items: center;
      gap: 10px;
      text-decoration: none;
      color: var(--text);
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand:hover {
      text-decoration: none;
    }
    .brand__icon {
      color: var(--text);
      flex-shrink: 0;
    }
    .brand__text {
      font-size: 17px;
      font-weight: 700;
    }
    .brand__text span {
      color: var(--accent);
      font-weight: 600;
    }
    .brand__badge {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      padding: 2px 7px;
      border-radius: 4px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      color: var(--muted);
    }

    .links {
      display: flex;
      align-items: center;
      gap: 4px;
      list-style: none;
      margin: 0;
      padding: 0;
      flex: 1;
      flex-wrap: wrap;
    }
    .links a {
      color: var(--muted);
      padding: 6px 12px;
      border-radius: var(--radius-pill);
      font-size: 13.5px;
      font-weight: 500;
      transition: all 0.15s ease;
      text-decoration: none;
    }
    .links a:hover {
      color: var(--text);
      background: var(--surface-2);
    }
    .links a.active {
      color: var(--text);
      background: var(--surface-2);
      border: 1px solid var(--line);
      font-weight: 600;
    }
    .links a.link--ai {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--accent);
      background: var(--accent-soft);
      border: 1px solid var(--accent-border);
    }
    .links a.link--ai:hover {
      background: var(--accent-border);
      color: var(--accent-hover);
    }
    .links a.link--ai.active {
      background: var(--accent);
      color: #ffffff;
      border-color: var(--accent);
    }
    .links a.link--ai.active .nav-chip {
      background: rgba(255, 255, 255, 0.25);
      color: #ffffff;
    }
    .nav-chip {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.05em;
      padding: 1px 5px;
      border-radius: var(--radius-sm);
      background: var(--accent);
      color: #ffffff;
    }

    .actions {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-left: auto;
    }

    .theme-toggle {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      border-radius: var(--radius);
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: var(--shadow-sm);
    }
    .theme-toggle:hover {
      color: var(--text);
      background: var(--surface-2);
      border-color: var(--line-strong);
    }

    .account {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .who {
      font-size: 13.5px;
      font-weight: 500;
      color: var(--muted);
      padding: 0 4px;
    }

    @media (max-width: 768px) {
      .bar__inner {
        gap: 10px 14px;
      }
      .brand__badge {
        display: none;
      }
      .links {
        order: 3;
        flex-basis: 100%;
        overflow-x: auto;
        white-space: nowrap;
        scrollbar-width: none;
        padding-bottom: 2px;
      }
      .links::-webkit-scrollbar {
        display: none;
      }
      .who {
        display: none;
      }
    }

    .foot {
      max-width: var(--width);
      margin: 56px auto 0;
      padding: 28px 20px 48px;
      border-top: 1px solid var(--line);
    }
    .foot__inner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 24px;
      flex-wrap: wrap;
    }
    .foot__info {
      max-width: 68ch;
    }
    .foot__brand {
      color: var(--text);
      font-size: 14px;
      margin-bottom: 6px;
    }
    .foot__note {
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      margin: 0;
    }
    .foot__links {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      white-space: nowrap;
    }
    .foot__links a {
      color: var(--muted);
      text-decoration: none;
    }
    .foot__links a:hover {
      color: var(--text);
      text-decoration: underline;
    }
    .foot__sep {
      color: var(--muted-soft);
    }
  `,
})
export class App {
  protected readonly session = inject(Session);
  protected readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/contratos']);
  }
}
