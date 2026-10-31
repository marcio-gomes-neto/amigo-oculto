import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { MIN_PARTICIPANTS } from '../utils.js';

/**
 * Pergunta ao backend, sempre que participantes ou regras mudam, se o sorteio
 * é possível. Nada é sorteado nem enviado nessa verificação.
 */
export function useDrawValidation(participants, rules, serverOnline) {
  const [validation, setValidation] = useState({ status: 'idle' });

  useEffect(() => {
    if (participants.length < MIN_PARTICIPANTS || !serverOnline) {
      setValidation({ status: 'idle' });
      return undefined;
    }
    setValidation({ status: 'checking' });
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const result = await api.validate(participants, rules, controller.signal);
        setValidation(result.ok ? { status: 'ok' } : { status: 'error', message: result.error });
      } catch (err) {
        if (err.name !== 'AbortError') setValidation({ status: 'error', message: err.message });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [participants, rules, serverOnline]);

  return validation;
}
