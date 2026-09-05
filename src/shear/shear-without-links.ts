import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { ShearGeometry } from './shear-geometry';
import { shearGeometry } from './shear-geometry';

export interface ShearWithoutLinksOptions {
  /** `C_Rd,c`. Defaut : `0,18 / gamma_c`, le gamma_c du profil normatif. */
  CRdc?: number;
  /** `k_1`, coefficient de l'effort normal. Defaut 0,15 (valeur recommandee). */
  k1?: number;
  /** `v_min` (MPa). Defaut : `0,035 · k^(3/2) · f_ck^(1/2)` (eq. 6.3N). */
  vMin?: number;
  /** Sens du moment concomitant, qui fixe la zone tendue. Defaut `1`. */
  sensDuMoment?: 1 | -1;
}

export interface ShearWithoutLinksResult {
  /** Resistance retenue (kN) : le plus grand de l'eq. 6.2.a et de son plancher. */
  VRdc: number;
  /** Eq. 6.2.a seule (kN). */
  VRdcEquation: number;
  /** Plancher de l'eq. 6.2.b (kN). */
  VRdcMinimum: number;
  /** `true` quand c'est le plancher 6.2.b qui gouverne. */
  minimumGoverns: boolean;
  /** Coefficient d'echelle, deja ecrete a 2,0. */
  k: number;
  /** Taux d'armature longitudinale, deja ecrete a 0,02. */
  rhoL: number;
  /** Contrainte moyenne de compression (MPa), nulle en traction, plafonnee. */
  sigmaCp: number;
  CRdc: number;
  k1: number;
  vMin: number;
  geometry: ShearGeometry;
}

/**
 * Resistance a l'effort tranchant SANS armature d'ame (EN 1992-1-1:2004
 * §6.2.2), eq. 6.2.a et son plancher 6.2.b :
 *
 *   V_Rd,c = [ C_Rd,c · k · (100 · rho_l · f_ck)^(1/3) + k1 · sigma_cp ] · b_w · d
 *   V_Rd,c >= ( v_min + k1 · sigma_cp ) · b_w · d
 *
 * VERIFICATION A L'ELU : le calcul travaille sur `f_cd` et prend un
 * `NormProfile`. C'est l'exact inverse des modules de service (sessions 6 a
 * 8), qui travaillent sur les valeurs caracteristiques sans aucun
 * coefficient partiel. Ne pas transposer l'un a l'autre.
 *
 * `N_Ed` est en kN, positif en COMPRESSION, comme partout dans ce noyau.
 * `V_Rd,c` est rendu en kN : les newtons issus de `MPa × mm²` sont divises
 * par 1000.
 *
 * Limites assumees : sections rectangulaires seules, pas de precontrainte,
 * pas de majoration pour charge proche d'appui (§6.2.2(6)), pas de
 * verification au droit de l'appui.
 */
export function shearWithoutLinks(
  section: Section,
  N_Ed: number,
  norm: NormProfile,
  options?: ShearWithoutLinksOptions
): ShearWithoutLinksResult {
  const geometry = shearGeometry(section, options?.sensDuMoment ?? 1);
  const { bw, d, Asl, Ac } = geometry;
  const fck = section.concrete.fck;

  const CRdc = options?.CRdc ?? 0.18 / norm.gammaC;
  const k1 = options?.k1 ?? 0.15;

  // ECRETAGE 1 — `k <= 2,0`, avec `d` en mm. L'oublier surestime la
  // resistance de toute section mince (d < 200 mm), donc des dalles.
  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);

  // ECRETAGE 2 — `rho_l <= 0,02`. L'oublier surestime la resistance de
  // toute section fortement armee.
  const rhoL = Math.min(Asl / (bw * d), 0.02);

  const vMin = options?.vMin ?? 0.035 * k ** 1.5 * Math.sqrt(fck);

  // `sigma_cp = N_Ed / A_c`, plafonnee a `0,2 · f_cd`.
  //
  // NULLE EN TRACTION, par choix explicite : le §6.2.2(1) n'ecrit
  // l'expression que pour la compression, et rien n'y autorise a prolonger
  // le terme dans les negatifs. Poser `sigma_cp = 0` est le parti sur — un
  // terme negatif reduirait la resistance sans fondement normatif, mais
  // surtout la traction appelle un traitement propre que ce module ne fait
  // pas.
  const sigmaCpBrut = (Math.max(N_Ed, 0) * 1000) / Ac;
  const sigmaCp = Math.min(sigmaCpBrut, 0.2 * section.concrete.fcd);

  const contrainteEquation = CRdc * k * (100 * rhoL * fck) ** (1 / 3) + k1 * sigmaCp;
  const contrainteMinimum = vMin + k1 * sigmaCp;

  const VRdcEquation = (contrainteEquation * bw * d) / 1000;
  const VRdcMinimum = (contrainteMinimum * bw * d) / 1000;
  const minimumGoverns = VRdcMinimum > VRdcEquation;

  return {
    VRdc: Math.max(VRdcEquation, VRdcMinimum),
    VRdcEquation,
    VRdcMinimum,
    minimumGoverns,
    k,
    rhoL,
    sigmaCp,
    CRdc,
    k1,
    vMin,
    geometry,
  };
}
