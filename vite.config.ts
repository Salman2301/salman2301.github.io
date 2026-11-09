import { createHash } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import path from "path";
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig, type Plugin } from 'vite';
import WindiCSS from 'vite-plugin-windicss';

/** Every file under `dir`, as site paths ("/css/global.css"). */
function filesIn(dir: string, base = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return filesIn(full, base);
    return ['/' + path.relative(base, full).split(path.sep).join('/')];
  });
}

/**
 * Writes /sw.js from sw/service-worker.js with the list of every built and
 * public file to cache, and a version that changes whenever any file does.
 */
function serviceWorker(): Plugin {
  return {
    name: 's2301-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const files = [
        '/',
        ...built.filter((f) => f !== 'index.html').map((f) => '/' + f),
        ...filesIn(path.resolve(__dirname, 'public')).filter((f) => !f.endsWith('.DS_Store') && f !== '/logo.ico'),
      ];
      const hash = createHash('sha256');
      for (const f of built.sort()) {
        const item = bundle[f];
        hash.update(f);
        hash.update(item.type === 'chunk' ? item.code : typeof item.source === 'string' ? item.source : Buffer.from(item.source));
      }
      const source = readFileSync(path.resolve(__dirname, 'sw/service-worker.js'), 'utf8')
        .replace('__VERSION__', hash.digest('hex').slice(0, 12))
        .replace('__PRECACHE__', JSON.stringify(files));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  resolve:{
    alias:{
      "@": path.resolve(__dirname, './src'),
      "@component": path.resolve(__dirname, './src/lib/component'),
      "@command": path.resolve(__dirname, './src/lib/component/Terminal/commands'),
      "@store": path.resolve(__dirname, './src/lib/component/Terminal/store')
    }
  },

  plugins: [
    svelte(),
    WindiCSS({
      scan: {
        dirs: ['src'],
        fileExtensions: ['svelte', 'ts'],
      },
    }),
    serviceWorker(),
  ],
});
