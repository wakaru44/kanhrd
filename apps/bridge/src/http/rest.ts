import { existsSync } from 'node:fs';
import { join } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { GetHostPanesResponse, GetHostsResponse } from '@kanhrd/schema';
import type { OriginPolicy } from '../config.js';
import { HostUnavailableError, type HostRegistry } from '../herdr/hosts.js';
import { originGuard } from './origin.js';

const PLACEHOLDER_HTML = `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>kanhrd</title></head>
  <body>
    <h1>SPA not yet built</h1>
    <p>Run <code>pnpm --filter @kanhrd/web build</code>, then reload.</p>
  </body>
</html>
`;

function isApiOrWsPath(url: string | undefined): boolean {
  return url !== undefined && (url.startsWith('/api') || url.startsWith('/ws'));
}

/**
 * `GET /api/hosts`, `GET /api/hosts/:host/panes`, and the SPA fallback.
 *
 * The two `/api` routes carry the same origin allowlist as `/ws`: a browser
 * omits `Origin` on a same-origin `GET`, so the SPA is unaffected, while a
 * cross-site `fetch` that names a foreign origin is refused rather than
 * served a body the browser then withholds. `require_origin` is deliberately
 * NOT applied here — it would refuse the SPA's own headerless requests.
 * The SPA fallback and static assets are not guarded; they are the page
 * itself, not the data.
 */
export async function registerRest(
  app: FastifyInstance,
  hosts: HostRegistry,
  spaDir: string,
  origins: OriginPolicy
): Promise<void> {
  const guard = originGuard(origins, false);

  app.get('/api/hosts', { preValidation: guard }, async (): Promise<GetHostsResponse> => {
    return { hosts: hosts.summaries() };
  });

  app.get<{ Params: { host: string } }>(
    '/api/hosts/:host/panes',
    { preValidation: guard },
    async (request: FastifyRequest<{ Params: { host: string } }>, reply: FastifyReply) => {
      const runtime = hosts.get(request.params.host);
      if (!runtime) {
        reply.code(404);
        return { error: `unknown host "${request.params.host}"` };
      }
      try {
        const body: GetHostPanesResponse = { panes: await runtime.listPanes() };
        return body;
      } catch (err) {
        if (err instanceof HostUnavailableError) {
          reply.code(503);
          return { error: err.message };
        }
        throw err;
      }
    }
  );

  const indexHtml = join(spaDir, 'index.html');
  const spaBuilt = existsSync(indexHtml);

  if (spaBuilt) {
    await app.register(fastifyStatic, { root: spaDir });
  }

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    if (isApiOrWsPath(request.raw.url)) {
      reply.code(404).send({ error: 'not found' });
      return;
    }
    if (spaBuilt) {
      reply.sendFile('index.html');
      return;
    }
    reply.code(200).type('text/html').send(PLACEHOLDER_HTML);
  });
}
