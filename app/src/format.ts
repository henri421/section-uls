/** Separateur decimal francais, conforme aux libelles de l'interface. */
function virgule(texte: string): string {
  return texte.replace('.', ',');
}

export function formatNumber(valeur: number, decimales: number): string {
  return virgule(valeur.toFixed(decimales));
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
 * la meme histoire. Le cas d'egalite exacte reste « 1,00 ».
 */
export function formatUtilization(taux: number): string {
  if (!Number.isFinite(taux)) return 'hors domaine';
  if (taux === 1) return '1,00';

  const facteur = 100;
  const arrondi =
    taux < 1 ? Math.floor(taux * facteur) / facteur : Math.ceil(taux * facteur) / facteur;

  return formatNumber(arrondi, 2);
}
