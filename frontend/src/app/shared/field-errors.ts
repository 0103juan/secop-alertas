import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FieldTree } from '@angular/forms/signals';

/** A field's errors, once the user has touched it (or tried to submit): never shouted before they typed. */
@Component({
  selector: 'app-field-errors',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      @for (error of field()().errors(); track $index) {
        <p class="error" role="alert">{{ error.message }}</p>
      }
    }
  `,
})
export class FieldErrors {
  readonly field = input.required<FieldTree<unknown>>();
  protected readonly visible = computed(() => {
    const state = this.field()();
    return state.touched() && state.invalid();
  });
}
