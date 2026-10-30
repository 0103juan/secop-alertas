import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { finalize, firstValueFrom, map, Observable, shareReplay, tap } from 'rxjs';

import { Access, API, Me } from '../api/api';

/**
 * Who is signed in, and the access token.
 *
 * The access token lives only in this signal: not in localStorage, where any injected script could read it. The
 * refresh token is an HttpOnly cookie the browser sends to /api/v1/auth/ by itself, so a reload restores the session
 * without the page ever touching it.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly http = inject(HttpClient);
  private readonly access = signal<string | null>(null);
  private refreshing: Observable<string> | null = null;

  readonly user = signal<Me | null>(null);
  readonly signedIn = computed(() => this.user() !== null);

  token(): string | null {
    return this.access();
  }

  async login(username: string, password: string): Promise<void> {
    const { access } = await firstValueFrom(this.http.post<Access>(`${API}/auth/login/`, { username, password }));
    this.access.set(access);
    this.user.set(await firstValueFrom(this.http.get<Me>(`${API}/auth/me/`)));
  }

  async register(username: string, email: string, password: string): Promise<void> {
    await firstValueFrom(this.http.post(`${API}/auth/register/`, { username, email, password }));
    await this.login(username, password);
  }

  async logout(): Promise<void> {
    this.clear();
    await firstValueFrom(this.http.post(`${API}/auth/logout/`, null)).catch(() => undefined);
  }

  /**
   * A new access token from the cookie. Single-flight: when several requests get a 401 at once they all wait for
   * the same refresh instead of each starting one (which would race and waste the server's time).
   */
  refresh(): Observable<string> {
    this.refreshing ??= this.http.post<Access | null>(`${API}/auth/refresh/`, null).pipe(
      map((body) => {
        if (!body?.access) throw new Error('no session'); // 204: there is no cookie, so nothing to refresh
        return body.access;
      }),
      tap((access) => this.access.set(access)),
      finalize(() => (this.refreshing = null)),
      shareReplay(1),
    );
    return this.refreshing;
  }

  /** At start-up: if the cookie is still valid, come back signed in. Any failure just means signed out. */
  async restore(): Promise<void> {
    try {
      await firstValueFrom(this.refresh());
      this.user.set(await firstValueFrom(this.http.get<Me>(`${API}/auth/me/`)));
    } catch {
      this.clear();
    }
  }

  clear(): void {
    this.access.set(null);
    this.user.set(null);
  }
}
