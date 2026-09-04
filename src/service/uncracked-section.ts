import type { Section } from '../model/section';
import type { HomogenisedProperties } from './cracked-section';
import { crackedProperties } from './cracked-section';

/**
 * Caracteristiques de la section homogeneisee NON FISSUREE.
 *
 * Tout le beton participe, et toutes les armatures comptent pour `(n-1)·A` :
 * aucune n'est dans une zone fissuree, donc toutes deplacent du beton.
 *
 * C'est l'etat I du §7.4.3, celui d'une section dont le moment reste sous le
 * moment de fissuration. Il comble aussi un angle mort de la session 6, qui
 * REFUSE les sections non fissurees parce que son hypothese de fissuration y
 * est caduque.
 *
 * Mise en oeuvre : c'est exactement `crackedProperties` avec un axe neutre
 * rejete a l'infini — « tout est comprime » signifie « rien n'est fissure ».
 * Reutiliser l'integration deja validee vaut mieux que d'en ecrire une
 * seconde qui pourrait en diverger.
 */
export function uncrackedProperties(
  section: Section,
  n: number,
  nBands: number
): HomogenisedProperties {
  return crackedProperties(section, Number.POSITIVE_INFINITY, n, nBands);
}
