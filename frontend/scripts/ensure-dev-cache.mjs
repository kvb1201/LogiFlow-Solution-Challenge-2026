#!/usr/bin/env node
/**
 * Turbopack dev cache can corrupt after branch switches / large merges (404 on all routes).
 * Wipe .next before `next dev` so local `make dev` always starts clean.
 */
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const nextDir = join(frontendRoot, '.next');

try {
  rmSync(nextDir, { recursive: true, force: true });
} catch {
  // ignore — dev server may have left partial locks
}
