import { buildApp } from './app.js';
import { PORT } from './config/config.js';

const app = buildApp();

try {
  await app.listen({ host: '0.0.0.0', port: PORT });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
