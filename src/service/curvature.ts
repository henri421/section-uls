import type { Section, Action } from '../model/section';
import { crackedProperties } from './cracked-section';
import { uncrackedProperties } from './uncracked-section';
import { verifyServiceUniaxial } from './verify-service';
import { fctmDepuisFck } from '../model/concrete';

export interface CurvatureOptions {
  /** Coefficient d'equivalence, la meme convention qu'en session 6. Defaut 15. */
  n?: number;
  /** Module effectif du beton (MPa). Defaut : Es / n. */
  ecEff?: number;
  /**
   * Duree de chargement (§7.4.3(3)) : 0,5 longue duree ou repetee (defaut,
   * adherence acier-beton degradee), 1,0 courte duree (chargement unique).
   *
   * ATTENTION, propriete de la NORME et non un defaut d'implementation :
   * l'eq. 7.18 n'est continue en M_cr que pour beta = 1. Juste au-dessus du
   * moment de fissuration, M_cr/M tend vers 1 donc zeta tend vers (1 - beta)
   * au lieu de 0 — la courbure y saute donc de (1 - beta) fois l'ecart entre
   * les deux etats. Avec le defaut beta = 0,5, ce saut vaut la moitie de cet
   * ecart. Un utilisateur qui l'observe sans le savoir pourrait le prendre a
   * tort pour un bug.
   */
  beta?: number;
  /** Resistance moyenne a la traction (MPa). Defaut : 0,30·fck^(2/3). */
  fctm?: number;
  nBands?: number;
}

export interface CurvatureResult {
  /** Courbure retenue apres interpolation (1/mm). */
  curvature: number;
  /** Courbure en section non fissuree (1/mm). */
  curvatureUncracked: number;
  /** Courbure en section fissuree (1/mm), `null` si la section ne fissure pas. */
  curvatureCracked: number | null;
  /** Coefficient de distribution : 0 non fissuree, tend vers 1 quand M croit. */
  zeta: number;
  /** Moment de fissuration (kN·m). */
  crackingMoment: number;
  cracked: boolean;
  /** Raideur effective (N·mm²). */
  effectiveStiffness: number;
  converged: boolean;
  reason?: string;
}

/**
 * Courbure d'une section flechie en service, interpolee entre etat non
 * fissure et etat fissure (§7.4.3).
 *
 * CE N'EST PAS UNE FLECHE. Une fleche exige la portee, les conditions
 * d'appui et la repartition des charges — donnees de niveau ELEMENT, que ce
 * module ne connait pas. Il rend la courbure ; l'appelant qui dispose d'un
 * schema statique l'integre lui-meme le long de la piece.
 *
 * Le coefficient `zeta` traduit la PARTICIPATION DU BETON TENDU entre les
 * fissures, qui rigidifie l'element par rapport a un calcul purement
 * fissure.
 *
 * Substitution assumee : l'eq. 7.19 s'ecrit avec `(sigma_sr/sigma_s)`, ici
 * remplace par `(M_cr/M)`. Les deux sont EQUIVALENTS en flexion pure, la
 * contrainte d'acier etant proportionnelle au moment a etat fissure donne,
 * et la seconde forme evite de calculer une contrainte fictive au moment de
 * fissuration. En flexion composee l'equivalence n'est plus rigoureuse —
 * l'effort normal ne se majore pas avec le moment — mais l'approximation est
 * usuelle.
 */
export function sectionCurvature(
  section: Section,
  action: Action,
  options?: CurvatureOptions
): CurvatureResult {
  const n = options?.n ?? 15;
  const nBands = options?.nBands ?? 400;
  const beta = options?.beta ?? 0.5;
  const fctm = options?.fctm ?? fctmDepuisFck(section.concrete.fck);

  const Es = section.rebars.length > 0 ? section.rebars[0].steel.Es : 200000;
  const ecEff = options?.ecEff ?? Es / n;

  // --- Etat I : section non fissuree ---
  const etatI = uncrackedProperties(section, n, nBands);
  const zAxeI = etatI.S / etatI.A;
  const inertieI = etatI.I - etatI.S ** 2 / etatI.A;

  const zValues =
    section.geometry.kind === 'rectangle'
      ? [-section.geometry.height / 2, section.geometry.height / 2]
      : section.geometry.vertices.map((v) => v.z);
  const zBottom = Math.max(...zValues);

  // Distance de l'axe neutre elastique a la fibre la plus tendue.
  const vt = zBottom - zAxeI;
  const crackingMomentNmm = (fctm * inertieI) / vt;

  const M = action.M * 1e6; // kN·m -> N·mm
  const courbureI = M / (ecEff * inertieI);

  const cracked = Math.abs(M) > crackingMomentNmm;

  if (!cracked) {
    return {
      curvature: courbureI,
      curvatureUncracked: courbureI,
      curvatureCracked: null,
      zeta: 0,
      crackingMoment: crackingMomentNmm / 1e6,
      cracked: false,
      effectiveStiffness: ecEff * inertieI,
      converged: true,
    };
  }

  // --- Etat II : section fissuree, axe neutre repris du calcul de service ---
  const service = verifyServiceUniaxial(section, action, { n, nBands });
  if (!service.converged) {
    return {
      curvature: courbureI,
      curvatureUncracked: courbureI,
      curvatureCracked: null,
      zeta: 0,
      crackingMoment: crackingMomentNmm / 1e6,
      cracked: true,
      effectiveStiffness: ecEff * inertieI,
      converged: false,
      reason: `etat fissure incalculable (${service.reason ?? 'cause non precisee'})`,
    };
  }

  const zNa = service.neutralAxisZ;
  const etatII = crackedProperties(section, zNa, n, nBands);
  // Theoreme de Huygens : les caracteristiques sont rendues autour du
  // centroide, la courbure se calcule autour de l'axe neutre.
  const inertieII = etatII.I - 2 * zNa * etatII.S + zNa ** 2 * etatII.A;
  const courbureII = M / (ecEff * inertieII);

  const zeta = 1 - beta * (crackingMomentNmm / M) ** 2;
  const courbure = zeta * courbureII + (1 - zeta) * courbureI;

  return {
    curvature: courbure,
    curvatureUncracked: courbureI,
    curvatureCracked: courbureII,
    zeta,
    crackingMoment: crackingMomentNmm / 1e6,
    cracked: true,
    effectiveStiffness: courbure === 0 ? Number.POSITIVE_INFINITY : M / courbure,
    converged: true,
  };
}
