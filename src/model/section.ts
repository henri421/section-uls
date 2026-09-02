import type { ConcreteMaterial } from './concrete';
import type { SteelMaterial } from './steel';
import type { RectangularGeometry } from '../geometry/rectangle';
import type { PolygonGeometry } from '../geometry/polygon';

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
  geometry: RectangularGeometry | PolygonGeometry;
  concrete: ConcreteMaterial;
  rebars: RebarLayer[];
}

export interface Action {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Moment flechissant (kN·m). */
  M: number;
}
