import type { Section, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { RectangularGeometry } from '../geometry/rectangle';
import type { PolygonGeometry } from '../geometry/polygon';
import type { StressResultant } from '../integration/fiber-rectangle';
import { integrateRectangle } from '../integration/fiber-rectangle';
import { integratePolygon } from '../integration/fiber-polygon';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';

/**
 * ETAT D'EQUILIBRE D'UNE SECTION SOUS UNE SOLLICITATION DONNEE (ELU).
 *
 * A quoi cela repond, et que `verifyUniaxial` ne dit pas : une section dont
 * `M_Rd` vaut 200 kN·m, chargee a `M_Ed` = 100 kN·m, n'est PAS a l'ultime.
 * Ses armatures ne travaillent pas a `f_yd` — elles travaillent a une
 * contrainte que seul l'equilibre a cette charge-la peut donner. C'est
 * cette contrainte que ce module rend, barre par barre.
 *
 * POURQUOI UN SECOND SOLVEUR. `verifyUniaxial` cale toujours la fibre
 * extreme comprimee a `eps_cu2` : le champ de deformation n'a alors qu'UNE
 * inconnue, la profondeur d'axe neutre, et le moment qui en sort est le
 * moment RESISTANT. Ici la section n'est plus a l'ultime : le champ garde
 * ses DEUX degres de liberte, et il faut satisfaire `N = N_Ed` ET
 * `M = M_Ed` simultanement.
 *
 * METHODE : bissection imbriquee sur `eps(z) = eps_0 + kappa·(z − z_top)`.
 * L'interieure cale `eps_0` sur l'effort normal, l'exterieure cale `kappa`
 * sur le moment. Les integrateurs de fibres ne bougent pas : ils prennent
 * deja un `strainAt(z)` quelconque.
 *
 * LOIS DE CALCUL DE L'ELU (`f_cd`, `f_yd`, parabole-rectangle, beton tendu
 * neglige). Le `sigma_s` rendu ici N'EST PAS celui du §7.2 ni du §7.3, qui
 * sortent de la methode n sous combinaison de service avec `f_ck` et
 * `f_yk`. Deux nombres differents pour deux questions differentes ; les
 * confondre ferait conclure de travers dans les deux sens.
 *
 * Flexion droite. Convention du projet : `z` vers le bas, compression
 * positive, moment positif comprimant la fibre superieure.
 */

/** Etat d'une barre sous la sollicitation appliquee. */
export interface BarState {
  y: number;
  z: number;
  area: number;
  /** Deformation (positive en compression). */
  eps: number;
  /** Contrainte (MPa, positive en compression ; negative en traction). */
  sigma: number;
  /** Effort dans la barre (kN, positif en compression). */
  force: number;
  /** `|sigma| / f_yd` de l'acier de CETTE barre. */
  utilization: number;
  /** La barre a-t-elle plastifie ? */
  yielded: boolean;
}

export interface SectionStateResult {
  converged: boolean;
  /** Renseigne des que `converged` est faux. */
  reason: string | null;
  /** Deformation de la fibre superieure (positive en compression). */
  epsTop: number;
  /** Deformation de la fibre inferieure. */
  epsBottom: number;
  /** Courbure (1/mm). Negative en flexion positive, `z` etant vers le bas. */
  curvature: number;
  /**
   * Profondeur de l'axe neutre depuis la fibre superieure (mm).
   * `Infinity` quand la deformation est uniforme, `null` quand l'axe neutre
   * tombe hors de la section (entierement comprimee ou entierement tendue).
   */
  neutralAxisDepth: number | null;
  /** Resultantes ATTEINTES (kN, kN·m) — le controle du residu, pas une redite de l'entree. */
  N: number;
  M: number;
  bars: BarState[];
  /** Traction maximale des armatures (MPa, positive ; 0 si aucune barre tendue). */
  sigmaSMax: number;
  /** Compression maximale des armatures (MPa, positive ; 0 si aucune barre comprimee). */
  sigmaScMax: number;
  /** Plus fort `|sigma| / f_yd` de la section. */
  utilization: number;
  /** Deformation maximale du beton comprime, a comparer a `eps_cu2`. */
  epsCMax: number;
  /** La fibre la plus comprimee est-elle a `eps_cu2` ? La section est alors a l'ultime. */
  atUltimate: boolean;
}

export interface SectionStateOptions {
  /** Bandes d'integration. Defaut : celui du profil normatif. */
  nBands?: number;
  /**
   * Tolerance RELATIVE sur les residus d'equilibre. Defaut 1e-3.
   *
   * Elle ne peut pas etre arbitrairement fine : l'integration par bandes a
   * sa propre erreur, et exiger mieux qu'elle ferait echouer des cas
   * parfaitement resolus.
   */
  tolerance?: number;
}

function zRange(section: Section): { zTop: number; zBottom: number } {
  if (section.geometry.kind === 'rectangle') {
    const { height } = section.geometry;
    return { zTop: -height / 2, zBottom: height / 2 };
  }
  const zValues = section.geometry.vertices.map((v) => v.z);
  return { zTop: Math.min(...zValues), zBottom: Math.max(...zValues) };
}

function integrate(
  section: Section,
  strainAt: (z: number) => number,
  nBands: number
): StressResultant {
  if (section.geometry.kind === 'rectangle') {
    return integrateRectangle(
      section as Section & { geometry: RectangularGeometry },
      strainAt,
      nBands
    );
  }
  return integratePolygon(section as Section & { geometry: PolygonGeometry }, strainAt, nBands);
}

const echec = (motif: string): SectionStateResult => ({
  converged: false,
  reason: motif,
  epsTop: NaN,
  epsBottom: NaN,
  curvature: NaN,
  neutralAxisDepth: null,
  N: NaN,
  M: NaN,
  bars: [],
  sigmaSMax: NaN,
  sigmaScMax: NaN,
  utilization: NaN,
  epsCMax: NaN,
  atUltimate: false,
});

/**
 * Equilibre de la section sous `(N_Ed, M_Ed)`, avec les lois de calcul de
 * l'ELU.
 *
 * Rend `converged: false` avec un motif plutot qu'un nombre chaque fois que
 * l'equilibre n'existe pas — `M_Ed` au-dela de `M_Rd`, `N_Ed` au-dela de la
 * compression centree admissible. Une contrainte d'acier inventee sur une
 * section qui ne tient pas serait le pire des resultats : elle a l'air d'une
 * reponse.
 */
export function sectionStateAt(
  section: Section,
  action: Action,
  norm: NormProfile,
  options?: SectionStateOptions
): SectionStateResult {
  const nBands = options?.nBands ?? norm.nBands;
  const tolerance = options?.tolerance ?? 1e-3;

  const { epsCu2 } = section.concrete;
  const { zTop, zBottom } = zRange(section);
  const hauteur = zBottom - zTop;

  if (!(hauteur > 0)) return echec('sectionStateAt : hauteur de section nulle');

  const champ = (eps0: number, kappa: number) => (z: number) => eps0 + kappa * (z - zTop);

  /**
   * Effort normal a courbure fixee. MONOTONE CROISSANTE en `eps_0` tant
   * qu'aucune fibre ne depasse `eps_cu2` : c'est ce que la borne haute
   * ci-dessous garantit, et c'est ce qui autorise la bissection. Passe
   * `eps_cu2`, la loi du beton retombe a zero et la monotonie tomberait avec
   * elle.
   */
  const effortNormal = (eps0: number, kappa: number): number =>
    integrate(section, champ(eps0, kappa), nBands).N;

  /** Deformation maximale admise a la fibre de reference, pour cette courbure. */
  const eps0Max = (kappa: number): number => epsCu2 - Math.max(0, kappa * hauteur);

  /**
   * Cale `eps_0` sur l'effort normal impose. `null` quand la section ne peut
   * pas porter `N_Ed` a cette courbure — le beton y serait deja ecrase.
   */
  const caleEffortNormal = (kappa: number): number | null => {
    const haut = eps0Max(kappa);
    // Assez bas pour que tout l'acier soit a −f_yd et le beton hors service :
    // l'effort normal y est franchement negatif quelle que soit la section.
    const bas = -0.1 - Math.abs(kappa) * hauteur;

    if (effortNormal(haut, kappa) < action.N) return null;
    if (effortNormal(bas, kappa) > action.N) return null;

    let lo = bas;
    let hi = haut;
    for (let i = 0; i < 80; i++) {
      const milieu = (lo + hi) / 2;
      if (effortNormal(milieu, kappa) < action.N) lo = milieu;
      else hi = milieu;
    }
    return (lo + hi) / 2;
  };

  /** Moment a l'equilibre d'effort normal, pour une courbure donnee. */
  const momentA = (kappa: number): number | null => {
    const eps0 = caleEffortNormal(kappa);
    if (eps0 === null) return null;
    return integrate(section, champ(eps0, kappa), nBands).M;
  };

  const M0 = momentA(0);
  if (M0 === null) {
    return echec(
      `l effort normal N_Ed = ${action.N.toFixed(1)} kN ne peut pas etre equilibre : il depasse ` +
        'ce que la section peut porter en compression centree, ou en traction centree'
    );
  }

  // Le moment DECROIT quand la courbure croit : une courbure plus negative
  // comprime davantage la fibre superieure, dont le bras `−z` est positif.
  // On cherche donc `kappa` du cote oppose a l'ecart de moment.
  const sens = action.M > M0 ? -1 : 1;

  // Echelle naturelle de courbure : celle qui amenerait la fibre extreme a
  // `eps_cu2` sur la hauteur de la section.
  const pas = epsCu2 / hauteur;

  const echelleMoment = Math.max(Math.abs(action.M), Math.abs(M0), 1);

  /**
   * Le moment vise est-il atteint ou depasse ?
   *
   * STRICT, et il doit le rester : c'est le predicat de la bissection, et
   * l'assouplir ferait converger celle-ci vers le bord de la tolerance au
   * lieu de la racine — un resultat systematiquement decale, du montant
   * exact de la tolerance.
   */
  const atteint = (moment: number): boolean =>
    sens < 0 ? moment >= action.M : moment <= action.M;

  /**
   * Meme question, a la tolerance pres. Reservee a la FRONTIERE DE
   * FAISABILITE, ou le moment maximal n'est approche que par valeurs
   * inferieures : exiger l'egalite stricte y rejetterait `M_Ed = M_Rd`.
   */
  const atteintAuBord = (moment: number): boolean =>
    sens < 0
      ? moment >= action.M - tolerance * echelleMoment
      : moment <= action.M + tolerance * echelleMoment;

  let kappaBracket = 0;
  let momentBracket = M0;
  let kappaInfaisable: number | null = null;
  let trouve = false;

  for (let i = 1; i <= 60; i++) {
    const kappa = sens * pas * 2 ** (i - 1);
    const moment = momentA(kappa);
    if (moment === null) {
      // Au-dela de l'ultime : la courbure n'equilibre plus l'effort normal
      // sans ecraser le beton. La borne est retenue, pas jetee.
      kappaInfaisable = kappa;
      break;
    }
    kappaBracket = kappa;
    momentBracket = moment;
    if (atteint(moment)) {
      trouve = true;
      break;
    }
  }

  // LE POINT DELICAT DU SOLVEUR. `M_Rd` est atteint EXACTEMENT a la
  // frontiere de faisabilite — la fibre superieure y est a `eps_cu2` — et un
  // doublement de courbure passe de « en deca » a « infaisable » sans jamais
  // s'y poser. Sans ce resserrement, une section chargee tout juste a son
  // moment resistant serait declaree non equilibrable, ce qui est faux et
  // inexplicable pour qui vient de lire `M_Rd` a l'ecran.
  if (!trouve && kappaInfaisable !== null) {
    let faisable = kappaBracket;
    let infaisable = kappaInfaisable;

    for (let i = 0; i < 60; i++) {
      const milieu = (faisable + infaisable) / 2;
      const moment = momentA(milieu);
      if (moment === null) {
        infaisable = milieu;
      } else {
        faisable = milieu;
        momentBracket = moment;
      }
    }

    kappaBracket = faisable;
    if (atteintAuBord(momentBracket)) trouve = true;
  }

  if (!trouve) {
    return echec(
      `le moment M_Ed = ${action.M.toFixed(1)} kN·m n est pas equilibrable a N_Ed = ` +
        `${action.N.toFixed(1)} kN : il depasse le moment resistant de la section ` +
        `(le calcul plafonne a ${momentBracket.toFixed(1)} kN·m). Aucune contrainte d acier ` +
        "n est rendue : la section ne resiste pas, il n y a pas d etat d equilibre a decrire."
    );
  }

  let lo = 0;
  let hi = kappaBracket;
  for (let i = 0; i < 80; i++) {
    const milieu = (lo + hi) / 2;
    const moment = momentA(milieu);
    // Une courbure infaisable est forcement du cote « trop loin ».
    if (moment === null || atteint(moment)) hi = milieu;
    else lo = milieu;
  }

  const kappa = (lo + hi) / 2;
  const eps0 = caleEffortNormal(kappa);
  if (eps0 === null) return echec('l equilibre n a pas pu etre cale a la courbure retenue');

  const strainAt = champ(eps0, kappa);
  const resultante = integrate(section, strainAt, nBands);

  // CONTROLE DU RESIDU, et il n'est pas decoratif. L'argument de monotonie
  // qui fonde les deux bissections vaut pour les lois EC2 telles qu'elles
  // sont ecrites aujourd'hui ; il ne se transporte pas gratuitement a une
  // loi future. Verifier ce qu'on a effectivement atteint coute une
  // integration et evite d'affirmer un resultat faux.
  const residuN = Math.abs(resultante.N - action.N);
  const residuM = Math.abs(resultante.M - action.M);
  const echelleN = Math.max(Math.abs(action.N), 1);
  const echelleM = Math.max(Math.abs(action.M), 1);

  if (residuN > tolerance * echelleN || residuM > tolerance * echelleM) {
    return echec(
      `l equilibre n a pas converge : residus N = ${residuN.toFixed(3)} kN et ` +
        `M = ${residuM.toFixed(3)} kN·m, au-dela de la tolerance. Aucun etat n est rendu ` +
        'plutot qu un etat approximatif.'
    );
  }

  const bars: BarState[] = section.rebars.map((rebar) => {
    const eps = strainAt(rebar.z);
    const sigma = steelStress(eps, rebar.steel);
    return {
      y: rebar.y,
      z: rebar.z,
      area: rebar.area,
      eps,
      sigma,
      force: (sigma * rebar.area) / 1000,
      utilization: Math.abs(sigma) / rebar.steel.fyd,
      yielded: Math.abs(eps) >= rebar.steel.epsYd,
    };
  });

  const epsTop = strainAt(zTop);
  const epsBottom = strainAt(zBottom);
  const epsCMax = Math.max(epsTop, epsBottom);

  let neutralAxisDepth: number | null;
  if (kappa === 0) {
    neutralAxisDepth = Infinity;
  } else {
    const profondeur = -eps0 / kappa;
    neutralAxisDepth = profondeur >= 0 && profondeur <= hauteur ? profondeur : null;
  }

  return {
    converged: true,
    reason: null,
    epsTop,
    epsBottom,
    curvature: kappa,
    neutralAxisDepth,
    N: resultante.N,
    M: resultante.M,
    bars,
    sigmaSMax: bars.reduce((max, b) => Math.max(max, -b.sigma), 0),
    sigmaScMax: bars.reduce((max, b) => Math.max(max, b.sigma), 0),
    utilization: bars.reduce((max, b) => Math.max(max, b.utilization), 0),
    epsCMax,
    // `concreteStress` retombe a zero au-dela de `eps_cu2` : y etre, c'est
    // etre a l'ultime, et la marge de moment est alors epuisee.
    atUltimate: epsCMax >= epsCu2 * (1 - 1e-6),
  };
}

/**
 * Contrainte du beton a une cote donnee, pour tracer le diagramme de l'etat
 * rendu par `sectionStateAt`.
 *
 * Fonction d'AFFICHAGE : elle relit le champ de deformation, elle ne
 * resout rien.
 */
export function concreteStressAt(
  section: Section,
  state: SectionStateResult,
  z: number
): number {
  const { zTop } = zRange(section);
  const eps = state.epsTop + state.curvature * (z - zTop);
  return concreteStress(eps, section.concrete);
}
