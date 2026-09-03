import type { NormProfile } from '../../src/model/norm-profile';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

/**
 * Profil normatif du banc de comparaison, LOCAL AUX FIXTURES.
 *
 * VCASLU travaille dans le cadre NTC, dont le seul ecart de coefficient
 * pertinent ici est alphaCc = 0.85. Ce profil n'est deliberement PAS exporte
 * par le module : la decision du projet est de ne publier qu'un seul profil,
 * `EC2_recommended`, l'utilisateur derivant lui-meme le sien pour son annexe
 * nationale.
 */
export function profilBancVcaslu(): NormProfile {
  return { ...ec2Recommended(), name: 'banc_VCASLU_NTC', alphaCc: 0.85 };
}

export interface CasVcaslu {
  nom: string;
  /**
   * Valeur relevee dans VCASLU : magnitude du moment resistant (kN·m) a
   * l'effort normal et dans la direction indiques. `null` tant que
   * l'utilisateur ne l'a pas saisie — le test est alors explicitement
   * ignore, pas faussement vert.
   */
  reference: number | null;
}

/** Tolerance de comparaison. Ne pas elargir sans accord explicite. */
export const TOLERANCE_RELATIVE = 0.05;

export const CAS: CasVcaslu[] = [
  { nom: 'poteau rectangulaire 300x500, N = 800 kN, moment a 30 deg', reference: null },
  { nom: 'section en T, flexion simple deviee a 45 deg', reference: null },
  { nom: 'pieu circulaire D600, N = 1200 kN, moment a 45 deg', reference: null },
];
