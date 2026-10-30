import { HttpClient } from '@angular/common/http';
import { computed, signal } from '@angular/core';

import { errorMessage } from './api/api';

interface Page<T> {
  results: T[];
  next?: string | null;
}

/**
 * A list over a DRF cursor-paginated endpoint: `reset(url)` loads the first page, `more()` appends the next.
 *
 * Every reset starts a new generation, and a response from an older one is dropped. Without that, typing "vías"
 * quickly could show the results for "ví" if that request happened to answer last.
 */
export class CursorList<T> {
  readonly items = signal<T[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  private readonly next = signal<string | null>(null);
  private generation = 0;

  readonly hasMore = computed(() => this.next() !== null);
  readonly empty = computed(() => !this.loading() && !this.error() && this.items().length === 0);

  constructor(private readonly http: HttpClient) {}

  reset(url: string): void {
    this.generation++;
    this.items.set([]);
    this.next.set(null);
    this.fetch(url, this.generation);
  }

  more(): void {
    const url = this.next();
    if (url && !this.loading()) this.fetch(url, this.generation);
  }

  private fetch(url: string, generation: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<Page<T>>(url).subscribe({
      next: (page) => {
        if (generation !== this.generation) return;
        this.items.update((items) => [...items, ...page.results]);
        this.next.set(page.next ? relative(page.next) : null);
        this.loading.set(false);
      },
      error: (error: unknown) => {
        if (generation !== this.generation) return;
        this.error.set(errorMessage(error));
        this.loading.set(false);
      },
    });
  }
}

/** DRF writes absolute `next` links; keeping only path and query makes them same-origin calls the interceptor sees. */
export function relative(url: string): string {
  const parsed = new URL(url, 'http://placeholder');
  return parsed.pathname + parsed.search;
}
