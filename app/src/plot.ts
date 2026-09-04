import { formatNumber } from './format';

/**
 * Primitives de trace de graphe : cadrage, graduations, transformation vers
 * l'ecran, chemins SVG.
 *
 * Ce module ne connait NI le DOM, NI le beton arme. Il place des nombres.
 * C'est ce qui le rend testable sans navigateur : tout ce qui peut se tromper
 * d'echelle, de signe ou d'ordre de grandeur vit ici plutot que dans le
 * cablage de la page.
 */

export interface PlotPoint {
  x: number;
  y: number;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface PlotBox {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
}

/**
 * Bornes exactes d'un nuage de points.
 *
 * Rend `null` sur un tableau vide : c'est a l'appelant de decider quoi faire
 * d'un graphe sans donnees. Inventer des bornes ici dessinerait des axes
 * gradues autour de rien.
 */
export function dataBounds(points: PlotPoint[]): Bounds | null {
  if (points.length === 0) return null;

  let xMin = points[0].x;
  let xMax = points[0].x;
  let yMin = points[0].y;
  let yMax = points[0].y;

  for (const p of points) {
    if (p.x < xMin) xMin = p.x;
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }

  return { xMin, xMax, yMin, yMax };
}

/**
 * Etend les bornes pour que zero appartienne aux deux plages.
 *
 * Les axes d'un diagramme d'interaction se croisent a l'origine : si l'origine
 * sort du cadre, les axes sortent du dessin et le graphe devient illisible.
 * L'extension ne deplace jamais la borne opposee.
 */
export function includeOrigin(b: Bounds): Bounds {
  return {
    xMin: Math.min(b.xMin, 0),
    xMax: Math.max(b.xMax, 0),
    yMin: Math.min(b.yMin, 0),
    yMax: Math.max(b.yMax, 0),
  };
}

/**
 * Elargit les bornes de `fraction` de l'etendue, de chaque cote.
 *
 * Cas degenere traite explicitement : une etendue nulle (point unique, ou
 * points tous alignes sur une valeur) ne peut pas etre elargie
 * proportionnellement — elle resterait nulle et provoquerait une division par
 * zero dans `makeScale`. On ouvre alors un intervalle unitaire centre sur la
 * valeur.
 */
export function padBounds(b: Bounds, fraction: number): Bounds {
  const x = padIntervalle(b.xMin, b.xMax, fraction);
  const y = padIntervalle(b.yMin, b.yMax, fraction);

  return { xMin: x.min, xMax: x.max, yMin: y.min, yMax: y.max };
}

function padIntervalle(min: number, max: number, fraction: number): { min: number; max: number } {
  const etendue = max - min;

  if (etendue === 0) {
    const demi = 0.5;
    return { min: min - demi, max: max + demi };
  }

  const marge = etendue * fraction;
  return { min: min - marge, max: max + marge };
}

/** Mantisses admissibles d'un pas de graduation : 1, 2, 5 fois une puissance de dix. */
const MANTISSES = [1, 2, 5, 10];

/**
 * Graduations aux multiples de 1, 2 ou 5 fois une puissance de dix — celles
 * qu'un lecteur lit sans effort.
 *
 * `cible` est un nombre SOUHAITE, pas une promesse : on retient le pas lisible
 * dont le nombre de multiples couvrant la plage tombe au plus pres de la
 * cible, et le compte reel peut differer de un ou deux. C'est le comportement
 * voulu : des graduations a 13,7 seraient plus proches de la cible et
 * illisibles.
 *
 * Comme les graduations sont les multiples entiers du pas, zero est toujours
 * present — exactement, pas a 1e-16 pres — des que la plage franchit zero.
 * C'est l'axe : il ne doit jamais manquer.
 */
export function niceTicks(min: number, max: number, cible: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];

  const bas = Math.min(min, max);
  const haut = Math.max(min, max);
  const etendue = haut - bas;

  // Etendue nulle : aucun pas ne peut couvrir la plage, et en chercher un
  // ferait diverger le calcul du pas brut. Une seule graduation suffit.
  if (etendue === 0) return [bas];

  // Cible absurde (nulle ou negative) : on se rabat sur une graduation, ce qui
  // borne le pas par le haut au lieu de le faire tendre vers zero — sans quoi
  // le tableau rendu serait demesure.
  const nSouhaite = Number.isFinite(cible) && cible >= 1 ? cible : 1;

