import type { Section, Action } from '../model/section';
import type { Vertex } from '../geometry/polygon';
import type { ServiceLimits, ServiceResult } from './verify-service';
import { rectangleToPolygon } from '../geometry/rectangle';
import { fctmDepuisFck } from '../model/concrete';
import { uncrackedProperties } from './uncracked-section';
import { verifyServiceUniaxial } from './verify-service';

/**
 * ETAT DE FISSURATION D'UNE SECTION EN SERVICE (EN 1992-1-1 §7.1(2)).
 *
 * La question que ce module tranche : sous une sollicitation de SERVICE, le
 * beton tendu travaille-t-il encore, ou la section a-t-elle fissure ?
 *
 *   - **etat I** — section NON fissuree : tout le beton participe, traction
 *     comprise. C'est l'etat tant que la contrainte de traction extreme
 *     reste sous `f_ct,eff`.
 *   - **etat II** — section FISSUREE : le beton tendu est integralement
 *     neglige. C'est l'hypothese, et la seule, de `verifyServiceUniaxial`.
 *
 * Le §7.1(2) pose le critere : la section est non fissuree tant que la
 * contrainte de traction du beton reste sous `f_ctm`. Ce module l'applique,
 * rend le MOMENT DE FISSURATION `M_cr` — la marge se lit alors directement,
 * et pas seulement un oui/non — et laisse l'utilisateur FORCER l'un ou
 * l'autre etat.
 *
 * ⚠ SOLLICITATION DE SERVICE, JAMAIS CELLE DE L'ELU. Reprendre `M_Ed` de
 * l'ELU ici surestimerait le moment d'un facteur 1,35 a 1,5 et declarerait
 * fissurees des sections qui ne le sont pas. Le format de modele separe
 * deliberement `ActionModel` et `ServiceActionModel` pour cette raison ;
 * c'est la combinaison QUASI-PERMANENTE qui gouverne la fissuration.
 *
 * ⚠ CE N'EST PAS UNE RESISTANCE. La traction du beton n'entre nulle part
 * dans un `M_Rd` : le §3.1.7 l'exclut de l'ELU, et ce module ne vit qu'au
 * service. Il diagnostique, il ne resiste pas.
 *
 * Flexion droite uniquement, comme tout le module de service.
 */

/** Etat de la section vis-a-vis de la fissuration. */
export type CrackingState = 'uncracked' | 'cracked';

/**
 * Comment l'etat est choisi.
 *
 * - `auto` : par le critere du §7.1(2). C'est le defaut.
 * - `uncracked` : etat I impose — voir les contraintes non fissurees meme
 *   quand la section fissure.
 * - `cracked` : etat II impose — le beton tendu neglige, cas ENVELOPPE et
 *   comportement historique de l'outil.
 */
export type CrackingMode = 'auto' | 'uncracked' | 'cracked';

export interface CrackingStateOptions {
  /** Coefficient d'equivalence. Defaut 15, comme `verifyServiceUniaxial`. */
  n?: number;
  /** Bandes d'integration. Defaut 400. */
  nBands?: number;
  /**
   * Resistance a la traction retenue pour le critere (MPa). Defaut `f_ctm` a
   * 28 jours.
   *
   * EDITABLE a dessein, et pour la meme raison que dans le §7.3.2 : la
   * fissuration au jeune age survient quand le beton est loin de sa valeur a
   * 28 jours. Retenir `f_ctm` est ici le cas OPTIMISTE — il repousse la
   * fissuration — a l'inverse exact du minimum d'armature, ou c'est le cas
   * defavorable. La meme valeur ne joue pas le meme role dans les deux
   * calculs, et il vaut mieux le savoir.
   */
  fctEff?: number;
  mode?: CrackingMode;
  limits?: ServiceLimits;
}

