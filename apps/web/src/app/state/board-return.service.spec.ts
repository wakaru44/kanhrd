import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import type { AgentStatus } from '@kanhrd/schema';
import {
  BoardReturnService,
  RESTORE_GRACE_MS,
  isBoardUrl,
  returnFocusTarget,
  type BoardRestorePort,
} from './board-return.service';

/** One pump tick, written out here so the grace-period test reads as "past the deadline". */
const RESTORE_RETRY_TICK = 50;

describe('returnFocusTarget (pure)', () => {
  const column = ['laptop:a', 'laptop:b', 'laptop:c'];

  it('returns the opened card when it is still in its column', () => {
    expect(returnFocusTarget('laptop:b', 1, column)).toBe('laptop:b');
  });

  it('returns the card now standing where it stood when it is gone', () => {
    expect(returnFocusTarget('laptop:b', 1, ['laptop:a', 'laptop:c', 'laptop:d'])).toBe('laptop:c');
  });

  it('clamps to the last card when the column shrank past the remembered index', () => {
    expect(returnFocusTarget('laptop:c', 2, ['laptop:a'])).toBe('laptop:a');
  });

  it('finds the card even when it moved within its column', () => {
    expect(returnFocusTarget('laptop:c', 0, column)).toBe('laptop:c');
  });

  it('has no target for a column that emptied out', () => {
    expect(returnFocusTarget('laptop:b', 1, [])).toBeNull();
  });

  it('falls back by index when the board was left without opening a card', () => {
    expect(returnFocusTarget(null, 0, column)).toBe('laptop:a');
  });

  it('tolerates a negative or absurd index', () => {
    expect(returnFocusTarget('gone', -3, column)).toBe('laptop:a');
    expect(returnFocusTarget('gone', 99, column)).toBe('laptop:c');
  });
});

describe('isBoardUrl', () => {
  it('recognises the three board shapes and nothing else', () => {
    expect(isBoardUrl('/')).toBe(true);
    expect(isBoardUrl('/workspace/w6')).toBe(true);
    expect(isBoardUrl('/workspace/w6/tab/w6:t2')).toBe(true);

    expect(isBoardUrl('/pane/local/w6:p1')).toBe(false);
    expect(isBoardUrl('/settings')).toBe(false);
    expect(isBoardUrl('/workspace')).toBe(false);
    expect(isBoardUrl('/workspace/w6/tab')).toBe(false);
    expect(isBoardUrl('/workspace/w6/tab/t1/extra')).toBe(false);
    expect(isBoardUrl('/nonsense')).toBe(false);
  });

  it('ignores a query string or fragment', () => {
    expect(isBoardUrl('/workspace/w6?q=1')).toBe(true);
    expect(isBoardUrl('/#frag')).toBe(true);
  });
});

/** A drivable stand-in for the router: `url` now, plus the navigations that got there. */
class FakeRouter {
  url = '/';
  readonly events = new Subject<NavigationEnd>();

  go(url: string): void {
    this.url = url;
    this.events.next(new NavigationEnd(1, url, url));
  }
}

/**
 * The board, reduced to the six answers the restore protocol needs. The
 * protocol under test is all timing, ordering and give-up rules, so it is
 * driven against this rather than a rendered board — the fixture-level
 * round trip that proves the port is wired to a real DOM lives in
 * `board.spec.ts`.
 */
class FakePort implements BoardRestorePort {
  url = '/workspace/w6';
  /** The board is on the skeleton until something says otherwise. */
  rendered = false;
  keys: readonly string[] = [];
  /** Cards the DOM has rendered so far; `focusCard` reports the rest as not there yet. */
  cards = new Set<string>();
  readonly log: string[] = [];
  focused: string | null = null;
  page: number | null = null;
  readonly columnScrolls = new Map<AgentStatus, number>();

  currentUrl(): string {
    return this.url;
  }
  ready(): boolean {
    return this.rendered;
  }
  restorePage(scrollLeft: number): void {
    this.log.push(`page:${scrollLeft}`);
    this.page = scrollLeft;
  }
  restoreColumnScroll(status: AgentStatus, scrollTop: number): void {
    this.log.push(`scroll:${status}`);
    this.columnScrolls.set(status, scrollTop);
  }
  columnKeys(): readonly string[] {
    return this.keys;
  }
  focusCard(paneKey: string): boolean {
    if (!this.cards.has(paneKey)) {
      return false;
    }
    this.log.push(`focus:${paneKey}`);
    this.focused = paneKey;
    return true;
  }
}

