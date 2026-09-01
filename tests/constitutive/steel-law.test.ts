import { describe, it, expect } from 'vitest';
import { steelStress } from '../../src/constitutive/steel-law';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('steelStress (bilineaire, branche horizontale, EN 1992-1-1 §3.2.7)', () => {
  const steel = createSteel(500, 200000, ec2Recommended()); // fyd=434.7826, epsYd=0.0021739

  it('est elastique lineaire sous la limite elastique', () => {
    expect(steelStress(0.001, steel)).toBeCloseTo(200, 3); // Es*eps
    expect(steelStress(0.002, steel)).toBeCloseTo(400, 3); // encore < epsYd
  });

  it('plafonne a fyd en compression au-dela de la limite elastique', () => {
    expect(steelStress(0.003, steel)).toBeCloseTo(434.7826, 3);
    expect(steelStress(0.01, steel)).toBeCloseTo(434.7826, 3);
  });

  it('plafonne a -fyd en traction au-dela de la limite elastique, sans limite de deformation', () => {
    expect(steelStress(-0.003, steel)).toBeCloseTo(-434.7826, 3);
    expect(steelStress(-0.05, steel)).toBeCloseTo(-434.7826, 3);
  });
});