/** Contraintes de la section homogeneisee NON fissuree (etat I). */
export interface UncrackedState {
  /** Centre de gravite de la section HOMOGENEISEE (mm) — pas celui du beton seul. */
  zG: number;
  /** Aire homogeneisee (mm²). */
  A: number;
  /** Inertie homogeneisee autour de `zG` (mm⁴). */
  I: number;
  /** Contrainte du beton en fibre superieure (MPa, positive en compression). */
  sigmaCTop: number;
  /** Contrainte du beton en fibre inferieure (MPa, positive en compression). */
  sigmaCBottom: number;
  /** Compression maximale du beton (MPa, positive ; 0 si aucune fibre comprimee). */
  sigmaC: number;
  /** TRACTION maximale du beton (MPa, positive ; 0 si aucune fibre tendue). */
  sigmaCt: number;
  /** Fibre ou la traction est maximale. `null` quand la section est entierement comprimee. */
  tensionFibre: 'top' | 'bottom' | null;
  /** Traction maximale des armatures (MPa, positive ; 0 si aucune barre tendue). */
  sigmaS: number;
  /** Axe neutre elastique (mm) ; `null` si la section est entierement comprimee ou tendue. */
  neutralAxisZ: number | null;
}

export interface CrackingStateResult {
  mode: CrackingMode;
  /** Etat RETENU, apres application du mode. */
  state: CrackingState;
  /** L'etat retenu vient d'un forcage et non du critere du §7.1(2). */
  forced: boolean;
  /** Etat que le critere du §7.1(2) designe, quel que soit le mode. */
  criterionState: CrackingState;
  fctEff: number;
  /**
   * Moment qui amene la fibre extreme tendue a `f_ct,eff`, a effort normal
   * constant (kN·m, du signe du moment applique).
   *
   * `null` quand la notion n'a pas de sens — typiquement lorsque l'effort
   * normal seul fissure deja la section : `Mcr` vaudrait alors zero sans
   * rien dire d'utile. `McrReason` porte le motif.
   */
  Mcr: number | null;
  McrReason: string | null;
  /** Toujours calcule : c'est lui qui porte le critere. */
  uncracked: UncrackedState;
}

const LIMITES_PAR_DEFAUT: ServiceLimits = { k1: 0.6, k3: 0.8 };

function verticesDe(section: Section): Vertex[] {
  return section.geometry.kind === 'rectangle'
    ? rectangleToPolygon(section.geometry).vertices
    : section.geometry.vertices;
}

/**
 * Diagramme de contraintes de l'etat I sous `(N, M)`.
 *
 * Le champ est lineaire, `sigma(z) = a + b·(z − zG)`, et ses deux
 * coefficients sortent en ferme de l'equilibre de la section HOMOGENEISEE :
 *
 *     a = N / A                    (l'aire ne voit que l'effort normal)
 *     b = −(M + N·zG) / I₀
 *
 * Le signe de `b` merite l'attention : l'integrateur du projet compte le
 * moment avec un bras `−z` (voir `fiber-rectangle.ts`), donc un moment
 * POSITIF comprime la fibre SUPERIEURE. Avec `z` vers le bas, cela impose
 * `b < 0` en flexion positive — la contrainte decroit vers le bas. Une
 * erreur de signe ici inverserait la face tendue, donc le verdict de
 * fissuration : c'est le piege principal du module.
 *
 * `zG` est le centre de gravite de la section HOMOGENEISEE, pas celui du
 * beton : les armatures le decalent, et l'ignorer fausserait `M_cr` sur
 * toute section a ferraillage dissymetrique.
 */
