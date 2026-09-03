import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { BiaxialAction } from '../solvers/uls-biaxial';
import type { LoadingMode } from './utilization';
import { utilizationRatio } from './utilization';

export interface VerificationResult {
  ok: boolean;
  /** |M_Ed| / |M_Rd| dans le mode retenu ; Infinity si hors domaine. */
  utilization: number;
  mode: LoadingMode;
  /** Capacite dans la direction sollicitante ; null si hors domaine. */
  M_Rd: { y: number; z: number } | null;
  neutralAxis: { angle: number; offset: number } | null;
  leverArm: number | null;
  /** Renseigne des que `ok` est faux, pour dire POURQUOI. */
  reason?: string;
}

/**
 * Verdict de verification a l'ELU.
 *
 * Rend `ok` (le taux d'exploitation ne depasse pas 1), le taux lui-meme, et
 * les grandeurs de la resolution : capacite, axe neutre, bras de levier.
 *
 * `reason` distingue les deux facons d'echouer, qui n'appellent pas la meme
 * correction : depassement de capacite en flexion, ou effort normal hors du
 * domaine avant meme toute flexion.
 *
 * Cette fonction CONCLUT mais ne PRESCRIT pas : aucun conseil de
 * dimensionnement n'est rendu. L'outil est une aide au calcul, la decision
 * et la responsabilite reviennent a l'ingenieur du projet.
 */
export function verifySection(
  section: Section,
  action: BiaxialAction,
  norm: NormProfile,
  options?: { mode?: LoadingMode }
): VerificationResult {
  const taux = utilizationRatio(section, action, norm, options);
  const ok = taux.utilization <= 1;
  const capacity = taux.capacity;

  const reason = ok
    ? undefined
    : (taux.reason ??
        `capacite depassee en flexion : taux d'exploitation ${taux.utilization.toFixed(3)}`);

  return {
    ok,
    utilization: taux.utilization,
    mode: taux.mode,
    M_Rd: capacity ? { y: capacity.M_Rd.y, z: capacity.M_Rd.z } : null,
    neutralAxis: capacity
      ? { angle: capacity.neutralAxis.angle, offset: capacity.neutralAxis.offset }
      : null,
    leverArm: capacity ? capacity.leverArm : null,
    ...(reason !== undefined ? { reason } : {}),
  };
}
