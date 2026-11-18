import dotenv from 'dotenv';
import { loadConfig } from './config';
import { buildContainer } from './container';
import { createApp } from './http/app';

dotenv.config();

const config = loadConfig();
const container = buildContainer(config);
const app = createApp(container);

const server = app.listen(config.port, () => {
  container.logger.info('Wallet API iniciada', { port: config.port, database: config.databasePath });
});

const shutdown = () => {
  server.close(() => {
    container.db.close();
    process.exit(0);
  });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
