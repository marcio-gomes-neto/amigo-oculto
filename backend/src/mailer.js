import fs from 'node:fs/promises';
import path from 'node:path';
import nodemailer from 'nodemailer';

/**
 * Cria o serviço de envio de emails a partir da configuração do .env.
 *
 * Modos:
 *  - smtp:         envia de verdade usando EMAIL_USER + EMAIL_TOKEN
 *  - dry-run:      não envia; salva cada email como .html em backend/outbox (para testes)
 *  - unconfigured: faltam credenciais no .env
 */
export function createMailer(options) {
  if (options.dryRun) return createDryRunMailer(options);

  if (!options.user || !options.token) {
    const fail = async () => {
      throw new Error('Email não configurado. Defina EMAIL_USER e EMAIL_TOKEN no arquivo backend/.env.');
    };
    return { mode: 'unconfigured', configured: false, verify: fail, send: fail };
  }

  const auth = { user: options.user, pass: options.token };
  const transport = nodemailer.createTransport(
    options.host
      ? { host: options.host, port: options.port, secure: options.secure, auth }
      : { service: options.service, auth },
  );

  const from = { name: options.fromName, address: options.from || options.user };

  return {
    mode: 'smtp',
    configured: true,
    verify: () => transport.verify(),
    send: ({ to, toName, subject, html, text }) =>
      transport.sendMail({ from, to: { name: toName, address: to }, subject, html, text }),
  };
}

function createDryRunMailer({ outboxDir }) {
  let sequence = 0; // evita sobrescrever arquivos quando o mesmo email recebe mais de uma mensagem
  return {
    mode: 'dry-run',
    configured: true,
    verify: async () => {
      await fs.mkdir(outboxDir, { recursive: true });
    },
    send: async ({ to, subject, html }) => {
      await fs.mkdir(outboxDir, { recursive: true });
      const safeEmail = to.replace(/[^a-z0-9@._-]/gi, '_');
      sequence += 1;
      const file = path.join(outboxDir, `${Date.now()}-${String(sequence).padStart(3, '0')}-${safeEmail}.html`);
      await fs.writeFile(file, html, 'utf8');
      console.log(`[dry-run] Email para ${to} salvo em ${path.relative(process.cwd(), file)} (${subject})`);
    },
  };
}
