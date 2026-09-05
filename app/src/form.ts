import type {
  SectionModel, RowFaceModel, BarSpecModel, PointModel,
  GeometryModel, ReinforcementModel,
  ServiceActionModel, ServiceActionsModel,
  ShearModel, ShearLinksModel, RestraintModel, MeyerModel,
} from '../../src/index';
import type { LoadingMode, ElementType, RestraintType, ShearReinforcement } from '../../src/index';
import type { MeyerCas, MeyerBridage, MeyerModeK } from '../../src/index';
import { ec2Recommended, fctmDepuisFck, FORMAT_VERSION, ENGINE_VERSION } from '../../src/index';
import { evaluateExpression, ExpressionError } from './expression';
import { formatNumber } from './format';

/** Un lit tel qu'il est saisi : nombre de barres OU espacement maximal. */
export interface RowInput {
  face: RowFaceModel;
  diameter: string;
  /** `true` : on saisit un espacement maximal ; `false` : un nombre de barres. */
  useSpacing: boolean;
  count: string;
  maxSpacing: string;
}

/** Un lit libre, le long d'un segment quelconque (geometries polygonales). */
export interface FreeRowInput {
  fromY: string; fromZ: string; toY: string; toZ: string;
  diameter: string;
  useSpacing: boolean;
  count: string;
  maxSpacing: string;
  excludeEndpoints: boolean;
}

/**
 * Etat du formulaire : les valeurs telles qu'elles sont saisies, donc en
 * CHAINES. La conversion vers le modele est le seul endroit ou elles
 * deviennent des nombres, et le seul endroit ou une saisie invalide est
 * refusee.
 */
export interface FormState {
  name: string;
  fck: string; fyk: string; Es: string;
  gammaC: string; gammaS: string; alphaCc: string; nBands: string;

  geometryKind: 'rectangle' | 'polygon' | 'circle';
  width: string; height: string;
  /** Un sommet par ligne, « y ; z ». */
  vertices: string;
  diameter: string; segments: string;

  reinforcementKind: 'rectangular-layout' | 'circular-cage' | 'rows' | 'bars';
  cover: string; stirrupDiameter: string;
  rows: RowInput[];
  cageBarDiameter: string; cageCount: string; cageRotationOffset: string;
  freeRows: FreeRowInput[];
  /** Une barre par ligne, « y ; z ; aire ». */
  bars: string;

  N: string; My: string; Mz: string;
  mode: LoadingMode;

  /**
   * Sollicitations de SERVICE, uniaxiales `{ N, M }` et saisies SEPAREMENT de
   * l'ELU : les combinaisons EN 1990 ne sont pas les memes, et reutiliser le
   * moment de l'ELU serait faux d'un facteur ~1,35 a 1,5.
   *
   * Deux combinaisons parce que les verifications n'ont pas la meme :
   * caracteristique pour la limitation des contraintes (§7.2), quasi-permanente
   * pour la fissuration (§7.3) et la courbure (§7.4.3).
   */
  serviceCarN: string; serviceCarM: string;
  serviceQpN: string; serviceQpM: string;

  /**
   * Les trois parametres que l'ingenieur ASSUME plutot qu'il ne les subit.
   *
   * Chacun porte deja un avertissement explicite dans la documentation de son
   * module, ce qui est le signe qu'il s'agit d'un CHOIX et non d'une constante :
   * `n = 15` est conventionnel et non prescrit sous cette forme par la norme,
   * `w_max` depend de la classe d'exposition que le module ignore, `beta` depend
   * de la duree de chargement. Les autres coefficients (k1, k2, k3, kt…) restent
   * a leurs valeurs recommandees.
   */
  serviceN: string; crackWMax: string; curvatureBeta: string;

  /**
   * Effort tranchant (§6.2), dispositions constructives (§9) et deformation
   * genee (§7.3.2).
   *
   * ENREGISTRES depuis la version 3 du format : ils decrivent l'ouvrage et
   * son chargement, pas une hypothese de verification, et tombent donc du
   * cote « se sauvegarde » de la frontiere du format. Un champ laisse VIDE
   * laisse son bloc absent du modele, jamais rempli d'un zero.
   *
   * `elementType` est une SAISIE, jamais une deduction : un 300x500 est une
   * poutre ou un poteau selon son role, et les regles du §9 different.
   */
  elementType: ElementType;
  V_Ed: string;
  Asw: string; sCadres: string; fywk: string;
  cotTheta: string;

  restraintType: RestraintType;
  fctEff: string; sigmaSZwang: string;
  zoneEfficace: boolean;

