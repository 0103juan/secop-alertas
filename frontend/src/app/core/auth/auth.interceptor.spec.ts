import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { authInterceptor } from './auth.interceptor';
import { Session } from './session';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let session: Session;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    session = TestBed.inject(Session);
  });

  function signInWith(token: string): void {
    (session as unknown as { access: { set(v: string): void } }).access.set(token);
  }

  it('sends the access token to the API and nothing to other hosts', () => {
    signInWith('t1');
    http.get('/api/v1/subscriptions/').subscribe();
    http.get('https://example.org/x').subscribe();
    expect(backend.expectOne('/api/v1/subscriptions/').request.headers.get('Authorization')).toBe('Bearer t1');
    expect(backend.expectOne('https://example.org/x').request.headers.has('Authorization')).toBe(false);
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    signInWith('old');
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/v1/subscriptions/'));
    backend.expectOne('/api/v1/subscriptions/').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh/').flush({ access: 'new' });
    const retry = backend.expectOne('/api/v1/subscriptions/');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('makes a single refresh when several calls expire at once', () => {
    signInWith('old');
    http.get('/api/v1/subscriptions/').subscribe();
    http.get('/api/v1/alerts/').subscribe();
    backend.expectOne('/api/v1/subscriptions/').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/alerts/').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh/').flush({ access: 'new' }); // expectOne fails if there were two
    backend.expectOne('/api/v1/subscriptions/').flush({});
    backend.expectOne('/api/v1/alerts/').flush({});
    backend.verify();
  });

  it('ends the session and sends the user to sign in when the refresh fails too', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    signInWith('old');
    const result = firstValueFrom(http.get('/api/v1/subscriptions/'));
    backend.expectOne('/api/v1/subscriptions/').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/v1/auth/refresh/').flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(result).rejects.toBeTruthy();
    expect(session.token()).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/ingresar'], expect.anything());
  });

  it('sends the token to /auth/me/, which needs it', () => {
    signInWith('t1');
    http.get('/api/v1/auth/me/').subscribe();
    expect(backend.expectOne('/api/v1/auth/me/').request.headers.get('Authorization')).toBe('Bearer t1');
  });

  it('never refreshes for the credential calls themselves', () => {
    http.post('/api/v1/auth/login/', {}).subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/auth/login/').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.verify(); // no refresh request was made
  });
});
