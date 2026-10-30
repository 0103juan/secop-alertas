import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { Session } from './core/auth/session';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip" href="#contenido">Saltar al contenido</a>
    <header class="bar">
      <nav class="bar__inner" aria-label="Principal">
        <a class="brand" routerLink="/">SECOP <span>alertas</span></a>
        <ul class="links">
          <li><a routerLink="/contratos" routerLinkActive="active">Contratos</a></li>
          <li><a routerLink="/lecturas/fraccionamiento" routerLinkActive="active">Fraccionamiento</a></li>
          <li><a routerLink="/lecturas/atipicos" routerLinkActive="active">Atípicos</a></li>
          <li><a routerLink="/alertas" routerLinkActive="active">Mis alertas</a></li>
        </ul>
        <div class="account">
          @if (session.user(); as user) {
            <span class="who" [title]="user.email">{{ user.username }}</span>
            <button type="button" class="button button--quiet" (click)="logout()">Salir</button>
          } @else {
            <a class="button button--quiet" routerLink="/ingresar">Ingresar</a>
            <a class="button" routerLink="/registro">Crear cuenta</a>
          }
        </div>
      </nav>
    </header>
    <main id="contenido" class="page">
      <router-outlet />
    </main>
    <footer class="foot">
      Datos abiertos de SECOP II (Colombia Compra Eficiente) en datos.gov.co. Las lecturas describen patrones en los
      datos; no juzgan a ninguna entidad.
      <a href="/api/docs/">API</a> ·
      <a href="https://github.com/0103juan/secop-alertas">Código</a>
    </footer>
  `,
  styles: `
    .skip { position: absolute; left: -999px; }
    .skip:focus { left: 16px; top: 12px; z-index: 10; background: var(--surface); padding: 8px 12px; border-radius: 8px; }
    .bar { position: sticky; top: 0; z-index: 5; backdrop-filter: saturate(180%) blur(20px);
      background: color-mix(in srgb, var(--surface) 80%, transparent); border-bottom: 1px solid var(--line); }
    .bar__inner { max-width: var(--width); margin: 0 auto; padding: 10px 16px; display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
    .brand { font-weight: 700; letter-spacing: -0.02em; color: var(--text); }
    .brand span { color: var(--accent); }
    .links { display: flex; gap: 4px; list-style: none; margin: 0; padding: 0; flex: 1; flex-wrap: wrap; }
    .links a { color: var(--muted); padding: 6px 10px; border-radius: 999px; font-size: 14px; }
    .links a:hover { color: var(--text); }
    .links a.active { color: var(--text); background: var(--surface-2); }
    .account { display: flex; gap: 8px; align-items: center; }
    .who { font-size: 14px; color: var(--muted); }
    @media (max-width: 640px) {
      .bar__inner { gap: 8px 12px; }
      .links { order: 3; flex-basis: 100%; flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; }
      .links a { white-space: nowrap; }
      .account { margin-left: auto; }
      .who { display: none; }
    }
    .foot { max-width: var(--width); margin: 48px auto 0; padding: 24px 16px 40px; color: var(--muted); font-size: 13px;
      border-top: 1px solid var(--line); }
  `,
})
export class App {
  protected readonly session = inject(Session);
  private readonly router = inject(Router);

  protected async logout(): Promise<void> {
    await this.session.logout();
    await this.router.navigate(['/contratos']);
  }
}
