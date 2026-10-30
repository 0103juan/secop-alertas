import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { API } from '../api/api';
import { Session } from './session';

// The calls that obtain or drop credentials: a 401 there is the answer itself, and refreshing on it would loop.
const CREDENTIAL_CALLS = ['login/', 'refresh/', 'logout/', 'register/', 'token/'].map((path) => `${API}/auth/${path}`);

function withToken(request: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request;
}

/**
 * Adds the access token to API calls. When one comes back 401 (the token expired), it refreshes once from the
 * cookie and retries the call; if that fails too, the session is over and the user is sent to sign in, back to
 * where they were afterwards. The credential calls themselves are never retried.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(API)) return next(request);

  const session = inject(Session);
  const router = inject(Router);
  const retriable = !CREDENTIAL_CALLS.some((path) => request.url.startsWith(path));

  return next(withToken(request, session.token())).pipe(
    catchError((error: unknown) => {
      if (!retriable || !(error instanceof HttpErrorResponse) || error.status !== 401) return throwError(() => error);
      return session.refresh().pipe(
        switchMap((token) => next(withToken(request, token))),
        catchError((refreshError: unknown) => {
          session.clear();
          void router.navigate(['/ingresar'], { queryParams: { next: router.url } });
          return throwError(() => refreshError);
        }),
      );
    }),
  );
};
