/**
 * Couche de configuration normative (EN 1992-1-1 §2.4.2.4, §3.1.6).
 * Aucune constante normative n'est codée en dur ailleurs dans le noyau —
 * toute grandeur qui dépend de l'annexe nationale provient d'un NormProfile.
 */
export interface NormProfile {
  name: string;
  gammaC: number;
  gammaS: number;
  alphaCc: number;
  /** Nombre de bandes pour la méthode des fibres (intégration/fiber-rectangle.ts). */
  nBands: number;
}
