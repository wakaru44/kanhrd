import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { COPY } from '../shared/copy';

/**
 * The labs surface against the REAL route table: a lab resolves only at its
 * exact path, is lazy, and the prefix alone is not a page.
 */
describe('labs routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter(routes)],
    });
  });

  it('declares every lab route lazily and none as an index', () => {
    const labs = routes.filter((route) => route.path?.startsWith('labs'));
    expect(labs.length).toBeGreaterThan(0);
    for (const route of labs) {
      expect(route.component).withContext(route.path!).toBeUndefined();
      expect(route.loadComponent).withContext(route.path!).toBeDefined();
      expect(route.path).not.toBe('labs');
      expect(route.path!.split('/').length).toBeGreaterThan(2);
    }
  });

  it('keeps the lab routes above the wildcard', () => {
    const wildcard = routes.findIndex((route) => route.path === '**');
    const lab = routes.findIndex((route) => route.path?.startsWith('labs'));
    expect(lab).toBeLessThan(wildcard);
  });

  it('renders the file-explorer mock at its exact path', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/labs/file-explorer/mock1');
    expect(harness.routeNativeElement?.querySelector('[data-lab-marker]')).not.toBeNull();
  });

  for (const url of ['/labs', '/labs/', '/labs/file-explorer', '/labs/file-explorer/mock2']) {
    it(`lands ${url} on the 404, which says nothing about labs`, async () => {
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(url);
      const el = harness.routeNativeElement!;
      expect(el.querySelector('h1')?.textContent?.trim()).toBe(COPY.emptyState.notFound);
      expect(el.textContent?.toLowerCase()).not.toContain('lab');
      expect(el.querySelector('a[href*="labs"]')).toBeNull();
    });
  }
});
