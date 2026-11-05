async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new Error('Não foi possível conectar ao servidor. Verifique se o backend está rodando.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Erro inesperado (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return data;
}

const toPayload = (participants, rules) => ({
  participants: participants.map(({ id, name, email }) => ({ id, name, email })),
  rules: rules.map(({ type, from, to }) => ({ type, from, to })),
});

const groupPath = (groupId) => `/groups/${encodeURIComponent(groupId)}`;

export const api = {
  health: () => request('/health'),
  listGroups: () => request('/groups'),
  createGroup: (event) => request('/groups', { method: 'POST', body: { event } }),
  deleteGroup: (groupId) => request(groupPath(groupId), { method: 'DELETE' }),
  getState: (groupId) => request(`${groupPath(groupId)}/state`),
  saveState: (groupId, { participants, rules, event }) =>
    request(`${groupPath(groupId)}/state`, { method: 'PUT', body: { participants, rules, event } }),
  /** Cria um novo amigo oculto com os mesmos participantes e regras (para sortear de novo). */
  duplicateGroup: (groupId, event) => request(`${groupPath(groupId)}/duplicate`, { method: 'POST', body: { event } }),
  validate: (participants, rules, signal) =>
    request('/draw/validate', { method: 'POST', body: toPayload(participants, rules), signal }),
  draw: (groupId, participants, rules, event) =>
    request(`${groupPath(groupId)}/draw`, { method: 'POST', body: { ...toPayload(participants, rules), event } }),
  resend: (drawId, participantId, email) =>
    request(`/draw/${encodeURIComponent(drawId)}/resend`, { method: 'POST', body: { participantId, email } }),
  /** Área secreta: sorteios do amigo oculto (sem os pares). */
  secretDraws: (groupId) => request(`/debug${groupPath(groupId)}/draws`),
  /** Área secreta: revela UM par. direction "receiver" = quem a pessoa tirou; "giver" = quem tirou a pessoa. */
  reveal: (drawId, participantId, direction) =>
    request(`/debug/draws/${encodeURIComponent(drawId)}/reveal?${new URLSearchParams({ participantId, direction })}`),
  previewUrl: (event = {}) => {
    const params = new URLSearchParams(Object.entries(event).filter(([, value]) => value));
    const query = params.toString();
    return `/api/email/preview${query ? `?${query}` : ''}`;
  },
};
