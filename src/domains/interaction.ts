import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import { capacityAtAngle } from '../solvers/uls-biaxial';
import { concretePivotStrainField } from '../solvers/uls-uniaxial';
import { integratePolygonBiaxial } from '../integration/fiber-polygon-biaxial';
import { rotateSection } from '../geometry/rotate';

export interface MomentPoint {
  /** Inclinaison de l'axe neutre ayant produit ce point (rad) — le parametre du balayage. */
  neutralAxisAngle: number;
  My: number;
  Mz: number;
}

/**
 * Contour du domaine resistant dans le plan des moments, a effort normal
 * fixe — le diagramme My-Mz.
 *
 * On balaye l'inclinaison de l'AXE NEUTRE, pas la direction du moment. Les
 * deux decrivent la meme courbe, mais balayer la direction du moment
 * obligerait a une recherche de racine par point (une vingtaine de
 * resolutions droites chacune), la ou balayer l'inclinaison n'en demande
 * qu'une seule. Contrepartie : les points ne sont pas regulierement espaces
 * en direction de moment, ce qui est sans consequence pour un trace.
 *
 * La courbe est FERMEE : le dernier point ne repete pas le premier, c'est a
 * l'appelant de refermer le trace.
 *
 * Une orientation ou l'effort normal est hors plage resistante produit un
 * TROU : le point est omis plutot qu'invente. Le nombre de points rendus
 * peut donc etre inferieur a `steps`.
 *
 * Limitation reconduite des sessions precedentes : seule la branche du pivot
 * beton est parcourue (la loi acier a branche horizontale n'impose aucune
 * limite de deformation, donc aucun pivot acier n'existe dans le modele).
 */
export function interactionCurveAtN(
  section: Section,
  N: number,
  norm: NormProfile,
  options?: { steps?: number }
): MomentPoint[] {
  const steps = options?.steps ?? 72;
  const points: MomentPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const theta = (2 * Math.PI * i) / steps;
    const etat = capacityAtAngle(section, theta, N, norm);
    if (!etat) continue;
    points.push({ neutralAxisAngle: theta, My: etat.M.y, Mz: etat.M.z });
  }

  return points;
}

export interface AxialMomentPoint {
  neutralAxisDepth: number;
  N: number;
  M: number;
}

/**
 * Diagramme N-M en flexion droite.
 *
 * Aucune resolution n'est necessaire : chaque profondeur d'axe neutre donne
 * directement son couple (N, M) par une simple integration. Le balayage est
 * GEOMETRIQUE et non lineaire, entre les memes bornes que la bissection du
 * solveur droit, parce que la plage utile s'etend sur plusieurs ordres de
 * grandeur — une profondeur faible donne la traction dominante, une
 * profondeur grande la compression quasi uniforme.
 *
 * Limitation reconduite : seule la branche du pivot beton est parcourue.
 */
export function interactionCurveNM(
  section: Section,
  norm: NormProfile,
  options?: { steps?: number }
): AxialMomentPoint[] {
  const steps = options?.steps ?? 72;
  const { epsCu2 } = section.concrete;

  // On passe par le repere « tourne de zero » pour disposer d'une geometrie
  // polygonale quelle que soit la forme d'entree, sans dupliquer la
  // conversion rectangle -> polygone.
  const polygonale = rotateSection(section, 0);
  const zValues = polygonale.geometry.vertices.map((v) => v.z);
  const zTop = Math.min(...zValues);
  const hauteur = Math.max(...zValues) - zTop;

  const xMin = 1e-3 * hauteur;
  const xMax = 100 * hauteur;
  const points: AxialMomentPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const x = xMin * Math.pow(xMax / xMin, t); // progression geometrique
    const champ = concretePivotStrainField(zTop, x, epsCu2);
    const r = integratePolygonBiaxial(polygonale, champ, norm.nBands);
    points.push({ neutralAxisDepth: x, N: r.N, M: r.My });
  }

  return points;
}

export interface DiagramPointNM extends AxialMomentPoint {
  /**
   * Sens de flexion : `1` quand la fibre superieure est comprimee (la branche
   * de `interactionCurveNM`), `-1` pour la branche opposee, obtenue sur la
   * section tournee de pi. `neutralAxisDepth` se mesure toujours depuis la
   * fibre comprimee de SA branche.
   */
  sense: 1 | -1;
}

/**
 * Diagramme N-M COMPLET : les deux sens de flexion.
 *
 * `interactionCurveNM` balaye la profondeur d'axe neutre depuis la fibre
 * superieure, donc ne decrit que les moments d'un seul signe. La branche
 * opposee s'obtient en balayant la section TOURNEE DE PI : la rotation envoie
 * (y, z) sur (-y, -z), donc le moment rendu dans le repere tourne vaut
 * l'oppose du moment dans le repere de la section (M_section = -M_tourne),
 * tandis que l'effort normal est invariant. Aucune approximation, aucune
 * mecanique nouvelle.
 *
 * Sur une section symetriquement armee les deux branches sont miroir et
 * l'omission ne se voit pas. Sur une section a ferraillage dissymetrique —
 * dalle a deux nappes inegales, section en T, voile — elles different, et
 * n'en tracer qu'une cache la moitie du domaine.
 *
 * ORDRE DES POINTS : branche opposee dans l'ordre du balayage, puis branche
 * positive A L'ENVERS. Le contour est donc parcourable d'un seul trait, en
 * montant du cote traction jusqu'a la compression maximale puis en
 * redescendant vers la traction de l'autre sens.
 *
 * AUCUN POINT DE FERMETURE n'est ajoute entre les deux extremites, et ce
 * n'est pas un oubli : le noyau ne parcourt que la branche du pivot beton
 * (la loi acier bilineaire a branche horizontale n'impose aucune deformation
 * limite, donc aucun pivot acier n'existe dans le modele), il n'atteint donc
 * jamais la traction pure N = -A_s*f_yd. Refermer le contour dessinerait un
 * domaine qui n'a pas ete calcule — credible et faux.
 */
export function interactionDiagramNM(
  section: Section,
  norm: NormProfile,
  options?: { steps?: number }
): DiagramPointNM[] {
  const positive = interactionCurveNM(section, norm, options);
  const opposee = interactionCurveNM(rotateSection(section, Math.PI), norm, options).map(
    (p): DiagramPointNM => ({
      neutralAxisDepth: p.neutralAxisDepth,
      N: p.N,
      M: -p.M,
      sense: -1,
    })
  );

  return [
    ...opposee,
    ...positive.map((p): DiagramPointNM => ({ ...p, sense: 1 })).reverse(),
  ];
}
