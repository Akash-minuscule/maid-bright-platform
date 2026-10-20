import { useRef, useState } from 'react';
import { friendlyError } from '../services/errors';
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const lock = useRef(false);
  const run = async (work: () => Promise<void>, successMessage = '') => {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await work();
      setSuccess(successMessage);
      return true;
    } catch (e) {
      setError(friendlyError(e));
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    error,
    success,
    run,
    setError,
    clear: () => {
      setError('');
      setSuccess('');
    },
  };
}
