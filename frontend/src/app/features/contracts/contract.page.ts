import { httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { apiUrl, Contract, errorMessage } from '../../core/api/api';
import { formatCop, formatDay } from '../../core/format';

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/contratos" class="small">← Contratos</a>
    @if (contract.value(); as c) {
      <h1>{{ c.entity }}</h1>
      <p class="lead">{{ c.object }}</p>
      <dl class="facts">
        <div class="card"><dt>Valor</dt><dd>{{ cop(c.value_cop) }}</dd></div>
        <div class="card"><dt>Firmado</dt><dd>{{ day(c.signed_on) }}</dd></div>
        <div class="card"><dt>Modalidad</dt><dd>{{ c.modality || 'Sin dato' }}</dd></div>
        <div class="card"><dt>Tipo</dt><dd>{{ c.contract_type || 'Sin dato' }}</dd></div>
        <div class="card"><dt>Estado</dt><dd>{{ c.status || 'Sin dato' }}</dd></div>
        <div class="card"><dt>Proveedor</dt><dd>{{ c.supplier || 'Sin dato' }}</dd></div>
        <div class="card"><dt>Entidad (NIT)</dt><dd class="mono">{{ c.entity_nit ?? 'Sin dato' }}</dd></div>
        <div class="card"><dt>Id en SECOP</dt><dd class="mono">{{ c.id }}</dd></div>
      </dl>
      @if (c.url) {
        <a class="button" [href]="c.url" target="_blank" rel="noopener">Ver el proceso en SECOP II</a>
      }
    } @else if (contract.error()) {
      <h1>Contrato no encontrado</h1>
      <p class="notice notice--error">{{ message(contract.error()) }}</p>
    } @else {
      <div class="skeleton" style="min-height: 240px; margin-top: 16px"></div>
    }
  `,
  styles: `
    .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin: 0 0 24px; }
    .facts dt { font-size: 13px; color: var(--muted); }
    .facts dd { margin: 0; font-weight: 500; overflow-wrap: anywhere; }
  `,
})
export class ContractPage {
  readonly id = input.required<string>();
  // httpResource refetches by itself when the route's id changes, and cancels the previous request.
  protected readonly contract = httpResource<Contract>(() => apiUrl(`contracts/${encodeURIComponent(this.id())}/`));
  protected readonly cop = formatCop;
  protected readonly day = formatDay;
  protected readonly message = errorMessage;
}
