import type { Section, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import { integrateRectangle } from '../integration/fiber-rectangle';

export interface UniaxialResult {
  /** Profondeur de l'axe neutre depuis la fibre superieure (mm). */
  neutralAxisDepth: number;
  /**
   * Moment resistant a l'effort normal impose (kN·m).
   *
   * Directionnel : le pivot beton est toujours cale en xi=0 (fibre
   * superieure), donc M_Rd est la capacite pour une compression en fibre
   * superieure (flexion "positive" au sens de cette convention). Pour la
   * capacite en flexion inverse (compression en fibre inferieure), il faut
   * appeler verifyUniaxial sur une section miroir, avec les depthFromTop des
   * armatures inverses par rapport a la hauteur — ce n'est pas fait
   * automatiquement.
   */
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
 *
 * Le pivot est toujours en depthFromTop=0 : le M_Rd retourne ne couvre donc
 * que le sens de flexion "compression en fibre superieure" pour la `section`
 * fournie. Pour le sens oppose sur une section a ferraillage asymetrique,
 * l'appelant doit fournir une section miroir (armatures symetrisees en
 * depthFromTop) — voir la doc de UniaxialResult.M_Rd.
 */
export function verifyUniaxial(section: Section, action: Action, norm: NormProfile): UniaxialResult {
  const { epsCu2 } = section.concrete;
  const height = section.geometry.height;
  const zTop = -height / 2;

  // La bissection suppose N_R(x) strictement croissante en x. C'est vrai pour
  // les combinaisons de materiaux EC2 usuelles : Es domine la raideur tangente
  // initiale du beton, et le champ de deformation construit ici ne fait jamais
  // depasser epsCu2 a aucune fibre, donc la branche "ecrasee" non monotone de
  // concreteStress reste inatteignable. A revoir si une loi beton plus raide
  // ou une branche descendante pour l'acier est introduite.
  //
  // strainField(x) : x = profondeur de l'axe neutre depuis la fibre
  // superieure. Pour z (centroide-relatif, positif vers le bas), la
  // profondeur depuis le sommet est (z - zTop).
  const strainField = (x: number) => (z: number) => epsCu2 * (1 - (z - zTop) / x);

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
