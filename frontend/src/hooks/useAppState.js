import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export const EMPTY_EVENT = { name: '', date: '', budget: '', message: '' };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Tenta de novo por alguns segundos: ao rodar `npm start`, o navegador pode abrir
 * antes do backend terminar de subir.
 */
export async function withRetry(fn, attempts = 8, delayMs = 1000) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      // Erros 4xx são definitivos; falha de rede ou 5xx (ex.: proxy sem backend) vale tentar de novo.
      if (attempt >= attempts || (err.status && err.status < 500)) throw err;
      await sleep(delayMs);
    }
  }
}

// Fila de salvamentos compartilhada: garante que eles cheguem ao servidor na ordem certa,
// e permite que a lista espere o último salvamento antes de carregar.
let saveQueue = Promise.resolve();

/** Espera os salvamentos pendentes terminarem (com ou sem erro). */
export const whenSaved = () => saveQueue;

/**
 * Carrega participantes, regras, evento e último sorteio de um amigo oculto
 * do servidor (SQLite) e salva automaticamente cada alteração.
 */
export function useAppState(groupId) {
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | notfound | error
  const [saveStatus, setSaveStatus] = useState('saved'); // saving | saved | error
  const [participants, setParticipants] = useState([]);
  const [rules, setRules] = useState([]);
  const [event, setEvent] = useState(EMPTY_EVENT);
  const [lastDraw, setLastDraw] = useState(null);

  const ready = useRef(false);
  const skipNextSave = useRef(false);
  const pending = useRef(null);

  const load = useCallback(async () => {
    setLoadStatus('loading');
    try {
      await whenSaved();
      const state = await withRetry(() => api.getState(groupId));
      skipNextSave.current = true; // o que acabou de chegar do servidor não precisa ser salvo de volta
      setParticipants(state.participants);
      setRules(state.rules);
      setEvent({ ...EMPTY_EVENT, ...state.event });
      setLastDraw(state.lastDraw);
      ready.current = true;
      setLoadStatus('ready');
    } catch (err) {
      setLoadStatus(err.status === 404 ? 'notfound' : 'error');
    }
  }, [groupId]);

  useEffect(() => {
    load();
  }, [load]);

  const flush = useCallback(() => {
    const payload = pending.current;
    if (!payload) return;
    pending.current = null;
    saveQueue = saveQueue
      .then(() => api.saveState(groupId, payload))
      .then(
        () => setSaveStatus('saved'),
        () => setSaveStatus('error'),
      );
  }, [groupId]);

  // Salvamento automático (com um pequeno atraso para agrupar digitações).
  useEffect(() => {
    if (!ready.current) return undefined;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return undefined;
    }
    pending.current = { participants, rules, event };
    setSaveStatus('saving');
    const timer = setTimeout(flush, 400);
    return () => clearTimeout(timer);
  }, [participants, rules, event, flush]);

  // Ao sair da tela (ex.: voltar para a lista), salva o que ainda estiver pendente.
  useEffect(() => flush, [flush]);

  return {
    loadStatus,
    saveStatus,
    reload: load,
    participants,
    setParticipants,
    rules,
    setRules,
    event,
    setEvent,
    lastDraw,
    setLastDraw,
  };
}
