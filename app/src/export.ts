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
  /* ---- Châssis ---- */
  --fond: #f7f7f6;            /* fond de page */
  --surface: #ffffff;         /* cartes, panneaux, champs */
  --surface-appui: #f2f1ec;   /* en-têtes de tableau, boutons au repos, blocs d'attente */
  --texte: #1a1a1a;
  --texte-doux: #4a4842;      /* notes, libellés de ligne, corps secondaire */
  --texte-faible: #6a6862;    /* legend, sous-titres, surtitres */
  --bordure: #c8c6c0;         /* filet structurant : cadres, champs, séparateurs */
  --bordure-douce: #eceae4;   /* filet interne : lignes de liste, lignes de tableau */

  /* ---- Interface ---- */
  --accent: #1e5aa8;          /* focus, liens, état actif — JAMAIS une couleur de sens */
  --accent-doux: #eaf1f9;     /* fond d'un champ actif, surlignage de zone */

  /* ---- Couleurs de sens ---- */
  --compression: #2f5d8a;     /* bielle, béton comprimé, domaine résistant */
  --traction: #a8442a;        /* tirant, acier tendu, point sollicitant */
  --beton: #e7eaee;           /* aplat de matière dans les tracés */
  --neutre: #9a978f;          /* barre à effort nul, repères de cotation */

  /* ---- Verdicts : trois états, pas quatre ---- */
  --ok: #1f6f3f;      --ok-fond: #eaf4ee;
  --alerte: #8a6d00;  --alerte-fond: #fdf6e3;
  --refus: #a52121;   --refus-fond: #f8ecec;

  /* ---- Typographie ---- */
  --sans: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;

  /* ---- Rayons ---- */
  --rayon: 4px;        /* cartes, panneaux, fieldsets */
  --rayon-petit: 3px;  /* champs, boutons, pastilles */
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

// --- Note de calcul ----------------------------------------------------------

/**
 * L avertissement porte par l en-tete de l application, reconduit sur la note.
 *
 * La note est le document qui SORT et circule : c est sur lui, plus encore que
 * sur l ecran, que la portee de l outil doit etre lisible.
 */
export const AVERTISSEMENT_RESPONSABILITE =
  'Outil d aide au calcul : la verification finale et la responsabilite incombent a ' +
  'l ingenieur du projet. Cette note est un COMPTE RENDU de calcul, non une justification ' +
  'reglementaire signee.';

/**
 * La feuille de style de la note, embarquee dans le document.
 *
 * Elle reprend les regles du trace — la note contient les memes dessins — et y
 * ajoute la mise en page du texte et l impression : sauts de page entre
 * parties, dessins jamais coupes, fond blanc.
 */
export const STYLES_NOTE = `${STYLES_TRACE}

body {
  margin: 0 auto;
  padding: 1.5rem;
  max-width: 60rem;
  background: var(--surface);
  color: var(--texte);
  font: 13px/1.55 var(--sans);
}

header { border-bottom: 2px solid var(--texte); padding-bottom: 0.6rem; }
h1 { margin: 0; font-size: 1.3rem; font-weight: normal; }
.date { margin: 0.2rem 0 0.5rem; color: var(--texte-doux); }
.avertissement {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.6rem;
  border-left: 3px solid var(--alerte);
  border-radius: var(--rayon);
  background: var(--alerte-fond);
  color: var(--alerte);
  font-size: 0.85rem;
}

.partie { margin-top: 1.6rem; }
.partie > h2 {
  margin: 0 0 0.6rem;
  padding-bottom: 0.2rem;
  border-bottom: 1px solid var(--bordure);
  font-size: 1rem;
}

.bloc { margin: 0 0 1rem; padding-left: 0.6rem; border-left: 2px solid var(--surface-appui); }
.bloc > h3 {
  margin: 0 0 0.3rem;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--texte-faible);
}

table.lignes { width: 100%; border-collapse: collapse; }
table.lignes th {
  width: 55%;
  padding: 0.2rem 0.4rem 0.2rem 0;
  border-bottom: 1px solid var(--bordure-douce);
  font-weight: normal;
  text-align: left;
  color: var(--texte-doux);
}
table.lignes td {
  padding: 0.2rem 0;
  border-bottom: 1px solid var(--bordure-douce);
  text-align: right;
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}

.verdict {
  margin: 0.4rem 0 0;
  padding: 0.35rem 0.55rem;
  border-left: 3px solid currentColor;
  border-radius: var(--rayon);
  font-weight: 600;
}
.verdict.ok { background: var(--ok-fond); color: var(--ok); }
.verdict.non-ok { background: var(--refus-fond); color: var(--refus); }

.note { margin: 0.4rem 0 0; font-size: 0.85rem; color: var(--texte-doux); }
.motif {
  margin: 0.4rem 0 0;
  padding: 0.4rem 0.55rem;
  border-left: 3px solid var(--refus);
  border-radius: var(--rayon);
  background: var(--refus-fond);
  font-size: 0.85rem;
  color: var(--refus);
}

figure { margin: 0 0 1rem; }
figure svg {
  width: 100%;
  max-width: 32rem;
  height: auto;
  border: 1px solid var(--bordure);
  border-radius: var(--rayon);
}

@media print {
  @page { margin: 15mm; }
  body { max-width: none; padding: 0; background: var(--surface); }
  /* Une partie commence sur sa page ; un bloc ou un dessin ne se coupe pas. */
  .partie { break-before: page; page-break-before: always; }
  .partie:first-of-type { break-before: auto; page-break-before: auto; }
  .bloc, figure { break-inside: avoid; page-break-inside: avoid; }
}`;

