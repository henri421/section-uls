import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section } from '../model/section';
import type { PolygonGeometry } from './polygon';

export interface RectangularGeometry {
  kind: 'rectangle';
  /** Largeur (mm). */
  width: number;
  /** Hauteur totale (mm). */
  height: number;
}

/**
 * Constructeur rectangle : son parametre public `rebars` prend `depthFromTop`
 * (mesure depuis la fibre superieure/comprimee), l'usage naturel pour coter
 * un enrobage de poutre, puis le convertit en `z` centre-centroide (stockage
 * uniforme de `RebarLayer`). D'autres constructeurs de geometrie (polygone,
 * cercle — sessions suivantes) pourront exposer une convention d'entree
 * differente, propre a leur geometrie, sans changer ce stockage.
 */
export function rectangularSection(params: {
  width: number;
  height: number;
  concrete: ConcreteMaterial;
  rebars: Array<{ depthFromTop: number; area: number; steel: SteelMaterial }>;
}): Section & { geometry: RectangularGeometry } {
  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars: params.rebars.map((r) => ({
      y: 0,
      z: r.depthFromTop - params.height / 2,
      area: r.area,
      steel: r.steel,
    })),
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