  /**
   * Elements massifs sous deformation genee, methode Meyer (DIN 1045).
   *
   * ENREGISTRES eux aussi depuis la version 3 du format, et sous leur propre
   * bloc : Meyer porte sa PROPRE epaisseur et son propre `f_ctm`, qu on fait
   * varier en pre-dimensionnement avant meme d avoir arrete la section.
   *
   * Ces parametres sont ceux de la METHODE, pas ceux de la section : Meyer ne
   * lit ni la geometrie ni le ferraillage, et reste donc calculable sur un
   * cercle ou un polygone. `meyerH` et `meyerFctm` sont seulement PRE-REMPLIS
   * a partir de la section au chargement, et l utilisateur les ecrase.
   */
  meyerH: string; meyerD1: string; meyerDs: string;
  meyerWk: string; meyerFctm: string; meyerKzt: string;
  meyerCas: MeyerCas;
  meyerBridage: MeyerBridage;
  meyerKmode: MeyerModeK;
}

/** Valeurs de depart des trois parametres assumes, telles qu'elles s'affichent. */
export const SERVICE_N_PAR_DEFAUT = '15';
export const CRACK_WMAX_PAR_DEFAUT = '0,3';
export const CURVATURE_BETA_PAR_DEFAUT = '0,5';

/**
 * Valeurs de depart des verifications de la session 11.
 *
 * `V_Ed` part de zero et les cadres partent VIDES : ce sont une charge et un
 * ferraillage, et la page n'en invente aucun — la meme regle que pour les
 * sollicitations de service. Les resistances (`V_Rd,c`, `A_s,min`) restent
 * calculees et affichees, ce qui est deja l'essentiel de l'information.
 *
 * `cot theta = 2,5` est le defaut de l'EC2 : il minimise les cadres et
 * sollicite le plus les bielles.
 */
export const ELEMENT_TYPE_PAR_DEFAUT: ElementType = 'column';
export const V_ED_PAR_DEFAUT = '0';
export const FYWK_PAR_DEFAUT = '500';
export const COT_THETA_PAR_DEFAUT = '2,5';
export const RESTRAINT_TYPE_PAR_DEFAUT: RestraintType = 'central';

/**
 * Valeurs de depart de la methode Meyer.
 *
 * `d1 = 40 mm` et `ds = 16 mm` sont les ordres de grandeur des armatures de
 * peau d un element massif ; `w_k = 0,3 mm` est la valeur courante du tableau
 * 7.1N pour les classes d exposition usuelles.
 *
 * `k_zt = 0,5` est le seul de ces defauts qui soit un ARBITRAGE et non une
 * habitude : le Zwang des pieces massives nait de la chaleur d hydratation et
 * fissure a quelques jours, quand le beton est loin de son `f_ctm` a 28 jours.
 * Partir de 1,0 conduirait a l armature la plus forte pour un instant de
 * fissuration qui n est pas celui du phenomene.
 */
export const MEYER_D1_PAR_DEFAUT = '40';
export const MEYER_DS_PAR_DEFAUT = '16';
export const MEYER_WK_PAR_DEFAUT = '0,3';
export const MEYER_KZT_PAR_DEFAUT = '0,5';
export const MEYER_CAS_PAR_DEFAUT: MeyerCas = 'traction';
export const MEYER_BRIDAGE_PAR_DEFAUT: MeyerBridage = 'exterieur';
export const MEYER_KMODE_PAR_DEFAUT: MeyerModeK = 'lineaire';

export class FormError extends Error {}

// --- Conversion chaine -> nombre, seul endroit ou une saisie est refusee ---

/**
 * Nombre requis : leve `FormError` en nommant le champ si la saisie n'est pas
 * evaluable.
 *
 * La saisie n'est pas seulement lue, elle est EVALUEE : « 30+10 » vaut 40,
 * « 500/2 » vaut 250. Un ingenieur cote rarement une valeur brute — un
 * enrobage se compose d'un enrobage nominal et d'un diametre d'etrier — et
 * pouvoir taper le calcul garde la trace du raisonnement dans le champ.
 */
function nombreRequis(valeur: string, champ: string): number {
  try {
    return evaluateExpression(valeur);
  } catch (e) {
    const detail = e instanceof ExpressionError ? e.message : String(e);
    throw new FormError(`${champ} : valeur ou expression attendue, recu "${valeur}" (${detail})`);
  }
}

/** Nombre optionnel : une saisie vide devient `undefined`, jamais `0`. */
function nombreOptionnel(valeur: string, champ: string): number | undefined {
  return valeur.trim() === '' ? undefined : nombreRequis(valeur, champ);
}

/** Rendu texte d'un nombre, ou chaine vide pour un optionnel absent. */
function texteDe(valeur: number | undefined): string {
  return valeur === undefined ? '' : String(valeur);
}

// --- Sollicitations de service ---

