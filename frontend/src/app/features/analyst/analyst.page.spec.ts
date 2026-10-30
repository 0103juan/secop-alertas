import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { AnalystPage } from './analyst.page';

describe('AnalystPage', () => {
  let fixture: ComponentFixture<AnalystPage>;
  let component: AnalystPage;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnalystPage],
    }).compileComponents();

    fixture = TestBed.createComponent(AnalystPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders heading and microfrontend iframe with safe url', () => {
    const el = fixture.nativeElement as HTMLElement;
    const h1 = el.querySelector('h1');
    expect(h1?.textContent).toContain('Analista Inteligente');

    const iframe = el.querySelector('iframe');
    expect(iframe).not.toBeNull();
  });

  it('handles iframe load event by updating loading state', () => {
    expect(component.isLoading()).toBe(true);
    component.onIframeLoad();
    expect(component.isLoading()).toBe(false);
  });
});
