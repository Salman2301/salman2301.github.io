import { get } from 'svelte/store';
import { ISSUES_URL } from '../core/sync';
import { themeStore } from '../core/theme';
import type { CommandDef } from '../core/types';

/** A new-issue link with the title and a short template, plus the browser and screen (nothing else). */
export function newIssueUrl(title: string): string {
  const body = [
    '**What happened?**',
    '',
    '',
    '**What did you expect?**',
    '',
    '',
    '**Steps to reproduce** (commands you ran, widgets you used)',
    '1. ',
    '',
    '---',
    `browser: ${navigator.userAgent}`,
    `screen: ${window.innerWidth}×${window.innerHeight} · theme: ${get(themeStore)}`,
  ].join('\n');
  const q = new URLSearchParams({ title, body });
  return `${ISSUES_URL}/new?${q.toString()}`;
}

const command: CommandDef = {
  name: 'issue',
  aliases: ['bug', 'feedback', 'report'],
  description: 'report a problem or suggest an idea on GitHub',
  usage: 'issue [<short title>]',
  help: `
Opens a new GitHub issue for this site in a new tab, with your title and a
short template filled in, plus your browser and screen size so the problem is
easier to find. You can edit everything before you submit it. You need a
GitHub account to post.

  issue                          open a blank report
  issue sync does not load       start with that title

All issues: ${ISSUES_URL}`,
  group: 'general',
  run: (ctx) => {
    const title = ctx.args.join(' ').trim();
    const url = newIssueUrl(title);
    window.open(url, '_blank', 'noopener');
    ctx.print('opened a new GitHub issue in a new tab. If nothing opened, use:', 'muted');
    ctx.print(`${ISSUES_URL}/new`, 'accent');
  },
};

export default command;
