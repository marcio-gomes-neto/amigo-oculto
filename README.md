# 🎁 Amigo Oculto

Aplicativo para organizar amigo oculto (amigo secreto): você cadastra os participantes com **nome + email**, define regras opcionais e o app faz o sorteio, enviando para cada pessoa um **email personalizado** com quem ela tirou.

Ninguém vê o resultado na tela — nem o organizador. 🤫

- **Backend:** Node.js + Express + Nodemailer + SQLite
- **Frontend:** React + Vite

## ⚡ Início rápido

Com o [Node.js 22.13+](https://nodejs.org/) instalado, basta **um comando**:

```bash
git clone https://github.com/marcio-gomes-neto/amigo-oculto.git
cd amigo-oculto
npm start
```

O `npm start` faz tudo o que é necessário para rodar a aplicação:

1. confere a versão do Node.js;
2. instala as dependências (só na primeira vez, ou se faltar alguma);
3. cria o `backend/.env` a partir do `.env.example`, se ainda não existir;
4. sobe o **backend** e o **frontend** juntos e abre o navegador em **<http://localhost:5173>**.

Para parar tudo, pressione **Ctrl+C**. Para não abrir o navegador: `npm start -- --no-open`.

> O app abre mesmo sem o email configurado. Para enviar o sorteio de verdade, preencha `EMAIL_USER` e `EMAIL_TOKEN` no `backend/.env` ([veja como](#-configurando-o-envio-de-email)) e rode `npm start` de novo.

---

## ✨ Funcionalidades

- Cadastro de participantes (nome + email), com edição, remoção e **importação de lista** colada (ex.: de uma planilha).
- Nomes repetidos são bloqueados, para não haver confusão no resultado.
- **Email repetido é permitido**, desde que os nomes sejam diferentes (ex.: um casal ou crianças que usam o email dos pais). Cada pessoa recebe **um email separado**, com o próprio nome no assunto e no corpo, e um aviso de que aquele endereço é compartilhado.
- **Regras de mão única:**
  - 🚫 **Não pode tirar:** _Ana não pode tirar Bruno_ (mas Bruno ainda pode tirar Ana).
  - 🎯 **Deve tirar:** _Carla obrigatoriamente tira Diego_ (Diego não é obrigado a tirar Carla).
- Verificação em tempo real: o app avisa se as regras tornam o sorteio impossível, explicando o motivo.
- Detalhes do evento (nome, data, valor sugerido e recado), que aparecem no email.
- Template de email bonito e responsivo, que deixa claro **para quem é o email** e **quem a pessoa tirou**.
- Teste da conexão de email **antes** de sortear: se o login falhar, nenhum email é enviado.
- **Reenvio** do email para quem não recebeu (inclusive corrigindo um email digitado errado), **sem refazer o sorteio**.
- Dados salvos em um banco **SQLite** (um único arquivo), sem precisar instalar nada.
- Modo de teste (`EMAIL_DRY_RUN`) que salva os emails como arquivos `.html` em vez de enviar.

---

## 🎲 Como o sorteio funciona

O sorteio usa a ideia de um **array circular**: os participantes são embaralhados e **cada posição tira a próxima, e a última tira a primeira**.

```
[Ana, Bruno, Carla, Diego]   →   Ana → Bruno → Carla → Diego → Ana
```

Como forma **um único ciclo com todo mundo**, é impossível alguém tirar a si mesmo ou sobrar alguém sem amigo oculto — o famoso _"deu zebra"_ não acontece.

**E as regras?**

- **Obrigatórias** ("X deve tirar Y") viram blocos fixos dentro do ciclo: se Ana deve tirar Bruno, o par `[Ana, Bruno]` fica sempre junto.
- **Bloqueios** ("X não pode tirar Y") são checados entre vizinhos do ciclo.
- O app embaralha até encontrar uma ordem que respeite tudo (com a mesma chance para cada combinação válida). Se as regras forem muito restritivas, ele faz uma busca completa — e, se não houver solução, explica o porquê (ex.: _"Não sobrou ninguém para Eduarda tirar"_).

O código está em [`backend/src/draw.js`](backend/src/draw.js).

---

## 📋 Requisitos

- [Node.js](https://nodejs.org/) **22.13 ou mais recente** (o SQLite vem embutido no Node, pelo módulo `node:sqlite`)
- Uma conta de email para enviar as mensagens (Gmail, Outlook, ou um serviço SMTP como SendGrid/Brevo)

---

## 🚀 Instalação manual (opcional)

O `npm start` já faz isso por você, mas se preferir fazer passo a passo:

```bash
npm install                              # dependências do backend e do frontend
cp backend/.env.example backend/.env     # arquivo de configuração
```

Depois, abra o `backend/.env` e preencha os dados de email (veja abaixo).

---

## 📧 Configurando o envio de email

O envio usa o [Nodemailer](https://nodemailer.com/) com um **token de envio** (sender token) definido no `.env`.

### Gmail (recomendado)

O Gmail não aceita sua senha normal. Você precisa gerar uma **Senha de app**:

1. Ative a **verificação em duas etapas** na sua conta Google: <https://myaccount.google.com/security>
2. Acesse <https://myaccount.google.com/apppasswords>, dê um nome (ex.: "Amigo Oculto") e clique em **Criar**.
3. Copie a senha de 16 letras gerada e coloque no `.env`:

```env
EMAIL_USER=seu.email@gmail.com
EMAIL_TOKEN=abcdefghijklmnop
EMAIL_FROM_NAME=Amigo Oculto da Família
EMAIL_SERVICE=gmail
```

### Outros provedores

Preencha `SMTP_HOST` para usar qualquer servidor SMTP (ele tem prioridade sobre `EMAIL_SERVICE`):

| Provedor | `SMTP_HOST`             | `SMTP_PORT` | `EMAIL_USER`             | `EMAIL_TOKEN`  | `EMAIL_FROM`               |
| -------- | ----------------------- | ----------- | ------------------------ | -------------- | -------------------------- |
| Outlook  | `smtp.office365.com`    | `587`       | seu email                | sua senha      | —                          |
| SendGrid | `smtp.sendgrid.net`     | `587`       | `apikey`                 | sua API key    | remetente verificado       |
| Brevo    | `smtp-relay.brevo.com`  | `587`       | login SMTP da Brevo      | chave SMTP     | remetente verificado       |

> Use `SMTP_SECURE=true` apenas com a porta `465`.

### Modo de teste (sem enviar nada)

Quer testar antes de mandar para todo mundo? Use:

```env
EMAIL_DRY_RUN=true
```

Nesse modo, nenhum email é enviado: cada email vira um arquivo `.html` em `backend/outbox/`, que você pode abrir no navegador. ⚠️ Esses arquivos revelam o resultado — use só para testar!

Você também pode ver como o email fica, com nomes de exemplo, em <http://localhost:3001/api/email/preview> (ou pelo link **"Ver como fica o email"** no app). Para ver a versão com o aviso de email compartilhado, use <http://localhost:3001/api/email/preview?shared=1>.

---

## ▶️ Comandos

| Comando         | O que faz                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------- |
| `npm start`     | **Início rápido:** prepara tudo (dependências + `.env`) e sobe backend e frontend. Abre **<http://localhost:5173>** |
| `npm run dev`   | Só sobe backend (porta **3001**) e frontend (porta **5173**) juntos, sem as verificações             |
| `npm run prod`  | Modo produção: compila o frontend e sobe só o backend, que serve tudo em **<http://localhost:3001>** |
| `npm test`      | Roda os testes automatizados                                                                       |

Em desenvolvimento, o frontend recarrega sozinho ao salvar um arquivo e o backend reinicia sozinho a cada alteração.

---

## 🧭 Usando o app

1. **Participantes:** adicione nome e email de cada pessoa (mínimo de 3). Para muitas pessoas, use **"Colar uma lista de participantes"** — uma pessoa por linha, no formato `Nome, email`. Os nomes precisam ser diferentes; o email pode se repetir (o app marca esses participantes como **compartilhado**).
2. **Regras (opcional):** escolha quem, o tipo da regra (**não pode tirar** / **deve tirar**) e quem. As regras valem só no sentido indicado.
3. **Detalhes do evento (opcional):** nome, data, valor sugerido e um recado. Tudo isso aparece no email.
4. **Sorteio:** confira o checklist (participantes, regras válidas e email configurado) e clique em **Sortear e enviar emails**.

Depois do sorteio, o app mostra **para quem o email foi enviado** (nunca quem tirou quem). Se alguém não recebeu, use **Reenviar** — o resultado é o mesmo, sem refazer o sorteio.

Tudo o que você cadastra é salvo automaticamente no banco (indicador "Tudo salvo" no canto da tela).

---

## 🗄️ Banco de dados (SQLite)

O app usa **SQLite**, um banco que fica inteiro em **um único arquivo** — não precisa instalar nem configurar servidor de banco. Ele é criado automaticamente em:

```
backend/data/amigo-oculto.db
```

(o caminho pode ser alterado com `DATABASE_PATH` no `.env`)

| Tabela         | O que guarda                                                          |
| -------------- | --------------------------------------------------------------------- |
| `participants` | Participantes cadastrados                                             |
| `rules`        | Regras de bloqueio e obrigatórias                                     |
| `settings`     | Detalhes do evento e qual é o sorteio atual                           |
| `draws`        | Sorteios realizados (data, modo de envio, dados do evento)            |
| `draw_entries` | Para cada sorteio: participante, email, status do envio e quem tirou  |

> ⚠️ **Segredo:** a API nunca devolve quem tirou quem, mas a tabela `draw_entries` guarda essa informação para permitir o reenvio. Se você também participa, **não abra o arquivo do banco**. 😉

**Para começar do zero**, pare o servidor e apague a pasta `backend/data/`.

---

## ⚙️ Variáveis de ambiente (`backend/.env`)

| Variável          | Padrão                  | Descrição                                                          |
| ----------------- | ----------------------- | ------------------------------------------------------------------ |
| `PORT`            | `3001`                  | Porta da API                                                       |
| `CORS_ORIGIN`     | `http://localhost:5173` | Origem do frontend permitida (separe várias por vírgula)           |
| `DATABASE_PATH`   | `data/amigo-oculto.db`  | Arquivo do SQLite (relativo à pasta `backend/`)                    |
| `EMAIL_USER`      | —                       | Conta que envia os emails                                          |
| `EMAIL_TOKEN`     | —                       | Token de envio (senha de app / API key)                            |
| `EMAIL_FROM_NAME` | `Amigo Oculto`          | Nome do remetente                                                  |
| `EMAIL_FROM`      | `EMAIL_USER`            | Endereço do remetente, se diferente do usuário                     |
| `EMAIL_SERVICE`   | `gmail`                 | Serviço conhecido pelo Nodemailer (ignorado se `SMTP_HOST` existir) |
| `SMTP_HOST`       | —                       | Servidor SMTP personalizado                                        |
| `SMTP_PORT`       | `587`                   | Porta SMTP                                                         |
| `SMTP_SECURE`     | `false`                 | `true` para porta 465 (SSL)                                        |
| `EMAIL_DRY_RUN`   | `false`                 | `true` salva os emails em `backend/outbox/` em vez de enviar       |

---

## 🔌 API

| Método   | Rota                            | Descrição                                                              |
| -------- | ------------------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/api/health`                   | Status do servidor e do email                                          |
| `GET`    | `/api/state`                    | Participantes, regras, evento e último sorteio (sem revelar pares)     |
| `PUT`    | `/api/state`                    | Salva participantes, regras e evento                                   |
| `POST`   | `/api/draw/validate`            | Verifica se o sorteio é possível (não envia nada)                      |
| `POST`   | `/api/draw`                     | Sorteia e envia os emails                                              |
| `POST`   | `/api/draw/:drawId/resend`      | Reenvia o email de um participante (`{ participantId, email? }`)       |
| `DELETE` | `/api/draw/current`             | Tira o último sorteio da tela para preparar um novo                    |
| `GET`    | `/api/email/preview`            | Pré-visualização do template de email                                  |

Exemplo de corpo para `POST /api/draw`:

```json
{
  "participants": [
    { "id": "1", "name": "Ana Souza", "email": "ana@email.com" },
    { "id": "2", "name": "Bruno Lima", "email": "bruno@email.com" },
    { "id": "3", "name": "Carla Dias", "email": "carla@email.com" }
  ],
  "rules": [
    { "type": "block", "from": "1", "to": "2" },
    { "type": "force", "from": "3", "to": "1" }
  ],
  "event": { "name": "Natal 2026", "date": "2026-12-24", "budget": "R$ 100,00", "message": "Às 20h!" }
}
```

---

## 🗂️ Estrutura do projeto

```
amigo-oculto/
├── package.json              # scripts que rodam backend + frontend juntos
├── scripts/
│   └── start.mjs             # início rápido (npm start)
├── backend/
│   ├── .env.example          # modelo de configuração
│   ├── src/
│   │   ├── server.js         # inicialização
│   │   ├── app.js            # rotas da API
│   │   ├── draw.js           # algoritmo do sorteio (ciclo + regras)
│   │   ├── db.js             # banco SQLite
│   │   ├── mailer.js         # envio com Nodemailer
│   │   ├── validation.js     # validação das requisições
│   │   ├── config.js         # leitura do .env
│   │   └── templates/
│   │       └── drawEmail.js  # template HTML do email
│   └── test/                 # testes automatizados
└── frontend/
    ├── index.html
    └── src/
        ├── App.jsx
        ├── api.js            # chamadas para a API
        ├── components/       # seções da tela
        ├── hooks/            # estado, validação e status do servidor
        └── styles.css
```

---

## 🧪 Testes

```bash
npm test
```

Os testes cobrem o algoritmo (ciclo único, aleatoriedade, bloqueios e regras obrigatórias de mão única, casos impossíveis), a API (envio, falhas, reenvio, sigilo do resultado) e a persistência no SQLite.

---

## 🛠️ Problemas comuns

| Problema                                              | Solução                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Invalid login: 535 ... Username and Password not accepted` | No Gmail, use uma **Senha de app** (não a senha normal) e confira se a verificação em duas etapas está ativa. |
| "Email não configurado" no app                        | Preencha `EMAIL_USER` e `EMAIL_TOKEN` no `backend/.env` e reinicie o servidor.                |
| Participante não recebeu                              | Peça para olhar o **spam**. Depois use **Reenviar** no app.                                   |
| "Servidor indisponível" no app                        | Verifique se o backend está rodando (`npm start`) e se não apareceu erro no terminal.          |
| `No such built-in module: node:sqlite`                | Atualize o Node.js para a versão 22.13 ou mais recente.                                       |
| "A porta 3001 já está em uso"                         | O app provavelmente já está rodando em outro terminal. Feche-o ou mude `PORT` no `backend/.env` (o frontend usa a mesma porta automaticamente). |
