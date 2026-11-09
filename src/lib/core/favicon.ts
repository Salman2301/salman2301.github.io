/**
 * The site mark (a ring around a squared "S") drawn as SVG in the active
 * theme: the accent on the theme's background. It replaces the favicon and
 * the browser's theme-color whenever the theme changes. /favicon.ico stays in
 * index.html for browsers that ignore SVG favicons.
 */

const S_PATH =
  'M43 23.5V21.5Q43 19.5 41 19.5H35.5Q33.2 19.5 32 15Q30.8 19.5 28.5 19.5H24Q21.5 19.5 21.5 22V29Q21.5 31.5 24 31.5H40Q42.5 31.5 42.5 34V42Q42.5 44.5 40 44.5H35.5Q33.2 44.5 32 49Q30.8 44.5 28.5 44.5H23Q21 44.5 21 42.5V40.5';

export function faviconSvg(bg: string, accent: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
    `<circle cx="32" cy="32" r="29" fill="${bg}" stroke="${accent}" stroke-width="3.5"/>` +
    `<path d="${S_PATH}" fill="none" stroke="${accent}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

function link(): HTMLLinkElement {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="icon"][data-themed]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'icon';
    el.type = 'image/svg+xml';
    el.dataset.themed = '';
    // After the .ico link, so browsers that support SVG favicons prefer this one.
    document.head.append(el);
  }
  return el;
}

/** Point the favicon and theme-color at the theme's colours. */
export function applyFavicon(bg: string, accent: string) {
  try {
    link().href = `data:image/svg+xml,${encodeURIComponent(faviconSvg(bg, accent))}`;
    document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', bg);
  } catch {
    /* no document (tests) */
  }
}
