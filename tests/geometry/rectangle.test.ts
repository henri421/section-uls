import { describe, it, expect } from 'vitest';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('rectangularSection', () => {
  it('assemble une section rectangulaire avec ses armatures', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 4 * Math.PI * 10 ** 2; // 4 x diam 20mm

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    expect(section.geometry.kind).toBe('rectangle');
    expect(section.geometry.width).toBe(300);
    expect(section.geometry.height).toBe(500);
    expect(section.rebars).toHaveLength(1);
    expect(section.rebars[0].z).toBe(200); // 450 - height/2 = 450 - 250
    expect(section.rebars[0].y).toBe(0);
  });
});