/**
 * Une combinaison de service : ses deux champs, ou aucun des deux.
 *
 * Une combinaison a demi remplie est REFUSEE plutot que completee par un zero.
 * « N = 300, M vide » lu comme « M = 0 » produirait un resultat de service
 * parfaitement calcule pour une sollicitation que personne n'a donnee — le
 * genre de chiffre qu'on ne songe pas a mettre en doute puisqu'il s'affiche
 * comme les autres.
 */
function sollicitationDeService(
  N: string,
  M: string,
  libelle: string
): ServiceActionModel | undefined {
  const sansN = N.trim() === '';
  const sansM = M.trim() === '';

  if (sansN && sansM) return undefined;
  if (sansN) {
    throw new FormError(
      `${libelle} : N est vide alors que M est renseigne. Une combinaison de service se saisit entierement, ou pas du tout.`
    );
  }
  if (sansM) {
    throw new FormError(
      `${libelle} : M est vide alors que N est renseigne. Une combinaison de service se saisit entierement, ou pas du tout.`
    );
  }

  return { N: nombreRequis(N, `${libelle} : N`), M: nombreRequis(M, `${libelle} : M`) };
}

const LIBELLE_CARACTERISTIQUE = 'Sollicitation de service caracteristique (§7.2)';
const LIBELLE_QUASI_PERMANENT = 'Sollicitation de service quasi-permanente (§7.3, §7.4.3)';

/** Les trois parametres assumes, evalues comme n'importe quel champ. */
export interface ParametresService {
  /** Coefficient d'equivalence. */
  n: number;
  /** Ouverture de fissure limite (mm). */
  wMax: number;
  /** Duree de chargement pour l'interpolation de courbure. */
  beta: number;
}

export function parametresDeService(form: FormState): ParametresService {
  return {
    n: nombreRequis(form.serviceN, 'coefficient d equivalence n'),
    wMax: nombreRequis(form.crackWMax, 'ouverture limite w_max'),
    beta: nombreRequis(form.curvatureBeta, 'duree de chargement beta'),
  };
}

// --- Parametres des verifications de tranchant, dispositions et Zwang ---

/**
 * Ce que la saisie apporte aux trois modules de la session 11, une fois
 * evaluee.
 *
 * `cotTheta` n'est PAS borne ici : le noyau refuse lui-meme toute valeur hors
 * de `[1 ; 2,5]` (§6.2.3(2)) avec un message qui nomme l'article, et son refus
 * n'atteint que le bloc du tranchant. Le dupliquer ici transformerait un
 * resultat d'un seul module en erreur de formulaire, qui bloquerait toute la
 * page.
 */
export interface ParametresVerifications {
  elementType: ElementType;
  /** Effort tranchant sollicitant (kN). */
  VEd: number;
  /** Cadres declares, ou `undefined` : il n'y en a pas. */
  cadres: ShearReinforcement | undefined;
  cotTheta: number;
  restraintType: RestraintType;
  /** `undefined` : le module retient `f_ctm` a 28 jours. */
  fctEff: number | undefined;
  /** `undefined` : le module retient `f_yk`. */
  sigmaS: number | undefined;
  zoneEfficace: boolean;
}

const LIBELLE_CADRES = 'Armatures d effort tranchant';

/**
 * Les cadres se saisissent entierement ou pas du tout.
 *
 * Une aire sans espacement — ou l'inverse — est REFUSEE plutot que completee.
 * Meme raison que pour les combinaisons de service : un `V_Rd,s` calcule sur
 * un espacement que personne n'a donne s'afficherait comme les autres
 * chiffres, et personne ne songerait a le mettre en doute.
 */
function cadresSaisis(form: FormState): ShearReinforcement | undefined {
  const sansAire = form.Asw.trim() === '';
  const sansEspacement = form.sCadres.trim() === '';

  if (sansAire && sansEspacement) return undefined;
  if (sansAire) {
    throw new FormError(
      `${LIBELLE_CADRES} : l aire A_sw est vide alors que l espacement est renseigne. ` +
        'Les cadres se saisissent entierement, ou pas du tout.'
    );
  }
  if (sansEspacement) {
    throw new FormError(
      `${LIBELLE_CADRES} : l espacement est vide alors que l aire A_sw est renseignee. ` +
        'Les cadres se saisissent entierement, ou pas du tout.'
    );
  }

  return {
    Asw: nombreRequis(form.Asw, `${LIBELLE_CADRES} : aire A_sw`),
    s: nombreRequis(form.sCadres, `${LIBELLE_CADRES} : espacement`),
    fywk: nombreRequis(form.fywk, `${LIBELLE_CADRES} : f_ywk`),
  };
}

