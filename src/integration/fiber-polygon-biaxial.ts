import type { Section } from '../model/section';
import type { PolygonGeometry } from '../geometry/polygon';
import { polygonSpansAtZ } from '../geometry/scanline';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';

/** Resultante (force en valeur absolue, kN) et son point d'application (mm). */
export interface Resultant {
  force: number;
  y: number;
  z: number;
}

export interface BiaxialResultant {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Moment autour de y (kN·m) : -∫σz dA, identique au M de la session 2. */
  My: number;
  /** Moment autour de z (kN·m) : +∫σy dA. */
  Mz: number;
  /** `null` si la section n'a aucune fibre comprimee. */
  compression: Resultant | null;
  /** `null` si la section n'a aucune fibre tendue. */
  tension: Resultant | null;
}

/**
 * Methode des fibres par bandes horizontales, rendant les DEUX composantes de
 * moment ainsi que les resultantes de compression et de traction separees.
 *
 * Le moment statique en y d'une bande vaut, par span, `σ·dz·(y2² - y1²)/2` ;
 * c'est exactement `force * milieu_du_span`, forme retenue ici. Les spans
 * viennent de `polygonSpansAtZ` inchange (session 2).
 *
 * `strainAt(z)` donne la deformation du champ lineaire suppose a la hauteur z
 * (mm depuis l'origine du repere fourni, positif vers le bas). L'integration
 * se fait autour de l'ORIGINE du repere des sommets fournis : c'est a
 * l'appelant de fournir une geometrie centree sur son centroide s'il veut des
 * moments barycentriques.
 */
export function integratePolygonBiaxial(
  section: Section & { geometry: PolygonGeometry },
  strainAt: (z: number) => number,
  nBands: number
): BiaxialResultant {
  const { vertices } = section.geometry;
  const zValues = vertices.map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);
  const dz = (zBottom - zTop) / nBands;

  let N = 0;
  let My = 0;
  let Mz = 0;
  let fComp = 0;
  let fCompY = 0;
  let fCompZ = 0;
  let fTrac = 0;
  let fTracY = 0;
  let fTracZ = 0;

  const ajouter = (force: number, y: number, z: number): void => {
    N += force;
    My += force * -z;
    Mz += force * y;

    if (force > 0) {
      fComp += force;
      fCompY += force * y;
      fCompZ += force * z;
    } else if (force < 0) {
      fTrac -= force;
      fTracY -= force * y;
      fTracZ -= force * z;
    }
  };

  for (let i = 0; i < nBands; i++) {
    const zi = zTop + (i + 0.5) * dz;
    const sigma = concreteStress(strainAt(zi), section.concrete);
    if (sigma === 0) continue; // le beton tendu ne contribue pas : inutile de balayer

    for (const span of polygonSpansAtZ(vertices, zi)) {
      const largeur = span.yEnd - span.yStart;
      if (largeur <= 0) continue;
      ajouter(sigma * largeur * dz, (span.yStart + span.yEnd) / 2, zi);
    }
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.z);
    const sigmaAcier = steelStress(eps, rebar.steel);
    const sigmaBetonDeplace = concreteStress(eps, section.concrete);
    ajouter((sigmaAcier - sigmaBetonDeplace) * rebar.area, rebar.y, rebar.z);
  }

  return {
    N: N / 1000,
    My: My / 1e6,
    Mz: Mz / 1e6,
    compression: fComp > 0 ? { force: fComp / 1000, y: fCompY / fComp, z: fCompZ / fComp } : null,
    tension: fTrac > 0 ? { force: fTrac / 1000, y: fTracY / fTrac, z: fTracZ / fTrac } : null,
  };
}
