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
