import type { Section, Action } from '../model/section';
import type { ServiceOptions } from './verify-service';
import { verifyServiceUniaxial } from './verify-service';
import { effectiveTensionArea, equivalentBarDiameter } from './effective-area';

export interface CrackOptions {
  /**
   * Ouverture limite (mm). Defaut 0,3.
   *
   * ATTENTION : la limite depend de la CLASSE D'EXPOSITION (tableau 7.1N :
   * 0,4 / 0,3 / 0,2 mm), que ce module ignore. 0,3 correspond au cas courant
   * XC2-XC4 en beton arme ; ce n'est pas une valeur normative universelle.
   */
  wMax?: number;
  /** Duree de chargement. Defaut 0,4 (longue duree, combinaison quasi-permanente). */
  kt?: number;
  /** Adherence : 0,8 pour barres a haute adherence (defaut), 1,6 pour barres lisses. */
  k1?: number;
  /** Distribution : 0,5 en flexion (defaut), 1,0 en traction pure. */
  k2?: number;
  k3?: number;
  k4?: number;
  /** Resistance moyenne a la traction (MPa). Defaut : 0,30·fck^(2/3). */
  fctm?: number;
  /** Module secant du beton (MPa). Defaut : 22000·((fck+8)/10)^0,3. */
  ecm?: number;
  /** Enrobage a la SURFACE des barres tendues (mm). Defaut : deduit de la geometrie. */
  cover?: number;
  service?: ServiceOptions;
}

export interface CrackResult {
  wk: number;
  wMax: number;
  ok: boolean;
  srMax: number;
  epsilonDifference: number;
  acEff: number;
  rhoEff: number;
  phiEq: number;
  /** `true` si l'eq. 7.14 a servi, l'espacement sortant du domaine de 7.11. */
  wideSpacing: boolean;
  sigmaS: number;
  reason?: string;
  converged: boolean;
}

/** Resistance moyenne a la traction, EN 1992-1-1 tableau 3.1 (fck <= 50). */
function fctmDepuisFck(fck: number): number {
  return fck <= 50 ? 0.3 * fck ** (2 / 3) : 2.12 * Math.log(1 + (fck + 8) / 10);
}

/** Module secant, EN 1992-1-1 tableau 3.1 (MPa). */
function ecmDepuisFck(fck: number): number {
  return 22000 * ((fck + 8) / 10) ** 0.3;
}

/**
 * Ouverture de fissures d'une section rectangulaire flechie (§7.3.4).
 *
 * S'APPUIE SUR LE CALCUL DE SERVICE de la session 6 : la contrainte des
 * armatures et la profondeur d'axe neutre en proviennent, rien n'est
 * recalcule ici. Si ce calcul ne converge pas — section entierement
 * comprimee, donc non fissuree — il n'y a pas de fissure a evaluer et le
 * resultat le dit.
 *
 * Aucun coefficient partiel n'intervient : vérification en SERVICE, sur les
 * valeurs caracteristiques.
 */