export function parametresDeVerification(form: FormState): ParametresVerifications {
  return {
    elementType: form.elementType,
    VEd: nombreRequis(form.V_Ed, 'effort tranchant V_Ed'),
    cadres: cadresSaisis(form),
    cotTheta: nombreRequis(form.cotTheta, 'cot theta'),
    restraintType: form.restraintType,
    fctEff: nombreOptionnel(form.fctEff, 'f_ct,eff'),
    sigmaS: nombreOptionnel(form.sigmaSZwang, 'sigma_s de la deformation genee'),
    zoneEfficace: form.zoneEfficace,
  };
}

// --- Parametres de la methode Meyer (DIN 1045) ---

/**
 * Ce que la saisie apporte a `meyerRestraintReinforcement`, une fois evaluee.
 *
 * La forme est exactement celle de `MeyerParams` : le cablage transmet cet
 * objet tel quel, sans rien en deriver. `Es` et `b` ne sont pas saisis et
 * restent aux defauts du module (200000 MPa, 1000 mm) — les aires sortent
 * donc PAR METRE de largeur.
 *
 * Aucune borne n est verifiee ici : le module REFUSE lui-meme tout parametre
 * qui n est pas strictement positif, et son refus n atteint que son propre
 * bloc. Le dupliquer ici transformerait un resultat d un seul module en
 * erreur de formulaire, qui bloquerait toute la page.
 */
export interface ParametresMeyer {
  h: number;
  d1: number;
  ds: number;
  wk: number;
  fctm: number;
  kzt: number;
  cas: MeyerCas;
  bridage: MeyerBridage;
  kmode: MeyerModeK;
}

export function parametresDeMeyer(form: FormState): ParametresMeyer {
  return {
    h: nombreRequis(form.meyerH, 'Meyer : epaisseur h'),
    d1: nombreRequis(form.meyerD1, 'Meyer : enrobage a l axe d1'),
    ds: nombreRequis(form.meyerDs, 'Meyer : diametre des barres ds'),
    wk: nombreRequis(form.meyerWk, 'Meyer : ouverture visee w_k'),
    fctm: nombreRequis(form.meyerFctm, 'Meyer : f_ctm'),
    kzt: nombreRequis(form.meyerKzt, 'Meyer : facteur d age k_zt'),
    cas: form.meyerCas,
    bridage: form.meyerBridage,
    kmode: form.meyerKmode,
  };
}

// --- Les quatre blocs de la version 3 du format, dans les deux sens ---

/**
 * Cadres tels qu'ils entrent DANS LE MODELE.
 *
 * Distinct de `cadresSaisis`, et pour une raison qui n'est pas cosmetique :
 * `cadresSaisis` REFUSE une saisie a demi remplie, ce qui est juste devant un
 * resultat affiche — un `V_Rd,s` calcule sur un espacement que personne n'a
 * donne s'afficherait comme les autres chiffres. Ici, on ecrit un fichier a
 * chaque frappe, et lever priverait la page de tout son resultat le temps que
 * l'utilisateur finisse de taper les trois champs. Un cours incomplet n'est
 * donc simplement PAS ecrit : rien n'est perdu, la saisie est encore a
 * l'ecran, et le message de `cadresSaisis` continue de dire ce qui manque.
 */
function cadresDuModele(form: FormState): ShearLinksModel | undefined {
  if (form.Asw.trim() === '' || form.sCadres.trim() === '' || form.fywk.trim() === '') {
    return undefined;
  }
  return {
    Asw: nombreRequis(form.Asw, `${LIBELLE_CADRES} : aire A_sw`),
    s: nombreRequis(form.sCadres, `${LIBELLE_CADRES} : espacement`),
    fywk: nombreRequis(form.fywk, `${LIBELLE_CADRES} : f_ywk`),
  };
}

/**
 * Bloc d'effort tranchant, ABSENT tant que `V_Ed` n'est pas saisi.
 *
 * Un `V_Ed: 0` ecrit a la place se relirait comme « l'ingenieur a verifie le
 * tranchant sous effort nul » : une affirmation, la ou il n'y a qu'une
 * absence. La meme regle que pour les sollicitations de service.
 *
 * `cotTheta` vide reste absent : son defaut de 2,5 vit dans `shearWithLinks`,
 * et l'ecrire ici ferait passer un defaut du moteur pour un choix d'ingenieur
 * fige dans le fichier.
 */
function tranchantDuModele(form: FormState): ShearModel | undefined {
  if (form.V_Ed.trim() === '') return undefined;

  const links = cadresDuModele(form);
  const cotTheta = nombreOptionnel(form.cotTheta, 'cot theta');
  return {
    V_Ed: nombreRequis(form.V_Ed, 'effort tranchant V_Ed'),
    ...(links !== undefined ? { links } : {}),
    ...(cotTheta !== undefined ? { cotTheta } : {}),
  };
}

/**
 * Bloc de deformation genee. TOUJOURS ecrit : sa nature se choisit dans une
 * liste, qui porte donc toujours une valeur. Ses trois autres champs sont
 * optionnels et un champ vide reste absent — `f_ct,eff` absent veut dire
 * « f_ctm a 28 jours », le cas defavorable, et surement pas zero, qui
 * annulerait l'armature exigee.
 */
