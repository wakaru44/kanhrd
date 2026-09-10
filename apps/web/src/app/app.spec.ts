import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { WsEvent } from '@kanhrd/schema';
import { App } from './app';
import { routes } from './app.routes';
import { WsClient } from './state/ws-client';
import { KeyboardService } from './state/keyboard.service';
import { ToastService } from './state/toast.service';

/** `KeyboardService` (wired into `App`'s global keydown) transitively injects the real `PanesStore`, which opens a socket via `WsClient` — fake it here so these tests don't hit a real WebSocket, mirroring board.spec.ts's `FakeWsClient`. */
class FakeWsClient {
  readonly connected = signal(false);
  readonly lastError = signal<string | null>(null);
  readonly events$ = new Subject<WsEvent>();
  connect(): void {
    // no-op
  }
  request = jasmine.createSpy('request');
}

/** `ToastHost` decides its placement from `matchMedia('(max-width: 900px)')`; fixing the answer makes both placements testable without resizing the runner. */
function fakeMatchMedia(matches: boolean): void {
  spyOn(window, 'matchMedia').and.callFake(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  );
}

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: new FakeWsClient() },
      ],
    }).compileComponents();
  });

  function create(): ComponentFixture<App> {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    return fixture;
  }

  it('should create the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('renders the wordmark with the crook set over the n', () => {
    const el = create().nativeElement as HTMLElement;
    const brand = el.querySelector('.brand');
    expect(brand?.textContent).toContain('kanhrd');
    expect(brand?.querySelector('.crook-letter')?.textContent).toBe('n');
  });

  describe('the terminal owns its keys', () => {
    it('never forwards an unmodified ?', () => {
      create();
      const keyboard = TestBed.inject(KeyboardService);
      const handle = spyOn(keyboard, 'handleKeydown').and.callThrough();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: '?' }));

      expect(handle).not.toHaveBeenCalled();
      expect(keyboard.helpOpen()).toBeFalse();
    });

    it('never forwards an unmodified Escape when no chrome is open', () => {
      create();
      const keyboard = TestBed.inject(KeyboardService);
      const handle = spyOn(keyboard, 'handleKeydown').and.callThrough();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(handle).not.toHaveBeenCalled();
    });

    it('forwards Escape only while app chrome is open', () => {
      create();
      const keyboard = TestBed.inject(KeyboardService);
      keyboard.openHelp();
      const handle = spyOn(keyboard, 'handleKeydown').and.callThrough();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(handle).toHaveBeenCalled();
      expect(keyboard.helpOpen()).toBeFalse();
    });

    it('still forwards the prefix chord', () => {
      create();
      const keyboard = TestBed.inject(KeyboardService);
      const handle = spyOn(keyboard, 'handleKeydown').and.callThrough();

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));

      expect(handle).toHaveBeenCalled();
    });
  });

  describe('fix-keyboard-shortcut-suppression: capture-phase listener at window', () => {
    it('still sees the prefix keydown when a document-level capture-phase listener stops propagation first (simulates a browser extension like Vimium binding Ctrl+B)', () => {
      create();
      const keyboard = TestBed.inject(KeyboardService);
      const handle = spyOn(keyboard, 'handleKeydown').and.callThrough();

      const vimiumLike = (e: KeyboardEvent): void => e.stopPropagation();
      document.addEventListener('keydown', vimiumLike, { capture: true });
      try {
        document.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'b', ctrlKey: true, bubbles: true, cancelable: true })
        );
      } finally {
        document.removeEventListener('keydown', vimiumLike, { capture: true });
      }

      expect(handle)
        .withContext(
          'window-capture listener must run before document-capture, regardless of registration order'
        )
        .toHaveBeenCalled();
    });

    it('removes the window listener on destroy (DestroyRef cleanup)', () => {
      const fixture = create();
      const keyboard = TestBed.inject(KeyboardService);
      const handle = spyOn(keyboard, 'handleKeydown').and.callThrough();

      fixture.destroy();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));

      expect(handle).not.toHaveBeenCalled();
    });
  });

  describe('toast placement', () => {
    it('stacks bottom-right at desktop width', () => {
      fakeMatchMedia(false);
      const fixture = create();
      TestBed.inject(ToastService).push({ level: 'info', message: 'back in view.' });
      fixture.detectChanges();

      const stack = (fixture.nativeElement as HTMLElement).querySelector('.toast-stack');
      expect(stack?.classList.contains('at-bottom-right')).toBeTrue();
      expect(stack?.classList.contains('at-top')).toBeFalse();
    });

    it('stacks at the top below --breakpoint-mobile', () => {
      fakeMatchMedia(true);
      const fixture = create();
      TestBed.inject(ToastService).push({ level: 'error', message: 'lost the bridge. retrying.' });
      fixture.detectChanges();

      const stack = (fixture.nativeElement as HTMLElement).querySelector('.toast-stack');
      expect(stack?.classList.contains('at-top')).toBeTrue();
      expect(stack?.classList.contains('at-bottom-right')).toBeFalse();
    });
  });
});
