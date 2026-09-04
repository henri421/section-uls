import type { Section, Action } from '../model/section';
import type { Vertex } from '../geometry/polygon';
import { rectangleToPolygon } from '../geometry/rectangle';
import { crackedProperties } from './cracked-section';

/** Limites de contrainte en service (EN 1992-1-1 §7.2). */
export interface ServiceLimits {
  /** Compression beton : k1·fck. Defaut 0,6 (§7.2(2), valeur recommandee). */
  k1: number;
  /** Traction acier : k3·fyk. Defaut 0,8 (§7.2(5), valeur recommandee). */
  k3: number;
}

export interface ServiceOptions {
  /**
   * Coefficient d'equivalence. Defaut 15.
   *
   * ATTENTION : 15 est une valeur CONVENTIONNELLE de la pratique, qui integre
   * forfaitairement le fluage. L'EN 1992-1-1 ne la prescrit pas sous cette
   * forme. Un utilisateur souhaitant un coefficient derive des modules reels
   * le passe explicitement.
   */
  n?: number;
  limits?: ServiceLimits;
  /** Bandes d'integration de la zone comprimee. Defaut 400. */
  nBands?: number;
}

export interface ServiceResult {
  /** Position de l'axe neutre (mm, depuis le centroide, positif vers le bas). */
  neutralAxisZ: number;
  /** Compression maximale du beton (MPa, positive). */
  sigmaC: number;
  /** Traction maximale des armatures (MPa, positive ; 0 si aucune barre tendue). */
  sigmaS: number;
  sigmaCLimit: number;
  sigmaSLimit: number;
  ok: boolean;
  /** Renseigne des que `ok` est faux. */
  reason?: string;
  converged: boolean;
}

const LIMITES_PAR_DEFAUT: ServiceLimits = { k1: 0.6, k3: 0.8 };

function verticesDe(section: Section): Vertex[] {
  return section.geometry.kind === 'rectangle'
    ? rectangleToPolygon(section.geometry).vertices
    : section.geometry.vertices;
}

/**
 * Verification des contraintes en SERVICE par la methode n.
 *
 * A NE JAMAIS CONFONDRE AVEC L'ELU. Les hypotheses sont differentes :
 * comportement elastique lineaire des deux materiaux, section fissuree dont
 * le beton tendu est integralement neglige, armatures homogeneisees. Aucun
 * coefficient partiel n'intervient : on travaille sur les valeurs
 * CARACTERISTIQUES `fck` et `fyk`, jamais sur `fcd` ou `fyd`.
 *
 * Limitation majeure, a lire avant usage : si la section est entierement
 * comprimee, l'hypothese de fissuration est caduque et c'est la section NON
 * fissuree qui s'applique. Ce module ne la couvre pas : il rend alors
 * `converged: false` avec un motif explicite, plutot qu'un chiffre issu
 * d'une hypothese fausse.
 *
 * Flexion droite uniquement.
 */
export function verifyServiceUniaxial(
  section: Section,
  action: Action,
  options?: ServiceOptions
): ServiceResult {
  const n = options?.n ?? 15;
  const limits = options?.limits ?? LIMITES_PAR_DEFAUT;
  const nBands = options?.nBands ?? 400;

  const zValues = verticesDe(section).map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);

  const sigmaCLimit = limits.k1 * section.concrete.fck;
  const sigmaSLimit =
    limits.k3 * (section.rebars.length > 0 ? section.rebars[0].steel.fyk : 0);

  const N_Ed = action.N * 1000; // kN -> N
  const M_Ed = action.M * 1e6; // kN·m -> N·mm

  // `f` s'annule a la position d'equilibre. Deux formulations, deliberement
  // separees plutot que forcees en une seule :
  //  - flexion simple : le moment statique de la section homogeneisee
  //    fissuree s'annule autour de l'axe neutre ;
  //  - flexion composee : le rapport M/N impose est retrouve, ecrit sous
  //    forme homogene pour eviter toute division par un effort quasi nul.
  const flexionSimple = N_Ed === 0;

  const f = (zNa: number): number => {
    const p = crackedProperties(section, zNa, n, nBands);
    const termeN = zNa * p.A - p.S;
    const termeM = zNa * p.S - p.I;
    return flexionSimple ? termeN : -termeM * N_Ed - termeN * M_Ed;
  };

  const echec = (motif: string): ServiceResult => ({
    neutralAxisZ: NaN,
    sigmaC: NaN,
    sigmaS: NaN,
    sigmaCLimit,
    sigmaSLimit,
    ok: false,
    reason: motif,
    converged: false,
  });

  const EPS = 1e-6 * (zBottom - zTop);
  let lo = zTop + EPS;
  let hi = zBottom;
  let fLo = f(lo);
  const fHi = f(hi);

  if (fLo * fHi > 0) {
    // Pas de changement de signe dans la hauteur : aucune position d'axe
    // neutre ne verifie l'equilibre avec une zone comprimee partielle. Le
    // cas usuel est une section entierement comprimee.
    return echec(
      'aucun axe neutre dans la section : elle est vraisemblablement entierement comprimee, ' +
        "et l'hypothese de section fissuree ne s'applique plus (la section non fissuree n'est pas couverte)"
    );
  }

  for (let iteration = 0; iteration < 80; iteration++) {
    const milieu = (lo + hi) / 2;
    const fMilieu = f(milieu);
    if (fLo * fMilieu <= 0) {
      hi = milieu;
    } else {
      lo = milieu;
      fLo = fMilieu;
    }
  }

  const zNa = (lo + hi) / 2;
  const p = crackedProperties(section, zNa, n, nBands);
  const hauteurComprimee = zNa - zTop;

  // Mise a l'echelle : la forme du diagramme est fixee par `zNa`, son
  // amplitude par la sollicitation.
  const sigmaExtreme = flexionSimple
    ? (-M_Ed * hauteurComprimee) / (zNa * p.S - p.I)
    : (N_Ed * hauteurComprimee) / (zNa * p.A - p.S);

  if (!Number.isFinite(sigmaExtreme)) {
    return echec('mise a l echelle impossible : sollicitation degeneree');
  }

  const sigmaC = sigmaExtreme;

  // Contrainte d'une barre : n fois la contrainte du beton a sa fibre. Le
  // `(n-1)` des barres comprimees porte sur l'EQUILIBRE (beton deplace), pas
  // sur la contrainte de l'acier lui-meme.
  let tractionMax = 0;
  for (const rebar of section.rebars) {
    const sigmaS = (n * sigmaExtreme * (zNa - rebar.z)) / hauteurComprimee;
    if (-sigmaS > tractionMax) tractionMax = -sigmaS;
  }

  const betonDepasse = sigmaC > sigmaCLimit;
  const acierDepasse = tractionMax > sigmaSLimit;
  const ok = !betonDepasse && !acierDepasse;

  const motifs: string[] = [];
  if (betonDepasse) {
    motifs.push(
      `compression du beton ${sigmaC.toFixed(1)} MPa au-dela de la limite ${sigmaCLimit.toFixed(1)} MPa`
    );
  }
  if (acierDepasse) {
    motifs.push(
      `traction de l acier ${tractionMax.toFixed(1)} MPa au-dela de la limite ${sigmaSLimit.toFixed(1)} MPa`
    );
  }

  return {
    neutralAxisZ: zNa,
    sigmaC,
    sigmaS: tractionMax,
    sigmaCLimit,
    sigmaSLimit,
    ok,
    ...(ok ? {} : { reason: motifs.join(' ; ') }),
    converged: true,
  };
}
