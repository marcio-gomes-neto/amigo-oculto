/**
 * Template do email do sorteio.
 *
 * Feito com tabelas e estilos inline para funcionar bem no Gmail, Outlook,
 * Apple Mail e clientes de celular. O email deixa bem claro:
 *   1. para QUEM é a mensagem (nome + email do destinatário);
 *   2. QUEM essa pessoa tirou.
 */

const C = {
  page: '#f4ece1',
  card: '#ffffff',
  red: '#c8102e',
  redLight: '#e2445c',
  redSoft: '#fdeef0',
  green: '#1b7f5b',
  greenSoft: '#eaf6f0',
  gold: '#f4b942',
  goldSoft: '#fff8e8',
  cream: '#fbf6ef',
  border: '#efe4d6',
  text: '#2d2433',
  muted: '#756b7b',
  faint: '#9a8f9f',
};

const FONT = "'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function initials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** "2026-12-24" => "quinta-feira, 24 de dezembro de 2026". Outros formatos ficam como vieram. */
export function formatEventDate(value = '') {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** "50" => "R$ 50". Se já vier com "R$", fica como está. */
export function formatBudget(value = '') {
  const trimmed = String(value).trim();
  if (/^R\$/i.test(trimmed)) return trimmed;
  return `R$ ${trimmed}`;
}

function avatar(name, { size, background, fontSize }) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>
    <td width="${size}" height="${size}" align="center" valign="middle" bgcolor="${background}"
        style="width:${size}px;height:${size}px;border-radius:50%;background:${background};color:#ffffff;font-family:${FONT};font-size:${fontSize}px;font-weight:700;line-height:${size}px;text-align:center;">${escapeHtml(initials(name))}</td>
  </tr></table>`;
}

function eventDetailsHtml(event) {
  const rows = [];
  if (event.date) rows.push(['📅', 'Data', escapeHtml(formatEventDate(event.date))]);
  if (event.budget) rows.push(['💰', 'Valor sugerido', escapeHtml(formatBudget(event.budget))]);

  const message = event.message
    ? `<tr><td colspan="2" style="padding:12px 0 0;">
         <div style="font-size:13px;color:${C.muted};font-weight:700;margin-bottom:6px;">💬 Recado do organizador</div>
         <div style="font-size:15px;line-height:1.6;color:${C.text};background:${C.card};border-left:4px solid ${C.gold};border-radius:8px;padding:12px 14px;">${escapeHtml(event.message).replace(/\r?\n/g, '<br>')}</div>
       </td></tr>`
    : '';

  if (rows.length === 0 && !message) return '';

  const rowsHtml = rows
    .map(
      ([icon, label, value]) => `<tr>
        <td width="28" valign="top" style="padding:5px 0;font-size:16px;line-height:22px;">${icon}</td>
        <td valign="top" style="padding:5px 0;font-size:15px;line-height:22px;color:${C.text};"><strong>${label}:</strong> ${value}</td>
      </tr>`,
    )
    .join('');

  return `<tr><td class="px" style="padding:28px 36px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cream}" style="background:${C.cream};border:1px solid ${C.border};border-radius:16px;">
      <tr><td style="padding:20px 22px;">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:${C.muted};font-weight:700;margin-bottom:8px;">Detalhes do evento</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rowsHtml}${message}</table>
      </td></tr>
    </table>
  </td></tr>`;
}

/**
 * @param {{ giver: {name: string, email: string}, receiver: {name: string}, event?: object, sharedEmail?: boolean }} data
 *   sharedEmail: true quando o mesmo endereço recebe o resultado de mais de um participante.
 * @returns {{ subject: string, html: string, text: string }}
 */
export function renderDrawEmail({ giver, receiver, event = {}, sharedEmail = false }) {
  const eventTitle = event.name?.trim() || 'Amigo Oculto';
  const subject = `🎁 ${eventTitle}: ${giver.name}, seu amigo oculto chegou!`;

  const giverName = escapeHtml(giver.name);
  const giverEmail = escapeHtml(giver.email);
  const receiverName = escapeHtml(receiver.name);
  const title = escapeHtml(eventTitle);

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
<style>
  @media only screen and (max-width: 520px) {
    .px { padding-left: 20px !important; padding-right: 20px !important; }
    .hero-title { font-size: 24px !important; }
    .reveal-name { font-size: 26px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};font-family:${FONT};color:${C.text};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">Olá, ${giverName}! Abra para descobrir quem você tirou. Mas guarde segredo! 🤫</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.page}" style="background:${C.page};">
<tr><td align="center" style="padding:32px 12px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.card}" style="max-width:600px;background:${C.card};border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(45,36,51,0.08);">

    <!-- Cabeçalho -->
    <tr><td align="center" bgcolor="${C.red}" style="background:${C.red};background-image:linear-gradient(135deg, ${C.red} 0%, ${C.redLight} 100%);padding:40px 24px 36px;">
      <div style="font-size:52px;line-height:1;">🎁</div>
      <div style="margin-top:14px;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#ffe3a3;font-weight:700;">O sorteio foi realizado</div>
      <h1 class="hero-title" style="margin:8px 0 0;font-size:30px;line-height:1.25;color:#ffffff;font-weight:800;">${title}</h1>
    </td></tr>

    <!-- Saudação -->
    <tr><td class="px" style="padding:32px 36px 0;">
      <p style="margin:0 0 8px;font-size:21px;font-weight:700;color:${C.text};">Olá, ${giverName}! 👋</p>
      <p style="margin:0;font-size:15px;line-height:1.65;color:${C.muted};">O resultado abaixo é só seu. Antes de continuar, confira se este email é mesmo para você:</p>
    </td></tr>

    <!-- Quem é o destinatário -->
    <tr><td class="px" style="padding:18px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.greenSoft}" style="background:${C.greenSoft};border:1px solid #cfe9dc;border-radius:16px;">
        <tr>
          <td width="76" valign="middle" style="padding:16px 0 16px 18px;">
            ${avatar(giver.name, { size: 52, background: C.green, fontSize: 19 })}
          </td>
          <td valign="middle" style="padding:16px 18px 16px 14px;">
            <div style="font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${C.green};font-weight:800;">Este email é exclusivo para</div>
            <div style="margin-top:3px;font-size:19px;font-weight:800;color:${C.text};">${giverName}</div>
            <div style="margin-top:1px;font-size:14px;color:${C.muted};word-break:break-all;">${giverEmail}</div>
          </td>
        </tr>
        ${
          sharedEmail
            ? `<tr><td colspan="2" style="padding:0 16px 16px;">
          <div style="font-size:13px;line-height:1.55;color:#7a5a12;background:${C.goldSoft};border:1px solid #f3dfb2;border-radius:10px;padding:10px 12px;">📬 Este endereço de email é usado por mais de um participante. Este resultado é <strong>somente de ${giverName}</strong> — cada pessoa recebe um email separado, com o próprio nome.</div>
        </td></tr>`
            : ''
        }
      </table>
      <p style="margin:12px 2px 0;font-size:13px;line-height:1.55;color:${C.faint};">⚠️ Você não é <strong style="color:${C.muted};">${giverName}</strong>? Não continue lendo: apague esta mensagem e avise o organizador.</p>
    </td></tr>

    <!-- Revelação -->
    <tr><td class="px" align="center" style="padding:32px 36px 0;">
      <div style="font-size:13px;letter-spacing:3px;text-transform:uppercase;color:${C.red};font-weight:800;">✨ Seu amigo oculto é ✨</div>
    </td></tr>
    <tr><td class="px" style="padding:14px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.goldSoft}" style="background:${C.goldSoft};border:2px dashed ${C.gold};border-radius:20px;">
        <tr><td align="center" style="padding:30px 20px 28px;">
          ${avatar(receiver.name, { size: 76, background: C.red, fontSize: 28 })}
          <div class="reveal-name" style="margin-top:16px;font-size:32px;line-height:1.2;font-weight:800;color:${C.text};">${receiverName}</div>
          <div style="margin-top:8px;font-size:14px;color:${C.muted};">É para esta pessoa que você vai dar o presente 🎀</div>
        </td></tr>
      </table>
    </td></tr>

    <!-- Resumo: quem dá → quem recebe -->
    <tr><td class="px" style="padding:16px 36px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="44%" align="center" valign="middle" bgcolor="${C.greenSoft}" style="background:${C.greenSoft};border-radius:14px;padding:12px 8px;">
            <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.green};font-weight:800;">Quem dá (você)</div>
            <div style="margin-top:4px;font-size:15px;font-weight:700;color:${C.text};">${giverName}</div>
          </td>
          <td width="12%" align="center" valign="middle" style="font-size:24px;line-height:1;color:${C.red};font-weight:700;">&#10140;</td>
          <td width="44%" align="center" valign="middle" bgcolor="${C.redSoft}" style="background:${C.redSoft};border-radius:14px;padding:12px 8px;">
            <div style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:${C.red};font-weight:800;">Quem recebe</div>
            <div style="margin-top:4px;font-size:15px;font-weight:700;color:${C.text};">${receiverName}</div>
          </td>
        </tr>
      </table>
    </td></tr>

    ${eventDetailsHtml(event)}

    <!-- Segredo -->
    <tr><td class="px" align="center" style="padding:32px 36px 38px;">
      <div style="font-size:30px;line-height:1;">🤫</div>
      <p style="margin:10px 0 0;font-size:17px;font-weight:800;color:${C.text};">Shhh! Guarde segredo.</p>
      <p style="margin:6px 0 0;font-size:13px;line-height:1.6;color:${C.muted};">O sorteio foi feito automaticamente — nem o organizador sabe quem tirou quem.</p>
    </td></tr>

  </table>

  <p style="margin:20px 0 0;font-size:12px;color:${C.faint};font-family:${FONT};">Enviado pelo app Amigo Oculto 🎄</p>

</td></tr>
</table>
</body>
</html>`;

  const details = [];
  if (event.date) details.push(`- Data: ${formatEventDate(event.date)}`);
  if (event.budget) details.push(`- Valor sugerido: ${formatBudget(event.budget)}`);
  if (event.message) details.push(`- Recado do organizador: ${event.message}`);

  const text = [
    `${eventTitle.toUpperCase()}`,
    '',
    `Olá, ${giver.name}!`,
    '',
    `Este email é exclusivo para: ${giver.name} <${giver.email}>`,
    ...(sharedEmail
      ? [
          `Este endereço de email é usado por mais de um participante. Este resultado é SOMENTE de ${giver.name} — cada pessoa recebe um email separado, com o próprio nome.`,
        ]
      : []),
    `Se você não é ${giver.name}, não continue lendo: apague esta mensagem e avise o organizador.`,
    '',
    '========================================',
    `SEU AMIGO OCULTO É: ${receiver.name.toUpperCase()}`,
    '========================================',
    '',
    `${giver.name} (você) ➜ ${receiver.name}`,
    ...(details.length ? ['', 'Detalhes do evento', ...details] : []),
    '',
    'Shhh! Guarde segredo. 🤫',
    'O sorteio foi feito automaticamente — nem o organizador sabe quem tirou quem.',
  ].join('\n');

  return { subject, html, text };
}
