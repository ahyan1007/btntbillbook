'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

export function PwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;

    if (standalone) setInstalled(true);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);

    let hadController = false;
    let reloading = false;
    const onControllerChange = () => {
      // Reload only when replacing an existing controller. The very first
      // service-worker installation should not cause an unnecessary reload.
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    };

    if ('serviceWorker' in navigator) {
      hadController = Boolean(navigator.serviceWorker.controller);
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

      navigator.serviceWorker
        .register('/sw.js', { updateViaCache: 'none' })
        .then(registration => registration.update().catch(() => {}))
        .catch(() => {});
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      }
    };
  }, []);

  if (installed || !deferredPrompt) return null;

  async function install() {
    const prompt = deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    setDeferredPrompt(null);
  }

  return (
    <button
      onClick={install}
      className='flex w-full items-center gap-3 rounded-xl bg-brand-blue px-4 py-3 text-sm font-bold text-white shadow-sm hover:opacity-95'
    >
      <Download size={18} />
      Install Bill Book App
    </button>
  );
}
