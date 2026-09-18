import { BridgeError } from './ws-client';

/**
 * A bridge refusal's `code` is the machine-readable half. Before the file
 * panel, every caller only ever showed the message, so the code was folded
 * into it; the panel has to tell `files_not_local` from `not_found` to pick
 * a state, and parsing prose to do that would be a bug waiting to happen.
 */
describe('WsClient BridgeError', () => {
  it('carries the code and the message separately', () => {
    const error = new BridgeError('files_not_local', 'host files: false');

    expect(error.code).toBe('files_not_local');
    expect(error.bridgeMessage).toBe('host files: false');
  });

  it('keeps the rendered string existing callers already show', () => {
    expect(new BridgeError('pane_not_found', 'no such pane').message).toBe(
      'pane_not_found: no such pane'
    );
  });

  it('is an Error, so an unprepared caller still catches it', () => {
    expect(new BridgeError('git_failed', 'boom') instanceof Error).toBeTrue();
  });
});
