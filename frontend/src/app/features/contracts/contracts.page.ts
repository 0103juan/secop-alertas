import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, input, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { apiUrl, Contract } from '../../core/api/api';
import { CursorList } from '../../core/cursor-list';
import { ContractCard } from '../../shared/contract-card';
import { MIN_VALUES, MODALITIES } from './filters';

const TYPING_PAUSE_MS = 300;

/**
 * Search over the contracts. The filters live in the URL (query params arrive as inputs), so a search can be
 * shared or bookmarked and the back button undoes a filter. The page only writes the URL; reading it drives the
 * list, which keeps a single source of truth.
 */
@Component({
  imports: [ContractCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Contratos</h1>
    <p class="lead">
      Contratos públicos del Cauca firmados desde 2025, actualizados cada día desde SECOP II. Busca por lo que se
      contrató; la búsqueda entiende español (plural, singular, tildes).
    </p>

    <form class="filters card" role="search" (submit)="$event.preventDefault()">
      <label class="field grow">
        <span>Buscar en el objeto del contrato</span>
        <input class="input" type="search" name="q" placeholder="vías, alimentación escolar, software…"
               [value]="q() ?? ''" (input)="typed($any($event.target).value)" autocomplete="off" />
      </label>
      <label class="field">
        <span>Modalidad</span>
        <select class="input" name="modality" (change)="set('modality', $any($event.target).value)">
          <option value="">Todas</option>
          @for (m of modalities; track m) { <option [value]="m" [selected]="m === modality()">{{ m }}</option> }
        </select>
      </label>
      <label class="field">
        <span>Valor</span>
        <select class="input" name="min_value" (change)="set('min_value', $any($event.target).value)">
          @for (v of minValues; track v.value) {
            <option [value]="v.value" [selected]="v.value === (min_value() ?? '')">{{ v.label }}</option>
          }
        </select>
      </label>
    </form>

    <section class="stack" aria-live="polite" [attr.aria-busy]="list.loading()">
      @for (contract of list.items(); track contract.id) {
        <app-contract-card [contract]="contract" />
      }
      @if (list.loading()) {
        @for (i of [1, 2, 3]; track i) { <div class="skeleton"></div> }
      }
      @if (list.error(); as error) { <p class="notice notice--error">{{ error }}</p> }
      @if (list.empty()) { <p class="card muted">Ningún contrato coincide con esos filtros.</p> }
      @if (list.hasMore() && !list.loading()) {
        <button class="button button--quiet more" type="button" (click)="list.more()">Cargar más</button>
      }
    </section>
  `,
  styles: `
    .filters { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .grow { flex: 1 1 280px; }
    .filters .field:not(.grow) { flex: 1 1 200px; }
    .more { justify-self: center; }
  `,
})
export class ContractsPage {
  readonly q = input<string>();
  readonly modality = input<string>();
  readonly min_value = input<string>();

  protected readonly modalities = MODALITIES;
  protected readonly minValues = MIN_VALUES;
  protected readonly list = new CursorList<Contract>(inject(HttpClient));
  private readonly router = inject(Router);
  private pending?: ReturnType<typeof setTimeout>;

  private readonly url = computed(() =>
    apiUrl('contracts/', { q: this.q(), modality: this.modality(), min_value: this.min_value() }),
  );

  constructor() {
    effect(() => {
      const url = this.url();
      untracked(() => this.list.reset(url)); // only the URL is a dependency, not what reset() reads
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pending));
  }

  /** Waits for a pause in typing, so "vías" is one request and not four. */
  protected typed(value: string): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.set('q', value.trim()), TYPING_PAUSE_MS);
  }

  protected set(name: 'q' | 'modality' | 'min_value', value: string): void {
    void this.router.navigate([], {
      queryParams: { [name]: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: name === 'q', // typing should not fill the history with one entry per word
    });
  }
}
