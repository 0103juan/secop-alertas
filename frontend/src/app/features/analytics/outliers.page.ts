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
    <header class="page-head">
      <h1>Valores atípicos</h1>
      <p class="lead">
        Contratos cuyo valor está lejos de lo habitual para su modalidad y tipo. Se compara en
        escala logarítmica con la mediana del grupo y su desviación absoluta mediana, que no se
        dejan arrastrar por los mismos valores extremos que se buscan.
      </p>
    </header>

    @if (result.isLoading()) {
      <div class="stack">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="skeleton"></div>
        }
      </div>
    } @else if (result.error()) {
      <p class="notice notice--error">{{ message(result.error()) }}</p>
    } @else if (result.value(); as r) {
      <div class="card card--subtle legend-card">
        <div class="legend small muted">
          <span class="legend-item"><i class="band"></i> Rango habitual (|z| ≤ {{ cutoff }})</span>
          <span class="legend-item"
            ><i class="dot dot--high"></i> Por encima (anomalía superior)</span
          >
          <span class="legend-item"
            ><i class="dot dot--low"></i> Por debajo (anomalía inferior)</span
          >
        </div>
      </div>

      <ol class="stack list">
        @for (o of r.outliers; track o.id) {
          <li class="card item">
            <div class="item__text">
              <a [routerLink]="['/contratos', o.id]" class="item__entity">{{ o.entity }}</a>
              <p class="small muted item__object">{{ o.object }}</p>
              <p class="small item__comparison">
                <strong class="item__value">{{ cop(o.value_cop) }}</strong>
                <span class="muted">
                  frente a una mediana de <strong>{{ cop(o.group_median_cop) }}</strong> en
                  {{ o.group_size }} contratos de «{{ o.modality }} / {{ o.contract_type }}»
                </span>
              </p>
            </div>

            <div class="strip-wrap">
              <svg class="strip" viewBox="0 0 200 24" role="img" [attr.aria-label]="'z = ' + o.z">
                <rect
                  [attr.x]="x(-cutoff)"
                  y="7"
                  [attr.width]="x(cutoff) - x(-cutoff)"
                  height="10"
                  rx="5"
                  class="band"
                />
                <line [attr.x1]="x(0)" [attr.x2]="x(0)" y1="3" y2="21" class="axis" />
                <circle
                  [attr.cx]="x(o.z)"
                  cy="12"
                  r="5"
                  [class]="o.z > 0 ? 'dot--high' : 'dot--low'"
                />
              </svg>
            </div>

            <div class="z-wrap">
              <span class="z mono" [class.z--high]="o.z > 0" [class.z--low]="o.z < 0">
                z {{ o.z > 0 ? '+' : '' }}{{ o.z }}
              </span>
            </div>
          </li>
        }
      </ol>
    }
  `,
  styles: `
    .page-head {
      margin-bottom: 24px;
    }

    .legend-card {
      padding: 12px 18px;
      margin-bottom: 16px;
    }

    .legend {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
      align-items: center;
    }

    .legend-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .legend .band {
      width: 24px;
      height: 10px;
      border-radius: 5px;
      background: var(--line-strong);
    }
    .legend .dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }

    .list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .item {
      display: grid;
      grid-template-columns: 1fr 200px 84px;
      gap: 18px;
      align-items: center;
      padding: 18px 20px;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
    }
    .item:hover {
      border-color: var(--line-strong);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .item p {
      margin: 4px 0 0;
    }

    .item__entity {
      font-weight: 600;
      font-size: 16px;
      color: var(--text);
      text-decoration: none;
      transition: color 0.15s ease;
      line-height: 1.35;
    }
    .item__entity:hover {
      color: var(--accent);
      text-decoration: none;
    }

    .item__object {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      line-height: 1.5;
    }

    .item__comparison {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px;
      margin-top: 6px;
    }

    .item__value {
      font-variant-numeric: tabular-nums;
      color: var(--text);
      font-size: 14px;
    }

    .strip-wrap {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .strip {
      width: 200px;
      height: 24px;
      overflow: visible;
    }
    .strip .band {
      fill: var(--line-strong);
      opacity: 0.7;
    }
    .strip .axis {
      stroke: var(--muted);
      stroke-width: 1.5;
      stroke-dasharray: 2 2;
    }

    .dot--high {
      fill: var(--danger);
      background: var(--danger);
    }
    .dot--low {
      fill: var(--accent);
      background: var(--accent);
    }

    .z-wrap {
      display: flex;
      justify-content: flex-end;
    }

    .z {
      display: inline-block;
      text-align: right;
      font-size: 13px;
      font-weight: 600;
      padding: 3px 8px;
      border-radius: var(--radius-sm);
      background: var(--surface-2);
      border: 1px solid var(--line);
      white-space: nowrap;
    }

    .z--high {
      color: var(--danger);
      background: var(--danger-soft);
      border-color: var(--danger-border);
    }

    .z--low {
      color: var(--accent);
      background: var(--accent-soft);
      border-color: var(--accent-border);
    }

    @media (max-width: 768px) {
      .item {
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .strip-wrap {
        justify-content: flex-start;
      }
      .z-wrap {
        justify-content: flex-start;
      }
      .z {
        text-align: left;
      }
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

  protected x(z: number): number {
    const clamped = Math.max(-SCALE, Math.min(SCALE, z));
    return 100 + (clamped / SCALE) * 96;
  }
}
