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

/** Etat de deformation ultime : pivot atteint et deformations aux fibres utiles. */
export interface EtatUltime {
  /** B : beton a eps_cu2 en fibre extreme ; C : section entierement comprimee. */
  pivot: 'B' | 'C';
  /** Raccourcissement de la fibre la plus comprimee (positif). */
  epsC: number;
  /** Deformation a la profondeur d : allongement positif, raccourcissement negatif. */
  epsS: number;
}

/**
 * Pivot et deformations, sur le champ de `ultimateStrainField` du noyau
 * (EN 1992-1-1 6.1(5), figure 6.1) : x <= h, pivot B (eps_cu2 en fibre
 * extreme) ; x > h, pivot C (eps_c2 a (1 − eps_c2/eps_cu2)·h de la fibre la
 * plus comprimee). Pas de pivot A : la loi de l'acier a un palier horizontal,
 * sans limite eps_ud.
 */
export function etatUltime(
  x: number,
  d: number,
  h: number,
  beton: { epsC2: number; epsCu2: number }
): EtatUltime {
  const { epsC2, epsCu2 } = beton;
  if (x <= h) return { pivot: 'B', epsC: epsCu2, epsS: (epsCu2 * (d - x)) / x };
  const profondeurC = (1 - epsC2 / epsCu2) * h;
  const champ = (z: number) => (epsC2 * (x - z)) / (x - profondeurC);
  return { pivot: 'C', epsC: champ(0), epsS: -champ(d) };
}

/** `z = d − 0,4·x`, la formule des abaques. */
export function simplifiedLeverArm(d: number, x: number): number {
  return d - 0.4 * x;
}
