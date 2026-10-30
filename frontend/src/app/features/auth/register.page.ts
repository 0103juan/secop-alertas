import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { email, form, FormField, minLength, required, submit } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';

import { Session } from '../../core/auth/session';
import { safeNext, serverErrors } from '../../core/forms';
import { FieldErrors } from '../../shared/field-errors';

@Component({
  imports: [FormField, FieldErrors, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth card card--raised">
      <h1>Crear cuenta</h1>
      <p class="muted">Recibe por correo o webhook los contratos que te interesan, apenas SECOP los publica.</p>
      <form class="stack" (submit)="send($event)" novalidate>
        <label class="field">
          <span>Usuario</span>
          <input class="input" [formField]="f.username" autocomplete="username" />
          <app-field-errors [field]="f.username" />
        </label>
        <label class="field">
          <span>Correo</span>
          <input class="input" type="email" [formField]="f.email" autocomplete="email" />
          <app-field-errors [field]="f.email" />
        </label>
        <label class="field">
          <span>Contraseña</span>
          <input class="input" type="password" [formField]="f.password" autocomplete="new-password" />
          <span class="small muted">Al menos 8 caracteres; el servidor también rechaza las contraseñas comunes.</span>
          <app-field-errors [field]="f.password" />
        </label>
        @for (error of f().errors(); track $index) {
          <p class="notice notice--error" role="alert">{{ error.message }}</p>
        }
        <button class="button" type="submit" [disabled]="f().submitting()">
          {{ f().submitting() ? 'Creando…' : 'Crear cuenta' }}
        </button>
      </form>
      <p class="small muted">¿Ya tienes cuenta? <a routerLink="/ingresar" [queryParams]="{ next: next() }">Ingresa</a></p>
    </div>
  `,
  styles: `.auth { max-width: 420px; margin: 24px auto; display: grid; gap: 12px; }`,
})
export class RegisterPage {
  readonly next = input<string>();
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  private readonly model = signal({ username: '', email: '', password: '' });
  protected readonly f = form(this.model, (path) => {
    required(path.username, { message: 'Elige un usuario.' });
    required(path.email, { message: 'Escribe tu correo.' });
    email(path.email, { message: 'Ese correo no parece válido.' });
    minLength(path.password, 8, { message: 'Usa al menos 8 caracteres.' });
  });

  protected async send(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.f, async () => {
      const { username, email: address, password } = this.model();
      try {
        await this.session.register(username, address, password);
      } catch (error) {
        // "Username taken" and the password validators are the server's; each shows under its own field.
        return serverErrors(error, { username: this.f.username, email: this.f.email, password: this.f.password });
      }
      await this.router.navigateByUrl(safeNext(this.next()));
      return undefined;
    });
  }
}
