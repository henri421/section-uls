import type { Section } from '../model/section';
import { polygonArea } from '../geometry/polygon';
import { rectangleToPolygon } from '../geometry/rectangle';

export interface ShearGeometry {
  /** Largeur d'ame (mm) : la largeur du rectangle. */
  bw: number;
  /** Hauteur utile (mm), jusqu'au CENTRE DE GRAVITE des armatures tendues. */
  d: number;
  /** Aire des armatures longitudinales tendues (mm²), pour rho_l. */
  Asl: number;
  /** Aire de beton de la section (mm²), pour sigma_cp. */
  Ac: number;
}

/**
 * Grandeurs geometriques du calcul d'effort tranchant (§6.2).
 *
 * `sensDuMoment` : `1` quand la fibre superieure est comprimee (traction en
 * bas), `-1` dans l'autre sens. La zone tendue en depend, donc `d` et `Asl`
 * aussi.
 *
 * ATTENTION — DEUX DEFINITIONS DE `d` COEXISTENT DANS CE DEPOT :
 *
 * - ici, `d` se mesure jusqu'au CENTRE DE GRAVITE des armatures tendues :
 *   c'est la definition de l'EC2, celle qu'appellent `rho_l`, `k` et `z` ;
 * - `effectiveDepth` de `app/src/lever-arm.ts` mesure, elle, jusqu'a LA BARRE
 *   LA PLUS ELOIGNEE. C'est une convention d'abaque, adoptee la-bas pour le
 *   bras de levier.
 *
 * Les deux coincident sur un lit unique et divergent des qu'il y en a
 * plusieurs. Les confondre fausserait `V_Rd,c` en silence, sans erreur ni
 * signe visible : ne pas substituer l'une a l'autre.
 *
 * Les armatures tendues sont celles situees du cote tendu du centre de
 * gravite de la section. C'est une convention geometrique, non un calcul
 * d'axe neutre : le §6.2.2 vise `A_sl`, l'armature de flexion ancree au-dela
 * de la section consideree, et sur une section flechie de facon courante les
 * deux se confondent.
 *
 * Restreint aux sections RECTANGULAIRES : `b_w` et `d` n'ont pas de
 * definition non ambigue sur une section circulaire, et l'EC2 ne la donne
 * pas. Une autre geometrie leve une erreur plutot que d'etre approximee.
 */
export function shearGeometry(section: Section, sensDuMoment: 1 | -1): ShearGeometry {
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      'shearGeometry : geometrie non rectangulaire. La largeur d ame b_w et la hauteur utile d ' +
        'du §6.2 ne sont pas definies sans ambiguite hors du rectangle, et l EC2 ne les donne pas.'
    );
  }

  const bw = section.geometry.width;
  const h = section.geometry.height;

  // Aire reelle de la section, par le meme calcul que partout ailleurs dans
  // le noyau : pas de `b*h` reconstruit a la main.
  const Ac = polygonArea(rectangleToPolygon(section.geometry).vertices);

  // z est positif vers le bas depuis le centroide. Fibre superieure
  // comprimee (sens +1) : les barres tendues sont celles de z > 0.
  const tendues = section.rebars.filter((r) => sensDuMoment * r.z > 0);

  if (tendues.length === 0) {
    throw new Error(
      'shearGeometry : aucune armature longitudinale tendue, la hauteur utile d est indefinie'
    );
  }

  const Asl = tendues.reduce((somme, r) => somme + r.area, 0);

  // Centre de gravite des armatures tendues, puis distance a la fibre
  // comprimee (le haut pour +1, le bas pour -1).
  const zBarycentre = tendues.reduce((somme, r) => somme + r.area * r.z, 0) / Asl;
  const d = h / 2 + sensDuMoment * zBarycentre;

  return { bw, d, Asl, Ac };
}
