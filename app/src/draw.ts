import type { Section } from '../../src/index';
import { rectangleToPolygon } from '../../src/index';

export interface Point {
  y: number;
  z: number;
}

export interface BoundingBox {
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface Segment {
  a: Point;
  b: Point;
}

export interface SplitOutline {
  /** Partie comprimee du contour (cote `zeta < offset`). Vide si aucune. */
  compressed: Point[];
  /** Partie tendue du contour. Vide si aucune. */
  tensioned: Point[];
}

/**
 * Coordonnee perpendiculaire a l'axe neutre, exactement celle du solveur :
 * la droite d'axe neutre est le lieu `zeta = offset`, et la compression se
 * trouve du cote des `zeta` inferieurs.
 */
export function zetaOf(p: Point, angle: number): number {
  return -p.y * Math.sin(angle) + p.z * Math.cos(angle);
}

/**
 * Decoupe le contour de part et d'autre de l'axe neutre, par l'algorithme de
 * Sutherland-Hodgman applique a un demi-plan.
 *
 * Sert a MONTRER la zone comprimee et la zone tendue, ce qu'une simple ligne
 * d'axe neutre ne donne pas a voir. Le decoupage est purement graphique : il
 * ne participe a aucun calcul de resistance, qui reste l'affaire du noyau.
 *
 * Limite connue et acceptee : sur un contour non convexe, le decoupage peut
 * produire un polygone comportant des aretes de raccord de largeur nulle.
 * Le rendu reste correct — la surface peinte est la bonne — mais le contour
 * intermediaire n'est pas un polygone simple au sens strict.
 */
export function splitByLine(polygon: Point[], angle: number, offset: number): SplitOutline {
  return {
    compressed: clipDemiPlan(polygon, angle, offset, true),
    tensioned: clipDemiPlan(polygon, angle, offset, false),
  };
}

function clipDemiPlan(
  polygon: Point[],
  angle: number,
  offset: number,
  garderComprime: boolean
): Point[] {
  if (polygon.length < 3) return [];

  const dedans = (p: Point): boolean =>
    garderComprime ? zetaOf(p, angle) <= offset : zetaOf(p, angle) >= offset;

  const sortie: Point[] = [];
  const n = polygon.length;

  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const aDedans = dedans(a);
    const bDedans = dedans(b);

    if (aDedans) sortie.push(a);

    // L'arete traverse la droite : on ajoute le point d'intersection.
    if (aDedans !== bDedans) {
      const za = zetaOf(a, angle);
      const zb = zetaOf(b, angle);
      const t = (offset - za) / (zb - za);
      sortie.push({ y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) });
    }
  }

  return sortie.length >= 3 ? sortie : [];
}

/**
 * Contour a dessiner. On passe par `rectangleToPolygon` plutot que de
 * reconstruire les sommets : le trace montre ainsi exactement la geometrie
 * que le moteur integre, et non une approximation parallele qui pourrait
 * diverger.
 */
export function outlineOf(section: Section): Point[] {
  const geometrie =
    section.geometry.kind === 'rectangle'
      ? rectangleToPolygon(section.geometry)
      : section.geometry;
  return geometrie.vertices.map((v) => ({ y: v.y, z: v.z }));
}

export function boundingBox(points: Point[]): BoundingBox {
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  return {
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
    zMin: Math.min(...zs),
    zMax: Math.max(...zs),
  };
}

/** Rayon a dessiner pour une barre d'aire donnee. */
export function barRadius(area: number): number {
  return Math.sqrt(area / Math.PI);
}

/**
 * Segment representant l'axe neutre, decoupe sur la boite englobante.
 *
 * La droite est { (y,z) : -y*sin(angle) + z*cos(angle) = offset }, exactement
 * la definition rendue par le solveur — aucune conversion, donc aucune
 * occasion de se tromper de signe.
 *
 * Methode : on intersecte la droite avec les quatre cotes de la boite et on
 * garde les points qui tombent reellement sur un cote. Rend `null` si la
 * droite ne traverse pas la boite.
 */
export function neutralAxisSegment(
  boite: BoundingBox,
  angle: number,
  offset: number
): Segment | null {
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  const TOL = 1e-9;

  const candidats: Point[] = [];

  // Cotes horizontaux : z fixe, on resout -y*s + z*c = offset en y.
  for (const z of [boite.zMin, boite.zMax]) {
    if (Math.abs(s) > TOL) {
      const y = (z * c - offset) / s;
      if (y >= boite.yMin - TOL && y <= boite.yMax + TOL) candidats.push({ y, z });
    }
  }

  // Cotes verticaux : y fixe, on resout en z.
  for (const y of [boite.yMin, boite.yMax]) {
    if (Math.abs(c) > TOL) {
      const z = (offset + y * s) / c;
      if (z >= boite.zMin - TOL && z <= boite.zMax + TOL) candidats.push({ y, z });
    }
  }

  if (candidats.length < 2) return null;

  // Deux intersections peuvent coincider (passage par un coin) : on retient
  // la paire la plus eloignee, qui est le segment traversant.
  let a = candidats[0];
  let b = candidats[1];
  let distanceMax = -1;
  for (let i = 0; i < candidats.length; i++) {
    for (let j = i + 1; j < candidats.length; j++) {
      const d = Math.hypot(candidats[i].y - candidats[j].y, candidats[i].z - candidats[j].z);
      if (d > distanceMax) {
        distanceMax = d;
        a = candidats[i];
        b = candidats[j];
      }
    }
  }

  return distanceMax > TOL ? { a, b } : null;
}
