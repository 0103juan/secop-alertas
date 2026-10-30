import { HttpClient } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  untracked,
} from '@angular/core';
import { Router } from '@angular/router';

import { apiUrl, Contract } from '../../core/api/api';
import { CursorList } from '../../core/cursor-list';
import { ContractCard } from '../../shared/contract-card';
import { MIN_VALUES, MODALITIES } from './filters';

const TYPING_PAUSE_MS = 300;

const SUGGESTIONS = ['puentes', 'vías', 'alimentación escolar', 'software', 'salud'];

/**
 * Search over the contracts. The filters live in the URL (query params arrive as inputs), so a search can be
 * shared or bookmarked and the back button undoes a filter. The page only writes the URL; reading it drives the
 * list, which keeps a single source of truth.
 */
@Component({
  imports: [ContractCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="page-head">
      <h1>Contratos</h1>
      <p class="lead">
        Contratos públicos del Cauca firmados desde 2025, actualizados cada día desde SECOP II.
        Busca por lo que se contrató; la búsqueda entiende español (plural, singular, tildes).
      </p>
    </header>

    <form class="filters card card--raised" role="search" (submit)="$event.preventDefault()">
      <div class="filters__row">
        <label class="field grow">
          <span>Buscar en el objeto del contrato</span>
          <div class="search-input-wrap">
            <svg
              class="search-icon"
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
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              class="input input--search"
              type="search"
              name="q"
              placeholder="vías, alimentación escolar, software…"
              [value]="q() ?? ''"
              (input)="typed($any($event.target).value)"
              autocomplete="off"
            />
            @if (q()) {
              <button
                type="button"
                class="search-clear"
                (click)="set('q', '')"
                title="Limpiar búsqueda"
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            }
          </div>
        </label>

        <label class="field">
          <span>Modalidad</span>
          <select
            class="input"
            name="modality"
            (change)="set('modality', $any($event.target).value)"
          >
            <option value="">Todas las modalidades</option>
            @for (m of modalities; track m) {
              <option [value]="m" [selected]="m === modality()">{{ m }}</option>
            }
          </select>
        </label>

        <label class="field">
          <span>Valor</span>
          <select
            class="input"
            name="min_value"
            (change)="set('min_value', $any($event.target).value)"
          >
            @for (v of minValues; track v.value) {
              <option [value]="v.value" [selected]="v.value === (min_value() ?? '')">
                {{ v.label }}
              </option>
            }
          </select>
        </label>
      </div>

      <div class="suggestions">
        <span class="suggestions__label">Búsquedas frecuentes:</span>
        @for (s of suggestions; track s) {
          <button
            type="button"
            class="chip chip--btn"
            [class.chip--accent]="q() === s"
            (click)="set('q', s)"
          >
            {{ s }}
          </button>
        }
      </div>
    </form>

    <section class="stack" aria-live="polite" [attr.aria-busy]="list.loading()">
      @for (contract of list.items(); track contract.id) {
        <app-contract-card [contract]="contract" />
      }
      @if (list.loading()) {
        @for (i of [1, 2, 3]; track i) {
          <div class="skeleton"></div>
        }
      }
      @if (list.error(); as error) {
        <p class="notice notice--error">{{ error }}</p>
      }
      @if (list.empty()) {
        <div class="card card--subtle empty-state">
          <p class="muted">Ningún contrato coincide con esos filtros.</p>
          @if (hasFilters()) {
            <button type="button" class="button button--quiet small" (click)="clearAll()">
              Limpiar filtros
            </button>
          }
        </div>
      }
      @if (list.hasMore() && !list.loading()) {
        <div class="more-wrap">
          <button class="button button--quiet more" type="button" (click)="list.more()">
            Cargar más
          </button>
        </div>
      }
    </section>
  `,
  styles: `
    .page-head {
      margin-bottom: 24px;
    }

    .filters {
      display: grid;
      gap: 14px;
      margin-bottom: 24px;
      padding: 20px;
    }

    .filters__row {
      display: flex;
      gap: 14px;
      flex-wrap: wrap;
      align-items: end;
    }

    .grow {
      flex: 1 1 320px;
    }

    .filters .field:not(.grow) {
      flex: 1 1 200px;
    }

    .search-input-wrap {
      position: relative;
      display: flex;
      align-items: center;
    }

    .search-icon {
      position: absolute;
      left: 12px;
      color: var(--muted);
      pointer-events: none;
    }

    .input--search {
      padding-left: 36px;
      padding-right: 32px;
    }

    .search-clear {
      position: absolute;
      right: 8px;
      background: none;
      border: none;
      font-size: 18px;
      line-height: 1;
      color: var(--muted);
      cursor: pointer;
      padding: 4px 6px;
      border-radius: 4px;
    }
    .search-clear:hover {
      color: var(--text);
    }

    .suggestions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      padding-top: 6px;
      border-top: 1px solid var(--line-subtle);
    }

    .suggestions__label {
      font-size: 12px;
      color: var(--muted);
    }

    .chip--btn {
      cursor: pointer;
      border: 1px solid var(--line);
      background: var(--surface-2);
      transition: all 0.15s ease;
    }
    .chip--btn:hover {
      background: var(--surface-3);
      color: var(--text);
    }

    .empty-state {
      text-align: center;
      padding: 32px 16px;
      display: grid;
      gap: 12px;
      justify-items: center;
    }
    .empty-state p {
      margin: 0;
    }

    .more-wrap {
      display: flex;
      justify-content: center;
      padding-top: 12px;
    }
    .more {
      min-width: 160px;
    }
  `,
})
export class ContractsPage {
  readonly q = input<string>();
  readonly modality = input<string>();
  readonly min_value = input<string>();

  protected readonly modalities = MODALITIES;
  protected readonly minValues = MIN_VALUES;
  protected readonly suggestions = SUGGESTIONS;
  protected readonly list = new CursorList<Contract>(inject(HttpClient));
  private readonly router = inject(Router);
  private pending?: ReturnType<typeof setTimeout>;

  protected readonly hasFilters = computed(() =>
    Boolean(this.q() || this.modality() || this.min_value()),
  );

  private readonly url = computed(() =>
    apiUrl('contracts/', { q: this.q(), modality: this.modality(), min_value: this.min_value() }),
  );

  constructor() {
    effect(() => {
      const url = this.url();
      untracked(() => this.list.reset(url));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.pending));
  }

  protected typed(value: string): void {
    clearTimeout(this.pending);
    this.pending = setTimeout(() => this.set('q', value.trim()), TYPING_PAUSE_MS);
  }

  protected set(name: 'q' | 'modality' | 'min_value', value: string): void {
    void this.router.navigate([], {
      queryParams: { [name]: value || null },
      queryParamsHandling: 'merge',
      replaceUrl: name === 'q',
    });
  }

  protected clearAll(): void {
    void this.router.navigate([], {
      queryParams: { q: null, modality: null, min_value: null },
      queryParamsHandling: 'merge',
    });
  }
}
