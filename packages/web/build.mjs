import esbuild from 'esbuild';

for (const entry of ['graph-view', 'pdf-export']) {
  await esbuild.build({
    entryPoints: [`src/${entry}.js`],
    bundle: true,
    format: 'esm',
    outfile: `dist/${entry}.js`,
    platform: 'browser',
    target: ['es2022'],
    sourcemap: true,
    logLevel: 'info',
  });
}
