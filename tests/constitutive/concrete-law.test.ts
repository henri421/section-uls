import { describe, it, expect } from 'vitest';
import { concreteStress } from '../../src/constitutive/concrete-law';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('concreteStress (parabole-rectangle, EN 1992-1-1 §3.1.7 éq. 3.17-3.18)', () => {
  const concrete = createConcrete(25, ec2Recommended()); // fcd=16.6667, epsC2=0.002, epsCu2=0.0035, n=2

  it('vaut 0 en traction (deformation negative ou nulle)', () => {
    expect(concreteStress(-0.001, concrete)).toBe(0);
    expect(concreteStress(0, concrete)).toBe(0);
  });

  it('suit la parabole entre 0 et epsC2', () => {
    // eps=0.001 -> eps/epsC2=0.5 -> sigma = fcd*(1-(1-0.5)^2) = fcd*0.75
    expect(concreteStress(0.001, concrete)).toBeCloseTo(16.6667 * 0.75, 3);
  });

  it('vaut fcd sur le plateau entre epsC2 et epsCu2', () => {
    expect(concreteStress(0.002, concrete)).toBeCloseTo(16.6667, 3);
    expect(concreteStress(0.003, concrete)).toBeCloseTo(16.6667, 3);
    expect(concreteStress(0.0035, concrete)).toBeCloseTo(16.6667, 3);
  });

  it('vaut 0 au-dela de epsCu2 (beton ecrase, ne devrait pas se produire en pratique)', () => {
    expect(concreteStress(0.004, concrete)).toBe(0);
  });
});
