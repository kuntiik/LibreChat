// Wrapper: run lc-agent.mjs with no fetch timeouts so long deck builds (which
// exceed undici's 300s default headersTimeout) complete instead of aborting
// while the server is still finishing. Usage:
//   node tools/lc-run.mjs "<prompt>" [--agent <id>] [--continue <convoId>]
import { setGlobalDispatcher, Agent } from 'undici';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

setGlobalDispatcher(new Agent({ headersTimeout: 0, bodyTimeout: 0, connectTimeout: 0 }));

const here = dirname(fileURLToPath(import.meta.url));
process.argv = [process.argv[0], join(here, 'lc-agent.mjs'), 'send', ...process.argv.slice(2)];
await import(join(here, 'lc-agent.mjs'));
