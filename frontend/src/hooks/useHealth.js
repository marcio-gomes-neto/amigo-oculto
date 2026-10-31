import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

/** Consulta o backend para saber se está no ar e como o email está configurado. */
export function useHealth() {
  const [health, setHealth] = useState({ status: 'loading' });

  const check = useCallback(async () => {
    setHealth({ status: 'loading' });
    try {
      const data = await api.health();
      setHealth({ status: 'ok', email: data.email });
    } catch {
      setHealth({ status: 'offline' });
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return [health, check];
}
