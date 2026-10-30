import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { Session } from '../../core/auth/session';
import { safeNext, serverErrors } from '../../core/forms';
import { FieldErrors } from '../../shared/field-errors';

@Component({
  imports: [FormField, FieldErrors, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth card card--raised">
      <h1>Ingresar</h1>
      <p class="muted">Para crear y ver tus alertas.</p>
      <form class="stack" (submit)="send($event)" novalidate>
        <label class="field">
          <span>Usuario</span>
          <input class="input" [formField]="f.username" autocomplete="username" />
          <app-field-errors [field]="f.username" />
        </label>
        <label class="field">
          <span>Contraseña</span>
          <input class="input" type="password" [formField]="f.password" autocomplete="current-password" />
          <app-field-errors [field]="f.password" />
        </label>
        @for (error of f().errors(); track $index) {
          <p class="notice notice--error" role="alert">{{ error.message }}</p>
        }
        <button class="button" type="submit" [disabled]="f().submitting()">
          {{ f().submitting() ? 'Ingresando…' : 'Ingresar' }}
        </button>
      </form>
      <p class="small muted">¿No tienes cuenta? <a routerLink="/registro" [queryParams]="{ next: next() }">Créala</a></p>
    </div>
  `,
  styles: `.auth { max-width: 420px; margin: 24px auto; display: grid; gap: 12px; }`,
})
export class LoginPage {
  readonly next = input<string>();
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  private readonly model = signal({ username: '', password: '' });
  protected readonly f = form(this.model, (path) => {
    required(path.username, { message: 'Escribe tu usuario.' });
    required(path.password, { message: 'Escribe tu contraseña.' });
  });

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      const { username, password } = this.model();
      try {
        await this.session.login(username, password);
      } catch (error) {
        // A 401 from simplejwt carries {detail}; it belongs to the form, not to one field.
        return serverErrors(error, {});
      }
      await this.router.navigateByUrl(safeNext(this.next()));
      return undefined;
    });
  }
}