function etatI(
  section: Section,
  action: Action,
  n: number,
  nBands: number
): { state: UncrackedState; a: number; b: number; zTop: number; zBottom: number } {
  const proprietes = uncrackedProperties(section, n, nBands);
  const A = proprietes.A;
  const zG = proprietes.S / A;
  // Transport au centre de gravite homogeneise (Huygens).
  const I = proprietes.I - A * zG ** 2;

  const zValues = verticesDe(section).map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);

  const N = action.N * 1000; // kN -> N
  const M = action.M * 1e6; // kN·m -> N·mm

  const a = N / A;
  const b = -(M + N * zG) / I;

  const sigmaEn = (z: number): number => a + b * (z - zG);

  const sigmaCTop = sigmaEn(zTop);
  const sigmaCBottom = sigmaEn(zBottom);

  const sigmaC = Math.max(0, sigmaCTop, sigmaCBottom);
  const tractionHaut = Math.max(0, -sigmaCTop);
  const tractionBas = Math.max(0, -sigmaCBottom);
  const sigmaCt = Math.max(tractionHaut, tractionBas);

  const tensionFibre: 'top' | 'bottom' | null =
    sigmaCt === 0 ? null : tractionHaut >= tractionBas ? 'top' : 'bottom';

  // Contrainte d'une barre : `n` fois celle du beton a sa fibre — meme
  // regle que `verifyServiceUniaxial`. Le `(n−1)` des barres comprimees
  // porte sur l'EQUILIBRE (beton deplace), jamais sur la contrainte de
  // l'acier lui-meme.
  let sigmaS = 0;
  for (const rebar of section.rebars) {
    const traction = -n * sigmaEn(rebar.z);
    if (traction > sigmaS) sigmaS = traction;
  }

  let neutralAxisZ: number | null = null;
  if (b !== 0) {
    const zNa = zG - a / b;
    if (zNa >= zTop && zNa <= zBottom) neutralAxisZ = zNa;
  }

  return {
    state: {
      zG,
      A,
      I,
      sigmaCTop,
      sigmaCBottom,
      sigmaC,
      sigmaCt,
      tensionFibre,
      sigmaS,
      neutralAxisZ,
    },
    a,
    b,
    zTop,
    zBottom,
  };
}

/**
 * Moment de fissuration a effort normal constant (kN·m).
 *
 * On resout `sigma(z_f) = −f_ct,eff` sur chacune des deux fibres extremes —
 * c'est lineaire en `M`, donc une forme fermee — et on retient la solution
 * DU SIGNE DU MOMENT APPLIQUE, la plus proche de zero : c'est celle que la
 * sollicitation atteint en croissant.
 *
 * Le cas ou l'effort normal fissure deja seul est ecarte AVANT le calcul :
 * `M_cr` y serait un nombre parfaitement calculable et parfaitement
 * trompeur, puisque la fissuration ne dependrait pas du moment.
 */
function momentDeFissuration(params: {
  a: number;
  A: number;
  I: number;
  zG: number;
  zTop: number;
  zBottom: number;
  N: number;
  M: number;
  fctEff: number;
}): { Mcr: number | null; reason: string | null } {
  const { a, I, zG, zTop, zBottom, N, M, fctEff } = params;

  // Traction sous l'effort normal seul : `sigma = a` partout.
  if (-a >= fctEff) {
    return {
      Mcr: null,
      reason:
        "l effort normal seul amene le beton a f_ct,eff : la section fissure quel que soit le moment, " +
        'et un moment de fissuration n aurait pas de sens',
    };
  }

  const candidats: number[] = [];
  for (const zf of [zTop, zBottom]) {
    const bras = zf - zG;
    if (bras === 0) continue;
    // sigma(zf) = a − (M + N·zG)·bras/I = −fctEff
    candidats.push((I * (a + fctEff)) / bras - N * zG);
  }

  // Le sens dans lequel la sollicitation croit. A moment nul, c'est le sens
  // positif par convention : la fibre inferieure est alors celle qui tend.
  const sens = M < 0 ? -1 : 1;
  const utiles = candidats.filter((valeur) => valeur * sens > 0);

  if (utiles.length === 0) {
    return {
      Mcr: null,
      reason:
        'aucune fibre extreme n atteint f_ct,eff en faisant croitre le moment dans son sens ' +
        'actuel : la fissuration n est pas gouvernee par le moment ici',
    };
  }

  const Mcr = utiles.reduce((min, valeur) => (Math.abs(valeur) < Math.abs(min) ? valeur : min));
  return { Mcr: Mcr / 1e6, reason: null }; // N·mm -> kN·m
}

/**
 * Etat de fissuration sous sollicitation de service, et moment de
 * fissuration associe.
 */
