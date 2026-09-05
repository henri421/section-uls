import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { ShearWithoutLinksResult } from './shear-without-links';
import type { ShearReinforcement, ShearWithLinksResult } from './shear-with-links';
import { shearWithoutLinks } from './shear-without-links';
import { shearWithLinks } from './shear-with-links';

export type { ShearReinforcement } from './shear-with-links';

export interface ShearAction {
  /** Effort tranchant sollicitant (kN). */
  V_Ed: number;
  /** Effort normal concomitant (kN), positif en compression. */
  N_Ed: number;
}

/**
 * Les trois facons d'echouer au tranchant, qui n'appellent PAS la meme
 * correction :
 *
 * - `armatures-necessaires` : sans cadres, `V_Ed` depasse `V_Rd,c`. Ce n'est
 *   pas un defaut de section, il faut des armatures d'ame.
 * - `cadres-insuffisants` : `V_Ed` depasse `V_Rd,s`. Resserrer ou grossir
 *   les cadres suffit.
 * - `bielles-ecrasees` : `V_Ed` depasse `V_Rd,max`. La section est trop
 *   petite, et AUCUN cadre supplementaire n'y changera quoi que ce soit.
 */
export type ShearFailureMode =
  | 'armatures-necessaires'
  | 'cadres-insuffisants'
  | 'bielles-ecrasees';

export interface ShearResult {
  ok: boolean;
  /** `|V_Ed|` / resistance retenue. */
  utilization: number;
  /** Resistance retenue (kN). */
  VRd: number;
  /** Resistance sans armature d'ame (kN), toujours calculee. */
  VRdc: number;
  /** `true` si `|V_Ed| > V_Rd,c` : le calcul exige des armatures d'ame. */
  shearReinforcementRequired: boolean;
  /** Resistance des cadres (kN) ; `null` en l'absence de cadres declares. */
  VRds: number | null;
  /** Resistance des bielles (kN) ; `null` en l'absence de cadres declares. */
  VRdmax: number | null;
  /** Mode d'echec, `null` quand la verification passe. */
  failureMode: ShearFailureMode | null;
  /** Renseigne des que `ok` est faux, pour dire POURQUOI. */
  reason?: string;
  withoutLinks: ShearWithoutLinksResult;
  withLinks: ShearWithLinksResult | null;
}

/**
 * Verdict d'effort tranchant a l'ELU (EN 1992-1-1:2004 §6.2).
 *
 * Deux regimes, conformement au §6.2 : sans armature d'ame, la resistance
 * est `V_Rd,c` (§6.2.2) ; des qu'il y a des cadres, elle est
 * `min(V_Rd,s ; V_Rd,max)` (§6.2.3) — `V_Rd,c` ne s'y AJOUTE PAS.
 *
 * Le signe de `V_Ed` est indifferent : la resistance ne depend pas du sens
 * de l'effort tranchant, seule sa valeur absolue est confrontee.
 *
 * Si `V_Ed <= V_Rd,c`, aucune armature n'est requise PAR LE CALCUL, ce qui
 * n'exonere pas du minimum constructif du §9.2.2 — hors du perimetre de ce
 * module.
 *
 * Cette fonction CONCLUT mais ne PRESCRIT pas : elle ne propose aucun
 * ferraillage. La decision et la responsabilite reviennent a l'ingenieur du
 * projet.
 */
export function verifyShear(
  section: Section,
  action: ShearAction,
  norm: NormProfile,
  options?: {
    links?: ShearReinforcement;
    cotTheta?: number;
    sensDuMoment?: 1 | -1;
  }
): ShearResult {
  const sensDuMoment = options?.sensDuMoment ?? 1;
  const VEd = Math.abs(action.V_Ed);

  const withoutLinks = shearWithoutLinks(section, action.N_Ed, norm, { sensDuMoment });
  const VRdc = withoutLinks.VRdc;
  const shearReinforcementRequired = VEd > VRdc;

  const links = options?.links;

  if (links === undefined) {
    const ok = !shearReinforcementRequired;
    return {
      ok,
      utilization: VEd / VRdc,
      VRd: VRdc,
      VRdc,
      shearReinforcementRequired,
      VRds: null,
      VRdmax: null,
      failureMode: ok ? null : 'armatures-necessaires',
      ...(ok
        ? {}
        : {
            reason:
              `V_Ed = ${VEd.toFixed(1)} kN au-dela de V_Rd,c = ${VRdc.toFixed(1)} kN : ` +
              'des armatures d ame sont necessaires (aucune n est declaree)',
          }),
      withoutLinks,
      withLinks: null,
    };
  }

  const withLinks = shearWithLinks(section, links, norm, {
    ...(options?.cotTheta !== undefined ? { cotTheta: options.cotTheta } : {}),
    sensDuMoment,
  });

  const VRd = withLinks.VRd;
  const ok = VEd <= VRd;

  // L'ecrasement des bielles prime sur le manque de cadres : c'est le
  // diagnostic le plus fondamental des deux, et le seul qu'on ne corrige pas
  // par du ferraillage.
  const failureMode: ShearFailureMode | null = ok
    ? null
    : VEd > withLinks.VRdmax
      ? 'bielles-ecrasees'
      : 'cadres-insuffisants';

  const reason =
    failureMode === 'bielles-ecrasees'
      ? `V_Ed = ${VEd.toFixed(1)} kN au-dela de V_Rd,max = ${withLinks.VRdmax.toFixed(1)} kN : ` +
        'les bielles de beton sont ecrasees, la section est trop petite — aucun cadre supplementaire n y changera rien'
      : failureMode === 'cadres-insuffisants'
        ? `V_Ed = ${VEd.toFixed(1)} kN au-dela de V_Rd,s = ${withLinks.VRds.toFixed(1)} kN : ` +
          'les cadres declares sont insuffisants'
        : undefined;

  return {
    ok,
    utilization: VEd / VRd,
    VRd,
    VRdc,
    shearReinforcementRequired,
    VRds: withLinks.VRds,
    VRdmax: withLinks.VRdmax,
    failureMode,
    ...(reason !== undefined ? { reason } : {}),
    withoutLinks,
    withLinks,
  };
}
