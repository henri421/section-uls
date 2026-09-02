import type { Section } from '../model/section';
import type { PolygonGeometry } from '../geometry/polygon';
import { polygonWidthAtZ } from '../geometry/scanline';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';
import type { StressResultant } from './fiber-rectangle';

/**
 * Methode des fibres par bandes horizontales, generalisee a une geometrie
 * polygonale quelconque : structurellement parallele a `integrateRectangle`,
 * mais la largeur de chaque bande est obtenue via `polygonWidthAtZ` plutot
 * qu'une largeur constante. `strainAt(z)` donne la deformation du champ
 * lineaire suppose a une position verticale donnee (mm depuis le centroide,
 * positif vers le bas).
 */
export function integratePolygon(
  section: Section & { geometry: PolygonGeometry },
  strainAt: (z: number) => number,
  nBands: number
): StressResultant {
  const { vertices } = section.geometry;
  const zValues = vertices.map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);
  const dz = (zBottom - zTop) / nBands;

  let N = 0;
  let M = 0;

  for (let i = 0; i < nBands; i++) {
    const zi = zTop + (i + 0.5) * dz;
    const eps = strainAt(zi);
    const sigma = concreteStress(eps, section.concrete);
    const width = polygonWidthAtZ(vertices, zi);
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
