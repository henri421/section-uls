import { describe, it, expect } from 'vitest';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

/**
 * Verification ELU de bout en bout pour une section de pieu circulaire —
 * la geometrie circulaire (Task 8) existe specifiquement pour ce cas
 * d'usage (pieux fores), mais n'avait jamais ete exercee a travers
 * verifyUniaxial avant ce test. Il n'y a pas de formule fermee bon marche
 * pour une section circulaire EC2 parabole-rectangle : ce test est un
 * smoke test qui prouve que le pipeline complet (cage circulaire ->
 * section polygonale -> solveur ELU) fonctionne et donne un resultat
 * physiquement sain, pas un handcalc de precision.
 */
describe('Verification ELU d une section de pieu circulaire', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);

  const diameter = 600;
  const cover = 50;
  const barDiameter = 20;
  const count = 8;

  it('converge en flexion simple (N=0) et donne un M_Rd fini et positif', () => {
    const section = circularSection({
      diameter,
      concrete,
      rebars: circularRebarCage({ diameter, cover, barDiameter, count, steel }),
      segments: 32,
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(Number.isFinite(result.M_Rd)).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
    expect(Number.isFinite(result.neutralAxisDepth)).toBe(true);
    expect(result.neutralAxisDepth).toBeGreaterThan(0);
    expect(result.neutralAxisDepth).toBeLessThan(diameter);
    expect(result.N_Rd).toBeCloseTo(0, 1);
  });

  it('converge aussi sous compression modeste combinee a la flexion (N non nul)', () => {
    const section = circularSection({
      diameter,
      concrete,
      rebars: circularRebarCage({ diameter, cover, barDiameter, count, steel }),
      segments: 32,
    });

    // N=500 kN : compression moderee, bien en-deca de la capacite max
    // (~fcd*Aire_beton + fyd*As, de l'ordre de plusieurs MN pour ce pieu),
    // representative d'un cas de charge de pieu reel.
    const result = verifyUniaxial(section, { N: 500, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(Number.isFinite(result.M_Rd)).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
    expect(result.N_Rd).toBeCloseTo(500, 1);
  });
});
