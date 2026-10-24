import { nombreAffiche, tauxAffiche } from 'aedificium-ui';

/**
 * Nombre a la francaise, trois decimales au plus et sans zero inutile
 * (`nombreAffiche` d'aedificium-ui). Un NaN ou un infini s'affiche en tiret.
 */
export function formatNumber(valeur: number, decimales: number): string {
  return nombreAffiche(valeur, Math.min(decimales, 3));
}

export function formatAngleDegrees(radians: number): string {
  return formatNumber((radians * 180) / Math.PI, 1);
}

/**
 * Met en forme un taux d'exploitation SANS jamais franchir 1 par arrondi.
 *
 * Le piege : `(0.999).toFixed(2)` donne « 1.00 », qui s'afficherait a cote
 * d'un verdict favorable et laisserait croire que la section est exactement
 * a la limite ; symetriquement `(1.001).toFixed(2)` donne aussi « 1.00 »,
 * a cote d'un verdict defavorable cette fois. Dans les deux cas l'affichage
 * contredit la conclusion. On arrondit donc VERS LE BAS sous 1 et VERS LE
 * HAUT au-dessus, de sorte que le nombre lu et le verdict racontent toujours
 * la meme histoire. Le cas d'egalite exacte s'ecrit « 1 ».
 */
export function formatUtilization(taux: number): string {
  return tauxAffiche(taux);
}
