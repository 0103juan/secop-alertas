import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { Session } from './core/auth/session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideRouter(
      routes,
      withComponentInputBinding(), // route and query params arrive as component inputs
      withViewTransitions(),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' }),
    ),
    // The guards need to know whether the visitor is signed in before the first navigation.
    provideAppInitializer(() => inject(Session).restore()),
  ],
};
