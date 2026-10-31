import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega o arquivo backend/.env (independente de onde o comando foi executado).
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });

const env = process.env;
const bool = (value, fallback = false) =>
  value === undefined || value === '' ? fallback : ['true', '1', 'yes', 'sim'].includes(value.toLowerCase());

export const config = {
  port: Number(env.PORT) || 3001,
  corsOrigin: env.CORS_ORIGIN || 'http://localhost:5173',
  staticDir: path.resolve(backendDir, '../frontend/dist'),
  // Arquivo do banco SQLite (caminho relativo à pasta backend/).
  databasePath: path.resolve(backendDir, env.DATABASE_PATH?.trim() || 'data/amigo-oculto.db'),
  email: {
    user: env.EMAIL_USER?.trim() || '',
    token: env.EMAIL_TOKEN?.trim() || '',
    from: env.EMAIL_FROM?.trim() || '',
    fromName: env.EMAIL_FROM_NAME?.trim() || 'Amigo Oculto',
    service: env.EMAIL_SERVICE?.trim() || 'gmail',
    host: env.SMTP_HOST?.trim() || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: bool(env.SMTP_SECURE, Number(env.SMTP_PORT) === 465),
    dryRun: bool(env.EMAIL_DRY_RUN),
    outboxDir: path.join(backendDir, 'outbox'),
  },
};
