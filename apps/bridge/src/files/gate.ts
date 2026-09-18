import { realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { isInside } from './confine.js';
import { RepoFileError } from './errors.js';
import { runGit } from './git.js';

/** What the gate needs to know about one pane, as herdr reported it. */
export interface PaneCheckoutClaim {
  host: string;
  /** Operator config: `files: false` on the host turns the gate shut. */
  filesEnabled: boolean;
  /** herdr's `PaneInfo.cwd` — a path on the machine herdr runs on. */
  cwd: string | undefined;
  /** `Pane.project.checkout_path`, when the bridge projected one. */
  checkoutPath: string | undefined;
}

function realDirectory(path: string): string | undefined {
  try {
    const real = realpathSync(path);
    return statSync(real).isDirectory() ? real : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The cheap, synchronous half of the gate, for `Pane.project.files_local` on
 * every `pane.list`: host enabled, and the pane's `cwd` and checkout both
 * exist on THIS filesystem with the `cwd` inside the checkout.
 *
 * Why the `cwd` and not just the checkout: the bridge derives
 * `checkout_path` by walking up from the `cwd` on its own filesystem. A
 * tunnelled host's `cwd` that does not exist here can still walk up into a
 * local ancestor that is a repository — the wrong machine's checkout. A
 * `cwd` that must itself exist, inside the checkout, closes that.
 */
export function filesLocalHint(claim: PaneCheckoutClaim): boolean {
  if (!claim.filesEnabled || claim.cwd === undefined || claim.checkoutPath === undefined) {
    return false;
  }
  const cwd = realDirectory(claim.cwd);
  const checkout = realDirectory(claim.checkoutPath);
  return cwd !== undefined && checkout !== undefined && isInside(checkout, cwd);
}

/**
 * The full gate, run on every file method call. Returns the checkout's real
 * path, or throws. On top of `filesLocalHint`, git itself — run HERE, in the
 * pane's `cwd` — must name the same checkout as its top level.
 *
 * What it cannot do is prove machine identity: a tunnelled host whose paths
 * also exist here as the same checkout passes. That is what `files: false`
 * on the host is for.
 */
export async function resolveLocalCheckout(
  claim: PaneCheckoutClaim,
  gitBinary: string
): Promise<string> {
  const notLocal = (why: string) =>
    new RepoFileError('files_not_local', `files for host "${claim.host}" are unavailable: ${why}`);

  if (!claim.filesEnabled) throw notLocal('the host is configured files: false');
  if (claim.checkoutPath === undefined) {
    throw new RepoFileError('no_checkout', 'the pane is not in a git checkout the bridge can see');
  }
  if (claim.cwd === undefined) throw notLocal('herdr reported no working directory for the pane');
  const cwd = realDirectory(claim.cwd);
  if (cwd === undefined) {
    throw notLocal(`the pane's directory ${claim.cwd} does not exist on the bridge's machine`);
  }
  const checkout = realDirectory(claim.checkoutPath);
  if (checkout === undefined) {
    throw notLocal(`the checkout ${claim.checkoutPath} does not exist on the bridge's machine`);
  }
  if (!isInside(checkout, cwd)) {
    throw notLocal(`the pane's directory is not inside ${claim.checkoutPath}`);
  }

  const { stdout } = await runGit(gitBinary, cwd, ['rev-parse', '--show-toplevel'], {
    maxBytes: 16_384,
  });
  const topLevel = realDirectory(resolve(cwd, stdout.toString('utf8').trim()));
  if (topLevel !== checkout) {
    throw notLocal(`git places the pane's directory in a different checkout`);
  }
  return checkout;
}
