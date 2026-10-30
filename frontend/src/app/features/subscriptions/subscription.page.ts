import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Alert, apiUrl, Contract, errorMessage, Subscription, SubscriptionSecret } from '../../core/api/api';
import { CursorList } from '../../core/cursor-list';
import { formatDay } from '../../core/format';
import { ContractCard } from '../../shared/contract-card';
import { describe } from './rules';

@Component({
  imports: [RouterLink, ContractCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/alertas" class="small">← Mis alertas</a>
    @if (subscription.value(); as s) {
      <div class="head">
        <div>
          <h1>{{ s.name }}</h1>
          <ul class="rules muted">
            @for (rule of rulesOf(s.rules); track $index) { <li>{{ describe(rule) }}</li> }
          </ul>
          <p class="small muted">
            {{ s.channel === 'webhook' ? 'Webhook' : 'Correo' }} a <span class="mono">{{ s.target }}</span> ·
            {{ s.active ? 'Activa' : 'Pausada' }}
          </p>
        </div>
        <div class="actions">
          <a class="button button--quiet" [routerLink]="['editar']">Editar</a>
          <button class="button button--quiet" type="button" (click)="toggle(s)" [disabled]="busy()">
            {{ s.active ? 'Pausar' : 'Activar' }}
          </button>
          @if (confirming()) {
            <button class="button button--danger" type="button" (click)="remove(s)" [disabled]="busy()">Sí, borrar</button>
            <button class="button button--quiet" type="button" (click)="confirming.set(false)">Cancelar</button>
          } @else {
            <button class="button button--danger" type="button" (click)="confirming.set(true)">Borrar</button>
          }
        </div>
      </div>
      @if (actionError(); as error) { <p class="notice notice--error">{{ error }}</p> }

      @if (s.channel === 'webhook') {
        <section class="card secret">
          <h2>Firma del webhook</h2>
          <p class="small muted">Cada envío lleva <span class="mono">X-Alertas-Signature: sha256=HMAC(clave, timestamp.cuerpo)</span>.
            Verifícala en tu servidor y rechaza timestamps viejos.</p>
          @if (secret(); as key) {
            <div class="row"><code class="mono key">{{ key }}</code>
              <button class="button button--quiet" type="button" (click)="copy(key)">{{ copied() ? 'Copiada' : 'Copiar' }}</button></div>
          } @else {
            <button class="button button--quiet" type="button" (click)="reveal(s)">Mostrar la clave</button>
          }
        </section>
      }

      <section>
        <h2>Lo que ya habría coincidido</h2>
        <p class="small muted">Los contratos más recientes que cumplen estas reglas, calculados en la base de datos.</p>
        @if (preview.isLoading()) {
          <div class="skeleton"></div>
        } @else if (preview.value(); as contracts) {
          @if (contracts.length === 0) { <p class="card muted">Ningún contrato cargado cumple estas reglas todavía.</p> }
          <div class="stack">@for (c of contracts; track c.id) { <app-contract-card [contract]="c" /> }</div>
        }
      </section>

      <section>
        <h2>Alertas</h2>
        <ul class="stack alerts">
          @for (a of alerts.items(); track a.id) {
            <li class="card alert">
              <a [routerLink]="['/contratos', a.contract.id]">{{ a.contract.entity }}</a>
              <span class="small muted">{{ day(a.created_at) }}</span>
              <span class="chip" [class.chip--accent]="a.delivered_at">
                {{ a.delivered_at ? 'Enviada' : 'Pendiente (' + a.attempts + ' intentos)' }}
              </span>
            </li>
          }
        </ul>
        @if (alerts.empty()) { <p class="card muted">Aún no hay alertas. Llegan cuando la carga diaria trae contratos que coinciden.</p> }
        @if (alerts.error(); as error) { <p class="notice notice--error">{{ error }}</p> }
        @if (alerts.hasMore() && !alerts.loading()) {
          <button class="button button--quiet" type="button" (click)="alerts.more()">Cargar más</button>
        }
      </section>
    } @else if (subscription.error()) {
      <h1>Alerta no encontrada</h1>
      <p class="notice notice--error">Esta alerta no existe o no es tuya.</p>
    } @else {
      <div class="skeleton" style="min-height: 240px; margin-top: 16px"></div>
    }
  `,
  styles: `
    .head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; }
    .rules { margin: 0 0 8px; padding-left: 18px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: start; }
    section { margin-top: 28px; }
    .secret p { margin: 0 0 12px; }
    .key { background: var(--surface); padding: 8px 12px; border-radius: 8px; overflow-wrap: anywhere; flex: 1; }
    .alerts { list-style: none; padding: 0; margin: 0; }
    .alert { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .alert a { flex: 1; color: var(--text); font-weight: 500; }
  `,
})
export class SubscriptionPage {
  readonly id = input.required<string>();
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly subscription = httpResource<Subscription>(() => apiUrl(`subscriptions/${this.id()}/`));
  protected readonly preview = httpResource<Contract[]>(() => apiUrl(`subscriptions/${this.id()}/preview/`));
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
      this.subscription.set(updated); // the server's answer is the new state; no refetch needed
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
      const { secret } = await firstValueFrom(this.http.get<SubscriptionSecret>(apiUrl(`subscriptions/${s.id}/secret/`)));
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
