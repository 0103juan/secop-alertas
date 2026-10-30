import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="card card--subtle not-found">
      <div class="not-found__badge">404</div>
      <h1>Esta página no existe</h1>
      <p class="lead">
        Puede que el enlace esté mal escrito o que el contenido ya no esté disponible.
      </p>
      <div class="not-found__actions">
        <a class="button" routerLink="/contratos">Ir a los contratos</a>
        <a class="button button--quiet" routerLink="/">Inicio</a>
      </div>
    </div>
  `,
  styles: `
    .not-found {
      max-width: 520px;
      margin: 48px auto;
      text-align: center;
      padding: 40px 24px;
      display: grid;
      gap: 12px;
      justify-items: center;
    }
    .not-found__badge {
      font-size: 14px;
      font-weight: 700;
      letter-spacing: 0.1em;
      color: var(--accent);
      background: var(--accent-soft);
      border: 1px solid var(--accent-border);
      padding: 4px 12px;
      border-radius: var(--radius-pill);
    }
    .not-found h1 {
      margin: 0;
      font-size: 26px;
    }
    .not-found .lead {
      margin: 0;
      font-size: 15px;
    }
    .not-found__actions {
      display: flex;
      gap: 10px;
      margin-top: 8px;
      flex-wrap: wrap;
      justify-content: center;
    }
  `,
})
export class NotFoundPage {}
