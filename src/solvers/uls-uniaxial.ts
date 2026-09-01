import type { Section, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import { integrateRectangle } from '../integration/fiber-rectangle';

export interface UniaxialResult {
  /** Profondeur de l'axe neutre depuis la fibre superieure (mm). */
  neutralAxisDepth: number;
  /** Moment resistant a l'effort normal impose (kN·m). */
  M_Rd: number;
  /** Effort normal resultant au point de convergence (kN), doit egaler action.N. */
  N_Rd: number;
  converged: boolean;
}

/**
 * Verification ELU en flexion composee droite, section rectangulaire
 * (EN 1992-1-1). Recherche par bissection de la profondeur d'axe neutre x
 * telle que N_R(x) = N_Ed, avec le champ de deformation cale sur le pivot
 * beton (fibre superieure a epsCu2) — voir limitation documentee en tete du
 * plan de session 1 concernant le pivot acier.
 */
export function verifyUniaxial(section: Section, action: Action, norm: NormProfile): UniaxialResult {
  const { epsCu2 } = section.concrete;
  const height = section.geometry.height;

  const strainField = (x: number) => (xi: number) => epsCu2 * (1 - xi / x);

  const netForceAt = (x: number): number => integrateRectangle(section, strainField(x), norm.nBands).N;

  const xLow = 1e-3;
  const xHigh = 100 * height;
  const target = action.N;

  const fLow = netForceAt(xLow) - target;
  const fHigh = netForceAt(xHigh) - target;

  if (fLow > 0 || fHigh < 0) {
    return { neutralAxisDepth: NaN, M_Rd: NaN, N_Rd: NaN, converged: false };
  }

  let lo = xLow;
  let hi = xHigh;
  let x = (lo + hi) / 2;

  for (let iter = 0; iter < 60; iter++) {
    x = (lo + hi) / 2;
    const f = netForceAt(x) - target;
    if (f < 0) lo = x; else hi = x;
  }

  const result = integrateRectangle(section, strainField(x), norm.nBands);

  return { neutralAxisDepth: x, M_Rd: result.M, N_Rd: result.N, converged: true };
}
