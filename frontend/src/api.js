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

export const api = {
  health: () => request('/health'),
  getState: () => request('/state'),
  saveState: ({ participants, rules, event }) => request('/state', { method: 'PUT', body: { participants, rules, event } }),
  clearCurrentDraw: () => request('/draw/current', { method: 'DELETE' }),
  validate: (participants, rules, signal) =>
    request('/draw/validate', { method: 'POST', body: toPayload(participants, rules), signal }),
  draw: (participants, rules, event) =>
    request('/draw', { method: 'POST', body: { ...toPayload(participants, rules), event } }),
  resend: (drawId, participantId, email) =>
    request(`/draw/${encodeURIComponent(drawId)}/resend`, { method: 'POST', body: { participantId, email } }),
  previewUrl: (event = {}) => {
    const params = new URLSearchParams(Object.entries(event).filter(([, value]) => value));
    const query = params.toString();
    return `/api/email/preview${query ? `?${query}` : ''}`;
  },
};
