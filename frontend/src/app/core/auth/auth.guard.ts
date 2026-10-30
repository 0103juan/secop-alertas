import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';

import { Session } from './session';

/** canMatch, not canActivate: a signed-out visitor never even downloads the lazy chunk of the private pages. */
export const signedIn: CanMatchFn = (_route, segments) => {
  if (inject(Session).signedIn()) return true;
  const next = '/' + segments.map((segment) => segment.path).join('/');
  return inject(Router).createUrlTree(['/ingresar'], { queryParams: { next } });
};
