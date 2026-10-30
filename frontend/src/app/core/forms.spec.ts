import { describe, expect, it } from 'vitest';

import { safeNext, serverErrors } from './forms';

describe('safeNext', () => {
  it('allows same-site paths only', () => {
    expect(safeNext('/alertas/3')).toBe('/alertas/3');
    expect(safeNext('//evil.example')).toBe('/alertas');
    expect(safeNext('https://evil.example')).toBe('/alertas');
    expect(safeNext(undefined)).toBe('/alertas');
  });
});

describe('serverErrors', () => {
  it('puts each DRF message on its field and the rest on the form', () => {
    const field = (() => undefined) as never;
    const errors = serverErrors(
      { status: 400, error: { username: ['Ya existe.'], non_field_errors: ['Otra cosa.'] } },
      { username: field },
    );
    expect(errors).toEqual([
      { kind: 'server', message: 'Ya existe.', fieldTree: field },
      { kind: 'server', message: 'Otra cosa.', fieldTree: undefined },
    ]);
  });

  it('turns anything else into one message on the form', () => {
    expect(serverErrors({ status: 401, error: { detail: 'Credenciales inválidas.' } }, {})).toEqual([
      { kind: 'server', message: 'Credenciales inválidas.' },
    ]);
  });
});
