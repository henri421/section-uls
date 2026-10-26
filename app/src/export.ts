import {
  JETONS,
  csv,
  notationTexte,
  svgAutonome as svgAutonomeCommun,
} from 'aedificium-ui';
import type { BlocService } from './service-view';

/**
 * Les SORTIES : ce qui quitte la page.
 *
 * Un calcul qu on ne peut ni archiver ni joindre a un dossier n a pas
 * d existence professionnelle. Ce module compose les documents ; il ne les
 * telecharge pas.
 *
 * TOUT EST PUR ICI : aucune API de navigateur, ni `document`, ni `window`.
 * C est la condition pour que ce qui compose un document se teste sans
 * navigateur — le meme partage que partout ailleurs dans ce projet. Le
 * telechargement lui-meme vit dans `storage.ts`.
 */

// --- Feuilles de style embarquees -------------------------------------------

/**
 * La palette de la page, RECOPIEE ici.
 *
 * Elle doit l etre : un document exporte s ouvre chez un tiers, hors de la
 * page, sans sa feuille de style. Les couleurs du trace viennent de variables
 * CSS definies sur `:root` DANS la page ; un SVG extrait tel quel s ouvre sans
 * aucune couleur, voire noir sur noir.
 *
 * Une copie derive. `tests/app/export.test.ts` compare valeur par valeur cette
 * palette a celle de `style.css` et echoue des que l une bouge sans l autre :
 * c est la copie, mais surveillee.
 */
export const PALETTE = JETONS;

/**
 * Les regles du trace, telles que la page les applique.
 *
 * Le fond blanc est AJOUTE : dans la page il vient de `#section svg`, un
 * selecteur qui ne peut pas suivre le dessin hors de la page. Sans lui, le
 * fichier s ouvre sur le fond du visualiseur, parfois sombre.
 */
export const STYLES_TRACE = `${PALETTE}

svg {
  background: var(--surface);
  color-scheme: light;
  /*
   * La police est AJOUTEE elle aussi : dans la page, les textes du trace
   * heritent celle du corps de page. Hors de la page il n y a plus de corps,
   * et le dessin sortirait dans la police par defaut du visualiseur.
   */
  font-family: var(--sans);
}

.zone-comprimee { fill: var(--compression); fill-opacity: 0.18; }
.zone-tendue { fill: var(--traction); fill-opacity: 0.09; }
.contour { fill: none; stroke: var(--texte); }
.barre-comprimee { fill: var(--compression); }
.barre-tendue { fill: var(--traction); }
.axe-neutre { stroke: var(--texte); stroke-dasharray: 14 9; }
.resultante { stroke: var(--texte); fill: none; }
.bras-levier { stroke: var(--texte); stroke-dasharray: 3 4; fill: none; }
.repere { stroke: var(--neutre); fill: none; }
.repere-texte { fill: var(--texte-faible); font-family: var(--sans); }

.plot-cadre { fill: var(--surface); stroke: var(--bordure); stroke-width: 1; }
.plot-axe { stroke: var(--bordure); stroke-width: 1; }
.plot-graduation { stroke: var(--bordure); stroke-width: 1; }
.plot-etiquette-x,
.plot-etiquette-y,
.plot-marqueur-libelle { fill: var(--texte-doux); font-size: 9px; }
.plot-libelle-x,
.plot-libelle-y { fill: var(--texte); font-size: 10px; }
.plot-etiquette-x,
.plot-etiquette-y { font-family: var(--mono); font-variant-numeric: tabular-nums; }
.plot-domaine { stroke: var(--compression); stroke-width: 1.6; fill: none; }
.plot-sollicitation { fill: var(--traction); stroke: var(--surface); stroke-width: 1; }
.plot-rayon { stroke: var(--traction); stroke-width: 1; stroke-dasharray: 4 3; }`;

// --- SVG autonome ------------------------------------------------------------

/**
 * Enveloppe un SVG de la page dans un document autonome, styles INLINES.
 *
 * Accepte le rendu complet de `dessiner()`, legende comprise, et n en retient
 * que le SVG : la legende est du HTML, et la laisser casserait le XML.
 */
export function svgAutonome(svg: string, styles: string): string {
  return svgAutonomeCommun(svg, styles);
}

// --- CSV des resultats -------------------------------------------------------

// Encodage (point-virgule, BOM, CRLF, guillemets) : `csv` d aedificium-ui,
// commun a toute la suite.

/**
 * Les resultats affiches, en tableau.
 *
 * Prend les `BlocService` DEJA produits par `service-view.ts`,
 * `checks-view.ts` et `meyer-view.ts` : l export dit exactement ce que l ecran
 * dit, parce qu il lit la meme chose. Reconstruire les valeurs ici creerait
 * une seconde source de verite, qui finirait par diverger.
 *
 * AUCUN BLOC N EST OMIS. Un module hors domaine sort avec son motif : une
 * absence silencieuse ferait croire au lecteur que la verification a eu lieu.
 */
export function resultatsEnCsv(blocs: BlocService[]): string {
  const lignes: string[][] = [['Bloc', 'Grandeur', 'Valeur']];

  for (const bloc of blocs) {
    const avant = lignes.length;

    for (const l of bloc.lignes) lignes.push([bloc.titre, l.libelle, l.valeur]);
    if (bloc.verdict !== null) lignes.push([bloc.titre, 'Verdict', bloc.verdict.texte]);
    if (bloc.note !== null) lignes.push([bloc.titre, 'Note', bloc.note]);

    // Un bloc prive de tout garde quand meme sa ligne : c est son TITRE qui
    // porte alors l information, et le faire disparaitre serait pire.
    if (lignes.length === avant) lignes.push([bloc.titre, '', '']);
  }

  // Les DONNEES gardent leur notation source ; la conversion en texte brut se
  // fait ici, au rendu, par `notationTexte` — indices et exposants Unicode,
  // lettres grecques, sans balise ni « _ ».
  return csv(lignes.map((ligne) => ligne.map((cellule) => notationTexte(cellule))));
}



