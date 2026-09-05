import type { Section } from '../model/section';
import type { SteelMaterial } from '../model/steel';
import { fctmDepuisFck } from '../model/concrete';
import { polygonArea } from '../geometry/polygon';
import { rectangleToPolygon } from '../geometry/rectangle';

/**
 * Type d'element porteur.
 *
 * C'EST UNE SAISIE, JAMAIS UNE DEDUCTION. Un 300x500 est une poutre ou un
 * poteau selon son role dans la structure, ce qu'aucune geometrie ne dit, et
 * les regles du §9 different. Deviner produirait des verdicts faux et
 * inexplicables : le type est declare par l'utilisateur.
 */
export type ElementType = 'beam' | 'slab' | 'column';

export interface LongitudinalOptions {
  /**
   * Hauteur utile (mm), de la fibre la plus comprimee au CENTRE DE GRAVITE
   * des armatures tendues — la definition de l'EN 1992-1-1.
   *
   * Par defaut deduite de la section, les armatures tendues etant celles
   * situees sous le centroide (`z > 0`), c'est-a-dire la convention de
   * flexion positive deja retenue par le calcul de service. Sur une section
   * en moment negatif, imposer `d` explicitement.
   *
   * A NE PAS CONFONDRE avec `effectiveDepth` de l'interface, qui mesure
   * jusqu'a la barre la PLUS ELOIGNEE — une convention d'abaque. Les deux
   * different des qu'il y a plusieurs lits tendus.
   */
  d?: number;
  /**
   * Effort normal de calcul (kN, positif en compression). OBLIGATOIRE pour un
   * poteau : le minimum du §9.5.2 en depend, et c'est une entree du calcul,
   * pas une propriete de la section.
   */
  NEd?: number;
  /**
   * Acier de reference. Par defaut celui de la premiere armature de la
   * section ; a fournir lorsque la section n'en porte aucune, cas ou le
   * minimum reste evidemment a calculer.
   */
  steel?: SteelMaterial;
}

export interface LongitudinalCheck {
  /** Aire d'acier longitudinal reellement en place (mm²). */
  asProvided: number;
  /** Minimum requis (mm²). */
  asMin: number;
  /** Maximum admis (mm²). */
  asMax: number;
  underReinforced: boolean;
  overReinforced: boolean;
  ok: boolean;
}

/** Aire de beton REELLE de la section (mm²), contour polygonal compris. */
export function concreteArea(section: Section): number {
  const contour =
    section.geometry.kind === 'rectangle'
      ? rectangleToPolygon(section.geometry)
      : section.geometry;
  return polygonArea(contour.vertices);
}

/**
 * Aire d'acier longitudinal en place (mm²) : tous les lits, tendus et
 * comprimes.
 *
 * LIMITE ASSUMEE. Le §9.2.1.1(3) enonce le maximum de poutre sur l'armature
 * TENDUE d'une part et l'armature COMPRIMEE d'autre part, alors que le
 * §9.5.2(3) l'enonce sur le total du poteau. Distinguer les deux faces
 * demanderait de savoir laquelle est tendue, donc de deviner le sens du
 * moment ; on compare ici le total dans les trois cas. C'est le sens
 * SECURITAIRE — une poutre a deux nappes symetriques peut donc etre signalee
 * sur-armee alors que chaque nappe prise a part reste sous 0,04·Ac.
 */
export function providedLongitudinalArea(section: Section): number {
  return section.rebars.reduce((somme, r) => somme + r.area, 0);
}

/** Acier de reference : celui fourni en option, sinon celui de la section. */
function acierDeReference(section: Section, options?: LongitudinalOptions): SteelMaterial {
  const steel = options?.steel ?? section.rebars[0]?.steel;
  if (steel === undefined) {
    throw new Error(
      'minimumLongitudinalArea : section sans armature et sans acier de reference. ' +
        "Fournir `steel` en option pour connaitre fyk et fyd."
    );
  }
  return steel;
}

/**
 * Hauteur utile deduite de la section : de la fibre superieure au centre de
 * gravite des armatures situees sous le centroide.
 */
function hauteurUtile(section: Section, options?: LongitudinalOptions): number {
  if (options?.d !== undefined) return options.d;

  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      'minimumLongitudinalArea : geometrie non rectangulaire, hauteur utile indefinie.'
    );
  }

  const tendues = section.rebars.filter((r) => r.z > 0);
  if (tendues.length === 0) {
    throw new Error(
      "minimumLongitudinalArea : aucune armature tendue, la hauteur utile est indefinie. " +
        'Imposer `d` en option.'
    );
  }

  const aire = tendues.reduce((somme, r) => somme + r.area, 0);
  const zG = tendues.reduce((somme, r) => somme + r.area * r.z, 0) / aire;
  return zG + section.geometry.height / 2;
}

