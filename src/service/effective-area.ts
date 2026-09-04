import type { Section, RebarLayer } from '../model/section';

export interface EffectiveTensionArea {
  /** Hauteur effective de beton tendu (mm), §7.3.2(3). */
  hcEff: number;
  /** Aire effective de beton tendu (mm²). */
  acEff: number;
  /** Aire des armatures SITUEES dans l'aire effective (mm²). */
  asEff: number;
  /** Les barres retenues, dans l'ordre de la section. */
  bars: RebarLayer[];
  /** Hauteur utile (mm), depuis la fibre comprimee. */
  d: number;
}

/**
 * Diametre d'une barre deduit de son aire.
 *
 * EXACT tant qu'un `RebarLayer` represente UNE barre — ce que produisent
 * `rebarRow`, `rectangularRebarLayout` et `circularRebarCage` depuis la
 * session 3. Un lit forfaitise a la main en une seule entree d'aire cumulee
 * donnerait un diametre trop grand : c'est une limite a connaitre, pas un
 * defaut du calcul.
 */
export function barDiameterOf(area: number): number {
  return Math.sqrt((4 * area) / Math.PI);
}

/** Diametre equivalent d'un groupe de barres (§7.3.4(3), eq. 7.12). */
export function equivalentBarDiameter(areas: number[]): number {
  let numerateur = 0;
  let denominateur = 0;
  for (const aire of areas) {
    const phi = barDiameterOf(aire);
    numerateur += phi * phi;
    denominateur += phi;
  }
  return denominateur === 0 ? 0 : numerateur / denominateur;
}

/**
 * Aire effective de beton tendu entourant les armatures (§7.3.2(3)).
 *
 * `x` est la profondeur d'axe neutre DEPUIS LA FIBRE COMPRIMEE, telle que
 * la rend le calcul de service de la session 6.
 *
 * Restreint aux sections RECTANGULAIRES : les formules de la norme sont
 * ecrites pour une zone tendue de largeur constante. Les appliquer a une
 * section en T ou a un pieu serait un abus, donc une geometrie non
 * rectangulaire leve une erreur plutot que d'etre approximee en silence.
 */
export function effectiveTensionArea(section: Section, x: number): EffectiveTensionArea {
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      "effectiveTensionArea : geometrie non rectangulaire. Les formules d'aire effective " +
        'du §7.3.2(3) supposent une zone tendue de largeur constante et ne sont pas transposables telles quelles.'
    );
  }

  const b = section.geometry.width;
  const h = section.geometry.height;
  const zTop = -h / 2;

  // Hauteur utile : jusqu'a la barre tendue la plus eloignee de la fibre
  // comprimee. En l'absence d'armature, la notion n'a pas de sens.
  if (section.rebars.length === 0) {
    throw new Error('effectiveTensionArea : section sans armature, aire effective indefinie');
  }
  const zPlusBas = Math.max(...section.rebars.map((r) => r.z));
  const d = zPlusBas - zTop;

  const hcEff = Math.min(2.5 * (h - d), (h - x) / 3, h / 2);
  const acEff = b * hcEff;

  // La bande effective part de la FACE TENDUE et remonte de `hcEff`.
  const zDebutBande = h / 2 - hcEff;
  const bars = section.rebars.filter((r) => r.z >= zDebutBande);
  const asEff = bars.reduce((somme, r) => somme + r.area, 0);

  return { hcEff, acEff, asEff, bars, d };
}
