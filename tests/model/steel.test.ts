import { describe, it, expect } from 'vitest';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('createSteel', () => {
  it('derive fyd et epsYd (EN 1992-1-1 §3.2.7)', () => {
    const profile = ec2Recommended();
    const s = createSteel(500, 200000, profile);
    expect(s.fyd).toBeCloseTo(434.7826, 3); // fyk/gammaS = 500/1.15
    expect(s.epsYd).toBeCloseTo(0.0021739, 6); // fyd/Es
    expect(s.Es).toBe(200000);
  });
});
