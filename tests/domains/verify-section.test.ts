import { describe, it, expect } from 'vitest';
import { verifySection } from '../../src/domains/verify-section';
import { interactionCurveAtN } from '../../src/domains/interaction';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poteauCarre() {
  return rectangularSection({
    width: 400, height: 400, concrete,
    rebars: rectangularRebarLayout({
      width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
        { face: 'left', bars: { count: 1, diameter: 20 } },
        { face: 'right', bars: { count: 1, diameter: 20 } },
      ],
    }).bars,
  });
}

describe('verifySection', () => {
  it('conclut favorablement sur une section largement suffisante', () => {
    const v = verifySection(poteauCarre(), { N: 600, My: 20, Mz: 20 }, profile);

    expect(v.ok).toBe(true);
    expect(v.utilization).toBeLessThan(1);
    expect(v.M_Rd).not.toBeNull();
    expect(v.neutralAxis).not.toBeNull();
    expect(v.reason).toBeUndefined();
    expect(v.mode).toBe('constant-N');
  });

  it('conclut defavorablement et dit pourquoi sur une section depassee', () => {
    const v = verifySection(poteauCarre(), { N: 600, My: 400, Mz: 400 }, profile);

    expect(v.ok).toBe(false);
    expect(v.utilization).toBeGreaterThan(1);
    expect(v.reason).toBeDefined();
  });

  it('distingue le depassement en flexion de l effort normal hors domaine', () => {
    const flexion = verifySection(poteauCarre(), { N: 600, My: 400, Mz: 400 }, profile);
    const normal = verifySection(poteauCarre(), { N: 1e9, My: 10, Mz: 0 }, profile);

    expect(flexion.utilization).toBeGreaterThan(1);
    expect(flexion.utilization).toBeLessThan(Infinity);
    expect(normal.utilization).toBe(Infinity);
    expect(normal.reason).not.toBe(flexion.reason);
  });

  it('un point sur le contour est a la limite, taux voisin de 1', () => {
    const section = poteauCarre();
    const courbe = interactionCurveAtN(section, 600, profile, { steps: 24 });
    const point = courbe[11];

    const v = verifySection(section, { N: 600, My: point.My, Mz: point.Mz }, profile);
    expect(v.utilization).toBeCloseTo(1, 3);
  });

  it('accepte le mode proportionnel', () => {
    const v = verifySection(
      poteauCarre(), { N: 600, My: 20, Mz: 20 }, profile, { mode: 'proportional' }
    );
    expect(v.mode).toBe('proportional');
  });
});
