import type { NormProfile } from '../model/norm-profile';

/**
 * Valeurs recommandées de l'EN 1992-1-1, sans modification d'annexe nationale.
 * L'utilisateur du module définit lui-même ses propres coefficients d'annexe
 * (belge, luxembourgeoise ou autre) en dérivant un NormProfile personnalisé —
 * aucune annexe nationale spécifique n'est codée dans le noyau.
 */
export function ec2Recommended(): NormProfile {
  return {
    name: 'EC2_recommended',
    gammaC: 1.5, // §2.4.2.4, tableau 2.1N
    gammaS: 1.15, // §2.4.2.4, tableau 2.1N
    alphaCc: 1.0, // §3.1.6(1)P, éq. 3.15, valeur recommandée
    nBands: 200,
  };
}
