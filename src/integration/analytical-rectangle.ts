import type { ConcreteMaterial } from '../model/concrete';

export interface ConcreteBlockResultant {
  /** Effort normal du bloc beton seul (kN), positif en compression. */
  N: number;
  /** Moment du bloc beton seul autour du centroide de la section (kN·m). */
  M: number;
}

/**
 * Integrale fermee du bloc parabole-rectangle (EN 1992-1-1 §3.1.7 eq.
 * 3.17-3.18), beton seul (pas d'armature). `x` = profondeur de l'axe
 * neutre depuis la fibre superieure (mm), pivot beton fixe a epsCu2 en
 * fibre superieure — meme convention que verifyUniaxial. Valide pour
 * 0 < x <= height. N en kN, M en kN·m autour du centroide de la section.
 *
 * Decomposition standard : zone plateau (0 a xi1, contrainte constante
 * fcd) et zone parabolique (xi1 a x, contrainte croissante de 0 a fcd) —
 * meme derivation que tests/handcalc/rectangular-beam-pure-bending.test.ts
 * (session 1), extraite ici en code de bibliotheque reutilisable.
 */
export function analyticalRectangleResultant(
  concrete: ConcreteMaterial,
  width: number,
  height: number,
  x: number
): ConcreteBlockResultant {
  const { fcd, epsC2, epsCu2 } = concrete;

  const xi1 = x * (1 - epsC2 / epsCu2);
  const Lp = x - xi1;
  const force1 = fcd * width * xi1;
  const force2 = (2 / 3) * fcd * width * Lp;
  const centre1 = xi1 / 2;
  const centre2 = xi1 + (3 * Lp) / 8;

  const forceTotal = force1 + force2; // N
  const centroidFromTop = (force1 * centre1 + force2 * centre2) / forceTotal; // mm

  return {
    N: forceTotal / 1000,
    M: (forceTotal * (height / 2 - centroidFromTop)) / 1e6,
  };
}
