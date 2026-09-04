import { parseModel, serializeModel } from '../../src/index';
import type { SectionModel } from '../../src/index';

const CLE = 'section-uls:modele-courant';

/**
 * Sauvegarde locale du travail en cours. Silencieuse en cas d'echec : un
 * stockage indisponible (navigation privee, quota depasse) ne doit pas
 * empecher de calculer.
 */
export function sauvegarderLocalement(model: SectionModel): void {
  try {
    localStorage.setItem(CLE, serializeModel(model));
  } catch {
    /* stockage indisponible : on continue sans */
  }
}

/**
 * Rend `null` si rien n'est stocke, ou si ce qui l'est n'est plus lisible
 * (format ancien, donnee corrompue) — jamais une exception a l'ouverture.
 */
export function chargerLocalement(): SectionModel | null {
  try {
    const texte = localStorage.getItem(CLE);
    return texte === null ? null : parseModel(texte);
  } catch {
    return null;
  }
}

export function telechargerModele(model: SectionModel, nomFichier: string): void {
  const blob = new Blob([serializeModel(model)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}

/**
 * Lit un modele depuis un fichier choisi par l'utilisateur.
 *
 * `parseModel` leve une erreur nommant le champ fautif : on la laisse
 * remonter telle quelle, c'est toute son utilite.
 */
export async function lireFichier(fichier: File): Promise<SectionModel> {
  return parseModel(await fichier.text());
}
