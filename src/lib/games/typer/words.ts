/**
 * Word pools for Typing Defense: things a developer types every day.
 * Normal words are bucketed by length so waves can ramp up difficulty.
 * Special words trigger an effect when typed and never appear as normal ones.
 */

export type WordKind = 'normal' | 'clear' | 'slow';

const POOL = `
  const let var enum type void null true false this super class new try catch throw yield async await
  if else for while case break return import export default extends typeof keyof readonly unknown never
  interface implements instanceof private public protected abstract finally switch continue delete
  ls cd pwd cat echo grep sed awk curl ssh git npm npx pnpm yarn bun deno node vim tmux sudo kill man
  less head tail sort uniq find xargs jq make chmod chown mkdir rmdir touch diff patch tar gzip ping
  map filter reduce forEach flatMap fetch Promise Object Array JSON Symbol BigInt console debugger
  props state slot store hook ref emit render mount query mutate cache retry lint test build deploy
  useState useEffect useMemo useRef useContext useReducer useCallback useLayoutEffect
  padding margin display opacity z-index flex-basis gap inset cursor outline-offset aspect-ratio
  border-radius box-shadow font-weight line-height align-items justify-content place-items
  grid-template overflow-x text-overflow white-space letter-spacing min-height max-width
`;

const PHRASES = [
  'git add', 'git push', 'git pull', 'git diff', 'git log', 'git init', 'git tag', 'git fetch',
  'git rebase', 'git merge', 'git commit', 'git blame', 'git bisect', 'git switch', 'git revert',
  'git rebase -i', 'git cherry-pick', 'git commit -m', 'git checkout -b', 'git log --oneline',
  'grep -r', 'ls -la', 'cd ..', 'mkdir -p', 'npm i', 'npm test', 'npm run dev', 'npm run build',
  'chmod +x', 'tar -xzf', 'tail -f', 'du -sh', 'ps aux', 'kill -9', 'ssh-keygen', 'curl -I',
  'find . -name', 'docker ps', 'docker build', 'kubectl get pods', 'make install', 'which node',
  'Promise.all', 'Array.from', 'Object.keys', 'Object.entries', 'JSON.parse', 'JSON.stringify',
  'Math.max', 'Math.random', 'structuredClone', 'querySelector', 'addEventListener',
  'import.meta', 'export default', 'async function', 'new Map()', 'new Set()', 'try catch',
  'display: grid', 'gap: 1rem', 'color-mix', 'calc(100%)', 'translate3d', 'will-change',
];

/** Typing one of these wipes every word on screen. */
export const CLEAR_WORDS = ['git stash', 'clear', 'git clean', 'rm -rf tmp', 'reset --hard', 'flush'];
/** Typing one of these slows time for a few seconds. */
export const SLOW_WORDS = ['sleep 5', 'debounce', 'throttle', 'nice -n 19', 'setTimeout', 'idle'];

const SPECIAL = new Set([...CLEAR_WORDS, ...SLOW_WORDS]);
const ALL = [...new Set([...POOL.trim().split(/\s+/), ...PHRASES])].filter((w) => !SPECIAL.has(w));

/** Buckets by length: short (up to 5), medium (6 to 9), long (10 and up). */
export const TIERS: string[][] = [
  ALL.filter((w) => w.length <= 5),
  ALL.filter((w) => w.length >= 6 && w.length <= 9),
  ALL.filter((w) => w.length >= 10),
];

export function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}
