import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { Pane, TabSummary } from '@kanhrd/schema';
import { TabStrip, stepTab, tabEntries, type TabEntry } from './tab-strip';
import { COPY } from '../shared/copy';

/**
 * The tab level of the pane-detail bar (add-pane-tab-hierarchy).
 *
 * The arithmetic — which tabs belong to this strip, and which one is next —
 * is proven as pure functions, because it is the SAME answer `prefix + n` /
 * `prefix + p` use through `PaneDetail`'s registered navigator. If these two
 * ever disagreed, the pointer and the keyboard would disagree.
 */

function tab(id: string, name: string, workspace = 'w1', host = 'laptop'): TabSummary {
  return { id, host, name, workspace: { id: workspace } };
}

function pane(id: string, tabId: string, workspace = 'w1', host = 'laptop'): Pane {
  return {
    id,
    host,
    workspace: { id: workspace, name: 'kanhrd' },
    tab: { id: tabId, name: tabId },
    agent_status: 'idle',
  };
}

describe('tab-strip arithmetic', () => {
  const tabs = [tab('t1', 'SVC'), tab('t2', 'GPT'), tab('t3', 'term2')];
  const panes = [pane('p1', 't1'), pane('p2', 't1'), pane('p3', 't2'), pane('p4', 't3')];

  it('lists the tabs of this workspace on this host, with the pane each one opens', () => {
    const entries = tabEntries(tabs, panes, 'laptop', 'w1', 't2');

    expect(entries.map((e) => e.tab.name)).toEqual(['SVC', 'GPT', 'term2']);
    expect(entries.map((e) => e.pane.id)).toEqual(['p1', 'p3', 'p4']);
    expect(entries.map((e) => e.count)).toEqual([2, 1, 1]);
    expect(entries.map((e) => e.current)).toEqual([false, true, false]);
  });

  it('leaves out another host, another workspace, and a tab with no pane to open', () => {
    const foreign = [
      ...tabs,
      tab('t4', 'elsewhere', 'w2'),
      tab('t5', 'remote', 'w1', 'prod'),
      tab('t6', 'empty'),
    ];
    const entries = tabEntries(foreign, panes, 'laptop', 'w1', 't1');

    // `t6` has no pane, so there is no URL to navigate to — a dead entry is
    // worse than an absent one.
    expect(entries.map((e) => e.tab.id)).toEqual(['t1', 't2', 't3']);
  });

  it('steps to the next and previous tab, wrapping at both ends', () => {
    const at = (current: string) => tabEntries(tabs, panes, 'laptop', 'w1', current);

    expect(stepTab(at('t1'), 1)?.tab.id).toBe('t2');
    expect(stepTab(at('t3'), 1)?.tab.id)
      .withContext('wraps past the last')
      .toBe('t1');
    expect(stepTab(at('t1'), -1)?.tab.id)
      .withContext('wraps before the first')
      .toBe('t3');
    expect(stepTab(at('t2'), -1)?.tab.id).toBe('t1');
  });

  it('has nowhere to step in a workspace of one tab, and says so with null', () => {
    const single = tabEntries([tab('t1', 'SVC')], [pane('p1', 't1')], 'laptop', 'w1', 't1');
    expect(single.length).toBe(1);
    expect(stepTab(single, 1)).toBeNull();
    expect(stepTab(single, -1)).toBeNull();
    expect(stepTab([], 1)).toBeNull();
  });
});

describe('TabStrip', () => {
  function entries(currentId = 't1'): TabEntry[] {
    return [
      { tab: tab('t1', 'SVC'), pane: pane('p1', 't1'), count: 2, current: currentId === 't1' },
      { tab: tab('t2', 'GPT'), pane: pane('p3', 't2'), count: 1, current: currentId === 't2' },
    ];
  }

  function render(current = 't1'): HTMLElement {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    });
    const fixture = TestBed.createComponent(TabStrip);
    fixture.componentRef.setInput('entries', entries(current));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders every tab as a link to a pane detail route, never a content swap', () => {
    const links = Array.from(render().querySelectorAll('a.tab'));

    expect(links.length).toBe(2);
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '/pane/laptop/p1',
      '/pane/laptop/p3',
    ]);
  });

  it('marks the current tab by weight, an ochre rule and aria-current — never colour alone', () => {
    const el = render('t2');
    const links = Array.from(el.querySelectorAll('a.tab'));

    expect(links[1].getAttribute('aria-current')).toBe('page');
    expect(links[0].getAttribute('aria-current')).toBeNull();
    expect(links[1].classList.contains('current')).toBeTrue();
    const style = getComputedStyle(links[1]);
    expect(style.fontWeight).not.toBe(getComputedStyle(links[0]).fontWeight);
    expect(style.borderBottomStyle).toBe('solid');
  });

  it('names the strip and every entry, carrying the card count into the accessible name', () => {
    const el = render();

    expect(el.querySelector('.tab-strip')?.getAttribute('aria-label')).toBe(COPY.nav.tabStrip);
    expect(el.querySelector('a.tab')?.getAttribute('aria-label')).toBe('SVC — 2 cards');
  });

  it('keeps one tab stop and moves focus with the arrows, loading nothing on the way', () => {
    const el = render();
    document.body.appendChild(el);
    const links = Array.from(el.querySelectorAll<HTMLAnchorElement>('a.tab'));

    expect(links.map((a) => a.getAttribute('tabindex'))).toEqual(['0', '-1']);

    links[0].focus();
    el.querySelector('.tab-strip')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })
    );
    expect(document.activeElement).withContext('focus moved, route did not').toBe(links[1]);

    el.querySelector('.tab-strip')!.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Home', bubbles: true })
    );
    expect(document.activeElement).toBe(links[0]);
    el.remove();
  });
});