/**
 * Largeur moyenne de la zone tendue `b_t` (mm).
 *
 * Sur un rectangle, c'est la largeur. Hors rectangle, la moyenne depend de la
 * position de l'axe neutre et de la forme du contour : la norme ne la donne
 * pas, et l'inventer fausserait le minimum en silence. On leve, comme le fait
 * `verifyCrackWidth` pour la meme raison.
 */
function largeurZoneTendue(section: Section): number {
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      "minimumLongitudinalArea : geometrie non rectangulaire. La largeur moyenne de la zone " +
        "tendue b_t du §9.2.1.1 n'a pas de definition normative hors rectangle."
    );
  }
  return section.geometry.width;
}

/**
 * Armature longitudinale minimale (mm²), EN 1992-1-1 §9.2.1.1 (poutres et
 * dalles, eq. 9.1N) et §9.5.2 (poteaux, eq. 9.12N).
 *
 *     poutre, dalle : max(0,26·fctm/fyk·bt·d ; 0,0013·bt·d)
 *     poteau        : max(0,10·N_Ed/fyd ; 0,002·Ac)
 *
 * Les deux termes de chaque maximum sont ecrits explicitement : c'est le
 * PLANCHER qui gouverne des que le beton est peu resistant devant l'acier
 * (poutre) ou l'effort normal faible (poteau), et l'omettre passerait
 * inapercu sur les cas courants.
 *
 * Valeurs RECOMMANDEES de l'EN 1992-1-1:2004 : une annexe nationale peut les
 * modifier.
 */
export function minimumLongitudinalArea(
  section: Section,
  elementType: ElementType,
  options?: LongitudinalOptions
): number {
  const steel = acierDeReference(section, options);

  if (elementType === 'column') {
    if (options?.NEd === undefined) {
      throw new Error(
        'minimumLongitudinalArea : le minimum de poteau (§9.5.2) depend de N_Ed, ' +
          "qui est une entree du calcul et non une propriete de la section."
      );
    }
    // N_Ed en kN, fyd en MPa (N/mm²) : passage en newtons.
    const parEffortNormal = (0.1 * options.NEd * 1000) / steel.fyd;
    const plancher = 0.002 * concreteArea(section);
    return Math.max(parEffortNormal, plancher);
  }

  // Poutre et dalle partagent le meme minimum (§9.3.1.1 renvoie a §9.2.1.1).
  const bt = largeurZoneTendue(section);
  const d = hauteurUtile(section, options);
  const fctm = fctmDepuisFck(section.concrete.fck);

  const parResistance = ((0.26 * fctm) / steel.fyk) * bt * d;
  const plancher = 0.0013 * bt * d;
  return Math.max(parResistance, plancher);
}

/**
 * Armature longitudinale maximale (mm²) : `0,04·Ac` hors zones de
 * recouvrement, §9.2.1.1(3) pour les poutres et §9.5.2(3) pour les poteaux,
 * meme valeur recommandee dans les deux cas.
 *
 * `Ac` est l'aire REELLE de la section, calculee par `polygonArea` : le
 * maximum reste donc defini sur une geometrie quelconque, contrairement au
 * minimum de poutre qui reclame `b_t`.
 */
export function maximumLongitudinalArea(section: Section, _elementType?: ElementType): number {
  return 0.04 * concreteArea(section);
}

/**
 * Constat sur l'armature longitudinale : ce qui est en place, ce que le §9
 * exige au minimum, ce qu'il admet au maximum.
 *
 * CONSTATE, NE PRESCRIT PAS : aucun ferraillage n'est propose.
 */
export function checkLongitudinal(
  section: Section,
  elementType: ElementType,
  options?: LongitudinalOptions
): LongitudinalCheck {
  const asProvided = providedLongitudinalArea(section);
  const asMin = minimumLongitudinalArea(section, elementType, options);
  const asMax = maximumLongitudinalArea(section, elementType);

  const underReinforced = asProvided < asMin;
  const overReinforced = asProvided > asMax;

  return {
    asProvided,
    asMin,
    asMax,
    underReinforced,
    overReinforced,
    ok: !underReinforced && !overReinforced,
  };
}
