import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

export const EMPTY_EVENT = { name: '', date: '', budget: '', message: '' };

/**
 * Carrega participantes, regras, evento e último sorteio do servidor (SQLite)
 * e salva automaticamente cada alteração.
 */
export function useAppState() {
  const [loadStatus, setLoadStatus] = useState('loading'); // loading | ready | error
  const [saveStatus, setSaveStatus] = useState('saved'); // saving | saved | error
  const [participants, setParticipants] = useState([]);
  const [rules, setRules] = useState([]);
  const [event, setEvent] = useState(EMPTY_EVENT);
  const [lastDraw, setLastDraw] = useState(null);

  const ready = useRef(false);
  const skipNextSave = useRef(false);
  const saveQueue = useRef(Promise.resolve());

  const load = useCallback(async () => {
    setLoadStatus('loading');
    try {
      const state = await api.getState();
      skipNextSave.current = true; // o que acabou de chegar do servidor não precisa ser salvo de volta
      setParticipants(state.participants);
      setRules(state.rules);
      setEvent({ ...EMPTY_EVENT, ...state.event });
      setLastDraw(state.lastDraw);
      ready.current = true;
      setLoadStatus('ready');
    } catch {
      setLoadStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Salvamento automático (com um pequeno atraso para agrupar digitações).
  useEffect(() => {
    if (!ready.current) return undefined;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return undefined;
    }
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      // Fila: garante que os salvamentos cheguem ao servidor na ordem certa.
      saveQueue.current = saveQueue.current
        .then(() => api.saveState({ participants, rules, event }))
        .then(
          () => setSaveStatus('saved'),
          () => setSaveStatus('error'),
        );
    }, 400);
    return () => clearTimeout(timer);
  }, [participants, rules, event]);

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
