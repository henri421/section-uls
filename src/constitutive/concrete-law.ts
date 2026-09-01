import type { ConcreteMaterial } from '../model/concrete';

/**
 * Loi parabole-rectangle (EN 1992-1-1 §3.1.7(1), éq. 3.17-3.18).
 * Convention : deformation positive en compression.
 */
export function concreteStress(eps: number, concrete: ConcreteMaterial): number {
  const { fcd, epsC2, epsCu2, n } = concrete;

  if (eps <= 0) return 0;
  if (eps < epsC2) return fcd * (1 - Math.pow(1 - eps / epsC2, n));
  if (eps <= epsCu2) return fcd;
  return 0;
}