export function verifyCrackWidth(
  section: Section,
  action: Action,
  options?: CrackOptions
): CrackResult {
  const wMax = options?.wMax ?? 0.3;
  const kt = options?.kt ?? 0.4;
  const k1 = options?.k1 ?? 0.8;
  const k2 = options?.k2 ?? 0.5;
  const k3 = options?.k3 ?? 3.4;
  const k4 = options?.k4 ?? 0.425;

  // Leve avant tout calcul si la geometrie n'est pas rectangulaire.
  //
  // CORRECTION PAR RAPPORT AU PLAN INITIAL : `verifyServiceUniaxial` ne fait
  // aucune restriction de geometrie (il gere nativement les polygones,
  // depuis la session 6) ; seul `effectiveTensionArea`, plus bas, la
  // restreint aux rectangles. Sans ce garde explicite, une section
  // polygonale SANS armature (cas du test "refuse une geometrie non
  // rectangulaire") echoue d'abord dans `verifyServiceUniaxial` avec un
  // motif de non-convergence ("entierement comprimee"), sans jamais
  // atteindre le message attendu — verifie empiriquement en executant le
  // test avant ce correctif. Le garde ici fait porter la restriction par le
  // module qui la revendique, indépendamment du resultat du calcul de
  // service.
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      "verifyCrackWidth : geometrie non rectangulaire. Les formules d'ouverture de fissure " +
        'du §7.3.4 supposent une zone tendue rectangulaire et ne sont pas transposables telles quelles.'
    );
  }

  const service = verifyServiceUniaxial(section, action, options?.service);

  const echec = (motif: string): CrackResult => ({
    wk: NaN,
    wMax,
    ok: false,
    srMax: NaN,
    epsilonDifference: NaN,
    acEff: NaN,
    rhoEff: NaN,
    phiEq: NaN,
    wideSpacing: false,
    sigmaS: NaN,
    reason: motif,
    converged: false,
  });

  if (!service.converged) {
    return echec(
      `le calcul de service ne converge pas, il n'y a pas de section fissuree a verifier (${service.reason ?? 'cause non precisee'})`
    );
  }

  const h = section.geometry.kind === 'rectangle' ? section.geometry.height : NaN;
  const x = service.neutralAxisZ + h / 2; // depuis la fibre comprimee
  const aire = effectiveTensionArea(section, x);

  if (aire.asEff <= 0) {
    return echec('aucune armature dans l aire effective de beton tendu');
  }

  const fctm = options?.fctm ?? fctmDepuisFck(section.concrete.fck);
  const ecm = options?.ecm ?? ecmDepuisFck(section.concrete.fck);
  const Es = aire.bars[0].steel.Es;
  const alphaE = Es / ecm;

  const rhoEff = aire.asEff / aire.acEff;
  const phiEq = equivalentBarDiameter(aire.bars.map((b) => b.area));
  const sigmaS = service.sigmaS;

  // Eq. 7.9, avec son plancher : sous faible sollicitation le terme entre
  // crochets devient negatif, et c'est 0,6·sigmaS/Es qui gouverne.
  const terme = (sigmaS - kt * (fctm / rhoEff) * (1 + alphaE * rhoEff)) / Es;
  const plancher = (0.6 * sigmaS) / Es;
  const epsilonDifference = Math.max(terme, plancher);

  // Enrobage a la surface de la barre. Deduit de la geometrie : distance de
  // la face tendue au centre de la barre, moins le demi-diametre.
  const cover = options?.cover ?? h / 2 - Math.max(...aire.bars.map((b) => b.z)) - phiEq / 2;

  // Domaine de validite de l'eq. 7.11 : l'espacement des barres tendues ne
  // doit pas depasser 5·(c + phi/2). Au-dela, la norme impose l'eq. 7.14.
  // Appliquer 7.11 hors de son domaine sous-estimerait l'ouverture, donc
  // rendrait un resultat dangereux.
  const ys = aire.bars.map((b) => b.y).sort((a, b) => a - b);
  let espacementMax = 0;
  for (let i = 1; i < ys.length; i++) espacementMax = Math.max(espacementMax, ys[i] - ys[i - 1]);
  const wideSpacing = espacementMax > 5 * (cover + phiEq / 2);

  const srMax = wideSpacing
    ? 1.3 * (h - x)
    : k3 * cover + (k1 * k2 * k4 * phiEq) / rhoEff;

  const wk = srMax * epsilonDifference;
  const ok = wk <= wMax;

  return {
    wk,
    wMax,
    ok,
    srMax,
    epsilonDifference,
    acEff: aire.acEff,
    rhoEff,
    phiEq,
    wideSpacing,
    sigmaS,
    ...(ok
      ? {}
      : {
          reason: `ouverture de fissure ${wk.toFixed(3)} mm au-dela de la limite ${wMax.toFixed(3)} mm`,
        }),
    converged: true,
  };
}
