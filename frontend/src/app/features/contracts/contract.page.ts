import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiUrl, Contract, errorMessage } from '../../core/api/api';
import { formatCop, formatDay } from '../../core/format';

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="back-nav">
      <a routerLink="/contratos" class="back-link small">
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
        <span>Volver a Contratos</span>
      </a>
    </nav>

    @if (contract.value(); as c) {
      <article class="detail">
        <header class="detail__head">
          <div class="detail__title-wrap">
            <div class="detail__badge-row">
              <span class="chip chip--accent">{{ c.department }}</span>
              @if (c.status) {
                <span class="chip">{{ c.status }}</span>
              }
            </div>
            <h1>{{ c.entity }}</h1>
          </div>
        </header>

        <section class="card detail__object-card">
          <h2 class="detail__section-title">Objeto del contrato</h2>
          <p class="detail__object-text">{{ c.object }}</p>
        </section>

        <section class="detail__facts-wrap">
          <h2 class="detail__section-title">Ficha técnica del proceso</h2>
          <dl class="facts">
            <div class="card fact-card fact-card--highlight">
              <dt>Valor</dt>
              <dd class="fact-value fact-value--primary">{{ cop(c.value_cop) }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Firmado</dt>
              <dd class="fact-value">{{ day(c.signed_on) }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Modalidad</dt>
              <dd class="fact-value">{{ c.modality || 'Sin dato' }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Tipo</dt>
              <dd class="fact-value">{{ c.contract_type || 'Sin dato' }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Estado</dt>
              <dd class="fact-value">{{ c.status || 'Sin dato' }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Proveedor</dt>
              <dd class="fact-value">{{ c.supplier || 'Sin dato' }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Entidad (NIT)</dt>
              <dd class="mono fact-value">{{ c.entity_nit ?? 'Sin dato' }}</dd>
            </div>
            <div class="card fact-card">
              <dt>Id en SECOP</dt>
              <dd class="mono fact-value">{{ c.id }}</dd>
            </div>
          </dl>
        </section>

        @if (c.url) {
          <div class="detail__actions">
            <a class="button button--external" [href]="c.url" target="_blank" rel="noopener">
              <span>Ver el proceso en SECOP II</span>
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </div>
        }
      </article>
    } @else if (contract.error()) {
      <div class="card empty-state">
        <h1>Contrato no encontrado</h1>
        <p class="notice notice--error">{{ message(contract.error()) }}</p>
        <a routerLink="/contratos" class="button button--quiet">Ir al listado</a>
      </div>
    } @else {
      <div class="skeleton" style="min-height: 280px; margin-top: 16px"></div>
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

    .detail {
      display: grid;
      gap: 24px;
    }

    .detail__head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }

    .detail__title-wrap {
      display: grid;
      gap: 8px;
    }

    .detail__badge-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .detail__section-title {
      font-size: 15px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      font-weight: 600;
      margin-bottom: 12px;
    }

    .detail__object-card {
      background: var(--surface);
      border: 1px solid var(--line);
      padding: 20px;
    }

    .detail__object-text {
      color: var(--text);
      font-size: 16px;
      line-height: 1.6;
      margin: 0;
    }

    .facts {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 12px;
      margin: 0;
    }

    .fact-card {
      display: grid;
      gap: 4px;
      padding: 14px 16px;
      background: var(--surface);
    }

    .fact-card--highlight {
      background: var(--surface-2);
      border-color: var(--line-strong);
    }

    .facts dt {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      font-weight: 600;
    }

    .fact-value {
      margin: 0;
      font-size: 15px;
      font-weight: 500;
      color: var(--text);
      overflow-wrap: anywhere;
    }

    .fact-value--primary {
      font-size: 18px;
      font-weight: 700;
      color: var(--text);
      font-variant-numeric: tabular-nums;
    }

    .detail__actions {
      padding-top: 8px;
    }

    .button--external {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .empty-state {
      padding: 32px;
      text-align: center;
      display: grid;
      gap: 16px;
      justify-items: center;
    }
  `,
})
export class ContractPage {
  readonly id = input.required<string>();
  // httpResource refetches by itself when the route's id changes, and cancels the previous request.
  protected readonly contract = httpResource<Contract>(() =>
    apiUrl(`contracts/${encodeURIComponent(this.id())}/`),
  );
  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly message = errorMessage;
}
