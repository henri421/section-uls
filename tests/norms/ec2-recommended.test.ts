import { describe, it, expect } from 'vitest';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('ec2Recommended', () => {
  it('retourne les coefficients partiels recommandés EN 1992-1-1 tableau 2.1N', () => {
    const profile = ec2Recommended();
    expect(profile.name).toBe('EC2_recommended');
    expect(profile.gammaC).toBe(1.5);
    expect(profile.gammaS).toBe(1.15);
    expect(profile.alphaCc).toBe(1.0);
    expect(profile.nBands).toBeGreaterThan(0);
  });
});
