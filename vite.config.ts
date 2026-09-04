import { defineConfig } from 'vite';

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
