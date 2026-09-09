import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import type { WsEvent } from '@kanhrd/schema';
import { App } from './app';
import { routes } from './app.routes';
import { WsClient } from './state/ws-client';

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

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WsClient, useValue: new FakeWsClient() }
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the brand link', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('kanhrd');
  });
});
