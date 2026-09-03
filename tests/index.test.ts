import { describe, it, expect } from 'vitest';
import { ec2Recommended, createConcrete, createSteel, rectangularSection, verifyUniaxial } from '../src/index';
import {
  polygonSection,
  circularSection,
  circularRebarCage,
  rebarRow,
  rectangularRebarLayout,
  verifyBiaxial,
} from '../src/index';

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

describe('API publique — session 2 et 3', () => {
  it("l'exemple du README s'execute tel quel depuis l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const pieu = circularSection({
      diameter: 600,
      concrete,
      rebars: circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel }),
    });

    const resultat = verifyUniaxial(pieu, { N: 0, M: 0 }, profile);

    expect(resultat.converged).toBe(true);
    expect(resultat.M_Rd).toBeGreaterThan(200);
    expect(resultat.M_Rd).toBeLessThan(280);
  });

  it('la verification deviee est accessible depuis l entree publique', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const layout = rectangularRebarLayout({
      width: 400,
      height: 400,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
      ],
    });

    const section = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
    const r = verifyBiaxial(section, { N: 500, My: 1, Mz: 1 }, profile);

    expect(r.converged).toBe(true);
    expect(r.M_Rd_magnitude).toBeGreaterThan(0);
  });

  it('les primitives polygonales sont exportees', () => {
    expect(typeof polygonSection).toBe('function');
    expect(typeof rebarRow).toBe('function');
  });
});
