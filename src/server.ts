import { buildApp } from './app.js';
import { env } from './config/env.js';

const app = buildApp();

async function start() {
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`Server listening on ${env.HOST}:${env.PORT}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    if (env.SWAGGER_ENABLED) {
      app.log.info(`API docs available at ${env.PLATFORM_BASE_URL}/docs`);
    }
  } catch (err) {
    app.log.error(err, 'Failed to start server');
    process.exit(1);
  }
}

async function shutdown(signal: string) {
  app.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await app.close();
    app.log.info('Server closed');
    process.exit(0);
  } catch (err) {
    app.log.error(err, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void start();
