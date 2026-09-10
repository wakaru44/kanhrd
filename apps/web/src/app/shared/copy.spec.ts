import { COPY, fill } from './copy';

describe('shared/copy', () => {
  it('substitutes a single slot', () => {
    expect(fill(COPY.toast.penDisconnected, { pen: 'ada' })).toBe('lost sight of ada. retrying.');
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
    expect(fill(COPY.toast.penReconnected, {})).toBe('back in view.');
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
      COPY.confirm.closeLaneBody,
      COPY.confirm.closeFieldBody,
      COPY.confirm.closeLinkedFieldsBody,
    ]) {
      expect(body).not.toMatch(/pause|suspend|restore|resume/);
    }
  });

  it('speaks the renamed vocabulary in user-facing copy', () => {
    const strings = JSON.stringify(COPY);
    expect(strings).not.toMatch(/\bhost\b|\bworkspace\b|\btab\b/);
    expect(COPY.toast.createPaneFailed).toContain('a card');
  });
});
