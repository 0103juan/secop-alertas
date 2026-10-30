import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { CursorList, relative } from './cursor-list';

describe('CursorList', () => {
  let list: CursorList<{ id: number }>;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    list = new CursorList(TestBed.inject(HttpClient));
    backend = TestBed.inject(HttpTestingController);
  });

  it('appends the next page, following DRF links as same-origin paths', () => {
    list.reset('/api/v1/contracts/?q=a');
    backend
      .expectOne('/api/v1/contracts/?q=a')
      .flush({ results: [{ id: 1 }], next: 'https://secop.example/api/v1/contracts/?cursor=abc&q=a' });
    expect(list.hasMore()).toBe(true);
    list.more();
    backend.expectOne('/api/v1/contracts/?cursor=abc&q=a').flush({ results: [{ id: 2 }], next: null });
    expect(list.items().map((i) => i.id)).toEqual([1, 2]);
    expect(list.hasMore()).toBe(false);
  });

  it('drops a slow answer to a search the user already replaced', () => {
    list.reset('/api/v1/contracts/?q=v');
    list.reset('/api/v1/contracts/?q=vias');
    backend.expectOne('/api/v1/contracts/?q=vias').flush({ results: [{ id: 2 }] });
    backend.expectOne('/api/v1/contracts/?q=v').flush({ results: [{ id: 1 }] }); // arrives last
    expect(list.items().map((i) => i.id)).toEqual([2]);
  });

  it('reports an error and an empty result separately', () => {
    list.reset('/api/v1/contracts/');
    backend.expectOne('/api/v1/contracts/').flush(null, { status: 0, statusText: 'offline' });
    expect(list.error()).toContain('conexión');
    expect(list.empty()).toBe(false);
  });

  it('keeps only path and query of a link', () => {
    expect(relative('https://x.run.app/api/v1/alerts/?cursor=1')).toBe('/api/v1/alerts/?cursor=1');
  });
});
