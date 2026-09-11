import type { FastifyReply, FastifyRequest } from 'fastify';
import { originKey, parseOrigin, type OriginPolicy } from '../config.js';

/**
 * Why this exists: the same-origin policy does not cover WebSockets. A
 * browser hands the socket to the page whatever the server thinks of the
 * page's origin, so the server has to refuse the upgrade itself. Everything
 * `ws/dispatch.ts` can do — `pane.send_text` types into a live shell —
 * hangs off that refusal.
 */

export type OriginVerdict = { allowed: true } | { allowed: false; reason: string };

/**
 * The decision table of design decision 2/4/5:
 *
 * - `allowAny` (the `--allow-any-origin` escape hatch) permits everything;
 * - an absent header is a non-browser client: permitted unless `strict`;
 * - anything else must parse and match an allowlist entry exactly. The
 *   literal `null` fails to parse, and so is refused.
 */
export function checkOrigin(
  policy: OriginPolicy,
  header: string | undefined,
  strict: boolean
): OriginVerdict {
  if (policy.allowAny) return { allowed: true };
  if (header === undefined) {
    return strict
      ? { allowed: false, reason: 'no Origin header (require_origin)' }
      : { allowed: true };
  }
  let key: string;
  try {
    key = originKey(parseOrigin(header));
  } catch {
    return { allowed: false, reason: `unparseable origin "${header}"` };
  }
  if (policy.allowed.has(key)) return { allowed: true };
  return { allowed: false, reason: `origin "${header}" is not allowed` };
}

export function effectiveAllowlist(policy: OriginPolicy): string {
  const entries = [...policy.derived, ...policy.configured];
  return entries.length > 0 ? entries.join(', ') : '(empty)';
}

/**
 * A Fastify `preValidation` hook. On a `/ws` route this runs on the upgrade
 * request, before any socket exists, so a refused handshake never reaches
 * `dispatch`.
 *
 * The 403 body is identical for every refusal — a misconfigured origin and
 * an attacking one get the same three words. The diagnosis goes to the
 * operator's log, not to the caller.
 */
export function originGuard(
  policy: OriginPolicy,
  strict: boolean
): (request: FastifyRequest, reply: FastifyReply, done: () => void) => void {
  return (request, reply, done) => {
    const verdict = checkOrigin(policy, request.headers.origin, strict);
    if (verdict.allowed) {
      done();
      return;
    }
    request.log.warn(
      `handshake rejected: ${verdict.reason} (remote ${request.ip}). ` +
        `Allowed: ${effectiveAllowlist(policy)}. Add it with \`allowed_origins:\` in ` +
        'kanhrd.config.yaml or --allowed-origin.'
    );
    reply.code(403).type('application/json').send({ error: 'origin not allowed' });
  };
}

/** The `info` line printed once at startup so a misconfiguration is visible
 * before the first failed handshake. */
export function originPolicySummary(policy: OriginPolicy, bind: string, port: number): string {
  if (policy.allowAny) {
    return 'ws origin allowlist DISABLED by --allow-any-origin: any web page in your browser can drive this bridge';
  }
  const configured = policy.configured.length > 0 ? policy.configured.join(', ') : '(none)';
  const missing = policy.requireOrigin ? 'refused' : 'allowed';
  return (
    `ws origin allowlist: derived ${policy.derived.join(', ')} (from bind ${bind} port ${port}); ` +
    `configured ${configured}; missing-Origin handshakes ${missing}`
  );
}