/** Ce qu il faut pour composer une note : des blocs deja mis en forme. */
export interface NoteDeCalcul {
  titre: string;
  date: string;
  /** Geometrie, materiaux, armatures, sollicitations. */
  entrees: BlocService[];
  /** SVG deja produits par `dessiner()` et `plotSvg()` — jamais redessines. */
  dessins: string[];
  verifications: BlocService[];
  hypotheses: string[];
}

/**
 * Echappement HTML, identique a celui du cablage.
 *
 * Recopie plutot qu importe : ce module ne doit RIEN devoir a `main.ts`, qui
 * touche au document. Quatre remplacements sans etat, dont la duplication
 * coute moins que le couplage.
 */
function echapperHtml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Un bloc de la note.
 *
 * La note du bloc devient un MOTIF — cadre rouge — quand elle explique une
 * absence : bloc sans ligne ni verdict, ou verdict defavorable. Partout
 * ailleurs c est une precision. Deux lectures qui n appellent pas la meme
 * reaction, et la note doit les distinguer aussi nettement que l ecran.
 */
function blocEnHtml(bloc: BlocService): string {
  const lignes =
    bloc.lignes.length === 0
      ? ''
      : `<table class="lignes"><tbody>${bloc.lignes
          .map(
            (l) =>
              `<tr><th scope="row">${echapperHtml(l.libelle)}</th>` +
              `<td>${echapperHtml(l.valeur)}</td></tr>`
          )
          .join('')}</tbody></table>`;

  const verdict =
    bloc.verdict === null
      ? ''
      : `<p class="verdict ${bloc.verdict.ok ? 'ok' : 'non-ok'}">` +
        `${echapperHtml(bloc.verdict.texte)}</p>`;

  const estUneAbsence =
    (bloc.verdict !== null && !bloc.verdict.ok) ||
    (bloc.verdict === null && bloc.lignes.length === 0);
  const note =
    bloc.note === null
      ? ''
      : `<p class="${estUneAbsence ? 'motif' : 'note'}">${echapperHtml(bloc.note)}</p>`;

  return `<section class="bloc"><h3>${echapperHtml(bloc.titre)}</h3>${lignes}${verdict}${note}</section>`;
}

function partie(titre: string, contenu: string): string {
  return `<section class="partie"><h2>${echapperHtml(titre)}</h2>${contenu}</section>`;
}

/**
 * La note de calcul, document HTML AUTONOME.
 *
 * Destine a etre ouvert dans un onglet et imprime en PDF par le navigateur :
 * aucune ressource externe, aucun script, aucune dependance. L ordre est celui
 * d une note d ingenieur — identification, donnees d entree, dessins,
 * verifications avec leurs valeurs intermediaires, hypotheses et limites.
 *
 * DEUX INTERDITS TENUS ICI :
 *
 * 1. la note NE CONCLUT PAS. Elle rapporte les verdicts des modules, un pour
 *    un, et n en ajoute aucun de synthese : la conclusion appartient a
 *    l ingenieur, pas au document qui lui sert a la former ;
 * 2. elle NE MASQUE AUCUNE verification. Un module hors domaine y figure avec
 *    son motif. Une section qui disparait sans explication fait croire au
 *    lecteur qu elle a ete verifiee — pire qu une section incomplete assumee.
 */
export function noteDeCalculHtml(note: NoteDeCalcul, styles: string): string {
  const dessins =
    note.dessins.length === 0
      ? ''
      : partie(
          'Section et diagrammes',
          note.dessins.map((svg) => `<figure>${svg}</figure>`).join('')
        );

  const hypotheses =
    note.hypotheses.length === 0
      ? ''
      : partie(
          'Hypotheses et limites',
          `<ul>${note.hypotheses.map((h) => `<li>${echapperHtml(h)}</li>`).join('')}</ul>`
        );

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${echapperHtml(note.titre)} — note de calcul</title>
<style>
${styles}
</style>
</head>
<body>
<header>
<h1>${echapperHtml(note.titre)} — note de calcul</h1>
<p class="date">Etablie le ${echapperHtml(note.date)} — section-uls, EN 1992-1-1</p>
<p class="avertissement">${echapperHtml(AVERTISSEMENT_RESPONSABILITE)}</p>
</header>
${partie('Donnees d entree', note.entrees.map(blocEnHtml).join(''))}
${dessins}
${partie('Verifications', note.verifications.map(blocEnHtml).join(''))}
${hypotheses}
</body>
</html>
`;
}
