import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: 'app',
  // Chemins relatifs : la page est servie depuis un sous-chemin sur GitHub
  // Pages (/section-uls/), pas depuis la racine d'un domaine.
  base: './',
  build: {
    outDir: '../docs',
    // NE PAS vider docs/ : il contient `docs/validation/vcaslu.md`, le
    // protocole du banc de comparaison, qui n'est pas un artefact de build.
    // Les anciens assets sont nettoyes par le script `build` de package.json.
    emptyOutDir: false,
  },
  plugins: [
    VitePWA({
      // Enregistrement explicite dans main.ts : `injectRegister: null` evite
      // un second enregistrement du service worker par le plugin.
      injectRegister: null,
      // Une nouvelle version attend l'accord de l'utilisateur : un calcul en
      // cours ne doit pas etre recharge sous ses yeux.
      registerType: 'prompt',
      includeAssets: ['icone.svg'],
      manifest: {
        // Identifiant, depart et portee RELATIFS : le site vit dans un
        // sous-chemin de GitHub Pages.
        id: './',
        start_url: './',
        scope: './',
        name: 'section-uls — sections BA a l ELU, EN 1992-1-1',
        short_name: 'Sections BA',
        description: "Verification de sections de beton arme a l'ELU et a l'ELS selon l'EN 1992-1-1.",
        lang: 'fr',
        display: 'standalone',
        background_color: '#f7f7f6',
        theme_color: '#f7f7f6',
        icons: [
          { src: 'icone-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icone-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icone-masquable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        navigateFallback: 'index.html',
        // Application entierement locale : rien a mettre en cache au vol.
        // La limite de precache par defaut (2 Mio) est conservee : la relever
        // masquerait une derive de taille du bundle.
        runtimeCaching: [],
      },
      // Pour tester l'installation en `npm run dev`.
      devOptions: { enabled: true },
    }),
  ],
  // Vitest reutilise ce fichier de config : sans ce champ, le `root: 'app'`
  // ci-dessus (necessaire au build) s'appliquerait aussi aux tests, qui
  // vivent hors de `app/`, et `npm test` ne trouverait plus rien.
  test: {
    root: '.',
    // `.worktrees/` contient des copies de travail completes du depot, donc
    // une seconde suite de tests identique : sans cette exclusion, chaque
    // session en cours double le decompte et fait passer deux fois les
    // memes tests.
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**'],
  },
});
