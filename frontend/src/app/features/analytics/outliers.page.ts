import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiUrl, errorMessage, OutliersResponse } from '../../core/api/api';
import { formatCop } from '../../core/format';

// The strip shows the modified z-score from -SCALE to +SCALE; the band in the middle is the "usual" range.
const SCALE = 20;
const CUTOFF = 3.5;

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Valores atípicos</h1>
    <p class="lead">
      Contratos cuyo valor está lejos de lo habitual para su modalidad y tipo. Se compara en escala logarítmica con
      la mediana del grupo y su desviación absoluta mediana, que no se dejan arrastrar por los mismos valores
      extremos que se buscan.
    </p>

    @if (result.isLoading()) {
      <div class="stack">@for (i of [1, 2, 3, 4]; track i) { <div class="skeleton"></div> }</div>
    } @else if (result.error()) {
      <p class="notice notice--error">{{ message(result.error()) }}</p>
    } @else if (result.value(); as r) {
      <div class="legend small muted">
        <span><i class="band"></i> rango habitual (|z| ≤ {{ cutoff }})</span>
        <span><i class="dot dot--high"></i> por encima</span>
        <span><i class="dot dot--low"></i> por debajo</span>
      </div>
      <ol class="stack list">
        @for (o of r.outliers; track o.id) {
          <li class="card item">
            <div class="item__text">
              <a [routerLink]="['/contratos', o.id]" class="item__entity">{{ o.entity }}</a>
              <p class="small muted item__object">{{ o.object }}</p>
              <p class="small">
                <strong>{{ cop(o.value_cop) }}</strong>
                <span class="muted"> frente a una mediana de {{ cop(o.group_median_cop) }} en {{ o.group_size }} contratos
                  de «{{ o.modality }} / {{ o.contract_type }}»</span>
              </p>
            </div>
            <svg class="strip" viewBox="0 0 200 24" role="img" [attr.aria-label]="'z = ' + o.z">
              <rect [attr.x]="x(-cutoff)" y="8" [attr.width]="x(cutoff) - x(-cutoff)" height="8" rx="4" class="band" />
              <line [attr.x1]="x(0)" [attr.x2]="x(0)" y1="4" y2="20" class="axis" />
              <circle [attr.cx]="x(o.z)" cy="12" r="5" [class]="o.z > 0 ? 'dot--high' : 'dot--low'" />
            </svg>
            <span class="z mono">z {{ o.z > 0 ? '+' : '' }}{{ o.z }}</span>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
    .legend i { display: inline-block; vertical-align: middle; margin-right: 4px; }
    .legend .band { width: 22px; height: 8px; border-radius: 4px; background: var(--line); }
    .legend .dot { width: 10px; height: 10px; border-radius: 50%; }
    .list { list-style: none; padding: 0; margin: 0; }
    .item { display: grid; grid-template-columns: 1fr 200px 64px; gap: 16px; align-items: center; }
    .item p { margin: 2px 0 0; }
    .item__entity { font-weight: 600; color: var(--text); }
    .item__object { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .strip { width: 200px; height: 24px; }
    .strip .band { fill: var(--line); }
    .strip .axis { stroke: var(--muted); stroke-width: 1; }
    .dot--high { fill: var(--danger); background: var(--danger); }
    .dot--low { fill: var(--accent); background: var(--accent); }
    .z { text-align: right; }
    @media (max-width: 640px) {
      .item { grid-template-columns: 1fr; }
      .z { text-align: left; }
    }
  `,
})
export class OutliersPage {
  protected readonly result = httpResource<OutliersResponse>(() =>
    apiUrl('analytics/outliers/', { department: 'Cauca', limit: 50 }),
  );
  protected readonly cutoff = CUTOFF;
  protected readonly cop = formatCop;
  protected readonly message = errorMessage;

  /** z from -SCALE..+SCALE onto 0..200, clamped so an extreme value still shows at the edge. */
  protected x(z: number): number {
    const clamped = Math.max(-SCALE, Math.min(SCALE, z));
    return 100 + (clamped / SCALE) * 96;
  }
}
