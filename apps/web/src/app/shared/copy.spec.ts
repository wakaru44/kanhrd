import { COPY, fill } from './copy';

describe('shared/copy', () => {
  it('substitutes a single slot', () => {
    expect(fill(COPY.toast.hostDisconnected, { host: 'ada' })).toBe('lost sight of ada. retrying.');
  });

  it('substitutes every slot in a multi-slot template', () => {
    expect(fill(COPY.toast.closeFailed, { name: 'api', reason: 'pane 3 is busy' })).toBe(
      "couldn't close api. herdr said: pane 3 is busy"
    );
  });

  it('substitutes a repeated slot everywhere it appears', () => {
    expect(fill('{a} then {a}', { a: 'x' })).toBe('x then x');
  });

  it("passes herdr's wire vocabulary and case through a {reason} verbatim", () => {
    const wire = 'Workspace "Main" has no such tab';
    expect(fill(COPY.toast.renameFailed, { reason: wire })).toBe(
      "couldn't rename. herdr said: " + wire
    );
  });

  it('leaves a template without slots untouched', () => {
    expect(fill(COPY.toast.hostReconnected, {})).toBe('back in view.');
  });

  it('rejects a missing or misspelled slot at compile time', () => {
    // @ts-expect-error - `reason` is required by the template's literal type
    expect(() => fill(COPY.toast.splitFailed, {})).not.toThrow();
    // @ts-expect-error - `resaon` is not a slot in the template
    expect(() => fill(COPY.toast.splitFailed, { resaon: 'x' })).not.toThrow();
  });

  it('never softens the fact behind a care prompt', () => {
    expect(COPY.confirm.closePane).toBe('let this one rest?');
    expect(COPY.confirm.closePaneBody).toContain('cannot be undone');
    for (const body of [
      COPY.confirm.closePaneBody,
      COPY.confirm.closeTabBody,
      COPY.confirm.closeWorkspaceBody,
      COPY.confirm.closeLinkedWorkspacesBody,
    ]) {
      expect(body).not.toMatch(/pause|suspend|restore|resume/);
    }
  });

  // --- one home per string ----------------------------------------------
  //
  // Five components used to carry their own `PENDING_COPY` / `CARD_COPY` /
  // `RAIL_COPY` / `SETTINGS_COPY` block, each written when a work lane could not
  // edit this file. Two of them held the same two strings.

  /** Every leaf string in COPY, with its dotted path. */
  function strings(node: unknown, path = ''): [string, string][] {
    if (typeof node === 'string') {
      return [[path, node]];
    }
    if (node && typeof node === 'object') {
      return Object.entries(node).flatMap(([key, value]) =>
        strings(value, path ? `${path}.${key}` : key)
      );
    }
    return [];
  }

  it('is lowercase throughout', () => {
    for (const [path, value] of strings(COPY)) {
      expect(value).withContext(path).toBe(value.toLowerCase());
    }
  });

  it('carries no exclamation mark anywhere', () => {
    for (const [path, value] of strings(COPY)) {
      expect(value).withContext(path).not.toContain('!');
    }
  });

  it('says each of the shared labels exactly once', () => {
    // `switch to washi` was in both the shell and Settings; `more actions`
    // was in both a card and a rail row. Duplicates drift. The washi/sumi
    // pair now labels one shared control (`shared/theme-choice`) rendered by
    // both surfaces, so the words have one home for the same reason.
    const counts = new Map<string, number>();
    for (const [, value] of strings(COPY)) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    for (const shared of [COPY.theme.washi, COPY.theme.sumi, COPY.nav.moreActions]) {
      expect(counts.get(shared)).withContext(shared).toBe(1);
    }
  });

  it('covers every surface that used to keep its own block', () => {
    for (const group of [COPY.settings, COPY.rail, COPY.help, COPY.create, COPY.card]) {
      expect(Object.keys(group).length).toBeGreaterThan(0);
    }
    expect(COPY.toast.dismiss).toBeTruthy();
    expect(COPY.theme.washi).toBeTruthy();
  });

  // --- the keyboard help surface ----------------------------------------
  //
  // Every description used to be typed into `state/keyboard.service.ts` in
  // Title Case, in herdr's vocabulary: "New pane", "Next tab", "Close
  // current tab (asks for confirmation)".

  it('keeps every shortcut description lowercase', () => {
    for (const [key, value] of Object.entries(COPY.help.shortcuts)) {
      expect(value).withContext(key).toBe(value.toLowerCase());
    }
  });

  it('labels each help section in lowercase, like the settings sections', () => {
    for (const [key, value] of Object.entries(COPY.help.categories)) {
      expect(value).withContext(key).toBe(value.toLowerCase());
      expect(value).withContext(key).toBe(key.toLowerCase());
    }
  });

  it('ends an unshipped shortcut with the one approved phrase for that', () => {
    expect(COPY.help.shortcuts.closePane.endsWith(COPY.notShipped)).toBeTrue();
    expect(COPY.help.shortcuts.focusSearch.endsWith(COPY.notShipped)).toBeTrue();
  });

  it('promises nothing in the shortcut list that the app cannot do', () => {
    // "coming soon" was the old wording, and it is a promise. `not yet.` is not.
    for (const value of Object.values(COPY.help.shortcuts)) {
      expect(value).not.toMatch(/coming soon|soon|planned/);
    }
  });

  it("speaks herdr's vocabulary in user-facing copy", () => {
    const strings = JSON.stringify(COPY);
    expect(strings).not.toMatch(/\bpen\b|\bpens\b|\bfield\b|\bfields\b/);
    expect(COPY.toast.createPaneFailed).toContain('a card');
  });

  it('reserves lane for the swimlane, never for a tab', () => {
    for (const [path, value] of strings(COPY)) {
      expect(value)
        .withContext(path)
        .not.toMatch(/\blanes?\b/);
    }
  });
});