describe('BoardReturnService', () => {
  let service: BoardReturnService;
  let router: FakeRouter;

  const geometry = { scrollLeft: 780, scrollTops: { working: 240 } as const };

  beforeEach(() => {
    router = new FakeRouter();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Router, useValue: router }],
    });
    service = TestBed.inject(BoardReturnService);
  });

  // --- the URL half ------------------------------------------------------

  describe('the board URL', () => {
    it("sends a pane's back control to / until a board has been remembered", () => {
      expect(service.boardUrl()).toBe('/');
    });

    it('remembers the scoped URL the board was on', () => {
      router.go('/workspace/w1/tab/t1');
      service.rememberBoard(geometry);
      expect(service.boardUrl()).toBe('/workspace/w1/tab/t1');
    });

    it('remembers the board it was ON, not the pane the router already moved to', () => {
      // The router commits the navigation before the outgoing board is torn
      // down, so by `ngOnDestroy` `Router.url` already names the pane. The
      // board never hands a URL over for exactly this reason.
      router.go('/workspace/w6');
      router.go('/pane/local/w6:p2');
      service.rememberBoard(geometry);

      expect(service.boardUrl()).toBe('/workspace/w6');
    });

    it('ignores every URL that is not a board', () => {
      router.go('/workspace/w6');
      router.go('/settings');
      router.go('/nonsense');
      service.rememberBoard(geometry);

      expect(service.boardUrl()).toBe('/workspace/w6');
    });

    it('falls back to / when no board has been navigated to at all', () => {
      const fresh = new FakeRouter();
      fresh.url = '/pane/local/w6:p1'; // a deep link straight into a pane
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), { provide: Router, useValue: fresh }],
      });
      const cold = TestBed.inject(BoardReturnService);
      cold.rememberBoard(geometry);

      expect(cold.boardUrl()).toBe('/');
    });

    it('seeds from the URL the app came up on', () => {
      const fresh = new FakeRouter();
      fresh.url = '/workspace/w9';
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), { provide: Router, useValue: fresh }],
      });
      const cold = TestBed.inject(BoardReturnService);
      cold.rememberBoard(geometry);

      expect(cold.boardUrl()).toBe('/workspace/w9');
    });

    it('keeps only the most recent board position', () => {
      router.go('/workspace/w1');
      service.rememberBoard(geometry);
      router.go('/');
      service.rememberBoard({ scrollLeft: 0, scrollTops: {} });

      expect(service.boardUrl()).toBe('/');
    });

    it('clear() forgets the record', () => {
      router.go('/workspace/w1');
      service.rememberBoard(geometry);
      service.clear();

      expect(service.boardUrl()).toBe('/');
    });
  });

  // --- the restore protocol ---------------------------------------------

  describe('putting the user back', () => {
    let port: FakePort;

    beforeEach(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(new Date(2026, 0, 1));
      port = new FakePort();
      router.go('/workspace/w6');
    });

    afterEach(() => {
      service.clear();
      jasmine.clock().uninstall();
    });

    /** The state a board is left in when a card is opened from it. */
    function leaveByCard(
      paneKey = 'local:w6:p2',
      status: AgentStatus = 'working',
      index = 1
    ): void {
      service.rememberCard(paneKey, status, index);
      service.rememberBoard(geometry);
    }

    /** Mount: hand the port over, then the first attempt after the first render. */
    function comeBack(): void {
      service.restore(port);
      service.retryRestore();
    }

    it('restores scroll and focus when the board comes up at the remembered URL', () => {
      leaveByCard();
      port.rendered = true;
      port.keys = ['local:w6:p1', 'local:w6:p2'];
      port.cards.add('local:w6:p2');

      comeBack();

      expect(port.page).toBe(780);
      expect(port.columnScrolls.get('working')).toBe(240);
      expect(port.focused).toBe('local:w6:p2');
    });

    it('restores the scroll before it restores focus', () => {
      leaveByCard();
      port.rendered = true;
      port.keys = ['local:w6:p1', 'local:w6:p2'];
      port.cards.add('local:w6:p2');

      comeBack();

      expect(port.log).toEqual(['page:780', 'scroll:working', 'focus:local:w6:p2']);
    });

    it('restores nothing when the board comes up at a different URL', () => {
      leaveByCard();
      port.url = '/workspace/somewhere-else';
      port.rendered = true;
      port.keys = ['local:w6:p2'];
      port.cards.add('local:w6:p2');

      comeBack();
      jasmine.clock().tick(200);

      expect(port.focused).toBeNull();
      expect(port.page).toBeNull();
    });

    it('keeps looking every 50ms until the card renders', () => {
      leaveByCard();
      port.rendered = true;
      port.keys = ['local:w6:p1', 'local:w6:p2'];

      comeBack();
      expect(port.focused).toBeNull();

      jasmine.clock().tick(49);
      expect(port.focused).toBeNull();

      // `pane.list` lands, and the pump's next tick finds the card.
      port.cards.add('local:w6:p2');
      jasmine.clock().tick(1);
      expect(port.focused).toBe('local:w6:p2');
    });

    it('waits through a board that is still on the skeleton', () => {
      leaveByCard();
      port.keys = ['local:w6:p2'];
      port.cards.add('local:w6:p2');

      comeBack();
      expect(port.focused).toBeNull();

      port.rendered = true;
      jasmine.clock().tick(50);
      expect(port.focused).toBe('local:w6:p2');
    });

    it('gives up once the grace period has run out, rather than jumping late', () => {
      leaveByCard();
      port.keys = ['local:w6:p2'];

      comeBack();
      jasmine.clock().tick(RESTORE_GRACE_MS + RESTORE_RETRY_TICK);

      // The data finally arrives, far too late to be anything but a surprise.
      port.rendered = true;
      port.cards.add('local:w6:p2');
      jasmine.clock().tick(500);

      expect(port.focused).toBeNull();
      expect(port.page).toBeNull();
    });

    it("falls back to the card standing in the opened one's place", () => {
      leaveByCard('local:w6:p2', 'working', 1);
      port.rendered = true;
      // That pane closed while the user was inside it; another took its slot.
      port.keys = ['local:w6:p1', 'local:w6:p3'];
      port.cards.add('local:w6:p3');

      comeBack();

      expect(port.focused).toBe('local:w6:p3');
    });

    it('has nothing to focus in a column that emptied out, and stops looking', () => {
      leaveByCard();
      port.rendered = true;
      port.keys = [];

      comeBack();
      port.keys = ['local:w6:p2'];
      port.cards.add('local:w6:p2');
      jasmine.clock().tick(500);

      expect(port.focused).toBeNull();
      expect(port.page).toBe(780);
    });

    it('restores the scroll of a departure that opened no card, and asks for no focus', () => {
      service.rememberBoard(geometry);
      port.rendered = true;
      port.keys = ['local:w6:p1'];
      port.cards.add('local:w6:p1');

      comeBack();
      jasmine.clock().tick(500);

      expect(port.page).toBe(780);
      expect(port.focused).toBeNull();
    });

    it('leaves focus the user has already placed somewhere else alone, and stops looking', () => {
      leaveByCard();
      port.rendered = true;
      port.keys = ['local:w6:p2'];
      // The port's own rule: the card is there, but focus was not taken.
      port.cards.add('local:w6:p2');
      spyOn(port, 'focusCard').and.returnValue(true);

      comeBack();
      jasmine.clock().tick(500);

      expect(port.focusCard).toHaveBeenCalledTimes(1);
    });

    it('is good for exactly one return', () => {
      leaveByCard();
      port.rendered = true;
      port.keys = ['local:w6:p2'];
      port.cards.add('local:w6:p2');
      comeBack();
      expect(port.focused).toBe('local:w6:p2');

      // The user navigates away and back again by some other route.
      const second = new FakePort();
      second.rendered = true;
      second.keys = ['local:w6:p2'];
      second.cards.add('local:w6:p2');
      service.restore(second);
      service.retryRestore();
      jasmine.clock().tick(500);

      expect(second.focused).toBeNull();
      expect(second.page).toBeNull();
    });

    it("does not let a later departure inherit an earlier visit's card", () => {
      leaveByCard();
      service.restore(port);
      service.clear();

      // Second visit, left through the rail rather than a card.
      service.rememberBoard(geometry);
      const second = new FakePort();
      second.rendered = true;
      second.keys = ['local:w6:p1', 'local:w6:p2'];
      second.cards.add('local:w6:p2');
      service.restore(second);
      service.retryRestore();
      jasmine.clock().tick(500);

      expect(second.focused).toBeNull();
      expect(second.page).toBe(780);
    });

    it('stops the pump when the board it was restoring is torn down again', () => {
      leaveByCard();
      port.keys = ['local:w6:p2'];
      comeBack();

      service.rememberBoard({ scrollLeft: 0, scrollTops: {} });
      port.rendered = true;
      port.cards.add('local:w6:p2');
      jasmine.clock().tick(500);

      expect(port.focused).toBeNull();
    });
  });
});
