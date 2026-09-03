import { resolve } from 'node:path';
import { parseFixture } from './parser/treesitter.ts';
import type { ParsedFile } from './types.ts';

export const engineRoot = resolve(import.meta.dirname, '..');
export const repoRoot = resolve(engineRoot, '..', '..');
export const fixturesRoot = resolve(repoRoot, 'fixtures');
export const generatedRoot = resolve(repoRoot, 'generated');

/** Engine POC apps used for generate + default UI. Not golden-fastify-app. */
export const POC_FIXTURES = [
  'golden-poc',
  'factory-poc',
  'interface-di-poc',
  'kafka-poc',
] as const;

export function parseAllPocFixtures(): ParsedFile[] {
  const files: ParsedFile[] = [];
  for (const poc of POC_FIXTURES) {
    files.push(
      ...parseFixture(resolve(fixturesRoot, poc, 'src'), `${poc}/src`),
    );
  }
  return files;
}
