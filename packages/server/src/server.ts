import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, webRoot, port } from './config.ts';
import { resolveCodeTracrGraphPath, resolveCodeTracrSourceRoot } from './paths.ts';
import { createGraphRepository } from './adapters/persistence/create-graph-repository.ts';
import { buildApp } from './adapters/http/fastify/app.ts';

async function main() {
  const graphPath = resolveCodeTracrGraphPath(repoRoot);
  const repository = createGraphRepository({ graphPath });
  const app = await buildApp({
    repository,
    config: {
      repoRoot,
      webRoot,
      graphPath,
      sourceRoot: resolveCodeTracrSourceRoot(repoRoot, graphPath),
      editorScheme: process.env.CODETRACR_EDITOR_SCHEME ?? 'vscode',
    },
  });

  try {
    await app.listen({ port, host: '127.0.0.1' });
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${port} is already in use. Set CODETRACR_PORT to another port.`);
      process.exit(1);
    }
    throw error;
  }

  console.log(`CodeTracr on http://127.0.0.1:${port}`);
  console.log(`UI: http://127.0.0.1:${port}/ui/`);
  if (!existsSync(join(webRoot, 'dist', 'graph-view.js'))) {
    console.warn('UI bundles missing. Run npm run build before opening the UI.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
