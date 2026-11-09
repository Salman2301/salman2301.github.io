import { writable } from 'svelte/store';
import { notify } from './notify';

/**
 * The installable app: registers the service worker (built to /sw.js, see
 * vite.config.ts), keeps the browser's install prompt for the `install`
 * command, and says when a new version has taken over.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
/** True when the browser offered to install the site and it is not installed yet. */
export const canInstall = writable(false);

/** Running as an installed app (its own window), not in a browser tab. */
export function isInstalled(): boolean {
  try {
    return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

/** Show the browser's install dialog. Resolves to what happened. */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const e = deferred;
  deferred = null;
  canInstall.set(false);
  await e.prompt();
  return (await e.userChoice).outcome;
}

let started = false;

export function startPwa() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    canInstall.set(true);
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    canInstall.set(false);
    notify('Installed', { body: 'open it from your dock, start menu or home screen', tone: 'success' });
  });
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) notify('Updated to the latest version', { body: 'reload the page to use it', durationMs: 10_000 });
  });
  const register = () =>
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* private mode or blocked: the site still works online */
    });
  if (document.readyState === 'complete') void register();
  else window.addEventListener('load', () => void register(), { once: true });
}
