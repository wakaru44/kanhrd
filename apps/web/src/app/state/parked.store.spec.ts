import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AgentStatus } from '@kanhrd/schema';
import {
  PARKED_STORAGE_KEY,
  ParkedStore,
  defaultParked,
  loadParked,
  saveParked,
  shouldExit,
  type ExitRule,
  type ParkedState,
} from './parked.store';
import type { PaneKey } from './panes.store';

/** A `localStorage` stand-in, so the pure read/write pair tests without a browser. */
function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

function state(overrides: Partial<ParkedState> = {}): ParkedState {
  return { ...defaultParked(), ...overrides };
}

describe('parked.store persistence', () => {
  it('round-trips columns and membership through one key', () => {
    const storage = fakeStorage();
    const written = state({
      columns: [
        { id: 'p1', name: 'archived', exitRule: 'never', order: 0 },
        { id: 'p2', name: 'parking', exitRule: 'agent-activity', order: 1 },
      ],
      membership: { 'laptop:pane-7': 'p1', 'prod:pane-3': 'p2' },
    });

    saveParked(written, storage);

    expect(storage.data.has(PARKED_STORAGE_KEY)).toBeTrue();
    expect(loadParked(storage)).toEqual(written);
  });

  it('keys membership by PaneKey, the same `${host}:${id}` the pane map uses', () => {
    const storage = fakeStorage();
    const key: PaneKey = 'laptop:pane-7';
    saveParked(
      state({
        columns: [{ id: 'p1', name: 'archived', exitRule: 'never', order: 0 }],
        membership: { [key]: 'p1' },
      }),
      storage
    );

    expect(loadParked(storage).membership[key]).toBe('p1');
  });

  it('loads the default when the key is absent', () => {
    expect(loadParked(fakeStorage())).toEqual(defaultParked());
  });

  it('loads the default from unparsable JSON rather than throwing', () => {
    expect(loadParked(fakeStorage({ [PARKED_STORAGE_KEY]: '{not json' }))).toEqual(defaultParked());
  });

  it('loads the default from an unknown version rather than half-applying it', () => {
    const raw = JSON.stringify({
      version: 2,
      columns: [{ id: 'p1', name: 'archived', exitRule: 'never', order: 0 }],
      membership: { 'laptop:p1': 'p1' },
    });
    expect(loadParked(fakeStorage({ [PARKED_STORAGE_KEY]: raw }))).toEqual(defaultParked());
  });

  it('drops a column with an unknown exit rule, keeping the rest', () => {
    const raw = JSON.stringify({
      version: 1,
      columns: [
        { id: 'p1', name: 'archived', exitRule: 'on any activity', order: 0 },
        { id: 'p2', name: 'parking', exitRule: 'agent-activity', order: 1 },
      ],
      membership: {},
    });

    expect(loadParked(fakeStorage({ [PARKED_STORAGE_KEY]: raw })).columns.map((c) => c.id)).toEqual(
      ['p2']
    );
  });

  it('drops a membership entry naming a column this document does not define', () => {
    const raw = JSON.stringify({
      version: 1,
      columns: [{ id: 'p1', name: 'archived', exitRule: 'never', order: 0 }],
      membership: { 'laptop:a': 'p1', 'laptop:b': 'p9' },
    });

    expect(loadParked(fakeStorage({ [PARKED_STORAGE_KEY]: raw })).membership).toEqual({
      'laptop:a': 'p1',
    });
  });

  it('drops a structurally broken column entry rather than failing the load', () => {
    const raw = JSON.stringify({
      version: 1,
      columns: [null, { name: 'no id', exitRule: 'never', order: 0 }, 'nonsense'],
      membership: {},
    });

    expect(loadParked(fakeStorage({ [PARKED_STORAGE_KEY]: raw }))).toEqual(defaultParked());
  });
});

describe('parked.store shouldExit', () => {
  const STATUSES: readonly AgentStatus[] = ['idle', 'working', 'blocked', 'done', 'unknown'];

  it('never ejects a card under the `never` rule, for any transition', () => {
    for (const previous of STATUSES) {
      for (const next of STATUSES) {
        expect(shouldExit('never', previous, next))
          .withContext(`${previous} → ${next}`)
          .toBeFalse();
      }
    }
  });

  it('ejects under `agent-activity` only on a transition INTO working or blocked', () => {
    for (const previous of STATUSES) {
      for (const next of STATUSES) {
        const expected = previous !== next && (next === 'working' || next === 'blocked');
        expect(shouldExit('agent-activity', previous, next))
          .withContext(`${previous} → ${next}`)
          .toBe(expected);
      }
    }
  });

  it('leaves a card parked when the agent finishes: working → done stays', () => {
    expect(shouldExit('agent-activity', 'working', 'done')).toBeFalse();
    expect(shouldExit('agent-activity', 'working', 'idle')).toBeFalse();
    expect(shouldExit('agent-activity', 'blocked', 'unknown')).toBeFalse();
  });

  it('does not fire on a repeated status — that is not a transition', () => {
    expect(shouldExit('agent-activity', 'working', 'working')).toBeFalse();
    expect(shouldExit('agent-activity', 'blocked', 'blocked')).toBeFalse();
  });
});

