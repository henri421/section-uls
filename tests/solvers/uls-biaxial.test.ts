import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poteau carre 400x400, ferraillage symetrique : 4 coins + 4 milieux de face. */
function poteauCarre() {
  const layout = rectangularRebarLayout({
    width: 400,
    height: 400,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
      { face: 'left', bars: { count: 1, diameter: 20 } },
      { face: 'right', bars: { count: 1, diameter: 20 } },
    ],
  });
  return rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
}

describe('verifyBiaxial', () => {
  it('refuse une sollicitation sans direction de moment', () => {
    expect(() => verifyBiaxial(poteauCarre(), { N: 500, My: 0, Mz: 0 }, profile)).toThrow();
  });

  it('non-regression : une sollicitation autour de y seul redonne le resultat du solveur droit', () => {
    const section = poteauCarre();
    const droit = verifyUniaxial(section, { N: 800, M: 0 }, profile);
    const devie = verifyBiaxial(section, { N: 800, My: 1, Mz: 0 }, profile);

    expect(devie.converged).toBe(true);
    expect(Math.abs(devie.M_Rd.y - droit.M_Rd) / Math.abs(droit.M_Rd)).toBeLessThan(1e-6);
    expect(Math.abs(devie.M_Rd.z)).toBeLessThan(1e-6);
    expect(Math.abs(devie.neutralAxis.angle)).toBeLessThan(1e-4);
    expect(Math.abs(devie.neutralAxisDepth - droit.neutralAxisDepth)).toBeLessThan(1e-3);

    // La racine tombe ici exactement sur un point de balayage (theta = 0) :
    // elle doit etre comptee UNE fois, pas deux. Sans deduplication, le
    // balayage la detecte a la fois comme echantillon et comme encadrement
    // de l'intervalle precedent.
    expect(devie.rootCount).toBe(1);
  });

  it('seule la direction du moment sollicitant compte, pas sa magnitude', () => {
    const section = poteauCarre();
    const petit = verifyBiaxial(section, { N: 500, My: 1, Mz: 0.5 }, profile);
    const grand = verifyBiaxial(section, { N: 500, My: 1000, Mz: 500 }, profile);

    expect(grand.M_Rd_magnitude).toBeCloseTo(petit.M_Rd_magnitude, 6);
  });

  it('porte de validation : a 45 deg sur un poteau carre symetrique, les deux composantes sont egales', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 600, My: 1, Mz: 1 }, profile);

    expect(r.converged).toBe(true);
    expect(r.M_Rd.y).toBeGreaterThan(0);
    expect(r.M_Rd.z).toBeGreaterThan(0);
    expect(Math.abs(r.M_Rd.y - r.M_Rd.z) / r.M_Rd.y).toBeLessThan(1e-4);

    // Axe neutre parallele a une diagonale : |cos| = |sin|.
    const t = r.neutralAxis.angle;
    expect(Math.abs(Math.abs(Math.cos(t)) - Math.abs(Math.sin(t)))).toBeLessThan(1e-3);
  });

  it('symetries d orientation : les quatre directions cardinales donnent la meme capacite', () => {
    const section = poteauCarre();
    const directions = [
      { My: 1, Mz: 0 },
      { My: 0, Mz: 1 },
      { My: -1, Mz: 0 },
      { My: 0, Mz: -1 },
    ];

    const magnitudes = directions.map(
      (d) => verifyBiaxial(section, { N: 600, ...d }, profile).M_Rd_magnitude
    );

    for (const m of magnitudes) {
      expect(Math.abs(m - magnitudes[0]) / magnitudes[0]).toBeLessThan(1e-6);
    }
  });

  it('le moment resistant est colineaire et de meme sens que le moment sollicitant', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 400, My: 3, Mz: -2 }, profile);

    const produitVectoriel = r.M_Rd.y * -2 - r.M_Rd.z * 3;
    const produitScalaire = r.M_Rd.y * 3 + r.M_Rd.z * -2;

    expect(Math.abs(produitVectoriel) / r.M_Rd_magnitude).toBeLessThan(1e-4);
    expect(produitScalaire).toBeGreaterThan(0);
  });

  it('budget : la convergence tient en moins de 60 resolutions droites', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 600, My: 1, Mz: 1 }, profile);
    expect(r.innerSolves).toBeLessThanOrEqual(60);
  });

  it('le bras de levier recoupe M = F * z en flexion simple', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 0, My: 1, Mz: 1 }, profile);

    expect(r.leverArm).not.toBeNull();
    expect(r.compression).not.toBeNull();
    expect(r.tension).not.toBeNull();
    // N = 0 : les deux resultantes sont egales en module, et M = F * z.
    expect(r.compression!.force).toBeCloseTo(r.tension!.force, 3);
    const produit = (r.compression!.force * r.leverArm!) / 1000; // kN * mm -> kN·m
    expect(Math.abs(produit - r.M_Rd_magnitude) / r.M_Rd_magnitude).toBeLessThan(1e-3);
  });
});
