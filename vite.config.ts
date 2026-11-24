import { defineConfig, type Plugin } from 'vite';

// Node global, declared here to avoid adding @types/node for one line.
declare const process: { env: Record<string, string | undefined> };

/**
 * Share previews (Open Graph) need absolute URLs. The deploy workflow sets SITE_URL
 * (e.g. https://user.github.io/repo/); locally it falls back to relative paths, which is
 * fine for development.
 */
function siteUrl(): Plugin {
  const raw = process.env.SITE_URL ?? '';
  const url = raw && !raw.endsWith('/') ? `${raw}/` : raw;
  return {
    name: 'site-url',
    transformIndexHtml: (html) => html.split('__SITE_URL__').join(url),
  };
}

export default defineConfig({
  // Relative base so the build works from any static host or subfolder.
  base: './',
  plugins: [siteUrl()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
  server: {
    host: true,
  },
});
