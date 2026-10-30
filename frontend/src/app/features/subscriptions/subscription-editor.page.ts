import { HttpClient, httpResource } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { applyEach, email, form, FormField, required, submit, validate } from '@angular/forms/signals';
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
    <a [routerLink]="id() ? ['/alertas', id()] : ['/alertas']" class="small">← {{ id() ? 'La alerta' : 'Mis alertas' }}</a>
    <h1>{{ id() ? 'Editar alerta' : 'Nueva alerta' }}</h1>

    @if (existing.error()) {
      <p class="notice notice--error">Esta alerta no existe o no es tuya.</p>
    } @else if (id() && !loaded()) {
      <div class="skeleton" style="min-height: 320px"></div>
    } @else {
      <form class="editor" (submit)="send($event)" novalidate>
        <section class="card stack">
          <label class="field">
            <span>Nombre</span>
            <input class="input" [formField]="f.name" placeholder="Vías en el Cauca" />
            <app-field-errors [field]="f.name" />
          </label>
        </section>

        <section class="card stack">
          <h2>Reglas <span class="small muted">· se deben cumplir todas</span></h2>
          @for (rule of model().rules; track $index; let i = $index) {
            @let r = f.rules[i];
            <fieldset class="rule">
              <legend class="visually-hidden">Regla {{ i + 1 }}</legend>
              <label class="field kind">
                <span>Tipo</span>
                <select class="input" [formField]="r.type">
                  @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
                </select>
              </label>
              @if (rule.type === 'amount') {
                <label class="field"><span>Desde (pesos)</span><input class="input" inputmode="numeric" [formField]="r.min" /></label>
                <label class="field"><span>Hasta (pesos)</span><input class="input" inputmode="numeric" [formField]="r.max" /></label>
              } @else {
                <label class="field grow">
                  <span>Valores</span>
                  <input class="input" [formField]="r.text" [placeholder]="hint(rule.type)" />
                </label>
              }
              <button type="button" class="button button--quiet remove" (click)="remove(i)"
                      [disabled]="model().rules.length === 1" [attr.aria-label]="'Quitar la regla ' + (i + 1)">Quitar</button>
              <p class="small muted hint">{{ hint(rule.type) }}</p>
              <app-field-errors [field]="r" />
            </fieldset>
          }
          @for (error of f.rules().errors(); track $index) { <p class="error" role="alert">{{ error.message }}</p> }
          <button type="button" class="button button--quiet add" (click)="add()" [disabled]="model().rules.length >= maxRules">
            Agregar regla
          </button>
        </section>

        <section class="card stack">
          <h2>Entrega</h2>
          <div class="row">
            <label class="field">
              <span>Canal</span>
              <select class="input" [formField]="f.channel">
                <option value="email">Correo</option>
                <option value="webhook">Webhook firmado (HMAC)</option>
              </select>
            </label>
            <label class="field grow">
              <span>{{ model().channel === 'email' ? 'Correo' : 'URL https del webhook' }}</span>
              <input class="input" [formField]="f.target"
                     [placeholder]="model().channel === 'email' ? 'tu@correo.com' : 'https://ejemplo.com/hooks/secop'" />
              <app-field-errors [field]="f.target" />
            </label>
          </div>
          <label class="check"><input type="checkbox" [formField]="f.active" /> Activa</label>
        </section>

        @for (error of f().errors(); track $index) { <p class="notice notice--error" role="alert">{{ error.message }}</p> }
        <div class="row">
          <button class="button" type="submit" [disabled]="f().submitting()">
            {{ f().submitting() ? 'Guardando…' : id() ? 'Guardar cambios' : 'Crear alerta' }}
          </button>
        </div>
      </form>
    }
  `,
  styles: `
    .editor { display: grid; gap: 16px; }
    .rule { border: 0; margin: 0; padding: 12px 0; border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: 12px; align-items: end; }
    .rule:first-of-type { border-top: 0; padding-top: 0; }
    .kind { flex: 0 1 220px; }
    .grow { flex: 1 1 260px; }
    .hint { flex-basis: 100%; margin: 0; }
    .add { justify-self: start; }
    .check { display: flex; gap: 8px; align-items: center; font-size: 14px; }
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

  /** When editing: the stored subscription. Undefined URL means "nothing to load" for a new one. */
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
    // Fill the form once, when the stored subscription arrives; later server refreshes must not wipe user edits.
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
        return serverErrors(error, { name: this.f.name, target: this.f.target, rules: this.f.rules, channel: this.f.channel });
      }
    });
  }
}
