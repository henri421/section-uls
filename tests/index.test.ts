import { describe, it, expect } from 'vitest';
import { ec2Recommended, createConcrete, createSteel, rectangularSection, verifyUniaxial } from '../src/index';

describe('API publique du noyau', () => {
  it("permet de verifier une section rectangulaire de bout en bout via l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 4 * Math.PI * 10 ** 2;

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
  });
});
