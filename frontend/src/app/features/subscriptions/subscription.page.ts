import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  Alert,
  apiUrl,
  Contract,
  errorMessage,
  Subscription,
  SubscriptionSecret,
} from '../../core/api/api';
import { CursorList } from '../../core/cursor-list';
import { formatDay } from '../../core/format';
import { ContractCard } from '../../shared/contract-card';
import { describe } from './rules';

@Component({
  imports: [RouterLink, ContractCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="back-nav">
      <a routerLink="/alertas" class="back-link small">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
        <span>← Mis alertas</span>
      </a>
    </nav>

    @if (subscription.value(); as s) {
      <div class="head">
        <div class="head__main">
          <div class="head__status-row">
            <span class="chip" [class.chip--ok]="s.active" [class.chip--muted]="!s.active">
              <span
                class="status-dot"
                [class.status-dot--active]="s.active"
                aria-hidden="true"
              ></span>
              <span>{{ s.active ? 'Activa' : 'Pausada' }}</span>
            </span>
            <span class="chip chip--channel">
              {{ s.channel === 'webhook' ? 'Webhook firmado' : 'Notificación por Correo' }}
            </span>
          </div>

          <h1>{{ s.name }}</h1>

          <ul class="rules muted">
            @for (rule of rulesOf(s.rules); track $index) {
              <li>{{ describe(rule) }}</li>
            }
          </ul>

          <p class="small muted target-info">
            {{ s.channel === 'webhook' ? 'Webhook' : 'Correo' }} a
            <span class="mono target-box">{{ s.target }}</span> ·
            <span class="status-text">{{ s.active ? 'Activa' : 'Pausada' }}</span>
          </p>
        </div>

        <div class="actions">
          <a class="button button--quiet" [routerLink]="['editar']">Editar</a>
          <button
            class="button button--quiet"
            type="button"
            (click)="toggle(s)"
            [disabled]="busy()"
          >
            {{ s.active ? 'Pausar' : 'Activar' }}
          </button>
          @if (confirming()) {
            <button
              class="button button--danger"
              type="button"
              (click)="remove(s)"
              [disabled]="busy()"
            >
              Sí, borrar
            </button>
            <button class="button button--quiet" type="button" (click)="confirming.set(false)">
              Cancelar
            </button>
          } @else {
            <button class="button button--danger" type="button" (click)="confirming.set(true)">
              Borrar
            </button>
          }
        </div>
      </div>

      @if (actionError(); as error) {
        <p class="notice notice--error">{{ error }}</p>
      }

      @if (s.channel === 'webhook') {
        <section class="card secret card--raised">
          <h2>Firma del webhook</h2>
          <p class="small muted">
            Cada envío lleva
            <span class="mono">X-Alertas-Signature: sha256=HMAC(clave, timestamp.cuerpo)</span>.
            Verifícala en tu servidor y rechaza timestamps viejos.
          </p>
          @if (secret(); as key) {
            <div class="row key-row">
              <code class="mono key">{{ key }}</code>
              <button class="button button--quiet" type="button" (click)="copy(key)">
                {{ copied() ? 'Copiada' : 'Copiar' }}
              </button>
            </div>
          } @else {
            <button class="button button--quiet" type="button" (click)="reveal(s)">
              Mostrar la clave
            </button>
          }
        </section>
      }

      <section class="preview-section">
        <div class="section-head">
          <h2>Lo que ya habría coincidido</h2>
          <p class="small muted">
            Los contratos más recientes que cumplen estas reglas, calculados en la base de datos.
          </p>
        </div>
        @if (preview.isLoading()) {
          <div class="skeleton"></div>
        } @else if (preview.value(); as contracts) {
          @if (contracts.length === 0) {
            <div class="card card--subtle empty-card">
              <p class="muted">Ningún contrato cargado cumple estas reglas todavía.</p>
            </div>
          }
          <div class="stack">
            @for (c of contracts; track c.id) {
              <app-contract-card [contract]="c" />
            }
          </div>
        }
      </section>

      <section class="alerts-section">
        <div class="section-head">
          <h2>Alertas</h2>
          <p class="small muted">Notificaciones generadas para esta suscripción.</p>
        </div>
        <ul class="stack alerts">
          @for (a of alerts.items(); track a.id) {
            <li class="card alert">
              <a [routerLink]="['/contratos', a.contract.id]">{{ a.contract.entity }}</a>
              <span class="small muted">{{ day(a.created_at) }}</span>
              <span
                class="chip"
                [class.chip--accent]="a.delivered_at"
                [class.chip--muted]="!a.delivered_at"
              >
                {{ a.delivered_at ? 'Enviada' : 'Pendiente (' + a.attempts + ' intentos)' }}
              </span>
            </li>
          }
        </ul>
        @if (alerts.empty()) {
          <div class="card card--subtle empty-card">
            <p class="muted">
              Aún no hay alertas. Llegan cuando la carga diaria trae contratos que coinciden.
            </p>
          </div>
        }
        @if (alerts.error(); as error) {
          <p class="notice notice--error">{{ error }}</p>
        }
        @if (alerts.hasMore() && !alerts.loading()) {
          <button class="button button--quiet more-btn" type="button" (click)="alerts.more()">
            Cargar más
          </button>
        }
      </section>
    } @else if (subscription.error()) {
      <div class="card empty-card">
        <h1>Alerta no encontrada</h1>
        <p class="notice notice--error">Esta alerta no existe o no es tuya.</p>
        <a routerLink="/alertas" class="button button--quiet">Ir a mis alertas</a>
      </div>
    } @else {
      <div class="skeleton" style="min-height: 240px; margin-top: 16px"></div>
    }
  `,
  styles: `
    .back-nav {
      margin-bottom: 20px;
    }
    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--muted);
      font-weight: 500;
      text-decoration: none;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      transition: all 0.15s ease;
    }
    .back-link:hover {
      color: var(--text);
      background: var(--surface-2);
      text-decoration: none;
    }

    .head {
      display: flex;
      justify-content: space-between;
      gap: 20px;
      flex-wrap: wrap;
      margin-bottom: 24px;
      align-items: flex-start;
    }
    .head__main {
      display: grid;
      gap: 8px;
      flex: 1 1 360px;
    }

    .head__status-row {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 4px;
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

    .rules {
      margin: 4px 0 8px;
      padding-left: 20px;
      line-height: 1.6;
    }

    .target-info {
      margin: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
    }
    .target-box {
      background: var(--surface-2);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid var(--line);
    }

    .actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      align-items: start;
    }

    section {
      margin-top: 32px;
    }
    .section-head {
      margin-bottom: 14px;
    }
    .section-head h2 {
      margin-bottom: 4px;
    }

    .secret {
      padding: 20px;
    }
    .secret p {
      margin: 0 0 14px;
    }
    .key-row {
      align-items: center;
    }
    .key {
      background: var(--surface-2);
      padding: 10px 14px;
      border-radius: var(--radius);
      border: 1px solid var(--line);
      overflow-wrap: anywhere;
      flex: 1;
      font-size: 13px;
    }

    .alerts {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .alert {
      display: flex;
      gap: 14px;
      align-items: center;
      flex-wrap: wrap;
      padding: 14px 18px;
    }
    .alert a {
      flex: 1;
      color: var(--text);
      font-weight: 500;
      text-decoration: none;
    }
    .alert a:hover {
      color: var(--accent);
      text-decoration: underline;
    }

    .empty-card {
      padding: 24px;
      text-align: center;
    }

    .more-btn {
      margin-top: 12px;
      justify-self: center;
    }
  `,
})
export class SubscriptionPage {
  readonly id = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly subscription = httpResource<Subscription>(() =>
    apiUrl(`subscriptions/${this.id()}/`),
  );
  protected readonly preview = httpResource<Contract[]>(() =>
    apiUrl(`subscriptions/${this.id()}/preview/`),
  );
  protected readonly alerts = new CursorList<Alert>(this.http);
  protected readonly secret = signal<string | null>(null);
  protected readonly copied = signal(false);
  protected readonly confirming = signal(false);
  protected readonly busy = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly describe = describe;
  protected readonly day = formatDay;

  constructor() {
    effect(() => {
      const url = apiUrl('alerts/', { subscription: this.id() });
      untracked(() => this.alerts.reset(url));
    });
  }

  protected rulesOf(rules: unknown): unknown[] {
    return Array.isArray(rules) ? rules : [];
  }

  protected async toggle(s: Subscription): Promise<void> {
    await this.act(async () => {
      const updated = await firstValueFrom(
        this.http.patch<Subscription>(apiUrl(`subscriptions/${s.id}/`), { active: !s.active }),
      );
      this.subscription.set(updated);
    });
  }

  protected async remove(s: Subscription): Promise<void> {
    await this.act(async () => {
      await firstValueFrom(this.http.delete(apiUrl(`subscriptions/${s.id}/`)));
      await this.router.navigate(['/alertas']);
    });
  }

  protected async reveal(s: Subscription): Promise<void> {
    await this.act(async () => {
      const { secret } = await firstValueFrom(
        this.http.get<SubscriptionSecret>(apiUrl(`subscriptions/${s.id}/secret/`)),
      );
      this.secret.set(secret);
    });
  }

  protected async copy(key: string): Promise<void> {
    await navigator.clipboard.writeText(key);
    this.copied.set(true);
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.actionError.set(null);
    try {
      await action();
    } catch (error) {
      this.actionError.set(errorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