  const brut = etendue / nSouhaite;
  const puissance = 10 ** Math.floor(Math.log10(brut));

  let meilleurPas = puissance;
  let meilleurEcart = Number.POSITIVE_INFINITY;

  for (const mantisse of MANTISSES) {
    const pas = mantisse * puissance;
    const ecart = Math.abs(compteDeGraduations(bas, haut, pas) - nSouhaite);
    if (ecart < meilleurEcart) {
      meilleurEcart = ecart;
      meilleurPas = pas;
    }
  }

  const premier = Math.ceil(bas / meilleurPas);
  const dernier = Math.floor(haut / meilleurPas);

  const ticks: number[] = [];
  for (let i = premier; i <= dernier; i++) {
    ticks.push(arrondirBruitFlottant(i * meilleurPas));
  }

  return ticks;
}

function compteDeGraduations(bas: number, haut: number, pas: number): number {
  return Math.floor(haut / pas) - Math.ceil(bas / pas) + 1;
}

/**
 * Efface le bruit de la multiplication flottante : `3 * 0.001` vaut
 * 0,003000000000000000... et s'afficherait tel quel dans une etiquette d'axe.
 * Douze chiffres significatifs conservent toute la precision utile a un
 * graphe et suppriment la trainee binaire.
 */
function arrondirBruitFlottant(valeur: number): number {
  return Number(valeur.toPrecision(12));
}

export interface PlotScale {
  x(valeur: number): number;
  y(valeur: number): number;
}

/**
 * Transformation des coordonnees DONNEES vers les coordonnees ECRAN.
 *
 * Le piege est l'axe vertical : en SVG il DESCEND. La valeur maximale des
 * donnees tombe donc sur la coordonnee ecran la plus PETITE, faute de quoi le
 * graphe est dessine a l'envers.
 *
 * Etendue nulle : plutot que de diviser par zero — un NaN dans un attribut SVG
 * ne leve rien, il efface silencieusement le trace — on renvoie le milieu du
 * cadre. En pratique `padBounds` a deja ouvert l'intervalle en amont ; c'est
 * une ceinture de securite.
 */
export function makeScale(b: Bounds, box: PlotBox): PlotScale {
  const gauche = box.margin.left;
  const droite = box.width - box.margin.right;
  const haut = box.margin.top;
  const bas = box.height - box.margin.bottom;

  const etendueX = b.xMax - b.xMin;
  const etendueY = b.yMax - b.yMin;

  return {
    x(valeur: number): number {
      if (etendueX === 0) return (gauche + droite) / 2;
      return gauche + ((valeur - b.xMin) / etendueX) * (droite - gauche);
    },
    y(valeur: number): number {
      if (etendueY === 0) return (haut + bas) / 2;
      return haut + ((b.yMax - valeur) / etendueY) * (bas - haut);
    },
  };
}

/** Coordonnee ecran mise en forme : deux decimales suffisent au sous-pixel. */
function n(valeur: number): string {
  return valeur.toFixed(2);
}

/**
 * Chemin `M … L …` d'une polyligne, OUVERT : jamais de `Z`.
 *
 * Le contour d'un diagramme d'interaction n'est pas ferme — le noyau ne
 * parcourt que la branche du pivot beton et n'atteint jamais la traction pure.
 * Refermer le trace dessinerait un domaine qui n'a pas ete calcule.
 */
export function polylinePath(points: PlotPoint[], scale: PlotScale): string {
  if (points.length === 0) return '';

  return points
    .map(
      (p, i) =>
        `${i === 0 ? 'M' : 'L'} ${n(scale.x(p.x))} ${n(scale.y(p.y))}`
    )
    .join(' ');
}

export interface PlotSeries {
  points: PlotPoint[];
  /** Classe CSS de la polyligne. */
  classe: string;
}

export interface PlotMarker {
  point: PlotPoint;
  classe: string;
  libelle?: string;
}

/** Segment droit a tracer, en coordonnees DONNEES. */
export interface PlotSegment {
  a: PlotPoint;
  b: PlotPoint;
  classe: string;
}

export interface PlotOptions {
  box?: PlotBox;
  xLabel: string;
  yLabel: string;
  markers?: PlotMarker[];
  segments?: PlotSegment[];
}

/** Cadre par defaut, en unites de `viewBox`. La CSS met a l'echelle. */
export const PLOT_BOX_DEFAUT: PlotBox = {
  width: 480,
  height: 320,
  margin: { top: 12, right: 16, bottom: 40, left: 56 },
};

