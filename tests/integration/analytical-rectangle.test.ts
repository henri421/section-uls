import { describe, it, expect } from 'vitest';
import { analyticalRectangleResultant } from '../../src/integration/analytical-rectangle';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { polygonSection } from '../../src/geometry/polygon';
import { concreteStress } from '../../src/constitutive/concrete-law';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('analyticalRectangleResultant', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const width = 300;
  const height = 500;
  const x = 200; // profondeur d'axe neutre arbitraire, dans (0, height)

  it('correspond a une integration numerique tres fine, ecrite independamment', () => {
    const analytical = analyticalRectangleResultant(concrete, width, height, x);

    // Integration numerique tres fine (100000 bandes), ecrite ici directement,
    // sans passer par integrateRectangle/integratePolygon, pour verifier la
    // formule fermee de maniere independante.
    const nBands = 100000;
    const dz = height / nBands;
    const zTop = -height / 2;
    let N = 0;
    let M = 0;
    for (let i = 0; i < nBands; i++) {
      const zi = zTop + (i + 0.5) * dz;
      const depthFromTop = zi - zTop;
      const eps = concrete.epsCu2 * (1 - depthFromTop / x);
      const sigma = concreteStress(eps, concrete);
      const force = sigma * width * dz;
      N += force;
      M += force * -zi;
    }
    const numericN = N / 1000;
    const numericM = M / 1e6;

    expect(Math.abs(analytical.N - numericN) / numericN).toBeLessThan(1e-4);
    expect(Math.abs(analytical.M - numericM) / numericM).toBeLessThan(1e-4);
  });

  it('la methode des fibres generalisee (integratePolygon) converge vers l integration analytique', () => {
    const vertices = [
      { y: 0, z: 0 },
      { y: width, z: 0 },
      { y: width, z: height },
      { y: 0, z: height },
    ];
    const polySection = polygonSection({ vertices, concrete, rebars: [] });

    const zTop = -height / 2;
    const strainAt = (z: number) => concrete.epsCu2 * (1 - (z - zTop) / x);

    const analytical = analyticalRectangleResultant(concrete, width, height, x);

    const coarse = integratePolygon(polySection, strainAt, 10);
    const fine = integratePolygon(polySection, strainAt, 1000);

    const coarseError = Math.abs(coarse.M - analytical.M) / analytical.M;
    const fineError = Math.abs(fine.M - analytical.M) / analytical.M;

    expect(fineError).toBeLessThan(coarseError);
    expect(fineError).toBeLessThan(1e-4);
  });
});