export function crackingState(
  section: Section,
  action: Action,
  options?: CrackingStateOptions
): CrackingStateResult {
  const n = options?.n ?? 15;
  const nBands = options?.nBands ?? 400;
  const fctEff = options?.fctEff ?? fctmDepuisFck(section.concrete.fck);
  const mode = options?.mode ?? 'auto';

  const { state, a, zTop, zBottom } = etatI(section, action, n, nBands);

  const criterionState: CrackingState = state.sigmaCt >= fctEff ? 'cracked' : 'uncracked';
  const retenu: CrackingState = mode === 'auto' ? criterionState : mode;

  const { Mcr, reason } = momentDeFissuration({
    a,
    A: state.A,
    I: state.I,
    zG: state.zG,
    zTop,
    zBottom,
    N: action.N * 1000,
    M: action.M * 1e6,
    fctEff,
  });

  return {
    mode,
    state: retenu,
    forced: mode !== 'auto' && retenu !== criterionState,
    criterionState,
    fctEff,
    Mcr,
    McrReason: reason,
    uncracked: state,
  };
}

/** Verification des contraintes de service, sur l'ETAT RETENU. */
export interface ServiceStateResult {
  cracking: CrackingStateResult;
  /**
   * Analyse de l'etat II, calculee uniquement lorsque cet etat est RETENU.
   * `null` en etat I : la calculer quand meme afficherait des contraintes
   * issues d'une hypothese que le §7.1(2) vient d'ecarter.
   */
  cracked: ServiceResult | null;
  /** Compression du beton de l'etat retenu (MPa, positive). */
  sigmaC: number;
  /** Traction des aciers de l'etat retenu (MPa, positive). */
  sigmaS: number;
  sigmaCLimit: number;
  sigmaSLimit: number;
  ok: boolean;
  reason?: string;
  converged: boolean;
}

/**
 * Contraintes de service du §7.2, appliquees a l'etat que le §7.1(2)
 * designe — ou a celui que l'utilisateur impose.
 *
 * CE QUE CELA CORRIGE. `verifyServiceUniaxial` suppose TOUJOURS la section
 * fissuree. Sur une section qui ne fissure pas, negliger le beton tendu
 * reporte tout l'effort de traction sur les armatures et SURESTIME
 * `sigma_s` — parfois largement. Le verdict du §7.2 s'en trouvait
 * pessimiste sans que rien ne le signale.
 */
export function verifyServiceState(
  section: Section,
  action: Action,
  options?: CrackingStateOptions
): ServiceStateResult {
  const limits = options?.limits ?? LIMITES_PAR_DEFAUT;
  const cracking = crackingState(section, action, options);

  const sigmaCLimit = limits.k1 * section.concrete.fck;
  const sigmaSLimit = limits.k3 * (section.rebars.length > 0 ? section.rebars[0].steel.fyk : 0);

  if (cracking.state === 'cracked') {
    const etatII = verifyServiceUniaxial(section, action, {
      n: options?.n,
      nBands: options?.nBands,
      limits,
    });

    return {
      cracking,
      cracked: etatII,
      sigmaC: etatII.sigmaC,
      sigmaS: etatII.sigmaS,
      sigmaCLimit,
      sigmaSLimit,
      ok: etatII.ok,
      ...(etatII.reason === undefined ? {} : { reason: etatII.reason }),
      converged: etatII.converged,
    };
  }

  const { sigmaC, sigmaS } = cracking.uncracked;
  const betonDepasse = sigmaC > sigmaCLimit;
  const acierDepasse = sigmaS > sigmaSLimit;

  const motifs: string[] = [];
  if (betonDepasse) {
    motifs.push(
      `compression du beton ${sigmaC.toFixed(1)} MPa au-dela de la limite ${sigmaCLimit.toFixed(1)} MPa`
    );
  }
  if (acierDepasse) {
    motifs.push(
      `traction de l acier ${sigmaS.toFixed(1)} MPa au-dela de la limite ${sigmaSLimit.toFixed(1)} MPa`
    );
  }

  const ok = !betonDepasse && !acierDepasse;

  return {
    cracking,
    cracked: null,
    sigmaC,
    sigmaS,
    sigmaCLimit,
    sigmaSLimit,
    ok,
    ...(ok ? {} : { reason: motifs.join(' ; ') }),
    // L'etat I est une forme fermee : il n'y a rien a faire converger.
    converged: true,
  };
}
