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
    <h1>Posible fraccionamiento</h1>
    <p class="lead">
      Grupos de contratos de una misma entidad con un mismo proveedor, firmados en pocos días, que por separado están
      por debajo de un umbral y juntos lo alcanzan. Es un patrón para revisar, no una prueba: hay convenios y obras
      por etapas que se ven igual.
    </p>

    <form class="row card controls" (submit)="$event.preventDefault()">
      <label class="field">
        <span>Umbral</span>
        <select class="input" (change)="go({ umbral: $any($event.target).value })">
          @for (t of thresholds; track t.value) { <option [value]="t.value" [selected]="t.value === threshold()">{{ t.label }}</option> }
        </select>
      </label>
      <label class="field">
        <span>Ventana</span>
        <select class="input" (change)="go({ dias: $any($event.target).value })">
          @for (w of windows; track w) { <option [value]="w" [selected]="w === window()">{{ w }} días</option> }
        </select>
      </label>
      <p class="small muted legend">
        <i class="key key--total"></i> juntos · <i class="key key--largest"></i> el contrato más grande ·
        <i class="key key--mark"></i> umbral
      </p>
      @if (result.value(); as r) {
        <p class="small muted summary">
          {{ r.total }} grupos{{ r.total > r.clusters.length ? ', se muestran los ' + r.clusters.length + ' de mayor valor' : '' }}.
          Calculado con un algoritmo O(n log n) sobre los contratos del departamento.
        </p>
      }
    </form>

    @if (result.isLoading()) {
      <div class="stack">@for (i of [1, 2, 3]; track i) { <div class="skeleton"></div> }</div>
    } @else if (result.error()) {
      <p class="notice notice--error">{{ message(result.error()) }}</p>
    } @else if (result.value(); as r) {
      @if (r.clusters.length === 0) { <p class="card muted">Ningún grupo con estos parámetros.</p> }
      <ol class="stack clusters">
        @for (c of r.clusters; track c.contract_ids[0]) {
          <li class="card cluster">
            <div class="cluster__head">
              <div>
                <h3>{{ c.entity }}</h3>
                <p class="small muted">con {{ c.supplier }}</p>
              </div>
              <div class="cluster__total">
                <strong>{{ cop(c.total_cop, true) }}</strong>
                <span class="small muted">en {{ c.contracts }} contratos · {{ span(c) }}</span>
              </div>
            </div>
            <!-- One scale for every bar (the largest group), with the threshold marked on it: groups compare at a glance. -->
            <div class="meter" role="img" [attr.aria-label]="meterLabel(c)">
              <div class="meter__fill" [style.width.%]="share(c.total_cop)"></div>
              <div class="meter__largest" [style.width.%]="share(c.largest_cop)" title="El contrato más grande del grupo"></div>
              <div class="meter__mark" [style.left.%]="share(threshold())" title="Umbral"></div>
            </div>
            <details>
              <summary class="small">Ver los {{ c.contracts }} contratos</summary>
              <ul class="ids">
                @for (id of c.contract_ids; track id) { <li><a class="mono" [routerLink]="['/contratos', id]">{{ id }}</a></li> }
              </ul>
            </details>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .controls { margin-bottom: 20px; }
    .summary { margin: 0 0 8px; flex: 1 1 260px; }
    .legend { flex-basis: 100%; margin: 0; }
    .key { display: inline-block; width: 12px; height: 8px; border-radius: 4px; vertical-align: middle; }
    .key--total { background: var(--accent); }
    .key--largest { background: color-mix(in srgb, var(--accent) 45%, var(--text)); }
    .key--mark { width: 2px; height: 12px; background: var(--danger); }
    .clusters { list-style: none; padding: 0; margin: 0; }
    .cluster { display: grid; gap: 10px; }
    .cluster__head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
    .cluster__head p { margin: 0; }
    .cluster__total { display: grid; text-align: right; }
    .cluster__total strong { font-size: 20px; font-variant-numeric: tabular-nums; }
    .meter { position: relative; height: 8px; border-radius: 999px; background: var(--surface); overflow: visible; }
    .meter__fill { height: 100%; border-radius: 999px; background: var(--accent); }
    .meter__largest { position: absolute; inset: 0 auto 0 0; border-radius: 999px; background: color-mix(in srgb, var(--accent) 45%, var(--text)); }
    .meter__mark { position: absolute; top: -4px; width: 2px; height: 16px; background: var(--danger); }
    .ids { columns: 2 220px; margin: 8px 0 0; padding-left: 18px; }
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
    return days === 0 ? `el ${formatDay(c.first_signed)}` : `en ${days} días desde el ${formatDay(c.first_signed)}`;
  }

  /** The scale of every bar: the largest group on the page. */
  private readonly scale = computed(() => Math.max(1, ...(this.result.value()?.clusters ?? []).map((c) => c.total_cop)));

  protected share(value: number): number {
    return Math.min(100, (value / this.scale()) * 100);
  }

  protected meterLabel(c: Cluster): string {
    return `${formatCop(c.total_cop)} juntos frente a un umbral de ${formatCop(this.threshold())}; el mayor fue de ${formatCop(c.largest_cop)}`;
  }
}
