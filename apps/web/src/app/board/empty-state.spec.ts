import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import type { HostSummary } from '@kanhrd/schema';
import { EmptyState } from './empty-state';

function host(name: string, connected: boolean): HostSummary {
  return { name, connected, last_error: connected ? undefined : 'connection refused' };
}

describe('EmptyState', () => {
  let fixture: ComponentFixture<EmptyState>;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date());
    TestBed.configureTestingModule({
      imports: [EmptyState],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(EmptyState);
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders immediately when there are no configured hosts', () => {
    fixture.componentRef.setInput('hosts', []);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(true);
    expect(el().querySelector('.empty-state')).not.toBeNull();
    expect(el().textContent).toContain('no hosts yet.');
  });

  it('does not render right away when a host is merely disconnected', () => {
    fixture.componentRef.setInput('hosts', [host('local', false)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(false);
    expect(el().querySelector('.empty-state')).toBeNull();
  });

  it('renders after every host has been disconnected for more than 5s', () => {
    fixture.componentRef.setInput('hosts', [host('local', false)]);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(false);

    // ClockTick only updates its `now` signal once per second (1000ms
    // interval), so tick comfortably past the 5s grace period rather than
    // right at the boundary.
    jasmine.clock().tick(6001);
    fixture.detectChanges();

    expect(fixture.componentInstance.show()).toBe(true);
    expect(el().textContent).toContain('waiting for a host…');
  });

  it('does not render when at least one host is connected', () => {
    fixture.componentRef.setInput('hosts', [host('local', false), host('remote', true)]);
    fixture.detectChanges();
    jasmine.clock().tick(10_000);
    fixture.detectChanges();
    expect(fixture.componentInstance.show()).toBe(false);
  });

  it('resets the disconnected timer once a host reconnects', () => {
    fixture.componentRef.setInput('hosts', [host('local', false)]);
    fixture.detectChanges();
    jasmine.clock().tick(3000);

    fixture.componentRef.setInput('hosts', [host('local', true)]);
    fixture.detectChanges();
    jasmine.clock().tick(3000);

    fixture.componentRef.setInput('hosts', [host('local', false)]);
    fixture.detectChanges();
    jasmine.clock().tick(3000);
    fixture.detectChanges();

    // Only 3s since the most recent disconnect (the earlier 3s+3s don't
    // carry over), so still below the 5s grace period.
    expect(fixture.componentInstance.show()).toBe(false);
  });
});

describe('EmptyState: the no-matches variant', () => {
  let fixture: ComponentFixture<EmptyState>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EmptyState],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(EmptyState);
    fixture.componentRef.setInput('variant', 'noMatches');
    fixture.componentRef.setInput('hosts', [{ name: 'local', connected: true }]);
    fixture.detectChanges();
  });

  it('always shows, whatever the hosts are doing', () => {
    expect(fixture.componentInstance.show()).toBe(true);
  });

  it('offers clear filters as the next step, with no setup instructions', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.no-matches')?.textContent).toContain(
      'nothing matches these filters.'
    );
    expect(el.querySelector('.action')?.textContent?.trim()).toBe('clear filters');
    expect(el.querySelector('.config-snippet')).withContext('never setup instructions').toBeNull();
  });

  it('emits clearFilters when the action is used', () => {
    let emitted = 0;
    fixture.componentInstance.clearFilters.subscribe(() => (emitted += 1));
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.action')?.click();
    expect(emitted).toBe(1);
  });
});

describe('EmptyState: the no-hosts variant is a tutorial', () => {
  let fixture: ComponentFixture<EmptyState>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EmptyState],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(EmptyState);
    fixture.componentRef.setInput('hosts', []);
    fixture.detectChanges();
  });

  it('renders the config snippet, a copy action and the operating-guide link', () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.empty-state')?.textContent).toContain('no hosts yet.');
    expect(el.querySelector('.config-snippet')?.textContent).toContain('socket:');
    expect(el.querySelector('.copy-action')).not.toBeNull();
    const link = el.querySelector<HTMLAnchorElement>('.guide-link');
    expect(link?.textContent?.trim()).toBe('read the operating guide');
    expect(link?.href).toContain('OPERATING.md');
  });
});
