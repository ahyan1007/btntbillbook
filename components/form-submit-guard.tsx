'use client';

import { useEffect } from 'react';

export function FormSubmitGuard() {
  useEffect(() => {
    const handler = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      if (form.dataset.submitting === '1') {
        event.preventDefault();
        return;
      }

      form.dataset.submitting = '1';
      const submitter = event.submitter instanceof HTMLButtonElement ? event.submitter : null;
      if (submitter) submitter.disabled = true;

      window.setTimeout(() => {
        delete form.dataset.submitting;
        if (submitter) submitter.disabled = false;
      }, 1500);
    };

    document.addEventListener('submit', handler, true);
    return () => document.removeEventListener('submit', handler, true);
  }, []);

  return null;
}