function geneDuModele(form: FormState): RestraintModel {
  const fctEff = nombreOptionnel(form.fctEff, 'f_ct,eff');
  const sigmaS = nombreOptionnel(form.sigmaSZwang, 'sigma_s de la deformation genee');
  return {
    type: form.restraintType,
    ...(fctEff !== undefined ? { fctEff } : {}),
    ...(sigmaS !== undefined ? { sigmaS } : {}),
    // Ecrit seulement quand il est vrai : `false` est deja ce que veut dire
    // son absence, et un fichier ne gagne rien a le repeter.
    ...(form.zoneEfficace ? { effectiveZoneOnly: true } : {}),
  };
}

const CHAMPS_MEYER_REQUIS = ['meyerH', 'meyerD1', 'meyerDs', 'meyerWk', 'meyerFctm', 'meyerKzt'] as const;

/**
 * Bloc de la methode Meyer, ABSENT des qu'une de ses six grandeurs manque.
 *
 * Le cas courant n'est pas theorique : hors du rectangle, aucune dimension ne
 * s'impose comme epaisseur, `h` reste vide, et le bloc ne s'ecrit pas. Meyer
 * ne se calcule pas non plus dans ce cas — le fichier dit donc exactement ce
 * que l'ecran montre.
 */
function meyerDuModele(form: FormState): MeyerModel | undefined {
  if (CHAMPS_MEYER_REQUIS.some((champ) => form[champ].trim() === '')) return undefined;

  return {
    h: nombreRequis(form.meyerH, 'Meyer : epaisseur h'),
    d1: nombreRequis(form.meyerD1, 'Meyer : enrobage a l axe d1'),
    ds: nombreRequis(form.meyerDs, 'Meyer : diametre des barres ds'),
    wk: nombreRequis(form.meyerWk, 'Meyer : ouverture visee w_k'),
    fctm: nombreRequis(form.meyerFctm, 'Meyer : f_ctm'),
    kzt: nombreRequis(form.meyerKzt, 'Meyer : facteur d age k_zt'),
    cas: form.meyerCas,
    bridage: form.meyerBridage,
    kmode: form.meyerKmode,
  };
}

// --- Points et lignes de texte (sommets, barres libres) ---

function parseLigneNombres(ligne: string, champ: string, numeroLigne: number, arite: number): number[] {
  const parties = ligne.split(';').map((p) => p.trim());
  if (parties.length !== arite) {
    throw new FormError(
      `${champ} : ligne ${numeroLigne}, ${arite} valeurs separees par « ; » attendues ("${ligne}")`
    );
  }
  // Chaque partie est EVALUEE, comme les champs simples : « 250-48 » est une
  // cote parfaitement legitime pour une position de barre.
  return parties.map((partie) => {
    try {
      return evaluateExpression(partie);
    } catch (e) {
      const detail = e instanceof ExpressionError ? e.message : String(e);
      throw new FormError(
        `${champ} : ligne ${numeroLigne}, valeur ou expression attendue ("${partie}" — ${detail})`
      );
    }
  });
}

/** Analyse une zone de texte « une entree par ligne », en ignorant les lignes vides. */
function parseLignes(texte: string, champ: string, arite: number): number[][] {
  const resultat: number[][] = [];
  texte.split('\n').forEach((ligne, index) => {
    const contenu = ligne.trim();
    if (contenu === '') return;
    resultat.push(parseLigneNombres(contenu, champ, index + 1, arite));
  });
  return resultat;
}

export function parsePoints(texte: string, champ: string): PointModel[] {
  return parseLignes(texte, champ, 2).map(([y, z]) => ({ y, z }));
}

export function formatPoints(points: PointModel[]): string {
  return points.map((p) => `${p.y} ; ${p.z}`).join('\n');
}

function parseBarsText(texte: string, champ: string): Array<{ y: number; z: number; area: number }> {
  return parseLignes(texte, champ, 3).map(([y, z, area]) => ({ y, z, area }));
}

function formatBarsText(bars: Array<{ y: number; z: number; area: number }>): string {
  return bars.map((b) => `${b.y} ; ${b.z} ; ${b.area}`).join('\n');
}

// --- Lits d'armatures : nombre de barres OU espacement maximal ---

interface SaisieBarSpec {
  useSpacing: boolean;
  diameter: string;
  count: string;
  maxSpacing: string;
}

function parseBarSpec(saisie: SaisieBarSpec, champ: string): BarSpecModel {
  const diameter = nombreRequis(saisie.diameter, `${champ} : diametre`);
  if (saisie.useSpacing) {
    return { diameter, maxSpacing: nombreRequis(saisie.maxSpacing, `${champ} : espacement maximal`) };
  }
  return { count: nombreRequis(saisie.count, `${champ} : nombre de barres`), diameter };
}

