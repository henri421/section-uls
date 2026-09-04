import type { Section } from '../../src/index';
import { zetaOf, outlineOf } from './draw';

/**
 * Bras de levier SIMPLIFIE, celui des abaques : `z = d − 0,4·x`.
 *
 * C'est la lecture usuelle du dimensionnement — celle des tables `μ → z/d` —
 * fondee sur le bloc de contrainte rectangulaire, dont la resultante se situe
 * a `0,4·x` de la fibre la plus comprimee.
 *
 * A NE PAS CONFONDRE avec la distance entre resultantes rendue par le noyau,
 * qui separe les resultantes de compression et de traction TOTALES. Les deux
 * different des qu'une seconde nappe se trouve du cote tendu : celle-ci
 * deplace le centre de gravite de la traction vers l'axe neutre, alors que
 * `d − 0,4x` ne regarde que la nappe la plus eloignee. Sur une dalle a deux
 * nappes, l'ecart depasse couramment 10 %.
 *
 * Les deux grandeurs sont exactes ; elles ne mesurent simplement pas la meme
 * chose, et l'interface affiche les deux plutot que d'arbitrer a la place de
 * l'ingenieur.
 */

/**
 * Hauteur utile mesuree PERPENDICULAIREMENT a l'axe neutre : de la fibre la
 * plus comprimee jusqu'a l'armature tendue la plus eloignee.
 *
 * Cette definition redonne le `d` habituel en flexion droite, et reste
 * valable en flexion deviee, ou la « hauteur » n'a de sens que dans la
 * direction perpendiculaire a l'axe neutre.
 *
 * Rend `null` s'il n'y a aucune armature tendue : le bras de levier n'a
 * alors pas de sens, et vaut mieux ne rien afficher qu'un nombre.
 */
export function effectiveDepth(section: Section, angle: number, offset: number): number | null {
  const contour = outlineOf(section);
  if (contour.length === 0) return null;

  const zetaFibreExtreme = Math.min(...contour.map((p) => zetaOf(p, angle)));

  const zetasTendus = section.rebars
    .map((r) => zetaOf({ y: r.y, z: r.z }, angle))
    .filter((zeta) => zeta > offset);

  if (zetasTendus.length === 0) return null;

  return Math.max(...zetasTendus) - zetaFibreExtreme;
}

/** `z = d − 0,4·x`, la formule des abaques. */
export function simplifiedLeverArm(d: number, x: number): number {
  return d - 0.4 * x;
}
