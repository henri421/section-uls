import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section, RebarLayer } from '../model/section';
import type { PolygonGeometry } from './polygon';

export interface RectangularGeometry {
  kind: 'rectangle';
  /** Largeur (mm). */
  width: number;
  /** Hauteur totale (mm). */
  height: number;
}

type RebarParDepth = { depthFromTop: number; area: number; steel: SteelMaterial };

/**
 * Constructeur rectangle. Le parametre `rebars` accepte deux formes :
 *
 * - `depthFromTop` (forme historique, session 1) : cotation depuis la fibre
 *   superieure, usage naturel pour un enrobage de poutre. Les barres sont
 *   alors placees a `y = 0` — suffisant en flexion droite, ou seule la
 *   position verticale intervient.
 * - `RebarLayer[]` deja positionnes en `(y, z)` barycentriques, ce que
 *   produit `rectangularRebarLayout`. Indispensable en flexion deviee, ou la
 *   position horizontale de chaque barre change sa deformation.
 */
export function rectangularSection(params: {
  width: number;
  height: number;
  concrete: ConcreteMaterial;
  rebars: RebarParDepth[] | RebarLayer[];
}): Section & { geometry: RectangularGeometry } {
  const rebars: RebarLayer[] = params.rebars.map((r: RebarParDepth | RebarLayer) =>
    'depthFromTop' in r
      ? { y: 0, z: r.depthFromTop - params.height / 2, area: r.area, steel: r.steel }
      : r
  );

  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars,
  };
}

/**
 * Contour polygonal equivalent a un rectangle, dans le repere barycentrique
 * (origine au centre, z vers le bas). Necessaire des que la section doit
 * etre tournee : un rectangle tourne n'est plus aligne sur les axes, donc
 * n'est plus representable par une `RectangularGeometry`.
 */
export function rectangleToPolygon(geometry: RectangularGeometry): PolygonGeometry {
  const { width: b, height: h } = geometry;
  return {
    kind: 'polygon',
    vertices: [
      { y: -b / 2, z: -h / 2 },
      { y: +b / 2, z: -h / 2 },
      { y: +b / 2, z: +h / 2 },
      { y: -b / 2, z: +h / 2 },
    ],
  };
}
