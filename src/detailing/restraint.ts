import type { Section } from '../model/section';
import { fctmDepuisFck } from '../model/concrete';

/**
 * Nature de la deformation genee (« Zwang »).
 *
 * - `central` : gene CENTREE — retrait ou refroidissement empeches par des
 *   appuis, un radier deja durci, une reprise de betonnage. Toute la section
 *   est tendue avant fissuration. C'est le cas dominant des voiles et radiers
 *   massifs.
 * - `bending` : gene de FLEXION — gradient thermique entre coeur et parement,
 *   typiquement au jeune age d'une piece epaisse. Seule une partie de la
 *   section est tendue.
 */
export type RestraintType = 'central' | 'bending';

export interface RestraintOptions {
  /**
   * Resistance moyenne a la traction A L'INSTANT DE LA FISSURATION (MPa).
   * Defaut `f_ctm` a 28 jours.
   *
   * ⚠ C'est le parametre le plus lourd de consequences du calcul, et le
   * defaut est le cas DEFAVORABLE. Le Zwang des elements massifs nait de la
   * chaleur d'hydratation : la fissuration survient a quelques jours, quand
   * le beton n'a pas atteint `f_ctm` a 28 jours. Retenir la valeur a 28 jours
   * SURESTIME donc l'acier necessaire. Le §7.3.2(2) demande explicitement
   * d'estimer `f_ct,eff` a l'age ou la fissuration est attendue.
   */
  fctEff?: number;

  /**
   * Contrainte admise dans l'acier juste apres fissuration (MPa). Defaut
   * `f_yk`.
   *
   * Le §7.3.2(2) autorise `f_yk`, mais une valeur PLUS FAIBLE est souvent
   * necessaire pour respecter une ouverture de fissure visee : les tableaux
   * 7.2N et 7.3N lient diametre maximal et espacement maximal a cette
   * contrainte. Ce module ne choisit pas a la place de l'ingenieur ; il rend
   * l'acier exige pour la contrainte qu'on lui donne.
   */
  sigmaS?: number;

  /**
   * Effort normal de service (kN, positif en compression), pour l'eq. 7.2.
   * Sans objet en gene centree, ou `k_c` vaut 1 par definition.
   */
  NEd?: number;

  /**
   * Calculer sur la seule zone de beton tendu EFFICACE plutot que sur toute
   * la zone tendue.
   *
   * ⚠ Ce n'est PAS le texte de l'EN 1992-1-1, qui ecrit l'eq. 7.1 sur `A_ct`,
   * toute la zone tendue. C'est le raffinement retenu par la pratique
   * allemande pour les pieces epaisses : au-dela d'une certaine epaisseur,
   * seule une peau participe reellement a la maitrise de l'ouverture des
   * fissures, et armer toute la section conduit a des quantites d'acier que
   * rien ne justifie mecaniquement. L'ecart est considerable — un facteur
   * plusieurs sur un voile de 1 m.
   *
   * Defaut `false` : le texte de la norme europeenne, qui est le cas
   * enveloppe.
   */
  effectiveZoneOnly?: boolean;
}

export interface RestraintResult {
  /** Facteur d'epaisseur (§7.3.2(2)). */
  k: number;
  /** Facteur de distribution des contraintes (§7.3.2(2), eq. 7.2). */
  kc: number;
  /** Aire de beton tendu retenue (mm²). */
  Act: number;
  /** Resistance a la traction retenue (MPa). */
  fctEff: number;
  /** Contrainte d'acier retenue (MPa). */
  sigmaS: number;
  /** Armature minimale de maitrise de la fissuration (mm²). */
  AsMin: number;
  /** `true` des que l'epaisseur atteint 800 mm, ou `k` est a son plancher. */
  massive: boolean;
  /** Sur quoi `A_ct` a ete calculee. */
  basis: 'zone-tendue-entiere' | 'zone-efficace';
}

/**
 * Facteur `k` du §7.3.2(2) : prise en compte des contraintes d'auto-equilibre.
 *
 *     k = 1,00  pour h <= 300 mm
 *     k = 0,65  pour h >= 800 mm
 *     interpolation lineaire entre les deux
 *
 * Le sens physique, et c'est tout l'enjeu des ELEMENTS MASSIFS : dans une
 * piece epaisse, les contraintes d'auto-equilibre reduisent l'effort qui
 * traverse reellement la section au moment de la fissuration. Une piece
 * massive exige donc RELATIVEMENT moins d'acier qu'une piece mince de meme
 * aire — c'est un facteur reducteur, pas une penalite.
 */
export function thicknessFactor(h: number): number {
  if (h <= 300) return 1.0;
  if (h >= 800) return 0.65;
  return 1.0 + ((0.65 - 1.0) * (h - 300)) / (800 - 300);
}

/**
 * Armature minimale de maitrise de la fissuration sous deformation genee
 * (« Zwang »), EN 1992-1-1:2004 §7.3.2, eq. (7.1) :
 *
 *     A_s,min · sigma_s = k_c · k · f_ct,eff · A_ct
 *
 * A NE PAS CONFONDRE avec le minimum de RESISTANCE du §9.2.1.1, qui repond a
 * une autre question. Celui-ci garantit que l'acier ne plastifie pas a
 * l'instant ou le beton fissure, donc que la fissuration se repartit en
 * plusieurs fissures fines au lieu d'une seule large. Sur un voile ou un
 * radier massif, c'est LUI qui gouverne, et de loin — la resistance n'y est
 * jamais le probleme.
 *
 * Sections RECTANGULAIRES uniquement : `A_ct` et la zone efficace supposent
 * une largeur constante, comme pour l'ouverture de fissures de la session 7.
 *
 * CONSTATE, NE PRESCRIT PAS : rend l'aire exigee, jamais un ferraillage.
 */
