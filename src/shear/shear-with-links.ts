import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { ShearGeometry } from './shear-geometry';
import { shearGeometry } from './shear-geometry';

export interface ShearReinforcement {
  /** Aire totale des brins d'un cours de cadres (mm²). */
  Asw: number;
  /** Espacement des cours (mm). */
  s: number;
  /** Limite elastique des cadres (MPa). */
  fywk: number;
}

export interface ShearWithLinksOptions {
  /** `cot theta`, entre 1 et 2,5 (§6.2.3(2)). Defaut 2,5. */
  cotTheta?: number;
  /** `alpha_cw`. Defaut 1 : pas de precontrainte dans ce module. */
  alphaCw?: number;
  /** `nu_1`. Defaut : `0,6 · (1 − f_ck / 250)` (eq. 6.6N). */
  nu1?: number;
  /** Sens du moment concomitant, qui fixe la zone tendue donc `d`. Defaut `1`. */
  sensDuMoment?: 1 | -1;
}

export interface ShearWithLinksResult {
  /** Resistance des cadres, eq. 6.8 (kN). */
  VRds: number;
  /** Resistance des bielles de beton, eq. 6.9 (kN). */
  VRdmax: number;
  /** Resistance retenue (kN) : `min(V_Rd,s ; V_Rd,max)`. */
  VRd: number;
  /**
   * `true` quand ce sont les BIELLES qui gouvernent. Diagnostic distinct :
   * ajouter des cadres n'y changerait rien, il faut agrandir la section.
   */
  strutsGovern: boolean;
  cotTheta: number;
  /** Bras de levier retenu (mm) : `0,9 · d`. */
  z: number;
  nu1: number;
  alphaCw: number;
  /** Limite elastique de calcul des cadres (MPa) : `f_ywk / gamma_s`. */
  fywd: number;
  geometry: ShearGeometry;
}

/**
 * Resistance a l'effort tranchant AVEC armatures d'ame (EN 1992-1-1:2004
 * §6.2.3), modele du treillis a inclinaison variable :
 *
 *   V_Rd,s   = (A_sw / s) · z · f_ywd · cot(theta)                           (6.8)
 *   V_Rd,max = alpha_cw · b_w · z · nu1 · f_cd / ( cot(theta) + tan(theta) ) (6.9)
 *
 * `cot theta` est une ENTREE, pas une constante : l'EC2 laisse
 * `1 <= cot theta <= 2,5` et le choix est un arbitrage d'ingenieur. `2,5`
 * (le defaut) minimise les cadres et sollicite le plus les bielles ; `1`
 * fait l'inverse. Hors de ces bornes, le calcul est REFUSE plutot
 * qu'ecrete : ecreter en silence masquerait une hypothese fausse.
 *
 * Conformement au §6.2.3(1), `V_Rd,c` ne s'ajoute PAS a `V_Rd,s` : des qu'il
 * y a des armatures d'ame, la resistance est `min(V_Rd,s ; V_Rd,max)`.
 *
 * VERIFICATION A L'ELU : `f_cd` et `f_ywd`, donc un `NormProfile`. C'est
 * l'inverse des modules de service, qui n'appliquent aucun coefficient
 * partiel.
 *
 * Limites assumees : sections rectangulaires seules, cadres DROITS
 * (`alpha = 90°`, pas de bielles d'acier inclinees), pas de precontrainte,
 * pas de torsion.
 */
export function shearWithLinks(
  section: Section,
  links: ShearReinforcement,
  norm: NormProfile,
  options?: ShearWithLinksOptions
): ShearWithLinksResult {
  const cotTheta = options?.cotTheta ?? 2.5;

  if (!(cotTheta >= 1 && cotTheta <= 2.5)) {
    throw new Error(
      `shearWithLinks : cot theta = ${cotTheta} hors du domaine du §6.2.3(2), qui impose ` +
        '1 <= cot theta <= 2,5. Valeur refusee plutot qu ecretee en silence.'
    );
  }
  if (!(links.s > 0)) {
    throw new Error('shearWithLinks : espacement des cadres nul ou negatif');
  }
  if (!(links.Asw > 0)) {
    throw new Error('shearWithLinks : aire A_sw des cadres nulle ou negative');
  }

  const geometry = shearGeometry(section, options?.sensDuMoment ?? 1);
  const { bw, d } = geometry;
  const fck = section.concrete.fck;
  const fcd = section.concrete.fcd;

  // Bras de levier forfaitaire du §6.2.3(1), l'approximation usuelle pour
  // une section flechie sans effort normal significatif.
  const z = 0.9 * d;

  const nu1 = options?.nu1 ?? 0.6 * (1 - fck / 250);
  const alphaCw = options?.alphaCw ?? 1;
  const fywd = links.fywk / norm.gammaS;

  const VRds = ((links.Asw / links.s) * z * fywd * cotTheta) / 1000;
  const VRdmax = (alphaCw * bw * z * nu1 * fcd) / (cotTheta + 1 / cotTheta) / 1000;

  return {
    VRds,
    VRdmax,
    VRd: Math.min(VRds, VRdmax),
    strutsGovern: VRdmax < VRds,
    cotTheta,
    z,
    nu1,
    alphaCw,
    fywd,
    geometry,
  };
}
