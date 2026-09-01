import type { Section } from '../model/section';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';

export interface StressResultant {
  /** Effort normal resultant (kN), positif en compression. */
  N: number;
  /** Moment resultant autour du centroide (kN·m). */
  M: number;
}

/**
 * Methode des fibres par bandes horizontales (EN 1992-1-1, principe general).
 * `strainAt(depthFromTop)` donne la deformation du champ lineaire suppose a
 * une profondeur donnee (mm depuis la fibre superieure). Les armatures sont
 * traitees comme des contributions ponctuelles ; le beton qu'elles deplacent
 * est retranche pour ne pas le compter deux fois.
 */
export function integrateRectangle(
  section: Section,
  strainAt: (depthFromTop: number) => number,
  nBands: number
): StressResultant {
  const { width, height } = section.geometry;
  const dz = height / nBands;
  const centroid = height / 2;

  let N = 0; // Newtons
  let M = 0; // Newton*mm

  for (let i = 0; i < nBands; i++) {
    const xi = (i + 0.5) * dz;
    const eps = strainAt(xi);
    const sigma = concreteStress(eps, section.concrete); // MPa
    const force = sigma * width * dz; // N
    const arm = centroid - xi; // mm, positif au-dessus du centroide
    N += force;
    M += force * arm;
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.depthFromTop);
    const steelSigma = steelStress(eps, rebar.steel);
    const displacedConcreteSigma = concreteStress(eps, section.concrete);
    const netForce = (steelSigma - displacedConcreteSigma) * rebar.area; // N
    const arm = centroid - rebar.depthFromTop;
    N += netForce;
    M += netForce * arm;
  }

  return { N: N / 1000, M: M / 1e6 }; // kN, kN·m
}
