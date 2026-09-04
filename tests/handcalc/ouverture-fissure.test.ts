import { describe, it, expect } from 'vitest';
import { verifyCrackWidth } from '../../src/service/crack-width';
import { verifyServiceUniaxial } from '../../src/service/verify-service';
import { effectiveTensionArea } from '../../src/service/effective-area';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('Ouverture de fissure — recalcul manuel complet, etape par etape', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);

  const b = 300;
  const h = 500;
  const M = 100; // kN·m

  const section = rectangularSection({
    width: b, height: h, concrete,
    rebars: rectangularRebarLayout({
      width: b, height: h, cover: 30, stirrupDiameter: 8, steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    }).bars,
  });

  it('etape 1 — methode n : axe neutre et contrainte d acier', () => {
    const service = verifyServiceUniaxial(section, { N: 0, M }, { n: 15 });

    expect(service.converged).toBe(true);
    expect(service.neutralAxisZ + h / 2).toBeCloseTo(164.585, 2); // x depuis la fibre comprimee
    expect(service.sigmaS).toBeCloseTo(267.17, 1);
  });

  it('etape 2 — aire effective de beton tendu', () => {
    const aire = effectiveTensionArea(section, 164.585);

    expect(aire.d).toBeCloseTo(452, 6);
    expect(aire.hcEff).toBeCloseTo(111.805, 2);
    expect(aire.acEff).toBeCloseTo(33541.5, 0);
    expect(aire.asEff).toBeCloseTo(942.478, 2);
    expect(aire.asEff / aire.acEff).toBeCloseTo(0.028099, 5);
  });

  it('etape 3 — deformation relative et espacement des fissures', () => {
    const r = verifyCrackWidth(section, { N: 0, M }, { service: { n: 15 } });

    expect(r.rhoEff).toBeCloseTo(0.028099, 5);
    expect(r.phiEq).toBeCloseTo(20, 6);
    expect(r.epsilonDifference).toBeCloseTo(1.1207e-3, 6);
    expect(r.wideSpacing).toBe(false);
    expect(r.srMax).toBeCloseTo(250.2, 0);
  });

  it('etape 4 — ouverture de fissure et verdict', () => {
    const r = verifyCrackWidth(section, { N: 0, M }, { service: { n: 15 } });

    expect(r.converged).toBe(true);
    expect(r.wk).toBeCloseTo(0.280, 2);
    expect(r.ok).toBe(true); // sous la limite par defaut de 0,3 mm
  });
});
