import { describe, it, expect } from 'vitest';
import { verifyCrackWidth } from '../../src/service/crack-width';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poutre(nombreBarres = 3, diametre = 20) {
  return rectangularSection({
    width: 300, height: 500, concrete,
    rebars: rectangularRebarLayout({
      width: 300, height: 500, cover: 30, stirrupDiameter: 8, steel,
      rows: [{ face: 'bottom', bars: { count: nombreBarres, diameter: diametre } }],
    }).bars,
  });
}

describe('verifyCrackWidth', () => {
  it('rend une ouverture positive et les grandeurs intermediaires', () => {
    const r = verifyCrackWidth(poutre(), { N: 0, M: 100 });

    expect(r.converged).toBe(true);
    expect(r.wk).toBeGreaterThan(0);
    expect(r.srMax).toBeGreaterThan(0);
    expect(r.rhoEff).toBeGreaterThan(0);
    expect(r.phiEq).toBeCloseTo(20, 6);
    expect(r.sigmaS).toBeGreaterThan(0);
  });

  it('conclut par rapport a la limite, parametrable', () => {
    const large = verifyCrackWidth(poutre(), { N: 0, M: 100 }, { wMax: 0.4 });
    const stricte = verifyCrackWidth(poutre(), { N: 0, M: 100 }, { wMax: 0.1 });

    expect(large.wMax).toBeCloseTo(0.4, 9);
    expect(large.ok).toBe(true);
    expect(stricte.ok).toBe(false);
    expect(stricte.reason).toBeDefined();
  });

  it('la limite par defaut vaut 0,3 mm', () => {
    expect(verifyCrackWidth(poutre(), { N: 0, M: 100 }).wMax).toBeCloseTo(0.3, 9);
  });

  it('SENS PHYSIQUE : plus d armatures reduit l ouverture', () => {
    const peu = verifyCrackWidth(poutre(3, 20), { N: 0, M: 100 });
    const beaucoup = verifyCrackWidth(poutre(5, 20), { N: 0, M: 100 });

    expect(beaucoup.wk).toBeLessThan(peu.wk);
  });

  it('SENS PHYSIQUE : a aire comparable, des barres plus fines reduisent l ouverture', () => {
    // 3 HA20 = 942 mm² contre 8 HA12 = 905 mm² : aire legerement moindre,
    // mais un diametre equivalent bien plus faible, qui doit l'emporter.
    const grosses = verifyCrackWidth(poutre(3, 20), { N: 0, M: 100 });
    const fines = verifyCrackWidth(poutre(8, 12), { N: 0, M: 100 });

    expect(fines.wk).toBeLessThan(grosses.wk);
  });

  it('le plancher de l eq. 7.9 mord sur une section faiblement sollicitee', () => {
    // A faible moment, le terme entre crochets devient negatif : c'est le
    // plancher 0,6*sigmaS/Es qui doit etre retenu.
    const r = verifyCrackWidth(poutre(), { N: 0, M: 20 });

    expect(r.converged).toBe(true);
    expect(r.epsilonDifference).toBeCloseTo((0.6 * r.sigmaS) / 200000, 12);
  });

  it('un espacement large fait basculer sur l eq. 7.14 et le signale', () => {
    // Deux barres seulement sur 300 mm de large : l'espacement depasse
    // 5*(c + phi/2), donc l'eq. 7.11 sort de son domaine.
    const section = rectangularSection({
      width: 1500, height: 500, concrete,
      rebars: rectangularRebarLayout({
        width: 1500, height: 500, cover: 30, stirrupDiameter: 8, steel,
        rows: [{ face: 'bottom', bars: { count: 2, diameter: 20 } }],
      }).bars,
    });

    const r = verifyCrackWidth(section, { N: 0, M: 100 });
    expect(r.wideSpacing).toBe(true);
  });

  it('refuse une geometrie non rectangulaire', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const polygonale = { ...section, geometry: { kind: 'polygon' as const, vertices: [
      { y: -150, z: -250 }, { y: 150, z: -250 }, { y: 0, z: 250 },
    ] } };

    expect(() => verifyCrackWidth(polygonale, { N: 0, M: 100 })).toThrow(/rectangulaire/i);
  });

  it('propage la non-convergence du calcul de service', () => {
    // Section entierement comprimee : la session 6 ne converge pas, et il
    // n'y a alors pas de fissure a calculer.
    const r = verifyCrackWidth(poutre(), { N: 5000, M: 1 });

    expect(r.converged).toBe(false);
    expect(Number.isNaN(r.wk)).toBe(true);
    expect(r.reason).toBeDefined();
  });
});
