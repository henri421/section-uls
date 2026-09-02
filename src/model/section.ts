import type { ConcreteMaterial } from './concrete';
import type { SteelMaterial } from './steel';
import type { RectangularGeometry } from '../geometry/rectangle';

/**
 * Convention geometrique (fixee) : repere barycentrique centre sur le
 * centroide reel de la section, z positif vers le bas, y horizontal
 * (inutilise en flexion droite). N positif en compression.
 */
export interface RebarLayer {
  /** Position horizontale depuis le centroide (mm). Inutilise en flexion droite. */
  y: number;
  /** Position verticale depuis le centroide, positif vers le bas (mm). */
  z: number;
  /** Aire de l'armature (mm²). */
  area: number;
  steel: SteelMaterial;
}

export interface Section {
  geometry: RectangularGeometry;
  concrete: ConcreteMaterial;
  rebars: RebarLayer[];
}

export interface Action {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Moment flechissant (kN·m). */
  M: number;
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
}): Section {
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
