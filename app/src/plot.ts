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
function coordonnee(valeur: number): string {
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
        `${i === 0 ? 'M' : 'L'} ${coordonnee(scale.x(p.x))} ${coordonnee(scale.y(p.y))}`
    )
    .join(' ');
}
