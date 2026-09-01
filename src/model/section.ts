import type { ConcreteMaterial } from './concrete';
import type { SteelMaterial } from './steel';
import type { RectangularGeometry } from '../geometry/rectangle';

/**
 * Convention geometrique (fixee, ne change plus une fois la session 1 entamee) :
 * - reperage barycentrique de la section brute de beton ;
 * - profondeur mesuree depuis la fibre superieure (comprimee), croissante vers le bas ;
 * - N positif en compression, deformations positives en compression.
 */
export interface RebarLayer {
  /** Aire de l'armature (mm²). */
  area: number;
  /** Profondeur depuis la fibre superieure (mm). */
  depthFromTop: number;
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

export function rectangularSection(params: {
  width: number;
  height: number;
  concrete: ConcreteMaterial;
  rebars: RebarLayer[];
}): Section {
  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars: params.rebars,
  };
}
