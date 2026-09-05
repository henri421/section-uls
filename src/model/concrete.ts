import type { NormProfile } from './norm-profile';

export type ConcreteLaw = 'parabola-rectangle';

/**
 * Matériau béton avec paramètres dérivés (EN 1992-1-1 §3.1.6, §3.1.7, tableau 3.1).
 * Seule la loi parabole-rectangle est implémentée dans cette session.
 */
export interface ConcreteMaterial {
  fck: number;
  gammaC: number;
  alphaCc: number;
  fcd: number;
  law: ConcreteLaw;
  epsC2: number;
  epsCu2: number;
  n: number;
}

/**
 * Resistance moyenne a la traction directe (MPa), EN 1992-1-1 tableau 3.1.
 *
 * `f_ctm = 0,30·f_ck^(2/3)` jusqu'a C50/60, expression logarithmique au-dela.
 *
 * SOURCE UNIQUE dans le projet : la fissuration (§7.3.4), la courbure (§7.4.3)
 * et les dispositions constructives (§9.2.1.1) l'appellent toutes ici. Elle a
 * ete recopiee dans deux modules de service avant d'etre remontee ici ; il ne
 * doit pas en exister de seconde version.
 */
export function fctmDepuisFck(fck: number): number {
  return fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + (fck + 8) / 10);
}

export function createConcrete(fck: number, profile: NormProfile): ConcreteMaterial {
  const fcd = (profile.alphaCc * fck) / profile.gammaC;

  let epsC2: number;
  let epsCu2: number;
  let n: number;

  if (fck <= 50) {
    epsC2 = 2.0e-3;
    epsCu2 = 3.5e-3;
    n = 2;
  } else {
    epsC2 = (2.0 + 0.085 * Math.pow(fck - 50, 0.53)) * 1e-3;
    epsCu2 = (2.6 + 35 * Math.pow((90 - fck) / 100, 4)) * 1e-3;
    n = 1.4 + 23.4 * Math.pow((90 - fck) / 100, 4);
  }

  return {
    fck,
    gammaC: profile.gammaC,
    alphaCc: profile.alphaCc,
    fcd,
    law: 'parabola-rectangle',
    epsC2,
    epsCu2,
    n,
  };
}
