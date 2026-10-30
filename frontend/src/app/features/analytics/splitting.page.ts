import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { apiUrl, Cluster, errorMessage, SplittingResponse } from '../../core/api/api';
import { daysBetween, formatCop, formatDay } from '../../core/format';

const THRESHOLDS = [
  { label: '$ 20 millones', value: 20_000_000 },
  { label: '$ 50 millones', value: 50_000_000 },
  { label: '$ 100 millones', value: 100_000_000 },
];
const WINDOWS = [7, 15, 30, 60];

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-head">
      <h1>Posible fraccionamiento</h1>
      <p class="lead">
        Grupos de contratos de una misma entidad con un mismo proveedor, firmados en pocos días, que
        por separado están por debajo de un umbral y juntos lo alcanzan. Es un patrón para revisar,
        no una prueba: hay convenios y obras por etapas que se ven igual.
      </p>
    </header>

    <form class="card card--raised controls" (submit)="$event.preventDefault()">
      <div class="controls__row">
        <label class="field">
          <span>Umbral</span>
          <select class="input" (change)="go({ umbral: $any($event.target).value })">
            @for (t of thresholds; track t.value) {
              <option [value]="t.value" [selected]="t.value === threshold()">{{ t.label }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span>Ventana</span>
          <select class="input" (change)="go({ dias: $any($event.target).value })">
            @for (w of windows; track w) {
              <option [value]="w" [selected]="w === window()">{{ w }} días</option>
            }
          </select>
        </label>
      </div>

      <div class="legend-bar">
        <p class="small muted legend">
          <span class="legend-item"><i class="key key--total"></i> juntos</span>
          <span class="legend-item"><i class="key key--largest"></i> el contrato más grande</span>
          <span class="legend-item"
            ><i class="key key--mark"></i> umbral ({{ cop(threshold(), true) }})</span
          >
        </p>

        @if (result.value(); as r) {
          <p class="small muted summary">
            {{ r.total }} grupos{{
              r.total > r.clusters.length
                ? ', se muestran los ' + r.clusters.length + ' de mayor valor'
                : ''
            }}. Calculado con un algoritmo O(n log n) sobre los contratos del departamento.
          </p>
        }
      </div>
    </form>

    @if (result.isLoading()) {
      <div class="stack">
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton"></div>
        }
      </div>
    } @else if (result.error()) {
      <p class="notice notice--error">{{ message(result.error()) }}</p>
    } @else if (result.value(); as r) {
      @if (r.clusters.length === 0) {
        <div class="card card--subtle empty-state">
          <p class="muted">Ningún grupo con estos parámetros.</p>
        </div>
      }
      <ol class="stack clusters">
        @for (c of r.clusters; track c.contract_ids[0]) {
          <li class="card cluster">
            <div class="cluster__head">
              <div class="cluster__info">
                <h3>{{ c.entity }}</h3>
                <p class="small muted supplier-line">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <span>con {{ c.supplier }}</span>
                </p>
              </div>
              <div class="cluster__total">
                <strong class="cluster__amount">{{ cop(c.total_cop, true) }}</strong>
                <span class="small muted">en {{ c.contracts }} contratos · {{ span(c) }}</span>
              </div>
            </div>

            <!-- One scale for every bar (the largest group), with the threshold marked on it: groups compare at a glance. -->
            <div class="meter-track">
              <div class="meter" role="img" [attr.aria-label]="meterLabel(c)">
                <div class="meter__fill" [style.width.%]="share(c.total_cop)"></div>
                <div
                  class="meter__largest"
                  [style.width.%]="share(c.largest_cop)"
                  title="El contrato más grande del grupo"
                ></div>
                <div class="meter__mark" [style.left.%]="share(threshold())" title="Umbral"></div>
              </div>
            </div>

            <details class="cluster__details">
              <summary class="small">Ver los {{ c.contracts }} contratos</summary>
              <ul class="ids">
                @for (id of c.contract_ids; track id) {
                  <li>
                    <a class="mono contract-tag" [routerLink]="['/contratos', id]">{{ id }}</a>
                  </li>
                }
              </ul>
            </details>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .page-head {
      margin-bottom: 24px;
    }

    .controls {
      display: grid;
      gap: 16px;
      margin-bottom: 24px;
      padding: 20px;
    }

    .controls__row {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
    }
    .controls__row .field {
      flex: 1 1 200px;
    }

    .legend-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
      padding-top: 12px;
      border-top: 1px solid var(--line-subtle);
    }

    .legend {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;
      align-items: center;
      margin: 0;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .key {
      display: inline-block;
      width: 14px;
      height: 8px;
      border-radius: 3px;
      vertical-align: middle;
    }
    .key--total {
      background: var(--accent);
    }
    .key--largest {
      background: color-mix(in srgb, var(--accent) 45%, var(--text));
    }
    .key--mark {
      width: 3px;
      height: 14px;
      background: var(--danger);
      border-radius: 1px;
    }

    .summary {
      margin: 0;
      flex: 1 1 280px;
      text-align: right;
    }

    .clusters {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .cluster {
      display: grid;
      gap: 14px;
      padding: 20px;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
    }
    .cluster:hover {
      border-color: var(--line-strong);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .cluster__head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .cluster__info {
      display: grid;
      gap: 4px;
      flex: 1;
    }
    .cluster__info h3 {
      font-size: 17px;
      margin: 0;
    }

    .supplier-line {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
    }

    .cluster__total {
      display: grid;
      text-align: right;
      gap: 2px;
    }

    .cluster__amount {
      font-size: 20px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      color: var(--text);
    }

    .meter-track {
      background: var(--surface-2);
      border-radius: var(--radius-pill);
      padding: 3px;
      border: 1px solid var(--line);
    }

    .meter {
      position: relative;
      height: 10px;
      border-radius: var(--radius-pill);
      background: transparent;
      overflow: visible;
    }

    .meter__fill {
      height: 100%;
      border-radius: var(--radius-pill);
      background: var(--accent);
      transition: width 0.3s ease;
    }

    .meter__largest {
      position: absolute;
      inset: 0 auto 0 0;
      border-radius: var(--radius-pill);
      background: color-mix(in srgb, var(--accent) 45%, var(--text));
    }

    .meter__mark {
      position: absolute;
      top: -5px;
      width: 2.5px;
      height: 20px;
      background: var(--danger);
      box-shadow: 0 0 4px var(--danger);
      border-radius: 1px;
    }

    .cluster__details {
      padding-top: 6px;
      border-top: 1px solid var(--line-subtle);
    }
    .cluster__details summary {
      cursor: pointer;
      color: var(--accent);
      font-weight: 500;
      user-select: none;
    }
    .cluster__details summary:hover {
      text-decoration: underline;
    }

    .ids {
      columns: 2 240px;
      margin: 10px 0 0;
      padding-left: 0;
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .contract-tag {
      display: inline-block;
      padding: 3px 8px;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: var(--radius-sm);
      color: var(--text);
      font-size: 12px;
      text-decoration: none;
      transition: all 0.15s ease;
    }
    .contract-tag:hover {
      background: var(--surface-3);
      color: var(--accent);
      text-decoration: none;
      border-color: var(--accent-border);
    }

    .empty-state {
      padding: 32px;
      text-align: center;
    }

    @media (max-width: 600px) {
      .cluster__total {
        text-align: left;
      }
      .summary {
        text-align: left;
      }
    }
  `,
})
export class SplittingPage {
  readonly umbral = input<string>();
  readonly dias = input<string>();

  protected readonly thresholds = THRESHOLDS;
  protected readonly windows = WINDOWS;
  protected readonly threshold = computed(() => Number(this.umbral()) || 50_000_000);
  protected readonly window = computed(() => Number(this.dias()) || 30);
  private readonly router = inject(Router);

  protected readonly result = httpResource<SplittingResponse>(() =>
    apiUrl('analytics/splitting/', {
      department: 'Cauca',
      threshold_cop: this.threshold(),
      window_days: this.window(),
    }),
  );

  protected readonly cop = formatCop;
  protected readonly message = errorMessage;

  protected go(params: Record<string, string>): void {
    void this.router.navigate([], { queryParams: params, queryParamsHandling: 'merge' });
  }

  protected span(c: Cluster): string {
    const days = daysBetween(c.first_signed, c.last_signed);
    return days === 0
      ? `el ${formatDay(c.first_signed)}`
      : `en ${days} días desde el ${formatDay(c.first_signed)}`;
  }

  private readonly scale = computed(() =>
    Math.max(1, ...(this.result.value()?.clusters ?? []).map((c) => c.total_cop)),
  );

  protected share(value: number): number {
    return Math.min(100, (value / this.scale()) * 100);
  }

  protected meterLabel(c: Cluster): string {
    return `${formatCop(c.total_cop)} juntos frente a un umbral de ${formatCop(this.threshold())}; el mayor fue de ${formatCop(c.largest_cop)}`;
  }
}
