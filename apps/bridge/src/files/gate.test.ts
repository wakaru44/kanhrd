import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepoFileError } from './errors.js';
import { filesLocalHint, resolveLocalCheckout, type PaneCheckoutClaim } from './gate.js';

// The failure this gate exists for: a host reached through an SSH socket
// tunnel reports paths on ANOTHER machine. A read that trusted them would
// either fail confusingly or serve the bridge machine's file at that path.
const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'kanhrd-gate-')));
const localRepo = join(sandbox, 'local-repo');
const localSub = join(localRepo, 'apps', 'bridge');
const otherRepo = join(sandbox, 'other-repo');

beforeAll(() => {
  execFileSync('git', ['init', '-q', localRepo]);
  execFileSync('git', ['init', '-q', otherRepo]);
  mkdirSync(localSub, { recursive: true });
});

afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

function claim(overrides: Partial<PaneCheckoutClaim>): PaneCheckoutClaim {
  return {
    host: 'local',
    filesEnabled: true,
    cwd: localSub,
    checkoutPath: localRepo,
    ...overrides,
  };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof RepoFileError) return err.code;
    throw err;
  }
  throw new Error('expected a RepoFileError, got success');
}

describe('local pane', () => {
  it('passes both halves and returns the real checkout path', async () => {
    expect(filesLocalHint(claim({}))).toBe(true);
    expect(await resolveLocalCheckout(claim({}), 'git')).toBe(localRepo);
  });

  it('resolves a symlinked cwd to the same checkout', async () => {
    const link = join(sandbox, 'link-to-sub');
    symlinkSync(localSub, link);
    expect(await resolveLocalCheckout(claim({ cwd: link }), 'git')).toBe(localRepo);
  });
});

describe('wrong machine', () => {
  it('refuses a tunnelled host whose paths do not exist here', async () => {
    const remote = claim({
      host: 'alpaca01',
      cwd: '/home/huberito/src/kanhrd',
      checkoutPath: '/home/huberito/src/kanhrd',
    });
    expect(filesLocalHint(remote)).toBe(false);
    expect(await refusal(resolveLocalCheckout(remote, 'git'))).toBe('files_not_local');
  });

  it('refuses a remote cwd that walked up into a LOCAL repository', async () => {
    // The bridge derives `checkout_path` by walking up from the cwd on its
    // own filesystem, so a remote `<local-repo>/remote-only-dir` projects the
    // local repo as its checkout. The cwd itself does not exist here.
    const remote = claim({
      host: 'alpaca01',
      cwd: join(localRepo, 'only-on-the-remote-machine'),
      checkoutPath: localRepo,
    });
    expect(filesLocalHint(remote)).toBe(false);
    expect(await refusal(resolveLocalCheckout(remote, 'git'))).toBe('files_not_local');
  });

  it('refuses a cwd that exists but sits outside the claimed checkout', async () => {
    const mismatched = claim({ cwd: otherRepo, checkoutPath: localRepo });
    expect(filesLocalHint(mismatched)).toBe(false);
    expect(await refusal(resolveLocalCheckout(mismatched, 'git'))).toBe('files_not_local');
  });

  it('refuses when git places the cwd in a different checkout than claimed', async () => {
    // A nested repository: the cwd is inside `localRepo` on disk, but git's
    // top level for it is the nested one.
    const nested = join(localRepo, 'vendor', 'nested');
    execFileSync('git', ['init', '-q', nested]);
    const claimOuter = claim({ cwd: nested, checkoutPath: localRepo });
    expect(filesLocalHint(claimOuter)).toBe(true);
    expect(await refusal(resolveLocalCheckout(claimOuter, 'git'))).toBe('files_not_local');
  });

  it('refuses a host configured files: false, even with local paths', async () => {
    const disabled = claim({ filesEnabled: false });
    expect(filesLocalHint(disabled)).toBe(false);
    expect(await refusal(resolveLocalCheckout(disabled, 'git'))).toBe('files_not_local');
  });

  it('refuses a pane herdr reported no cwd for', async () => {
    const noCwd = claim({ cwd: undefined });
    expect(filesLocalHint(noCwd)).toBe(false);
    expect(await refusal(resolveLocalCheckout(noCwd, 'git'))).toBe('files_not_local');
  });
});

describe('no checkout', () => {
  it('says no_checkout for a pane without project', async () => {
    expect(await refusal(resolveLocalCheckout(claim({ checkoutPath: undefined }), 'git'))).toBe(
      'no_checkout'
    );
  });
});
