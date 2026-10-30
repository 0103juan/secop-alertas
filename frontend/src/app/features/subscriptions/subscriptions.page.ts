import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiUrl, errorMessage, SubscriptionPage } from '../../core/api/api';
import { describe } from './rules';

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="head">
      <div class="head__text">
        <h1>Mis alertas</h1>
        <p class="lead">
          Cada alerta es un conjunto de reglas. Cuando SECOP publica un contrato que las cumple
          todas, te llega por correo o a tu webhook.
        </p>
      </div>
      <a class="button button--new" routerLink="nueva">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        <span>Nueva alerta</span>
      </a>
    </header>

    @if (subscriptions.isLoading()) {
      <div class="stack">
        @for (i of [1, 2]; track i) {
          <div class="skeleton"></div>
        }
      </div>
    } @else if (subscriptions.error()) {
      <p class="notice notice--error">{{ message(subscriptions.error()) }}</p>
    } @else if (subscriptions.value(); as page) {
      @if (page.results.length === 0) {
        <div class="card card--subtle empty">
          <div class="empty__icon-wrap">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
          </div>
          <h2>Todavía no tienes alertas</h2>
          <p class="muted">Por ejemplo: obras de vías en el Cauca por más de $ 500 millones.</p>
          <a class="button" routerLink="nueva">Crear la primera</a>
        </div>
      }
      <ul class="stack list">
        @for (s of page.results; track s.id) {
          <li>
            <a class="card item" [routerLink]="[s.id]">
              <div class="item__main">
                <h3 class="item__title">{{ s.name }}</h3>
                <ul class="rules small muted">
                  @for (rule of rulesOf(s.rules); track $index) {
                    <li>{{ describe(rule) }}</li>
                  }
                </ul>
              </div>
              <div class="tags">
                <span class="chip chip--channel">
                  @if (s.channel === 'webhook') {
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                  } @else {
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path
                        d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"
                      ></path>
                      <polyline points="22,6 12,13 2,6"></polyline>
                    </svg>
                  }
                  <span>{{ s.channel === 'webhook' ? 'Webhook' : 'Correo' }}</span>
                </span>
                <span class="chip" [class.chip--ok]="s.active" [class.chip--muted]="!s.active">
                  <span
                    class="status-dot"
                    [class.status-dot--active]="s.active"
                    aria-hidden="true"
                  ></span>
                  <span>{{ s.active ? 'Activa' : 'Pausada' }}</span>
                </span>
              </div>
            </a>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 24px;
    }
    .head__text {
      flex: 1 1 340px;
    }
    .head__text .lead {
      margin-bottom: 0;
    }

    .button--new {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .item {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 20px;
      color: var(--text);
      text-decoration: none;
      padding: 18px 20px;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
    }
    .item:hover {
      text-decoration: none;
      border-color: var(--line-strong);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .item__main {
      display: grid;
      gap: 6px;
      flex: 1;
    }

    .item__title {
      font-size: 17px;
      font-weight: 600;
      color: var(--text);
      margin: 0;
    }

    .rules {
      margin: 0;
      padding-left: 18px;
      line-height: 1.5;
    }

    .tags {
      display: flex;
      gap: 8px;
      align-items: center;
      flex-wrap: wrap;
      flex-shrink: 0;
    }

    .status-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--muted-soft);
    }
    .status-dot--active {
      background: var(--ok);
    }

    .empty {
      text-align: center;
      display: grid;
      gap: 12px;
      justify-items: center;
      padding: 40px 20px;
    }
    .empty__icon-wrap {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--surface-2);
      border: 1px solid var(--line);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .empty h2 {
      margin: 0;
    }
    .empty p {
      margin: 0 0 8px;
    }

    @media (max-width: 600px) {
      .item {
        flex-direction: column;
        gap: 12px;
      }
      .tags {
        width: 100%;
        justify-content: flex-start;
      }
    }
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
