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
    <div class="auth-wrapper">
      <div class="auth card card--raised">
        <div class="auth__brand-mark">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="2"
              stroke-opacity="0.25"
            />
            <circle
              cx="12"
              cy="12"
              r="6"
              stroke="currentColor"
              stroke-width="2"
              stroke-opacity="0.5"
            />
            <circle cx="12" cy="12" r="2.5" fill="var(--accent)" />
            <path
              d="M12 2C17.5228 2 22 6.47715 22 12"
              stroke="var(--accent)"
              stroke-width="2.5"
              stroke-linecap="round"
            />
          </svg>
        </div>

        <header class="auth__head">
          <h1>Ingresar</h1>
          <p class="muted">Accede para gestionar tus alertas y suscripciones.</p>
        </header>

        <form class="stack" (submit)="send($event)" novalidate>
          <label class="field">
            <span>Usuario</span>
            <input
              class="input"
              [formField]="f.username"
              autocomplete="username"
              placeholder="Nombre de usuario"
            />
            <app-field-errors [field]="f.username" />
          </label>
          <label class="field">
            <span>Contraseña</span>
            <input
              class="input"
              type="password"
              [formField]="f.password"
              autocomplete="current-password"
              placeholder="Tu contraseña"
            />
            <app-field-errors [field]="f.password" />
          </label>
          @for (error of f().errors(); track $index) {
            <p class="notice notice--error" role="alert">{{ error.message }}</p>
          }
          <button class="button button--auth" type="submit" [disabled]="f().submitting()">
            {{ f().submitting() ? 'Ingresando…' : 'Ingresar' }}
          </button>
        </form>

        <footer class="auth__foot">
          <p class="small muted">
            ¿No tienes cuenta?
            <a routerLink="/registro" [queryParams]="{ next: next() }">Crear cuenta</a>
          </p>
        </footer>
      </div>
    </div>
  `,
  styles: `
    .auth-wrapper {
      padding: 32px 0 48px;
    }
    .auth {
      max-width: 440px;
      margin: 0 auto;
      display: grid;
      gap: 18px;
      padding: 32px 28px;
    }
    .auth__brand-mark {
      color: var(--text);
    }
    .auth__head h1 {
      font-size: 24px;
      margin-bottom: 4px;
    }
    .auth__head p {
      margin: 0;
      font-size: 14px;
    }
    .button--auth {
      width: 100%;
      min-height: 42px;
      font-size: 15px;
      margin-top: 4px;
    }
    .auth__foot {
      padding-top: 12px;
      border-top: 1px solid var(--line-subtle);
      text-align: center;
    }
    .auth__foot p {
      margin: 0;
    }
  `,
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
        return serverErrors(error, {});
      }
      await this.router.navigateByUrl(safeNext(this.next()));
      return undefined;
    });
  }
}
