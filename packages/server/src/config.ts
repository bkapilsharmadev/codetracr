import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
export const repoRoot = join(__dirname, '..', '..', '..');
export const webRoot = join(repoRoot, 'packages', 'web');
export const port = Number(process.env.CODETRACR_PORT ?? process.env.PORT ?? 8787);
