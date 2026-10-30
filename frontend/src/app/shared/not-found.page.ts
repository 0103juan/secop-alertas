import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Esta página no existe</h1>
    <p class="lead">Puede que el enlace esté mal escrito o que el contenido ya no esté.</p>
    <a class="button" routerLink="/contratos">Ir a los contratos</a>
  `,
})
export class NotFoundPage {}