function barSpecEnSaisie(bars: BarSpecModel): SaisieBarSpec {
  if ('maxSpacing' in bars) {
    return { useSpacing: true, diameter: texteDe(bars.diameter), count: '', maxSpacing: texteDe(bars.maxSpacing) };
  }
  return { useSpacing: false, diameter: texteDe(bars.diameter), count: texteDe(bars.count), maxSpacing: '' };
}

// --- Modele par defaut, seule reference pour les coefficients recommandes ---

const RECOMMANDE = ec2Recommended();

/**
 * Convertit l'etat du formulaire en `SectionModel`. Seuls les champs de la
 * forme de geometrie et de ferraillage retenues sont lus ; les autres,
 * saisis pour une autre forme, sont ignores.
 *
 * Refuse toute valeur non numerique avec un `FormError` nommant le champ
 * (et, pour les zones de texte, le numero de ligne).
 */
export function formToModel(form: FormState): SectionModel {
  const nom = form.name.trim();

  const gammaC = nombreRequis(form.gammaC, 'gammaC');
  const gammaS = nombreRequis(form.gammaS, 'gammaS');
  const alphaCc = nombreRequis(form.alphaCc, 'alphaCc');
  const nBands = nombreRequis(form.nBands, 'nBands');
  const normPersonnalise =
    gammaC !== RECOMMANDE.gammaC ||
    gammaS !== RECOMMANDE.gammaS ||
    alphaCc !== RECOMMANDE.alphaCc ||
    nBands !== RECOMMANDE.nBands;

  let geometry: GeometryModel;
  switch (form.geometryKind) {
    case 'rectangle':
      geometry = {
        kind: 'rectangle',
        width: nombreRequis(form.width, 'largeur'),
        height: nombreRequis(form.height, 'hauteur'),
      };
      break;
    case 'polygon':
      geometry = { kind: 'polygon', vertices: parsePoints(form.vertices, 'sommets') };
      break;
    case 'circle': {
      const segments = nombreOptionnel(form.segments, 'segments');
      geometry = {
        kind: 'circle',
        diameter: nombreRequis(form.diameter, 'diametre'),
        ...(segments !== undefined ? { segments } : {}),
      };
      break;
    }
  }

  let reinforcement: ReinforcementModel;
  switch (form.reinforcementKind) {
    case 'rectangular-layout': {
      const stirrupDiameter = nombreOptionnel(form.stirrupDiameter, 'diametre etrier');
      reinforcement = {
        kind: 'rectangular-layout',
        cover: nombreRequis(form.cover, 'enrobage'),
        ...(stirrupDiameter !== undefined ? { stirrupDiameter } : {}),
        rows: form.rows.map((row) => ({
          face: row.face,
          bars: parseBarSpec(row, `lit ${row.face}`),
        })),
      };
      break;
    }
    case 'circular-cage': {
      const stirrupDiameter = nombreOptionnel(form.stirrupDiameter, 'diametre etrier');
      const rotationOffset = nombreOptionnel(form.cageRotationOffset, 'decalage angulaire');
      reinforcement = {
        kind: 'circular-cage',
        cover: nombreRequis(form.cover, 'enrobage'),
        ...(stirrupDiameter !== undefined ? { stirrupDiameter } : {}),
        barDiameter: nombreRequis(form.cageBarDiameter, 'diametre des barres'),
        count: nombreRequis(form.cageCount, 'nombre de barres'),
        ...(rotationOffset !== undefined ? { rotationOffset } : {}),
      };
      break;
    }
    case 'rows':
      reinforcement = {
        kind: 'rows',
        rows: form.freeRows.map((row) => ({
          from: { y: nombreRequis(row.fromY, 'lit libre : y de depart'), z: nombreRequis(row.fromZ, 'lit libre : z de depart') },
          to: { y: nombreRequis(row.toY, "lit libre : y d'arrivee"), z: nombreRequis(row.toZ, "lit libre : z d'arrivee") },
          bars: parseBarSpec(row, 'lit libre'),
          // `as const` : narrowe le litteral en 'exclude', pas un contournement
          // de type — sans lui l'objet serait infere avec `endpoints: string`.
          ...(row.excludeEndpoints ? { endpoints: 'exclude' as const } : {}),
        })),
      };
      break;
    case 'bars':
      reinforcement = { kind: 'bars', bars: parseBarsText(form.bars, 'bars') };
      break;
  }

  // Les deux combinaisons sont INDEPENDANTES : saisir la seule
  // quasi-permanente est un cas courant, la fissuration et la courbure etant
  // les verifications les plus souvent demandees.
  const characteristic = sollicitationDeService(
    form.serviceCarN,
    form.serviceCarM,
    LIBELLE_CARACTERISTIQUE
  );
  const quasiPermanent = sollicitationDeService(
    form.serviceQpN,
    form.serviceQpM,
    LIBELLE_QUASI_PERMANENT
  );
  const serviceActions: ServiceActionsModel | undefined =
    characteristic === undefined && quasiPermanent === undefined
      ? undefined
      : {
          ...(characteristic !== undefined ? { characteristic } : {}),
          ...(quasiPermanent !== undefined ? { quasiPermanent } : {}),
        };

  // Les quatre blocs de la version 3. `elementType` et la nature de la gene
  // se choisissent dans une liste, qui porte toujours une valeur : ils
  // s'ecrivent toujours. Les deux autres blocs s'effacent des qu'un champ
  // manque, plutot que de se completer d'un zero.
  const shear = tranchantDuModele(form);
  const meyer = meyerDuModele(form);

  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    ...(nom !== '' ? { name: nom } : {}),
    norm: {
      name: normPersonnalise ? 'EC2_personnalise' : 'EC2_recommended',
      gammaC, gammaS, alphaCc, nBands,
    },
    concrete: { fck: nombreRequis(form.fck, 'fck') },
    steel: { fyk: nombreRequis(form.fyk, 'fyk'), Es: nombreRequis(form.Es, 'Es') },
    geometry,
    reinforcement,
    action: {
      N: nombreRequis(form.N, 'N'),
      My: nombreRequis(form.My, 'My'),
      Mz: nombreRequis(form.Mz, 'Mz'),
    },
    ...(serviceActions !== undefined ? { serviceActions } : {}),
    elementType: form.elementType,
    ...(shear !== undefined ? { shear } : {}),
    restraint: geneDuModele(form),
    ...(meyer !== undefined ? { meyer } : {}),
  };
}

