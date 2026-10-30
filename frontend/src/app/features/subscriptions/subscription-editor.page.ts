import { HttpClient, httpResource } from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import {
  applyEach,
  email,
  form,
  FormField,
  required,
  submit,
  validate,
} from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { apiUrl, Channel, Subscription } from '../../core/api/api';
import { serverErrors } from '../../core/forms';
import { FieldErrors } from '../../shared/field-errors';
import { blankRule, fromApi, MAX_RULES, problem, RULE_TYPES, RuleDraft, toApi } from './rules';

interface Draft {
  name: string;
  channel: Channel;
  target: string;
  active: boolean;
  rules: RuleDraft[];
}

const EMPTY: Draft = { name: '', channel: 'email', target: '', active: true, rules: [blankRule()] };

/** One page for creating (`/alertas/nueva`) and editing (`/alertas/:id/editar`). */
@Component({
  imports: [FormField, FieldErrors, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="back-nav">
      <a [routerLink]="id() ? ['/alertas', id()] : ['/alertas']" class="back-link small">
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
        <span>← {{ id() ? 'La alerta' : 'Mis alertas' }}</span>
      </a>
    </nav>

    <header class="page-head">
      <h1>{{ id() ? 'Editar alerta' : 'Nueva alerta' }}</h1>
      <p class="lead">
        Configura los criterios de detección. Cada vez que se publique un contrato en SECOP II que
        cumpla todas las reglas, se enviará una notificación inmediata.
      </p>
    </header>

    @if (existing.error()) {
      <div class="card empty-card">
        <p class="notice notice--error">Esta alerta no existe o no es tuya.</p>
        <a routerLink="/alertas" class="button button--quiet">Volver a mis alertas</a>
      </div>
    } @else if (id() && !loaded()) {
      <div class="skeleton" style="min-height: 360px"></div>
    } @else {
      <form class="editor" (submit)="send($event)" novalidate>
        <!-- Step 1: Identification -->
        <section class="card card--raised section-block">
          <div class="section-title-wrap">
            <span class="section-step">1</span>
            <h2>Identificación de la alerta</h2>
          </div>
          <div class="stack">
            <label class="field">
              <span>Nombre</span>
              <input
                class="input"
                [formField]="f.name"
                placeholder="Ej: Vías y pavimentación en el Cauca"
              />
              <app-field-errors [field]="f.name" />
            </label>
          </div>
        </section>

        <!-- Step 2: Rules -->
        <section class="card card--raised section-block">
          <div class="section-title-wrap">
            <span class="section-step">2</span>
            <div>
              <h2>Reglas</h2>
              <span class="small muted">Se deben cumplir todas las condiciones configuradas</span>
            </div>
          </div>

          <div class="rules-container">
            @for (rule of model().rules; track $index; let i = $index) {
              @let r = f.rules[i];
              <fieldset class="rule">
                <legend class="visually-hidden">Regla {{ i + 1 }}</legend>
                <div class="rule-index">{{ i + 1 }}</div>
                <div class="rule-inputs">
                  <label class="field kind">
                    <span>Tipo</span>
                    <select class="input" [formField]="r.type">
                      @for (t of types; track t.value) {
                        <option [value]="t.value">{{ t.label }}</option>
                      }
                    </select>
                  </label>

                  @if (rule.type === 'amount') {
                    <label class="field">
                      <span>Desde (pesos)</span>
                      <input
                        class="input"
                        inputmode="numeric"
                        [formField]="r.min"
                        placeholder="Ej: 50.000.000"
                      />
                    </label>
                    <label class="field">
                      <span>Hasta (pesos)</span>
                      <input
                        class="input"
                        inputmode="numeric"
                        [formField]="r.max"
                        placeholder="Ej: 500.000.000"
                      />
                    </label>
                  } @else {
                    <label class="field grow">
                      <span>Valores</span>
                      <input class="input" [formField]="r.text" [placeholder]="hint(rule.type)" />
                    </label>
                  }

                  <button
                    type="button"
                    class="button button--quiet remove-btn"
                    (click)="remove(i)"
                    [disabled]="model().rules.length === 1"
                    [attr.aria-label]="'Quitar la regla ' + (i + 1)"
                    title="Quitar regla"
                  >
                    Quitar
                  </button>
                </div>

                <p class="small muted hint">{{ hint(rule.type) }}</p>
                <app-field-errors [field]="r" />
              </fieldset>
            }
          </div>

          @for (error of f.rules().errors(); track $index) {
            <p class="error" role="alert">{{ error.message }}</p>
          }

          <div class="add-wrap">
            <button
              type="button"
              class="button button--quiet add"
              (click)="add()"
              [disabled]="model().rules.length >= maxRules"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Agregar regla</span>
            </button>
            <span class="small muted"
              >{{ model().rules.length }} de {{ maxRules }} reglas máximas</span
            >
          </div>
        </section>

        <!-- Step 3: Delivery -->
        <section class="card card--raised section-block">
          <div class="section-title-wrap">
            <span class="section-step">3</span>
            <h2>Entrega de notificaciones</h2>
          </div>
          <div class="row">
            <label class="field channel-field">
              <span>Canal</span>
              <select class="input" [formField]="f.channel">
                <option value="email">Correo electrónico</option>
                <option value="webhook">Webhook firmado (HMAC-SHA256)</option>
              </select>
            </label>
            <label class="field grow">
              <span>{{ model().channel === 'email' ? 'Correo' : 'URL https del webhook' }}</span>
              <input
                class="input"
                [formField]="f.target"
                [placeholder]="
                  model().channel === 'email' ? 'tu@correo.com' : 'https://ejemplo.com/hooks/secop'
                "
              />
              <app-field-errors [field]="f.target" />
            </label>
          </div>
          <div class="active-toggle-wrap">
            <label class="check">
              <input type="checkbox" [formField]="f.active" />
              <span>Activa (recibir notificaciones inmediatamente)</span>
            </label>
          </div>
        </section>

        @for (error of f().errors(); track $index) {
          <p class="notice notice--error" role="alert">{{ error.message }}</p>
        }

        <div class="form-actions">
          <button class="button button--submit" type="submit" [disabled]="f().submitting()">
            {{ f().submitting() ? 'Guardando…' : id() ? 'Guardar cambios' : 'Crear alerta' }}
          </button>
          <a class="button button--quiet" [routerLink]="id() ? ['/alertas', id()] : ['/alertas']">
            Cancelar
          </a>
        </div>
      </form>
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

    .page-head {
      margin-bottom: 24px;
    }

    .editor {
      display: grid;
      gap: 20px;
    }

    .section-block {
      display: grid;
      gap: 16px;
      padding: 22px;
    }

    .section-title-wrap {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .section-title-wrap h2 {
      margin: 0;
      font-size: 18px;
    }

    .section-step {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: var(--surface-2);
      border: 1px solid var(--line-strong);
      color: var(--text);
      font-size: 13px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .rules-container {
      display: grid;
      gap: 12px;
    }

    .rule {
      border: 1px solid var(--line);
      background: var(--surface-2);
      border-radius: var(--radius);
      padding: 16px;
      margin: 0;
      display: grid;
      gap: 10px;
      position: relative;
    }

    .rule-index {
      position: absolute;
      top: -10px;
      left: 14px;
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: var(--radius-pill);
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      padding: 1px 8px;
    }

    .rule-inputs {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      align-items: end;
    }

    .kind {
      flex: 0 1 200px;
    }
    .grow {
      flex: 1 1 280px;
    }
    .remove-btn {
      flex-shrink: 0;
    }

    .hint {
      margin: 0;
      line-height: 1.4;
    }

    .add-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      padding-top: 4px;
    }

    .add {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .channel-field {
      flex: 0 1 240px;
    }

    .active-toggle-wrap {
      padding-top: 8px;
      border-top: 1px solid var(--line-subtle);
    }
    .check {
      display: inline-flex;
      gap: 8px;
      align-items: center;
      font-size: 14px;
      cursor: pointer;
      user-select: none;
    }
    .check input[type='checkbox'] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
      cursor: pointer;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-top: 8px;
    }
    .button--submit {
      min-width: 160px;
    }

    .empty-card {
      padding: 32px;
      text-align: center;
    }
  `,
})
export class SubscriptionEditorPage {
  readonly id = input<string>();
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  protected readonly types = RULE_TYPES;
  protected readonly maxRules = MAX_RULES;
  protected readonly model = signal<Draft>(structuredClone(EMPTY));
  protected readonly loaded = signal(false);

  protected readonly existing = httpResource<Subscription>(() => {
    const id = this.id();
    return id ? apiUrl(`subscriptions/${id}/`) : undefined;
  });

  protected readonly f = form(this.model, (path) => {
    required(path.name, { message: 'Ponle un nombre para reconocerla.' });
    required(path.target, { message: 'Dinos a dónde enviarla.' });
    email(path.target, {
      message: 'Ese correo no parece válido.',
      when: ({ valueOf }) => valueOf(path.channel) === 'email',
    });
    validate(path.target, ({ value, valueOf }) =>
      valueOf(path.channel) === 'webhook' && !value().startsWith('https://')
        ? { kind: 'https', message: 'El webhook debe ser una URL https.' }
        : undefined,
    );
    applyEach(path.rules, (rule) => {
      validate(rule, ({ value }) => {
        const message = problem(value());
        return message ? { kind: 'rule', message } : undefined;
      });
    });
  });

  private readonly isEdit = computed(() => Boolean(this.id()));

  constructor() {
    effect(() => {
      const stored = this.existing.value();
      if (!stored) return;
      untracked(() => {
        if (this.loaded()) return;
        const rules = Array.isArray(stored.rules) ? stored.rules.map(fromApi) : [];
        this.model.set({
          name: stored.name,
          channel: stored.channel ?? 'email',
          target: stored.target,
          active: stored.active ?? true,
          rules: rules.length ? rules : [blankRule()],
        });
        this.loaded.set(true);
      });
    });
  }

  protected hint(type: RuleDraft['type']): string {
    return RULE_TYPES.find((t) => t.value === type)?.hint ?? '';
  }

  protected add(): void {
    this.model.update((m) => ({ ...m, rules: [...m.rules, blankRule()] }));
  }

  protected remove(index: number): void {
    this.model.update((m) => ({ ...m, rules: m.rules.filter((_, i) => i !== index) }));
  }

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      const draft = this.model();
      const body = { ...draft, rules: draft.rules.map(toApi) };
      try {
        const saved = await firstValueFrom(
          this.isEdit()
            ? this.http.put<Subscription>(apiUrl(`subscriptions/${this.id()}/`), body)
            : this.http.post<Subscription>(apiUrl('subscriptions/'), body),
        );
        await this.router.navigate(['/alertas', saved.id]);
        return undefined;
      } catch (error) {
        return serverErrors(error, {
          name: this.f.name,
          target: this.f.target,
          rules: this.f.rules,
          channel: this.f.channel,
        });
      }
    });
  }
}
