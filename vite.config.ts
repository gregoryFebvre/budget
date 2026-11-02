import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Politique de sécurité injectée uniquement dans le build de production :
 * aucune requête réseau sortante n'est autorisée (connect-src 'none').
 * Les données budgétaires ne peuvent donc pas quitter le navigateur.
 */
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data:; connect-src 'none'; object-src 'none'; base-uri 'self'; form-action 'none'";

export default defineConfig(({ command, isPreview }) => ({
  // Chemin de déploiement GitHub Pages : https://<utilisateur>.github.io/budget/
  define: { __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? 'dev') },
  // `preview` doit servir le build avec le même chemin que lui (sinon les fichiers sont introuvables).
  base: command === 'build' || isPreview ? (process.env.BASE_PATH ?? '/budget/') : '/',
  // Pas de polyfill modulepreload : il utilise fetch() (même origine) et n'est utile qu'aux très anciens navigateurs.
  build: { modulePreload: { polyfill: false } },
  plugins: [
    react(),
    {
      name: 'budget-csp',
      apply: 'build',
      transformIndexHtml: (html: string) =>
        html.replace('</head>', `  <meta http-equiv="Content-Security-Policy" content="${CSP}" />\n  </head>`),
    },
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/tests/setup.ts'],
    css: false,
  },
}));
