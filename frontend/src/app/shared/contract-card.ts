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
        <a class="contract__entity" [routerLink]="['/contratos', c.id]">{{ c.entity }}</a>
        <strong class="contract__value">{{ cop(c.value_cop) }}</strong>
      </header>
      <p class="contract__object">{{ c.object }}</p>
      <footer class="contract__meta">
        @if (c.modality) { <span class="chip">{{ c.modality }}</span> }
        @if (c.supplier) { <span class="small muted">{{ c.supplier }}</span> }
        <span class="small muted">{{ day(c.signed_on) }}</span>
      </footer>
    </article>
  `,
  styles: `
    .contract { display: grid; gap: 6px; }
    .contract__head { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; }
    .contract__entity { font-weight: 600; color: var(--text); }
    .contract__value { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .contract__object { margin: 0; color: var(--muted); font-size: 14px; display: -webkit-box; -webkit-line-clamp: 3;
      -webkit-box-orient: vertical; overflow: hidden; }
    .contract__meta { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  `,
})
export class ContractCard {
  readonly contract = input.required<Contract>();
  protected readonly cop = formatCop;
  protected readonly day = formatDay;
}
