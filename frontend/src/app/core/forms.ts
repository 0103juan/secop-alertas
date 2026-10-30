import { FieldTree, ValidationError } from '@angular/forms/signals';

import { errorMessage } from './api/api';

/**
 * Turns a DRF 400 (`{"username": ["already taken"], "non_field_errors": [...]}`) into signal-forms errors on the
 * matching fields, so the server's message appears under the input it is about. Anything without a matching field
 * goes on the form itself.
 */
export function serverErrors(
  error: unknown,
  fields: Record<string, FieldTree<unknown>>,
): ValidationError.WithOptionalFieldTree[] {
  const { status, error: body } = error as { status?: number; error?: unknown };
  if (status !== 400 || !body || typeof body !== 'object') {
    return [{ kind: 'server', message: errorMessage(error) }];
  }
  return Object.entries(body as Record<string, unknown>).flatMap(([name, messages]) =>
    ([] as unknown[])
      .concat(messages)
      .filter((message): message is string => typeof message === 'string')
      .map((message) => ({ kind: 'server', message, fieldTree: fields[name] })),
  );
}

/** Only same-site paths: `?next=//evil.example` must not turn the sign-in page into an open redirect. */
export function safeNext(next: string | undefined, fallback = '/alertas'): string {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}
