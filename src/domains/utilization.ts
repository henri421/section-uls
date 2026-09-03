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
  //
  // Pas choisi a 0,25 : le facteur d'homothetie recherche vaut typiquement
  // entre 1 et 4 (l'inverse d'un taux d'exploitation courant), donc
  // l'encadrement se trouve en une poignee de pas dans les cas reels, et le
  // pire cas (ALPHA_MAX / PAS) tombe de 400 a 80 evaluations — chacune un
  // `verifyBiaxial` complet, donc plusieurs dizaines de resolutions droites.
  //
  // Ce que ce pas coute en surete, honnetement : un pas plus grossier ne
  // peut manquer qu'une PAIRE de racines rapprochees a l'interieur d'un
  // meme intervalle de 0,25 — une remontee de `g` au-dessus de zero suivie
  // d'un retour en dessous avant le prochain point de balayage. La premiere
  // racine, celle qu'on cherche, est une transition du negatif vers le
  // positif : elle reste detectee tant que `g` ne repasse pas negatif dans
  // ce meme intervalle. Le mode proportionnel reste par ailleurs NETTEMENT
  // plus couteux que le mode par defaut (« N constant »), qui ne fait qu'une
  // seule resolution deviee la ou celui-ci en enchaine plusieurs dizaines.
  const PAS = 0.25;
  const ALPHA_MAX = 20;

  let alphaBas = PAS;
  let gBas = g(alphaBas);
  if (gBas === null) {
    return { utilization: Infinity, mode, capacity: null, reason: HORS_DOMAINE };
  }
  if (gBas > 0) {
    // Deja au-dela de la capacite au premier pas de balayage (alpha = PAS) :
    // la racine, si elle existe, est forcement en dessous de PAS. On
    // encadre par le bas plutot que d'abandonner : quand `alpha` tend vers
    // zero, la sollicitation en moment (proportionnelle a alpha) tend vers
    // zero alors que la capacite reste finie et positive, donc `g` y est
    // negatif — sauf si la section est deja si depassee que meme ce plancher
    // ne suffit pas.
    const ALPHA_PLANCHER = 0.01;
    const gPlancher = g(ALPHA_PLANCHER);

    if (gPlancher !== null && gPlancher < 0) {
      const alphaRacine = bissection(g, ALPHA_PLANCHER, alphaBas, gPlancher);
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

    // Meme au plancher, la capacite est depassee (ou l'effort normal y est
    // deja hors domaine) : la section est tres largement depassee en
    // flexion, bien au-dela de tout usage raisonnable. Le taux est
    // PLAFONNE plutot que rendu faux (le taux du mode « N constant » n'a
    // aucune raison de coincider) ou infini (`Infinity` ferait croire a un
    // depassement en effort normal, alors que c'est la flexion qui lache).
    return {
      utilization: 1 / ALPHA_PLANCHER,
      mode,
      capacity: null,
      reason: `taux plafonne a ${(1 / ALPHA_PLANCHER).toFixed(0)} : section tres largement depassee en flexion (mode proportionnel)`,
    };
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
  // Sur un intervalle initial de 0,25 (le pas de balayage ci-dessus), 30
  // bissections donnent une precision de l'ordre de 10^-10 sur `alpha` —
  // tres au-dela de ce que la physique justifie, et deja bien plus fin que
  // la tolerance des tests.
  iterations = 30
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
