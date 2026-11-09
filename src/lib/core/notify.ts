import { writable } from 'svelte/store';
import { sfx } from './sound';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: 'info' | 'success' | 'error';
}

export const toasts = writable<Toast[]>([]);
let nextId = 1;

export interface NotifyOptions {
  body?: string;
  tone?: Toast['tone'];
  /** Play the chime. Default false. */
  sound?: boolean;
  /** Also show a system notification when the tab is hidden and permission was granted. */
  system?: boolean;
  durationMs?: number;
}

/** Show an in-app toast (and optionally a sound and a system notification). */
export function notify(title: string, opts: NotifyOptions = {}) {
  const id = nextId++;
  toasts.update((t) => [...t.slice(-4), { id, title, body: opts.body, tone: opts.tone ?? 'info' }]);
  setTimeout(() => dismiss(id), opts.durationMs ?? 5000);
  if (opts.sound) sfx('chime');
  if (opts.system) void systemNotification(title, opts.body);
}

/**
 * A system notification while the site is in the background. Goes through
 * the service worker when there is one (the only way on Android, and the
 * click brings the site forward), else the plain Notification API.
 */
async function systemNotification(title: string, body?: string) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
    const options = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: title };
    const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* ignore */
  }
}

export function dismiss(id: number) {
  toasts.update((t) => t.filter((x) => x.id !== id));
}

/** Ask for system notification permission. Resolves to the resulting permission. */
export async function requestNotificationPermission(): Promise<string> {
  try {
    if (!('Notification' in window)) return 'unsupported';
    if (Notification.permission !== 'default') return Notification.permission;
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}