/** Respiration autour des donnees, en fraction de l'etendue. */
const MARGE_CADRAGE = 0.05;
const CIBLE_GRADUATIONS_X = 6;
const CIBLE_GRADUATIONS_Y = 5;
const RAYON_MARQUEUR = 4;
const LONGUEUR_GRADUATION = 4;

function estFini(p: PlotPoint): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

/**
 * Tous les points qui doivent tenir dans le cadre : ceux des series, mais
 * AUSSI ceux des marqueurs et des extremites de segments.
 *
 * C'est ce qui garantit qu'un point sollicitant hors du domaine resistant
 * reste visible : quand la section ne passe pas, on veut voir de combien.
 */
function pointsACadrer(series: PlotSeries[], options: PlotOptions): PlotPoint[] {
  const tous: PlotPoint[] = [];

  for (const s of series) tous.push(...s.points);
  for (const m of options.markers ?? []) tous.push(m.point);
  for (const seg of options.segments ?? []) tous.push(seg.a, seg.b);

  return tous.filter(estFini);
}

/**
 * Decoupe une suite de points en tronçons consecutifs de points placables.
 *
 * Un point sans coordonnees finies ne peut pas etre dessine ; le trace est
 * alors INTERROMPU plutot que raccorde par-dessus. Un raccord inventerait un
 * morceau de contour qui n'a pas ete calcule.
 */
function troncons(points: PlotPoint[]): PlotPoint[][] {
  const morceaux: PlotPoint[][] = [];
  let courant: PlotPoint[] = [];

  for (const p of points) {
    if (estFini(p)) {
      courant.push(p);
    } else if (courant.length > 0) {
      morceaux.push(courant);
      courant = [];
    }
  }
  if (courant.length > 0) morceaux.push(courant);

  return morceaux;
}

/**
 * Nombre de decimales des etiquettes, deduit du PAS des graduations : un pas
 * de 0,001 en demande trois, un pas de 10^6 aucune.
 */
function decimalesPour(ticks: number[]): number {
  if (ticks.length < 2) return 0;

  const pas = Math.abs(ticks[1] - ticks[0]);
  if (pas === 0) return 0;

  return Math.max(0, Math.min(6, Math.ceil(-Math.log10(pas))));
}

