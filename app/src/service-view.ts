import type { Section } from '../../src/index';
import { formatNumber } from './format';

/**
 * Presentation des verifications de service (§7.2, §7.3, §7.4.3).
 *
 * Fonctions PURES, sans DOM et sans mecanique : elles mettent en forme ce que
 * le noyau a rendu, elles ne recalculent rien.
 *
 * Le parti pris du module : un echec de verification de service n est pas une
 * panne, c est un RESULTAT. Section entierement comprimee, geometrie non
 * rectangulaire, flexion deviee — trois cas legitimes et frequents, qui
 * doivent s afficher aussi proprement qu un succes. Traites dans le cablage,
 * ils deviendraient des `if` disperses et non testes ; ici ce sont des
 * donnees comme les autres.
 */

/**
 * Ce qui empeche TOUTE verification de service, ou `null`.
 *
 * `verifyServiceUniaxial`, `verifyCrackWidth` et `sectionCurvature` prennent
 * une `Action` UNIAXIALE `{ N, M }`. Un Mz non nul les met donc tous les
 * trois hors domaine. Le dire une fois, clairement, plutot que de projeter en
 * douce le moment sur un axe — ce qui serait un mensonge silencieux.
 */
export function obstacleService(Mz: number): string | null {
  if (Mz === 0) return null;

  return (
    `Flexion deviee (Mz = ${formatNumber(Mz, 1)} kN·m). ` +
    'Les verifications de service du §7.2, du §7.3 et du §7.4.3 supposent une flexion ' +
    'droite et ne prennent qu un moment unique. Annuler Mz pour les obtenir.'
  );
}

/**
 * Ce qui empeche la seule verification de fissuration, ou `null`.
 *
 * `verifyCrackWidth` LEVE une erreur sur toute geometrie non rectangulaire —
 * garde explicite en tete de fonction. Les deux autres verifications, elles,
 * acceptent les polygones : le motif le dit, pour que l utilisateur ne croie
 * pas tout le service perdu.
 */
export function obstacleFissuration(section: Section): string | null {
  if (section.geometry.kind === 'rectangle') return null;

  return (
    'Geometrie non rectangulaire. Les formules du §7.3.4 supposent une zone tendue ' +
    'rectangulaire et ne sont pas transposables telles quelles. Les contraintes (§7.2) ' +
    'et la courbure (§7.4.3) restent calculables.'
  );
}