/**
 * Convertit un `SectionModel` en etat de formulaire. Ne remplit que les
 * champs pertinents pour la geometrie et le ferraillage du modele ; les
 * autres restent a leur valeur par defaut (chaine vide, tableau vide).
 */
export function modelToForm(model: SectionModel): FormState {
  const form: FormState = {
    name: model.name ?? '',
    fck: texteDe(model.concrete.fck),
    fyk: texteDe(model.steel.fyk),
    Es: texteDe(model.steel.Es),
    gammaC: texteDe(model.norm.gammaC),
    gammaS: texteDe(model.norm.gammaS),
    alphaCc: texteDe(model.norm.alphaCc),
    nBands: texteDe(model.norm.nBands),

    geometryKind: model.geometry.kind,
    width: '', height: '', vertices: '', diameter: '', segments: '',

    reinforcementKind: model.reinforcement.kind,
    cover: '', stirrupDiameter: '',
    rows: [],
    cageBarDiameter: '', cageCount: '', cageRotationOffset: '',
    freeRows: [],
    bars: '',

    N: texteDe(model.action.N),
    My: texteDe(model.action.My),
    Mz: texteDe(model.action.Mz),
    mode: 'constant-N',

    // Champ absent (fichier de format v1) = champs VIDES, et surtout pas des
    // zeros qui ressembleraient a une saisie. On n'invente pas les charges de
    // service de l'utilisateur.
    serviceCarN: texteDe(model.serviceActions?.characteristic?.N),
    serviceCarM: texteDe(model.serviceActions?.characteristic?.M),
    serviceQpN: texteDe(model.serviceActions?.quasiPermanent?.N),
    serviceQpM: texteDe(model.serviceActions?.quasiPermanent?.M),

    // Les trois parametres assumes ne sont PAS dans le modele : ce sont des
    // choix de verification, pas des donnees de la section. Ils reprennent
    // donc leur valeur de depart a chaque chargement.
    serviceN: SERVICE_N_PAR_DEFAUT,
    crackWMax: CRACK_WMAX_PAR_DEFAUT,
    curvatureBeta: CURVATURE_BETA_PAR_DEFAUT,

    // Les quatre blocs de la version 3, relus tels quels. Un bloc ABSENT —
    // fichier de version 1 ou 2, ou modele qui ne verifiait que la flexion —
    // laisse les champs a leur valeur de depart, et jamais a zero : un
    // « V_Ed = 0 » ressemblerait a une saisie.
    elementType: model.elementType ?? ELEMENT_TYPE_PAR_DEFAUT,
    V_Ed: model.shear !== undefined ? texteDe(model.shear.V_Ed) : V_ED_PAR_DEFAUT,
    // Les cadres restent VIDES quand le fichier n'en porte pas : c'est un
    // ferraillage, et un « 0 » afficherait un cours d'aire nulle.
    Asw: texteDe(model.shear?.links?.Asw),
    sCadres: texteDe(model.shear?.links?.s),
    fywk: model.shear?.links !== undefined ? texteDe(model.shear.links.fywk) : FYWK_PAR_DEFAUT,
    // `cot theta` absent du fichier reprend la valeur de depart du champ, et
    // non un vide : le champ est affiche en permanence et alimente le §6.2.3,
    // qui refuserait une saisie vide. Le fichier relu n'en gagne donc pas
    // moins que ce qu'il portait — il repartira avec le 2,5 qu'on voit a
    // l'ecran, ce que « Enregistrer » a toujours fait des valeurs affichees.
    cotTheta:
      model.shear?.cotTheta !== undefined ? texteDe(model.shear.cotTheta) : COT_THETA_PAR_DEFAUT,

    restraintType: model.restraint?.type ?? RESTRAINT_TYPE_PAR_DEFAUT,
    fctEff: texteDe(model.restraint?.fctEff),
    sigmaSZwang: texteDe(model.restraint?.sigmaS),
    zoneEfficace: model.restraint?.effectiveZoneOnly ?? false,

    // Bloc Meyer du fichier quand il existe. A defaut seulement, les
    // pre-remplissages : `h` prend la hauteur de la section quand elle est
    // rectangulaire — le cas ou l epaisseur de l element massif et la hauteur
    // de la section coincident. Hors du rectangle, aucune dimension ne
    // s impose et le champ reste vide plutot que de proposer une epaisseur
    // que personne n a donnee.
    meyerH:
      model.meyer !== undefined
        ? texteDe(model.meyer.h)
        : model.geometry.kind === 'rectangle'
          ? texteDe(model.geometry.height)
          : '',
    meyerD1: model.meyer !== undefined ? texteDe(model.meyer.d1) : MEYER_D1_PAR_DEFAUT,
    meyerDs: model.meyer !== undefined ? texteDe(model.meyer.ds) : MEYER_DS_PAR_DEFAUT,
    meyerWk: model.meyer !== undefined ? texteDe(model.meyer.wk) : MEYER_WK_PAR_DEFAUT,
    // `f_ctm` DEDUIT du f_ck saisi (tableau 3.1) faute de mieux, et non la
    // valeur de table de l ouvrage : les deux concordent a moins de 2 % —
    // 2,896 contre 2,9 pour un C30/37 — et la valeur deduite suit le beton
    // reellement saisi. Un fichier qui porte deja un `f_ctm` a la priorite :
    // c est un choix de l utilisateur, pas une deduction.
    meyerFctm:
      model.meyer !== undefined
        ? texteDe(model.meyer.fctm)
        : formatNumber(fctmDepuisFck(model.concrete.fck), 2),
    meyerKzt: model.meyer !== undefined ? texteDe(model.meyer.kzt) : MEYER_KZT_PAR_DEFAUT,
    meyerCas: model.meyer?.cas ?? MEYER_CAS_PAR_DEFAUT,
    meyerBridage: model.meyer?.bridage ?? MEYER_BRIDAGE_PAR_DEFAUT,
    meyerKmode: model.meyer?.kmode ?? MEYER_KMODE_PAR_DEFAUT,
  };

  switch (model.geometry.kind) {
    case 'rectangle':
      form.width = texteDe(model.geometry.width);
      form.height = texteDe(model.geometry.height);
      break;
    case 'polygon':
      form.vertices = formatPoints(model.geometry.vertices);
      break;
    case 'circle':
      form.diameter = texteDe(model.geometry.diameter);
      form.segments = texteDe(model.geometry.segments);
      break;
  }

  switch (model.reinforcement.kind) {
    case 'rectangular-layout':
      form.cover = texteDe(model.reinforcement.cover);
      form.stirrupDiameter = texteDe(model.reinforcement.stirrupDiameter);
      form.rows = model.reinforcement.rows.map((row) => ({
        face: row.face,
        ...barSpecEnSaisie(row.bars),
      }));
      break;
    case 'circular-cage':
      form.cover = texteDe(model.reinforcement.cover);
      form.stirrupDiameter = texteDe(model.reinforcement.stirrupDiameter);
      form.cageBarDiameter = texteDe(model.reinforcement.barDiameter);
      form.cageCount = texteDe(model.reinforcement.count);
      form.cageRotationOffset = texteDe(model.reinforcement.rotationOffset);
      break;
    case 'rows':
      form.freeRows = model.reinforcement.rows.map((row) => ({
        fromY: texteDe(row.from.y), fromZ: texteDe(row.from.z),
        toY: texteDe(row.to.y), toZ: texteDe(row.to.z),
        excludeEndpoints: row.endpoints === 'exclude',
        ...barSpecEnSaisie(row.bars),
      }));
      break;
    case 'bars':
      form.bars = formatBarsText(model.reinforcement.bars);
      break;
  }

  return form;
}