/** Echappe le texte et les valeurs d'attributs inseres dans le SVG. */
function echapper(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Assemble le graphe complet : cadre, axes passant par l'origine, graduations
 * et leurs etiquettes, polylignes, segments, marqueurs, libelles d'axes.
 *
 * Le SVG porte un `viewBox` et AUCUNE dimension en dur : la mise a l'echelle
 * est l'affaire de la CSS, comme pour le dessin de la section.
 */
export function plotSvg(series: PlotSeries[], options: PlotOptions): string {
  const box = options.box ?? PLOT_BOX_DEFAUT;

  const gauche = box.margin.left;
  const droite = box.width - box.margin.right;
  const haut = box.margin.top;
  const bas = box.height - box.margin.bottom;

  const morceaux: string[] = [
    `<rect class="plot-cadre" x="${n(gauche)}" y="${n(haut)}" ` +
      `width="${n(droite - gauche)}" height="${n(bas - haut)}"/>`,
  ];

  const brut = dataBounds(pointsACadrer(series, options));

  // Aucun point placable : on rend le cadre et les libelles, sans graduations
  // ni trace. Inventer des bornes graduerait des axes autour de rien.
  if (brut !== null) {
    const bornes = padBounds(includeOrigin(brut), MARGE_CADRAGE);
    const echelle = makeScale(bornes, box);

    morceaux.push(...graduations(bornes, echelle, gauche, bas));
    morceaux.push(...axesOrigine(bornes, echelle));
    morceaux.push(...tracesDeSeries(series, echelle));
    morceaux.push(...tracesDeSegments(options.segments ?? [], echelle));
    morceaux.push(...tracesDeMarqueurs(options.markers ?? [], echelle));
  }

  const milieuX = (gauche + droite) / 2;
  const milieuY = (haut + bas) / 2;
  const yLibelleY = 14;

  morceaux.push(
    `<text class="plot-libelle-x" x="${n(milieuX)}" y="${n(box.height - 8)}" ` +
      `text-anchor="middle">${echapper(options.xLabel)}</text>`,
    `<text class="plot-libelle-y" x="${n(yLibelleY)}" y="${n(milieuY)}" ` +
      `text-anchor="middle" transform="rotate(-90 ${n(yLibelleY)} ${n(milieuY)})">` +
      `${echapper(options.yLabel)}</text>`
  );

  return `<svg viewBox="0 0 ${n(box.width)} ${n(box.height)}" class="plot" ` +
    `role="img">${morceaux.join('')}</svg>`;
}

function graduations(
  bornes: Bounds,
  echelle: PlotScale,
  gauche: number,
  bas: number
): string[] {
  const ticksX = niceTicks(bornes.xMin, bornes.xMax, CIBLE_GRADUATIONS_X);
  const ticksY = niceTicks(bornes.yMin, bornes.yMax, CIBLE_GRADUATIONS_Y);
  const decX = decimalesPour(ticksX);
  const decY = decimalesPour(ticksY);

  const sortie: string[] = [];

  for (const t of ticksX) {
    const x = echelle.x(t);
    sortie.push(
      `<line class="plot-graduation" x1="${n(x)}" y1="${n(bas)}" ` +
        `x2="${n(x)}" y2="${n(bas + LONGUEUR_GRADUATION)}"/>`,
      `<text class="plot-etiquette-x" x="${n(x)}" y="${n(bas + 16)}" ` +
        `text-anchor="middle">${echapper(formatNumber(t, decX))}</text>`
    );
  }

  for (const t of ticksY) {
    const y = echelle.y(t);
    sortie.push(
      `<line class="plot-graduation" x1="${n(gauche - LONGUEUR_GRADUATION)}" y1="${n(y)}" ` +
        `x2="${n(gauche)}" y2="${n(y)}"/>`,
      `<text class="plot-etiquette-y" x="${n(gauche - 7)}" y="${n(y + 3)}" ` +
        `text-anchor="end">${echapper(formatNumber(t, decY))}</text>`
    );
  }

  return sortie;
}

/** Les deux axes se croisent a l'origine, que `includeOrigin` garde dans le cadre. */
function axesOrigine(bornes: Bounds, echelle: PlotScale): string[] {
  return [
    `<line class="plot-axe" x1="${n(echelle.x(bornes.xMin))}" y1="${n(echelle.y(0))}" ` +
      `x2="${n(echelle.x(bornes.xMax))}" y2="${n(echelle.y(0))}"/>`,
    `<line class="plot-axe" x1="${n(echelle.x(0))}" y1="${n(echelle.y(bornes.yMin))}" ` +
      `x2="${n(echelle.x(0))}" y2="${n(echelle.y(bornes.yMax))}"/>`,
  ];
}

function tracesDeSeries(series: PlotSeries[], echelle: PlotScale): string[] {
  const sortie: string[] = [];

  for (const s of series) {
    const chemin = troncons(s.points)
      .map((morceau) => polylinePath(morceau, echelle))
      .filter((d) => d.length > 0)
      .join(' ');

    // Une serie vide ne produit pas de `<path>` : un attribut `d` vide est une
    // balise morte que la CSS peut malgre tout styler.
    if (chemin.length > 0) {
      sortie.push(`<path class="${echapper(s.classe)}" d="${chemin}" fill="none"/>`);
    }
  }

  return sortie;
}

function tracesDeSegments(segments: PlotSegment[], echelle: PlotScale): string[] {
  return segments
    .filter((seg) => estFini(seg.a) && estFini(seg.b))
    .map(
      (seg) =>
        `<line class="${echapper(seg.classe)}" x1="${n(echelle.x(seg.a.x))}" ` +
        `y1="${n(echelle.y(seg.a.y))}" x2="${n(echelle.x(seg.b.x))}" ` +
        `y2="${n(echelle.y(seg.b.y))}"/>`
    );
}

function tracesDeMarqueurs(markers: PlotMarker[], echelle: PlotScale): string[] {
  const sortie: string[] = [];

  for (const m of markers) {
    if (!estFini(m.point)) continue;

    const cx = echelle.x(m.point.x);
    const cy = echelle.y(m.point.y);

    sortie.push(
      `<circle class="${echapper(m.classe)}" cx="${n(cx)}" cy="${n(cy)}" ` +
        `r="${n(RAYON_MARQUEUR)}"/>`
    );

    if (m.libelle !== undefined) {
      sortie.push(
        `<text class="plot-marqueur-libelle" x="${n(cx + 7)}" y="${n(cy - 7)}">` +
          `${echapper(m.libelle)}</text>`
      );
    }
  }

  return sortie;
}
