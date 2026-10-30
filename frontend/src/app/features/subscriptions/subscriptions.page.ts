import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiUrl, errorMessage, SubscriptionPage } from '../../core/api/api';
import { describe } from './rules';

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="head">
      <div>
        <h1>Mis alertas</h1>
        <p class="lead">Cada alerta es un conjunto de reglas. Cuando SECOP publica un contrato que las cumple todas, te
          llega por correo o a tu webhook.</p>
      </div>
      <a class="button" routerLink="nueva">Nueva alerta</a>
    </div>

    @if (subscriptions.isLoading()) {
      <div class="stack">@for (i of [1, 2]; track i) { <div class="skeleton"></div> }</div>
    } @else if (subscriptions.error()) {
      <p class="notice notice--error">{{ message(subscriptions.error()) }}</p>
    } @else if (subscriptions.value(); as page) {
      @if (page.results.length === 0) {
        <div class="card empty">
          <h2>Todavía no tienes alertas</h2>
          <p class="muted">Por ejemplo: obras de vías en el Cauca por más de $ 500 millones.</p>
          <a class="button" routerLink="nueva">Crear la primera</a>
        </div>
      }
      <ul class="stack list">
        @for (s of page.results; track s.id) {
          <li>
            <a class="card item" [routerLink]="[s.id]">
              <div>
                <h3>{{ s.name }}</h3>
                <ul class="rules small muted">
                  @for (rule of rulesOf(s.rules); track $index) { <li>{{ describe(rule) }}</li> }
                </ul>
              </div>
              <div class="tags">
                <span class="chip">{{ s.channel === 'webhook' ? 'Webhook' : 'Correo' }}</span>
                <span class="chip" [class.chip--accent]="s.active">{{ s.active ? 'Activa' : 'Pausada' }}</span>
              </div>
            </a>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: start; gap: 16px; flex-wrap: wrap; }
    .list { list-style: none; padding: 0; margin: 0; }
    .item { display: flex; justify-content: space-between; gap: 16px; color: var(--text); }
    .item:hover { text-decoration: none; background: var(--line); }
    .rules { margin: 4px 0 0; padding-left: 18px; }
    .tags { display: flex; gap: 6px; align-items: start; }
    .empty { text-align: center; display: grid; gap: 8px; justify-items: center; padding: 32px; }
    .empty p { margin: 0; }
  `,
})
export class SubscriptionsPage {
  protected readonly subscriptions = httpResource<SubscriptionPage>(() => apiUrl('subscriptions/'));
  protected readonly describe = describe;
  protected readonly message = errorMessage;

  protected rulesOf(rules: unknown): unknown[] {
    return Array.isArray(rules) ? rules : [];
  }
}