describe('ParkedStore', () => {
  let store: ParkedStore;

  beforeEach(() => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ParkedStore);
  });

  afterEach(() => {
    localStorage.removeItem(PARKED_STORAGE_KEY);
  });

  it('creates columns in order and hands back the created column', () => {
    const first = store.createColumn('archived', 'never');
    const second = store.createColumn('parking');

    expect([first.id, second.id]).toEqual(['p1', 'p2']);
    expect(store.columns().map((c) => c.name)).toEqual(['archived', 'parking']);
    expect(second.exitRule).withContext('the confirmed default').toBe('agent-activity');
    expect(store.hasColumns()).toBeTrue();
  });

  it('renames a column and sets its exit rule without touching membership', () => {
    const column = store.createColumn('archived', 'never');
    store.park('laptop:a', column.id);

    store.renameColumn(column.id, 'cold storage');
    store.setExitRule(column.id, 'agent-activity');

    expect(store.columns()[0].name).toBe('cold storage');
    expect(store.columns()[0].exitRule).toBe('agent-activity');
    expect(store.columnOf('laptop:a')).toBe(column.id);
  });

  it('ignores a park into a column that does not exist', () => {
    store.park('laptop:a', 'p9');
    expect(store.columnOf('laptop:a')).toBeNull();
  });

  it('removeColumn releases every card it held', () => {
    const archived = store.createColumn('archived', 'never');
    const parking = store.createColumn('parking');
    store.park('laptop:a', archived.id);
    store.park('laptop:b', parking.id);

    store.removeColumn(archived.id);

    expect(store.columns().map((c) => c.id)).toEqual([parking.id]);
    expect(store.columnOf('laptop:a')).withContext('back to its status column').toBeNull();
    expect(store.columnOf('laptop:b')).toBe(parking.id);
  });

  it('releasePanes drops exactly the keys it is given', () => {
    const column = store.createColumn('archived', 'never');
    store.park('laptop:a', column.id);
    store.park('laptop:b', column.id);

    store.releasePanes(['laptop:a', 'laptop:zzz']);

    expect(store.columnOf('laptop:a')).toBeNull();
    expect(store.columnOf('laptop:b')).toBe(column.id);
  });

  it('applies the exit rule to a status change, and only to the card that moved', () => {
    const archived = store.createColumn('archived', 'never');
    const parking = store.createColumn('parking', 'agent-activity');
    store.park('laptop:a', archived.id);
    store.park('laptop:b', parking.id);

    store.applyAgentStatusChanged('laptop:a', 'idle', 'working');
    store.applyAgentStatusChanged('laptop:b', 'idle', 'done');
    expect(store.columnOf('laptop:a')).withContext('`never` holds it').toBe(archived.id);
    expect(store.columnOf('laptop:b')).withContext('done is not activity').toBe(parking.id);

    store.applyAgentStatusChanged('laptop:b', 'done', 'working');
    expect(store.columnOf('laptop:b')).toBeNull();
  });

  it('applies a rule change from the next event onward, never retroactively', () => {
    const column = store.createColumn('parking', 'never');
    store.park('laptop:a', column.id);
    store.applyAgentStatusChanged('laptop:a', 'idle', 'working');

    // The card was already `working` when the rule changed; nothing unparks
    // until the NEXT transition into working/blocked.
    store.setExitRule(column.id, 'agent-activity');
    expect(store.columnOf('laptop:a')).toBe(column.id);

    store.applyAgentStatusChanged('laptop:a', 'working', 'blocked');
    expect(store.columnOf('laptop:a')).toBeNull();
  });

  it('persists every change under the kanhrd.* key, and reloads it', () => {
    const column = store.createColumn('archived', 'never');
    store.park('laptop:a', column.id);
    TestBed.tick(); // flush the persisting effect

    const reloaded = loadParked();
    expect(reloaded.columns.map((c) => c.name)).toEqual(['archived']);
    expect(reloaded.membership['laptop:a']).toBe(column.id);
    expect(localStorage.key(0)?.startsWith('kanhrd.')).toBeTrue();
  });

  it('clear removes every column and every membership entry', () => {
    const column = store.createColumn('archived', 'never');
    store.park('laptop:a', column.id);

    store.clear();

    expect(store.columns()).toEqual([]);
    expect(store.columnOf('laptop:a')).toBeNull();
    expect(store.hasColumns()).toBeFalse();
  });

  it('offers both shipped rules and nothing else', () => {
    const rules: readonly ExitRule[] = ['never', 'agent-activity'];
    expect(store.createColumn('x', rules[0]).exitRule).toBe('never');
    expect(store.createColumn('y', rules[1]).exitRule).toBe('agent-activity');
  });
});
