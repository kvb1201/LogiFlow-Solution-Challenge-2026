#!/usr/bin/env node
/**
 * Optional dev cache reset — only when LOGIFLOW_DEV_FRESH=1 (see `npm run dev:clean`).
 * Wiping .next on every start forces a slow cold compile; keep the cache for fast reloads.
 */
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.LOGIFLOW_DEV_FRESH !== '1') {
  process.exit(0);
}

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nextDir = join(frontendRoot, '.next');

try {
  rmSync(nextDir, { recursive: true, force: true });
  console.log('[dev] Cleared .next (LOGIFLOW_DEV_FRESH=1)');
} catch {
  // ignore
}
