import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { BiaxialAction, BiaxialResult } from '../solvers/uls-biaxial';
import { verifyBiaxial } from '../solvers/uls-biaxial';

export type LoadingMode = 'constant-N' | 'proportional';

export interface UtilizationResult {
  /** |M_Ed| / |M_Rd| ; Infinity si le point est hors domaine. */
  utilization: number;
  mode: LoadingMode;
  /** Resolution a l'effort normal retenu ; null si hors domaine. */
  capacity: BiaxialResult | null;
  /** Renseigne uniquement quand le taux est infini. */
  reason?: string;
}

const HORS_DOMAINE =
  "effort normal hors du domaine resistant : la section est depassee avant toute flexion";

/**
 * Taux d'exploitation par homothetie radiale.
 *
 * Mode « N constant » (defaut) : l'effort normal est tenu, seul le moment est
 * majore. C'est l'usage reel en poteau, ou N vient des charges verticales et
 * ne suit pas la majoration du moment. Le taux est alors DIRECT — la
 * capacite dans la direction sollicitante est exactement ce que rend
 * `verifyBiaxial` — et vaut |M_Ed| / |M_Rd|.
 *
 * Mode proportionnel : les trois composantes croissent ensemble. On cherche
 * le facteur `alpha` annulant `alpha*|M_Ed| - |M_Rd(alpha*N_Ed)|`, par
 * recherche de racine encadree.
 */
export function utilizationRatio(
  section: Section,
  action: BiaxialAction,
  norm: NormProfile,
  options?: { mode?: LoadingMode }
): UtilizationResult {
  const mode = options?.mode ?? 'constant-N';
  const magnitudeSollicitante = Math.hypot(action.My, action.Mz);

  if (magnitudeSollicitante === 0) {
    throw new Error(
      'utilizationRatio : (My, Mz) nul, la direction de flexion est indefinie.'
    );
  }

  if (mode === 'constant-N') {
    const capacity = verifyBiaxial(section, action, norm);
    if (!capacity.converged) {
      return { utilization: Infinity, mode, capacity: null, reason: HORS_DOMAINE };
    }
    return {
      utilization: magnitudeSollicitante / capacity.M_Rd_magnitude,
      mode,
      capacity,
    };
  }

  return tauxProportionnel(section, action, norm, magnitudeSollicitante);
}

/**
 * Mode proportionnel : recherche de racine sur le facteur d'homothetie.
 *
 * ATTENTION : `M_Rd(N)` n'est pas monotone — c'est la courbe en cloche du
 * diagramme d'interaction, qui croit jusqu'au point d'equilibre puis
 * decroit. `g` peut donc presenter plusieurs racines. On retient la PLUS
 * PETITE alpha positive : c'est le premier niveau de chargement auquel la
 * section atteint sa limite, donc le seul physiquement pertinent. Retenir
 * une racine plus grande decrirait un etat atteint apres la ruine.
 */
function tauxProportionnel(
  section: Section,
  action: BiaxialAction,
  norm: NormProfile,
  magnitudeSollicitante: number
): UtilizationResult {
  const mode: LoadingMode = 'proportional';

  const g = (alpha: number): number | null => {
    const r = verifyBiaxial(
      section,
      { N: alpha * action.N, My: action.My, Mz: action.Mz },
      norm
    );
    if (!r.converged) return null;
    return alpha * magnitudeSollicitante - r.M_Rd_magnitude;
  };

  // Balayage croissant pour encadrer le PREMIER changement de signe.
  const PAS = 0.05;
  const ALPHA_MAX = 20;

  let alphaBas = PAS;
  let gBas = g(alphaBas);
  if (gBas === null) {
    return { utilization: Infinity, mode, capacity: null, reason: HORS_DOMAINE };
  }
  if (gBas > 0) {
    // Deja au-dela de la capacite au plus petit facteur teste : la section
    // est depassee, on rend le taux au facteur unitaire.
    return tauxAuFacteur(section, action, norm, magnitudeSollicitante, mode);
  }

  for (let alpha = PAS * 2; alpha <= ALPHA_MAX; alpha += PAS) {
    const gHaut = g(alpha);
    if (gHaut === null) {
      // Au-dela, l'effort normal sort du domaine : la limite est atteinte
      // entre les deux derniers facteurs testes.
      return { utilization: 1 / alphaBas, mode, capacity: null, reason: HORS_DOMAINE };
    }
    if (gHaut >= 0) {
      const alphaRacine = bissection(g, alphaBas, alpha, gBas);
      const capacity = verifyBiaxial(
        section,
        { N: alphaRacine * action.N, My: action.My, Mz: action.Mz },
        norm
      );
      return {
        utilization: 1 / alphaRacine,
        mode,
        capacity: capacity.converged ? capacity : null,
      };
    }
    alphaBas = alpha;
    gBas = gHaut;
  }

  // Aucun changement de signe jusqu'a ALPHA_MAX : la section est tres loin
  // d'etre sollicitee, le taux est inferieur a 1/ALPHA_MAX.
  return { utilization: 1 / ALPHA_MAX, mode, capacity: null };
}

function bissection(
  g: (alpha: number) => number | null,
  bas: number,
  haut: number,
  gBas: number,
  iterations = 40
): number {
  let lo = bas;
  let hi = haut;
  let fLo = gBas;

  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const fMid = g(mid);
    if (fMid === null) {
      hi = mid;
      continue;
    }
    if (fMid === 0) return mid;
    if (fLo * fMid < 0) {
      hi = mid;
    } else {
      lo = mid;
      fLo = fMid;
    }
  }

  return (lo + hi) / 2;
}

function tauxAuFacteur(
  section: Section,
  action: BiaxialAction,
  norm: NormProfile,
  magnitudeSollicitante: number,
  mode: LoadingMode
): UtilizationResult {
  const capacity = verifyBiaxial(section, action, norm);
  if (!capacity.converged) {
    return { utilization: Infinity, mode, capacity: null, reason: HORS_DOMAINE };
  }
  return { utilization: magnitudeSollicitante / capacity.M_Rd_magnitude, mode, capacity };
}
