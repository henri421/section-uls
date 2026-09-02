import type { Section } from '../model/section';
import type { RectangularGeometry } from '../geometry/rectangle';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';

export interface StressResultant {
  /** Effort normal resultant (kN), positif en compression. */
  N: number;
  /** Moment resultant autour du centroide (kN·m). */
  M: number;
}

/**
 * Methode des fibres par bandes horizontales. `strainAt(z)` donne la
 * deformation du champ lineaire suppose a une position verticale donnee
 * (mm depuis le centroide, positif vers le bas).
 */
export function integrateRectangle(
  section: Section & { geometry: RectangularGeometry },
  strainAt: (z: number) => number,
  nBands: number
): StressResultant {
  const { width, height } = section.geometry;
  const dz = height / nBands;
  const zTop = -height / 2;

  let N = 0;
  let M = 0;

  for (let i = 0; i < nBands; i++) {
    const zi = zTop + (i + 0.5) * dz;
    const eps = strainAt(zi);
    const sigma = concreteStress(eps, section.concrete);
    const force = sigma * width * dz;
    const arm = -zi;
    N += force;
    M += force * arm;
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.z);
    const steelSigma = steelStress(eps, rebar.steel);
    const displacedConcreteSigma = concreteStress(eps, section.concrete);
    const netForce = (steelSigma - displacedConcreteSigma) * rebar.area;
    const arm = -rebar.z;
    N += netForce;
    M += netForce * arm;
  }

  return { N: N / 1000, M: M / 1e6 };
}
