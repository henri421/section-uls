import { describe, it, expect } from 'vitest';
import { verifyUniaxial, concretePivotStrainField } from '../../src/solvers/uls-uniaxial';
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

  it('converge avec N non nul sur une section en T, axe neutre au-dela de la transition aile/ame (z=150)', () => {
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

    // N=800 kN choisi empiriquement (sondage 500..4000 kN) pour pousser
    // l'axe neutre au-dela de z=150, dans l'ame (largeur 250mm) apres la
    // discontinuite de largeur avec l'aile (largeur 600mm) — exactement le
    // cas ou l'hypothese de monotonie bande par bande est la plus sollicitee.
    const result = verifyUniaxial(section, { N: 800, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.neutralAxisDepth).toBeGreaterThan(150);
    expect(result.M_Rd).toBeGreaterThan(0);
  });
});

describe('concretePivotStrainField', () => {
  it('vaut epsCu2 a la fibre extreme et zero a l axe neutre', () => {
    const champ = concretePivotStrainField(-250, 200, 3.5e-3);

    expect(champ(-250)).toBeCloseTo(3.5e-3, 12); // fibre extreme comprimee
    expect(champ(-250 + 200)).toBeCloseTo(0, 12); // axe neutre
    expect(champ(0)).toBeCloseTo(3.5e-3 * (1 - 250 / 200), 12); // au-dela : traction
  });
});
