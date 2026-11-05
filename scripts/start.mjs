#!/usr/bin/env node
/**
 * Início rápido: prepara tudo e sobe backend + frontend com um único comando.
 *
 *   npm start               # prepara, sobe tudo e abre o navegador
 *   npm start -- --no-open  # não abre o navegador
 *
 * Passos:
 *  1. confere a versão do Node.js;
 *  2. instala as dependências, se estiverem faltando;
 *  3. cria o backend/.env a partir do .env.example, se ainda não existir;
 *  4. sobe o backend (API) e o frontend juntos.
 *
 * Usa apenas módulos nativos do Node, então funciona antes do `npm install`.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_NODE = [22, 13];
// Só abre o navegador quando há interface gráfica (em servidores e containers Linux não há).
const hasDesktop =
  process.platform !== 'linux' ||
  Boolean(process.env.DISPLAY || process.env.WAYLAND_DISPLAY || process.env.WSL_DISTRO_NAME);
const openBrowser = hasDesktop && !process.env.CI && !process.argv.includes('--no-open');

const color = (code) => (text) => (process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text);
const bold = color('1');
const green = color('32');
const yellow = color('33');
const red = color('31');
const dim = color('2');

const ok = (msg) => console.log(`${green('✔')} ${msg}`);
const warn = (msg) => console.log(`${yellow('!')} ${msg}`);
const step = (msg) => console.log(`${dim('…')} ${msg}`);
const fail = (msg) => {
  console.error(`${red('✖')} ${msg}`);
  process.exit(1);
};

/** Roda um comando do npm usando o mesmo npm que chamou este script (funciona no Windows também). */
function runNpm(args, { env } = {}) {
  const npmCli = process.env.npm_execpath;
  const options = { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...env } };
  return npmCli?.endsWith('.js')
    ? spawn(process.execPath, [npmCli, ...args], options)
    : spawn('npm', args, { ...options, shell: process.platform === 'win32' });
}

const waitFor = (child) =>
  new Promise((resolve) => {
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
    child.on('error', (err) => {
      console.error(err.message);
      resolve(1);
    });
  });

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));

/** Lista as dependências que ainda não estão instaladas em node_modules. */
function missingDependencies() {
  const root = readJson('package.json');
  const missing = [];
  for (const dir of ['.', ...(root.workspaces ?? [])]) {
    const pkg = readJson(path.join(dir, 'package.json'));
    for (const name of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) {
      const installed = [path.join(ROOT, 'node_modules', name), path.join(ROOT, dir, 'node_modules', name)].some(
        (location) => fs.existsSync(path.join(location, 'package.json')),
      );
      if (!installed) missing.push(name);
    }
  }
  return missing;
}

/** Leitura simples de um arquivo .env (só para mostrar avisos; quem carrega de verdade é o backend). */
function readEnvFile(file) {
  const values = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([\w.-]+)\s*=\s*(.*)?$/.exec(line);
    if (!match) continue;
    let value = (match[2] ?? '').trim();
    if (/^(['"`]).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    values[match[1]] = value;
  }
  return values;
}

async function main() {
  console.log(`\n${bold('🎁 Amigo Oculto — início rápido')}\n`);

  // 1. Node.js
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])) {
    fail(
      `Node.js ${process.versions.node} é antigo demais. Instale a versão ${MIN_NODE.join('.')} ou mais recente: https://nodejs.org/`,
    );
  }
  ok(`Node.js ${process.versions.node}`);

  // 2. Dependências
  const missing = missingDependencies();
  if (missing.length > 0) {
    step('Instalando dependências (só demora na primeira vez)…\n');
    const code = await waitFor(runNpm(['install', '--no-fund', '--no-audit']));
    if (code !== 0) fail('Não foi possível instalar as dependências. Veja o erro acima.');
    const stillMissing = missingDependencies();
    if (stillMissing.length > 0) fail(`Dependências ainda faltando: ${stillMissing.join(', ')}`);
    console.log();
  }
  ok('Dependências instaladas');

  // 3. Configuração (.env)
  const envFile = path.join(ROOT, 'backend', '.env');
  if (!fs.existsSync(envFile)) {
    fs.copyFileSync(path.join(ROOT, 'backend', '.env.example'), envFile);
    ok(`Arquivo ${bold('backend/.env')} criado a partir do .env.example`);
  } else {
    ok(`Configuração encontrada em ${bold('backend/.env')}`);
  }

  const env = readEnvFile(envFile);
  const dryRun = ['true', '1', 'yes', 'sim'].includes((env.EMAIL_DRY_RUN ?? '').toLowerCase());
  if (dryRun) {
    warn('Modo de teste ligado (EMAIL_DRY_RUN=true): os emails serão salvos em backend/outbox, sem envio real.');
  } else if (!env.EMAIL_USER || !env.EMAIL_TOKEN) {
    warn(
      `Email ainda não configurado. O app abre normalmente, mas para enviar o sorteio preencha ${bold('EMAIL_USER')} e ` +
        `${bold('EMAIL_TOKEN')} em backend/.env\n  (ou use EMAIL_DRY_RUN=true para testar sem enviar). Passo a passo no README.`,
    );
  } else {
    ok(`Email configurado: ${env.EMAIL_USER}`);
  }

  // 4. Sobe backend + frontend
  const apiPort = env.PORT || '3001';
  console.log(
    `\n${bold('🚀 Subindo o backend e o frontend…')}\n` +
      `   App: ${bold('http://localhost:5173')}   ${dim(`(API em http://localhost:${apiPort})`)}\n` +
      `   ${dim('Pressione Ctrl+C para parar tudo.')}\n`,
  );

  const dev = runNpm(['run', 'dev'], { env: openBrowser ? { OPEN_BROWSER: 'true' } : {} });
  // Repassa Ctrl+C / encerramento para os serviços e espera eles terminarem.
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => {
      if (dev.exitCode === null) dev.kill(signal);
    });
  }
  process.exitCode = await waitFor(dev);
}

main().catch((err) => fail(err.stack || err.message));
