import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  clearHandoff,
  disposeTestSession,
  seedSession,
  startTestSession,
  writeHandoff,
} from './herdr-session.js';

const FIXTURES_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(FIXTURES_DIR, '../../../..');

/** One session per suite — see the proposal's Q1. Running servers aren't free. */
export const INT_SESSION_NAME = 'kanhrd-test-int';
export const INT_HANDOFF_SCOPE = 'int';

/**
 * vitest `globalSetup` for `pnpm test:int`.
 *
 * Runs once, in the runner process, before any test file loads: sweeps any
 * session a previous crashed run leaked, starts this run's own headless
 * herdr session, seeds the workspace/panes the suite asserts against, and
 * writes the handoff every fixture reads.
 *
 * When herdr is unreachable it writes an `unavailable` handoff instead of
 * throwing, so the suite skips with that reason (proposal Q2) rather than
 * failing — but it never leaves the fixtures able to reach the default
 * socket either way.
 */
export async function setup(): Promise<void> {
  try {
    const session = await startTestSession(INT_SESSION_NAME);
    const world = await seedSession(session.name, REPO_ROOT);
    writeHandoff(INT_HANDOFF_SCOPE, { session, world });
    console.log(
      `[test:int] isolated herdr session "${session.name}" at ${session.socket} ` +
        `(workspace ${world.workspaceId}, panes ${world.paneIds.join(', ')})`
    );
  } catch (err) {
    const reason = `no isolated herdr session available: ${(err as Error).message}`;
    writeHandoff(INT_HANDOFF_SCOPE, { unavailable: reason });
    console.warn(`[test:int] ${reason} — herdr-dependent tests will skip`);
  }
}

export async function teardown(): Promise<void> {
  await disposeTestSession(INT_SESSION_NAME).catch(() => undefined);
  clearHandoff(INT_HANDOFF_SCOPE);
}
