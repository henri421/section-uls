import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('integrateRectangle', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile); // fcd=16.6667

  it('donne un moment nul pour une contrainte uniforme (symetrie autour du centroide)', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    // Deformation constante sur le plateau (epsC2 <= eps <= epsCu2) -> sigma = fcd partout
    const strainAt = () => concrete.epsC2;

    const result = integrateRectangle(section, strainAt, 100);

    // N attendu = fcd * b * h / 1000 (conversion N -> kN)
    expect(result.N).toBeCloseTo((concrete.fcd * 300 * 500) / 1000, 1);
    expect(result.M).toBeCloseTo(0, 6);
  });

  it('vaut 0 en N et M pour une section entierement tendue', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const strainAt = () => -0.001; // traction partout -> beton ne resiste pas

    const result = integrateRectangle(section, strainAt, 50);

    expect(result.N).toBe(0);
    expect(result.M).toBe(0);
  });
});
