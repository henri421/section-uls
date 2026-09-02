import type { Section, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { RectangularGeometry } from '../geometry/rectangle';
import type { PolygonGeometry } from '../geometry/polygon';
import { integrateRectangle } from '../integration/fiber-rectangle';
import { integratePolygon } from '../integration/fiber-polygon';
import type { StressResultant } from '../integration/fiber-rectangle';

export interface UniaxialResult {
  /** Profondeur de l'axe neutre depuis la fibre superieure (mm). */
  neutralAxisDepth: number;
  /** Moment resistant a l'effort normal impose (kN·m). */
  M_Rd: number;
  /** Effort normal resultant au point de convergence (kN), doit egaler action.N. */
  N_Rd: number;
  converged: boolean;
}

function zRange(section: Section): { zTop: number; zBottom: number } {
  if (section.geometry.kind === 'rectangle') {
    const { height } = section.geometry;
    return { zTop: -height / 2, zBottom: height / 2 };
  }
  const zValues = section.geometry.vertices.map((v) => v.z);
  return { zTop: Math.min(...zValues), zBottom: Math.max(...zValues) };
}

function integrate(section: Section, strainAt: (z: number) => number, nBands: number): StressResultant {
  if (section.geometry.kind === 'rectangle') {
    return integrateRectangle(section as Section & { geometry: RectangularGeometry }, strainAt, nBands);
  }
  return integratePolygon(section as Section & { geometry: PolygonGeometry }, strainAt, nBands);
}

/**
 * Verification ELU en flexion composee droite (EN 1992-1-1), pour une
 * section rectangulaire ou polygonale quelconque. Recherche par bissection
 * de la profondeur d'axe neutre x telle que N_R(x) = N_Ed, avec le champ de
 * deformation cale sur le pivot beton (fibre superieure a epsCu2) — voir
 * limitation documentee en tete du plan de session 1 concernant le pivot
 * acier (toujours valable : SteelMaterial n'a pas de limite de deformation
 * cette session).
 *
 * Le pivot est toujours en zTop (fibre la plus haute de la geometrie) : le
 * M_Rd retourne ne couvre donc que le sens de flexion "compression en fibre
 * superieure" pour la `section` fournie. Pour le sens oppose sur une
 * section a ferraillage asymetrique, l'appelant doit fournir une section
 * miroir (armatures et geometrie symetrisees en z).
 */
export function verifyUniaxial(section: Section, action: Action, norm: NormProfile): UniaxialResult {
  const { epsCu2 } = section.concrete;
  const { zTop, zBottom } = zRange(section);
  const totalDepth = zBottom - zTop;

  // La bissection suppose N_R(x) strictement croissante en x — voir la note
  // de la session 1 sur la raideur tangente du beton vs. l'acier.
  const strainField = (x: number) => (z: number) => epsCu2 * (1 - (z - zTop) / x);

  const netForceAt = (x: number): number => integrate(section, strainField(x), norm.nBands).N;

  const xLow = 1e-3;
  const xHigh = 100 * totalDepth;
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

  const result = integrate(section, strainField(x), norm.nBands);

  return { neutralAxisDepth: x, M_Rd: result.M, N_Rd: result.N, converged: true };
}
