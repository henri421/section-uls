import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { rectangularRebarLayout, rebarRow } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { profilBancVcaslu, CAS, TOLERANCE_RELATIVE } from './vcaslu-cases';

const profile = profilBancVcaslu();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function cas0() {
  const layout = rectangularRebarLayout({
    width: 300,
    height: 500,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
    ],
  });
  const section = rectangularSection({ width: 300, height: 500, concrete, rebars: layout.bars });
  return verifyBiaxial(section, { N: 800, My: Math.cos(Math.PI / 6), Mz: Math.sin(Math.PI / 6) }, profile);
}

function cas1() {
  const bas = rebarRow({
    from: { y: 200, z: 450 },
    to: { y: 400, z: 450 },
    bars: { count: 3, diameter: 20 },
    steel,
  });
  const section = polygonSection({
    vertices: [
      { y: 0, z: 0 },
      { y: 600, z: 0 },
      { y: 600, z: 150 },
      { y: 425, z: 150 },
      { y: 425, z: 500 },
      { y: 175, z: 500 },
      { y: 175, z: 150 },
      { y: 0, z: 150 },
    ],
    concrete,
    rebars: bas.bars,
  });
  return verifyBiaxial(section, { N: 0, My: 1, Mz: 1 }, profile);
}

function cas2() {
  const section = circularSection({
    diameter: 600,
    concrete,
    rebars: circularRebarCage({
      diameter: 600,
      cover: 50,
      stirrupDiameter: 12,
      barDiameter: 20,
      count: 8,
      steel,
    }),
  });
  return verifyBiaxial(section, { N: 1200, My: 1, Mz: 1 }, profile);
}

const CALCULS = [cas0, cas1, cas2];

describe('Banc de comparaison VCASLU', () => {
  CAS.forEach((cas, i) => {
    const calculer = CALCULS[i];

    it(`${cas.nom} — converge et produit une capacite exploitable`, () => {
      const r = calculer();
      expect(r.converged).toBe(true);
      expect(r.M_Rd_magnitude).toBeGreaterThan(0);
      expect(r.rootCount).toBe(1);
    });

    const nomComparaison = `${cas.nom} — ecart a VCASLU sous ${TOLERANCE_RELATIVE * 100} %`;

    if (cas.reference === null) {
      it.skip(`${nomComparaison} (reference non saisie : voir docs/validation/vcaslu.md)`, () => {});
    } else {
      it(nomComparaison, () => {
        const r = calculer();
        const ecart = Math.abs(r.M_Rd_magnitude - cas.reference!) / cas.reference!;
        expect(ecart).toBeLessThan(TOLERANCE_RELATIVE);
      });
    }
  });
});
