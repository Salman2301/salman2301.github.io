import { get } from 'svelte/store';
import { requestNotificationPermission } from '../core/notify';
import { canInstall, isInstalled, promptInstall } from '../core/pwa';
import type { CommandDef } from '../core/types';

const command: CommandDef = {
  name: 'install',
  description: 'install this site as an app: its own window, works offline, reminder notifications',
  group: 'system',
  run: async (ctx) => {
    if (isInstalled()) {
      ctx.print('already running as an installed app', 'success');
    } else if (get(canInstall)) {
      const outcome = await promptInstall();
      ctx.print(outcome === 'accepted' ? 'installing…' : 'not installed. Run "install" again any time.', outcome === 'accepted' ? 'success' : 'muted');
    } else {
      const ua = navigator.userAgent;
      const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const safari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\//.test(ua);
      if (ios) ctx.print('on iPhone or iPad: tap Share, then "Add to Home Screen"');
      else if (safari) ctx.print('in Safari: File > Add to Dock');
      else if (/Firefox\//.test(ua)) ctx.print('Firefox on desktop cannot install sites. Chrome, Edge or Safari can; on Android, use the menu > Install.');
      else ctx.print('use the install icon at the right of the address bar, or the browser menu > Install / Add to Home Screen');
    }
    const perm = await requestNotificationPermission();
    if (perm === 'granted') ctx.print('reminders show as system notifications while the site is open in the background', 'muted');
    else if (perm === 'denied') ctx.print('notifications are blocked for this site, so reminders only show inside the page', 'muted');
  },
};

export default command;
