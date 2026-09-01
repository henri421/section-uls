import { describe, it, expect } from 'vitest';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('verifyUniaxial', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);
  const As = 4 * Math.PI * 10 ** 2; // 4Ø20

  it('converge et donne un M_Rd positif en flexion simple (N=0)', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
    expect(result.N_Rd).toBeCloseTo(0, 1);
    expect(result.neutralAxisDepth).toBeGreaterThan(0);
    expect(result.neutralAxisDepth).toBeLessThan(500);
  });

  it("signale la non-convergence quand l'effort de traction demande depasse la capacite de la section", () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    // Capacite max en traction ~ -fyd*As ~ -546 kN ; on demande bien au-dela.
    const result = verifyUniaxial(section, { N: -2000, M: 0 }, profile);

    expect(result.converged).toBe(false);
  });
});
