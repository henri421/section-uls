/**
 * Annexe nationale (audit R4, lot E) : valeurs recommandees ou Luxembourg.
 *
 * Le noyau ne connait aucune annexe (`ec2Recommended`) ; l'outil preremplit gamma_c,
 * gamma_s et alpha_cc selon l'annexe choisie, et l'utilisateur peut changer chacun.
 * Le nom du profil enregistre dit l'annexe et si une valeur a ete changee :
 * EC2_recommended, EC2_personnalise, EC2_LU, EC2_LU_personnalise.
 */
import { valeurLu, type AnnexeNationale } from 'aedificium-ui';
import { ec2Recommended } from '../../src/index';

export const COEFS = ['gammaC', 'gammaS', 'alphaCc'] as const;
export type Coef = (typeof COEFS)[number];

const CLAUSES: Record<Coef, string> = {
  gammaC: 'tableau 2.1N',
  gammaS: 'tableau 2.1N',
  alphaCc: '3.1.6(1)P',
};
const CLES_LU: Record<Coef, string> = { gammaC: 'gamma_C', gammaS: 'gamma_S', alphaCc: 'alpha_cc' };

/** Valeur et source de chaque coefficient pour l'annexe choisie. */
export function coefsDeLAnnexe(a: AnnexeNationale): Record<Coef, { valeur: number; source: string }> {
  const rec = ec2Recommended();
  const sortie = {} as Record<Coef, { valeur: number; source: string }>;
  for (const k of COEFS) {
    const r = { valeur: rec[k], source: `EN 1992-1-1:2004, valeur recommandée, ${CLAUSES[k]}` };
    sortie[k] = a === 'lu' ? valeurLu('EN 1992-1-1', CLES_LU[k], r, CLAUSES[k]) : r;
  }
  return sortie;
}

export function annexeDuNom(nom: string): AnnexeNationale {
  return nom.startsWith('EC2_LU') ? 'lu' : 'recommande';
}

export function nomDuProfil(a: AnnexeNationale, personnalise: boolean): string {
  if (a === 'lu') return personnalise ? 'EC2_LU_personnalise' : 'EC2_LU';
  return personnalise ? 'EC2_personnalise' : 'EC2_recommended';
}
