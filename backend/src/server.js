import path from 'node:path';
import { createApp } from './app.js';
import { config } from './config.js';
import { openDatabase } from './db.js';
import { createMailer } from './mailer.js';

const mailer = createMailer(config.email);
const db = openDatabase(config.databasePath);
const app = createApp({
  mailer,
  db,
  corsOrigin: config.corsOrigin,
  staticDir: config.staticDir,
});

const modeLabel = {
  smtp: `SMTP (${config.email.host || config.email.service}) como ${config.email.user}`,
  'dry-run': 'modo de teste (emails salvos em backend/outbox)',
  unconfigured: 'NÃO CONFIGURADO — defina EMAIL_USER e EMAIL_TOKEN no backend/.env',
};

const server = app.listen(config.port, () => {
  console.log(`🎁 Amigo Oculto API rodando em http://localhost:${config.port}`);
  console.log(`📧 Email: ${modeLabel[mailer.mode]}`);
  const dbPath = path.relative(process.cwd(), config.databasePath);
  console.log(`🗄️  Banco de dados: ${dbPath.startsWith('..') ? config.databasePath : dbPath}`);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `❌ A porta ${config.port} já está em uso (talvez o app já esteja rodando em outro terminal).\n` +
        '   Feche o outro processo ou mude PORT no arquivo backend/.env.',
    );
    process.exit(1);
  }
  throw err;
});
