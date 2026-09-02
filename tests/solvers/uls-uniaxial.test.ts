import { describe, it, expect } from 'vitest';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
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

  it("signale la non-convergence quand l'effort de compression demande depasse la capacite de la section", () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    // Capacite max en compression ~ fcd*b*h + fyd*As ~ 2500 + 546 ~ 3046 kN ;
    // on demande bien au-dela.
    const result = verifyUniaxial(section, { N: 5000, M: 0 }, profile);

    expect(result.converged).toBe(false);
  });

  it('donne le meme M_Rd qu avant generalisation pour une section rectangulaire (non-regression)', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    // Valeurs de reference, verifiees en session 1 (Task 9) et confirmees par
    // le calcul manuel independant (Task 11, ecart < 0.001%).
    expect(result.M_Rd).toBeCloseTo(215.184, 1);
    expect(result.neutralAxisDepth).toBeCloseTo(134.976, 1);
  });

  it('donne un M_Rd equivalent pour le meme rectangle modelise en polygone', () => {
    const width = 300;
    const height = 500;
    const depthFromTop = 450;

    const rectSection = rectangularSection({
      width,
      height,
      concrete,
      rebars: [{ area: As, depthFromTop, steel }],
    });

    const polySection = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: width, z: 0 },
        { y: width, z: height },
        { y: 0, z: height },
      ],
      concrete,
      rebars: [{ y: width / 2, z: depthFromTop, area: As, steel }],
    });

    const rectResult = verifyUniaxial(rectSection, { N: 0, M: 0 }, profile);
    const polyResult = verifyUniaxial(polySection, { N: 0, M: 0 }, profile);

    expect(polyResult.converged).toBe(true);
    const relError = Math.abs(polyResult.M_Rd - rectResult.M_Rd) / rectResult.M_Rd;
    expect(relError).toBeLessThan(1e-6);
  });

  it('converge sur une section en T (sanity check, sans valeur de reference precise)', () => {
    const vertices = [
      { y: 0, z: 0 },
      { y: 600, z: 0 },
      { y: 600, z: 150 },
      { y: 425, z: 150 },
      { y: 425, z: 500 },
      { y: 175, z: 500 },
      { y: 175, z: 150 },
      { y: 0, z: 150 },
    ];

    const section = polygonSection({
      vertices,
      concrete,
      rebars: [{ y: 300, z: 450, area: As, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
  });
});
