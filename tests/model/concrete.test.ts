import { describe, it, expect } from 'vitest';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('createConcrete', () => {
  it('dérive fcd, epsC2, epsCu2, n pour fck <= 50 MPa (EN 1992-1-1 tableau 3.1)', () => {
    const profile = ec2Recommended();
    const c = createConcrete(25, profile);
    expect(c.fcd).toBeCloseTo(16.6667, 3); // alphaCc * fck / gammaC = 1.0*25/1.5
    expect(c.epsC2).toBeCloseTo(0.002, 6);
    expect(c.epsCu2).toBeCloseTo(0.0035, 6);
    expect(c.n).toBe(2);
    expect(c.law).toBe('parabola-rectangle');
  });

  it('dérive fcd, epsC2, epsCu2, n pour fck > 50 MPa via les formules du tableau 3.1', () => {
    const profile = ec2Recommended();
    const c = createConcrete(70, profile);
    // epsC2 = (2.0 + 0.085*(fck-50)^0.53) * 1e-3
    expect(c.epsC2).toBeCloseTo(0.0024159, 5);
    // epsCu2 = (2.6 + 35*((90-fck)/100)^4) * 1e-3 — exact car (20/100)^4 = 0.0016
    expect(c.epsCu2).toBeCloseTo(0.002656, 6);
    // n = 1.4 + 23.4*((90-fck)/100)^4 — exact
    expect(c.n).toBeCloseTo(1.43744, 5);
  });
});
