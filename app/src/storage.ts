import { parseModel, serializeModel } from '../../src/index';
import type { SectionModel } from '../../src/index';

const CLE = 'section-uls:modele-courant';
const CLE_ECHEC = 'section-uls:modele-illisible';

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
 *
 * QUAND LA RELECTURE ECHOUE, LE TEXTE ILLISIBLE EST MIS DE COTE plutot que
 * laisse en place. Sans cela, le travail de l'utilisateur etait PERDU sans un
 * mot : la page repartait du modele par defaut, puis le premier recalcul
 * ecrasait la sauvegarde par ce modele par defaut. Une seule valeur refusee
 * par le format — un `h` a zero suffit — effacait toute une saisie.
 *
 * Le texte est conserve sous `CLE_ECHEC`, d'ou il reste recuperable a la main
 * dans le stockage du navigateur. On ne perd rien, meme ce qu'on ne sait plus
 * relire.
 */
export function chargerLocalement(): SectionModel | null {
  let texte: string | null = null;

  try {
    texte = localStorage.getItem(CLE);
  } catch {
    return null; // stockage indisponible : rien a recuperer
  }

  if (texte === null) return null;

  try {
    return parseModel(texte);
  } catch {
    mettreDeCote(texte);
    return null;
  }
}

/** Ecarte une sauvegarde devenue illisible, sans la detruire. */
function mettreDeCote(texte: string): void {
  try {
    localStorage.setItem(CLE_ECHEC, texte);
    localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : on continue sans */
  }
}

/** Derniere sauvegarde que le format a refusee, conservee pour ne rien perdre. */
export function sauvegardeIllisible(): string | null {
  try {
    return localStorage.getItem(CLE_ECHEC);
  } catch {
    return null;
  }
}

/**
 * Le telechargement, quel que soit ce qu'on telecharge.
 *
 * SEUL endroit du projet qui touche au navigateur pour faire sortir un
 * fichier : modele, dessin, tableau ou note passent tous par ici. Tout ce qui
 * COMPOSE ces documents est pur et vit dans `export.ts`.
 */
export function telecharger(nomFichier: string, contenu: string, typeMime: string): void {
  const blob = new Blob([contenu], { type: typeMime });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  URL.revokeObjectURL(url);
}

export function telechargerModele(model: SectionModel, nomFichier: string): void {
  telecharger(nomFichier, serializeModel(model), 'application/json');
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
