import { describe, it, expect } from 'vitest';
import { sectionCurvature } from '../../src/service/curvature';
import { uncrackedProperties } from '../../src/service/uncracked-section';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('Courbure — recalcul manuel, etape par etape', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);

  const b = 300;
  const h = 500;
  const n = 15;
  const As = 3 * (Math.PI * 20 ** 2) / 4;

  const section = rectangularSection({
    width: b, height: h, concrete,
    rebars: [{ depthFromTop: 452, area: As, steel }],
  });

  it('controle elementaire : sans armature, M_cr = f_ctm·b·h²/6', () => {
    const nue = rectangularSection({ width: b, height: h, concrete, rebars: [] });
    const fctm = 0.3 * 25 ** (2 / 3);
    const attendu = (fctm * b * h ** 2) / 6 / 1e6; // kN·m

    expect(attendu).toBeCloseTo(32.062, 2);
    expect(sectionCurvature(nue, { N: 0, M: 10 }, { n }).crackingMoment).toBeCloseTo(attendu, 2);
  });

  it('etape 1 — caracteristiques de la section non fissuree', () => {
    const p = uncrackedProperties(section, n, 2000);

    expect(p.A).toBeCloseTo(b * h + 14 * As, 1);
    expect(p.S).toBeCloseTo(14 * As * 202, 0);
    expect(p.S / p.A).toBeCloseTo(16.332, 2);
    expect(p.I - p.S ** 2 / p.A).toBeCloseTo(3.61987e9, -5);
  });

  it('etape 2 — moment de fissuration', () => {
    const r = sectionCurvature(section, { N: 0, M: 100 }, { n });
    expect(r.crackingMoment).toBeCloseTo(39.735, 2);
  });

  it('etape 3 — les deux courbures et le coefficient de distribution', () => {
    const r = sectionCurvature(section, { N: 0, M: 100 }, { n, beta: 0.5 });

    expect(r.curvatureUncracked).toBeCloseTo(2.0719e-6, 9);
    expect(r.curvatureCracked).not.toBeNull();
    expect(r.curvatureCracked!).toBeCloseTo(4.6478e-6, 9);
    expect(r.zeta).toBeCloseTo(0.92106, 4);
  });

  it('etape 4 — courbure interpolee et raideur effective', () => {
    const r = sectionCurvature(section, { N: 0, M: 100 }, { n, beta: 0.5 });

    expect(r.curvature).toBeCloseTo(4.4445e-6, 9);
    expect(r.effectiveStiffness / 1e13).toBeCloseTo(2.25, 2);
  });
});
