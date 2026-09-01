import type { SteelMaterial } from '../model/steel';

/**
 * Loi bilineaire, branche horizontale (EN 1992-1-1 §3.2.7 éq. 3.8).
 * Convention : deformation positive en compression. Pas de limite de
 * deformation (branche inclinee avec epsUd hors scope de cette session).
 */
export function steelStress(eps: number, steel: SteelMaterial): number {
  const { Es, fyd, epsYd } = steel;

  if (eps >= epsYd) return fyd;
  if (eps <= -epsYd) return -fyd;
  return Es * eps;
}