export function minimumRestraintArea(
  section: Section,
  restraint: RestraintType,
  options?: RestraintOptions
): RestraintResult {
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      'minimumRestraintArea : geometrie non rectangulaire. L aire de beton tendu du ' +
        '§7.3.2 suppose une largeur constante et n est pas transposable telle quelle.'
    );
  }

  const b = section.geometry.width;
  const h = section.geometry.height;

  const fctEff = options?.fctEff ?? fctmDepuisFck(section.concrete.fck);
  const sigmaS = options?.sigmaS ?? acierDeReference(section);
  const k = thicknessFactor(h);
  const kc = facteurDeDistribution(restraint, b, h, fctEff, options?.NEd);

  const zoneEfficace = options?.effectiveZoneOnly === true;
  const Act = zoneEfficace
    ? aireEfficace(section, b, h, restraint)
    : aireTendue(b, h, restraint);

  return {
    k,
    kc,
    Act,
    fctEff,
    sigmaS,
    AsMin: (kc * k * fctEff * Act) / sigmaS,
    massive: h >= 800,
    basis: zoneEfficace ? 'zone-efficace' : 'zone-tendue-entiere',
  };
}

/**
 * Aire de beton tendu juste avant la premiere fissure.
 *
 * En gene centree, toute la section est tendue. En gene de flexion, la
 * section est NON FISSUREE au moment considere, donc son axe neutre est a
 * mi-hauteur pour un rectangle : la moitie de l'aire.
 */
function aireTendue(b: number, h: number, restraint: RestraintType): number {
  return restraint === 'central' ? b * h : (b * h) / 2;
}

/**
 * Zone de beton tendu EFFICACE (§7.3.2(3)), variante des elements massifs.
 *
 * `h_c,ef = min( 2,5·(h − d) , h/2 )` en gene centree, comptee sur les DEUX
 * parements ; sur un seul en gene de flexion.
 *
 * Le terme `(h − x)/3` du §7.3.2(3) ne figure pas ici : il suppose un axe
 * neutre de section fissuree en flexion, qui n'a pas de sens a l'instant de
 * la premiere fissure sous gene. Sur une piece mince, c'est `h/2` qui
 * gouverne et la zone efficace couvre alors toute la section — la borne de
 * completude se refermant d'elle-meme.
 */
function aireEfficace(section: Section, b: number, h: number, restraint: RestraintType): number {
  if (section.rebars.length === 0) {
    throw new Error('minimumRestraintArea : section sans armature, zone efficace indefinie');
  }

  // Distance du parement le plus proche a la nappe qui en est la plus proche :
  // c'est l'enrobage mecanique qui commande la hauteur efficace.
  const zTop = -h / 2;
  const zBottom = h / 2;
  const distanceAuParement = Math.min(
    ...section.rebars.map((r) => Math.min(r.z - zTop, zBottom - r.z))
  );

  const hcEff = Math.min(2.5 * distanceAuParement, h / 2);
  const faces = restraint === 'central' ? 2 : 1;

  return Math.min(faces * hcEff * b, b * h);
}

/**
 * Facteur `k_c` du §7.3.2(2).
 *
 * Gene centree : `k_c = 1` par definition, toute la section etant tendue.
 *
 * Gene de flexion, eq. (7.2) :
 *
 *     k_c = 0,4 · [ 1 − sigma_c / ( k_1 · (h/h*) · f_ct,eff ) ]  <= 1
 *
 * avec `sigma_c = N_Ed / (b·h)` (positive en compression),
 * `h_etoile = min(h, 1000)`, et `k_1 = 1,5` sous compression ou
 * `2·h_etoile / (3·h)` sous traction. En flexion pure (`N_Ed = 0`),
 * l'expression redonne exactement 0,4.
 */
function facteurDeDistribution(
  restraint: RestraintType,
  b: number,
  h: number,
  fctEff: number,
  NEd?: number
): number {
  if (restraint === 'central') return 1.0;

  const N = NEd ?? 0;
  if (N === 0) return 0.4;

  const sigmaC = (N * 1000) / (b * h); // kN -> N
  const hEtoile = Math.min(h, 1000);
  const k1 = N > 0 ? 1.5 : (2 * hEtoile) / (3 * h);

  const kc = 0.4 * (1 - sigmaC / (k1 * (h / hEtoile) * fctEff));

  // Borne haute de la norme, et borne basse physique : une section entierement
  // comprimee ne fissure pas, mais rendre un k_c negatif produirait une aire
  // d'acier negative, ce qui n'a aucun sens a afficher.
  return Math.min(Math.max(kc, 0), 1);
}

function acierDeReference(section: Section): number {
  const premiere = section.rebars[0];
  if (premiere === undefined) {
    throw new Error(
      'minimumRestraintArea : section sans armature, contrainte d acier de reference inconnue. ' +
        'Passer `sigmaS` explicitement.'
    );
  }
  return premiere.steel.fyk;
}
