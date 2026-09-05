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
export const PALETTE = `:root {
  --encre: #1a1a1a;
  --papier: #fbfbf9;
  --trait: #c8c6c0;
  --appui: #f2f1ec;
  --ok: #1f6f3f;
  --non-ok: #a52121;
  --attention: #8a6d00;
  --compression: #2f5d8a;
  --traction: #a8442a;
}`;

/**
 * Les regles du trace, telles que la page les applique.
 *
 * Le fond blanc est AJOUTE : dans la page il vient de `#section svg`, un
 * selecteur qui ne peut pas suivre le dessin hors de la page. Sans lui, le
 * fichier s ouvre sur le fond du visualiseur, parfois sombre.
 */
export const STYLES_TRACE = `${PALETTE}

svg {
  background: #fff;
  color-scheme: light;
}

.zone-comprimee { fill: var(--compression); fill-opacity: 0.18; }
.zone-tendue { fill: var(--traction); fill-opacity: 0.09; }
.contour { fill: none; stroke: var(--encre); }
.barre-comprimee { fill: var(--compression); }
.barre-tendue { fill: var(--traction); }
.axe-neutre { stroke: var(--encre); stroke-dasharray: 14 9; }
.resultante { stroke: var(--encre); fill: none; }
.bras-levier { stroke: var(--encre); stroke-dasharray: 3 4; fill: none; }
.repere { stroke: #9a978f; fill: none; }
.repere-texte { fill: #6a6862; font-family: system-ui, sans-serif; }

.plot-cadre { fill: #fff; stroke: var(--trait); stroke-width: 1; }
.plot-axe { stroke: var(--trait); stroke-width: 1; }
.plot-graduation { stroke: var(--trait); stroke-width: 1; }
.plot-etiquette-x,
.plot-etiquette-y,
.plot-marqueur-libelle { fill: #4a4842; font-size: 9px; }
.plot-libelle-x,
.plot-libelle-y { fill: var(--encre); font-size: 10px; }
.plot-domaine { stroke: var(--compression); stroke-width: 1.6; fill: none; }
.plot-sollicitation { fill: var(--traction); stroke: #fff; stroke-width: 1; }
.plot-rayon { stroke: var(--traction); stroke-width: 1; stroke-dasharray: 4 3; }`;

// --- SVG autonome ------------------------------------------------------------

const NAMESPACE_SVG = 'http://www.w3.org/2000/svg';
const DECLARATION_XML = '<?xml version="1.0" encoding="UTF-8"?>';

/**
 * Le CSS passe en CDATA, jamais en texte nu.
 *
 * Un document SVG est du XML : un `&` ou un `<` dans la feuille de style y
 * serait une erreur d analyse fatale — le fichier ne s ouvrirait pas du tout.
 */
function baliseStyle(styles: string): string {
  return `<style type="text/css"><![CDATA[\n${styles}\n]]></style>`;
}

/**
 * Enveloppe un SVG de la page dans un document autonome, styles INLINES.
 *
 * Accepte le rendu complet de `dessiner()`, legende comprise, et n en retient
 * que le SVG : la legende est du HTML, et la laisser casserait le XML.
 */
export function svgAutonome(svg: string, styles: string): string {
  const debut = /<svg\b[^>]*>/i.exec(svg);
  const fin = svg.lastIndexOf('</svg>');

  // Rien d exploitable : on rend un document vide mais VALIDE, plutot qu un
  // fichier tronque que le lecteur ne saurait pas ouvrir.
  if (debut === null || fin < debut.index) {
    return `${DECLARATION_XML}\n<svg xmlns="${NAMESPACE_SVG}">${baliseStyle(styles)}</svg>`;
  }

  const ouverture = /\bxmlns\s*=/.test(debut[0])
    ? debut[0]
    : debut[0].replace(/^<svg\b/i, `<svg xmlns="${NAMESPACE_SVG}"`);

  const contenu = svg.slice(debut.index + debut[0].length, fin);

  return `${DECLARATION_XML}\n${ouverture}${baliseStyle(styles)}${contenu}</svg>`;
}

// --- CSV des resultats -------------------------------------------------------

/**
 * Le point-virgule, et pas la virgule.
 *
 * Le separateur decimal de l interface est la VIRGULE — `formatNumber` la
 * produit partout. La prendre aussi comme separateur de colonnes couperait
 * chaque nombre en deux a l ouverture. Le point-virgule est du reste ce
 * qu attend un tableur en configuration francaise.
 */
const SEPARATEUR = ';';

/** Fin de ligne CSV usuelle (RFC 4180), celle qu attendent les tableurs. */
const FIN_DE_LIGNE = '\r\n';

/**
 * Marque d ordre des octets.
 *
 * Sans elle, Excel lit le fichier dans l encodage de la machine et massacre
 * les accents comme les σ, ρ et ζ dont les libelles de ce module sont peuples.
 * C est le seul moyen fiable de lui dire que le fichier est en UTF-8.
 */
const BOM = '\uFEFF';

function champCsv(valeur: string): string {
  if (!/[;"\r\n]/.test(valeur)) return valeur;
  return `"${valeur.replace(/"/g, '""')}"`;
}

function ligneCsv(champs: string[]): string {
  return champs.map(champCsv).join(SEPARATEUR);
}

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
  const lignes = [ligneCsv(['Bloc', 'Grandeur', 'Valeur'])];

  for (const bloc of blocs) {
    const avant = lignes.length;

    for (const l of bloc.lignes) lignes.push(ligneCsv([bloc.titre, l.libelle, l.valeur]));
    if (bloc.verdict !== null) lignes.push(ligneCsv([bloc.titre, 'Verdict', bloc.verdict.texte]));
    if (bloc.note !== null) lignes.push(ligneCsv([bloc.titre, 'Note', bloc.note]));

    // Un bloc prive de tout garde quand meme sa ligne : c est son TITRE qui
    // porte alors l information, et le faire disparaitre serait pire.
    if (lignes.length === avant) lignes.push(ligneCsv([bloc.titre, '', '']));
  }

  return BOM + lignes.join(FIN_DE_LIGNE) + FIN_DE_LIGNE;
}
