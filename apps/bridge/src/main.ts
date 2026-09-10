#!/usr/bin/env node
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import { loadConfig, type CliOverrides } from './config.js';
import { HostRegistry } from './herdr/hosts.js';
import { registerRest } from './http/rest.js';
import { registerWebSocket } from './ws/server.js';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): CliOverrides {
  const overrides: CliOverrides = {};
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--config': {
        const value = argv[++i];
        if (value !== undefined) overrides.configPath = value;
        break;
      }
      case '--port': {
        const value = argv[++i];
        if (value !== undefined) overrides.port = Number(value);
        break;
      }
      case '--bind': {
        const value = argv[++i];
        if (value !== undefined) overrides.bind = value;
        break;
      }
      case '--spa-dir': {
        const value = argv[++i];
        if (value !== undefined) overrides.spaDir = value;
        break;
      }
      case '--i-know-what-im-doing':
        overrides.allowNonLoopback = true;
        break;
      default:
        break;
    }
  }
  return overrides;
}

async function main(): Promise<void> {
  const config = loadConfig(parseArgs(process.argv.slice(2)));

  const app = Fastify({ logger: true });
  const hosts = new HostRegistry(config.hosts);
  hosts.startAll();

  await registerWebSocket(app, hosts);
  const spaDir = isAbsolute(config.spaDir) ? config.spaDir : resolve(MODULE_DIR, config.spaDir);
  await registerRest(app, hosts, spaDir);

  await app.listen({ host: config.bind, port: config.port });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
