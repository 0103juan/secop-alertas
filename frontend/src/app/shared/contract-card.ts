import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Contract } from '../core/api/api';
import { formatCop, formatDay } from '../core/format';

@Component({
  selector: 'app-contract-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = contract();
    <article class="card contract">
      <header class="contract__head">
        <div class="contract__title-wrap">
          <a class="contract__entity" [routerLink]="['/contratos', c.id]">{{ c.entity }}</a>
          @if (c.department) {
            <span class="contract__dept">{{ c.department }}</span>
          }
        </div>
        <div class="contract__value-box">
          <span class="contract__value-label">Valor</span>
          <strong class="contract__value">{{ cop(c.value_cop) }}</strong>
        </div>
      </header>

      <p class="contract__object">{{ c.object }}</p>

      <footer class="contract__meta">
        @if (c.modality) {
          <span class="chip chip--accent">{{ c.modality }}</span>
        }
        @if (c.supplier) {
          <span class="contract__meta-item" title="Proveedor / Contratista">
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
            <span class="small muted">{{ c.supplier }}</span>
          </span>
        }
        <span class="contract__meta-item" title="Fecha de firma">
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
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="16" y1="2" x2="16" y2="6"></line>
            <line x1="8" y1="2" x2="8" y2="6"></line>
            <line x1="3" y1="10" x2="21" y2="10"></line>
          </svg>
          <span class="small muted">{{ day(c.signed_on) }}</span>
        </span>
      </footer>
    </article>
  `,
  styles: `
    .contract {
      display: grid;
      gap: 10px;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
      position: relative;
    }
    .contract:hover {
      border-color: var(--line-strong);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .contract__head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
    }

    .contract__title-wrap {
      display: grid;
      gap: 4px;
      flex: 1;
    }

    .contract__entity {
      font-weight: 600;
      font-size: 16px;
      color: var(--text);
      text-decoration: none;
      line-height: 1.35;
      transition: color 0.15s ease;
    }
    .contract__entity:hover {
      color: var(--accent);
      text-decoration: none;
    }

    .contract__dept {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted-soft);
      font-weight: 600;
    }

    .contract__value-box {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      background: var(--surface-2);
      border: 1px solid var(--line);
      border-radius: var(--radius);
      padding: 6px 12px;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .contract__value-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--muted);
      font-weight: 600;
    }

    .contract__value {
      font-size: 15px;
      font-weight: 700;
      color: var(--text);
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
    }

    .contract__object {
      margin: 0;
      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.55;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .contract__meta {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
      align-items: center;
      padding-top: 4px;
      border-top: 1px solid var(--line-subtle);
    }

    .contract__meta-item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--muted);
    }

    @media (max-width: 600px) {
      .contract__head {
        flex-direction: column;
        gap: 8px;
      }
      .contract__value-box {
        align-items: flex-start;
        align-self: flex-start;
      }
    }
  `,
})
export class ContractCard {
  readonly contract = input.required<Contract>();
  protected readonly cop = formatCop;
  protected readonly day = formatDay;
}
