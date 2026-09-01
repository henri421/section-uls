import type { NormProfile } from './norm-profile';

/**
 * Matériau acier, branche horizontale (EN 1992-1-1 §3.2.7 éq. 3.8) —
 * pas de limite de deformation dans cette session (voir en-tete du plan).
 */
export interface SteelMaterial {
  fyk: number;
  gammaS: number;
  Es: number;
  fyd: number;
  epsYd: number;
}

export function createSteel(fyk: number, Es: number, profile: NormProfile): SteelMaterial {
  const fyd = fyk / profile.gammaS;
  const epsYd = fyd / Es;
  return { fyk, gammaS: profile.gammaS, Es, fyd, epsYd };
}
