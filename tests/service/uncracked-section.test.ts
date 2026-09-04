import { describe, it, expect } from 'vitest';
import { uncrackedProperties } from '../../src/service/uncracked-section';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

describe('section homogeneisee non fissuree', () => {
  it('sans armature, retrouve les formules elementaires du rectangle', () => {
    const nue = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const p = uncrackedProperties(nue, 15, 800);

    expect(p.A).toBeCloseTo(300 * 500, 3);
    expect(Math.abs(p.S)).toBeLessThan(1e-6); // rectangle symetrique autour du centroide
    expect(p.I).toBeCloseTo((300 * 500 ** 3) / 12, -2);
  });

  it('les armatures comptent pour (n-1)A, quelle que soit leur position', () => {
    // Tout le beton participe : aucune barre n'est « tendue » au sens fissure,
    // donc toutes deplacent du beton et comptent pour (n-1)A.
    const As = 500;
    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [
        { depthFromTop: 50, area: As, steel },
        { depthFromTop: 450, area: As, steel },
      ],
    });

    const p = uncrackedProperties(section, 15, 800);
    expect(p.A).toBeCloseTo(300 * 500 + 2 * 14 * As, 3);
  });

  it('un ferraillage dissymetrique decale l axe neutre elastique vers les armatures', () => {
    const As = 3 * (Math.PI * 20 ** 2) / 4;
    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [{ depthFromTop: 452, area: As, steel }],
    });

    const p = uncrackedProperties(section, 15, 800);
    const zAxe = p.S / p.A;

    expect(zAxe).toBeGreaterThan(0); // vers le bas, du cote des barres
    expect(zAxe).toBeCloseTo(16.332, 2);
  });

  it('converge quand le nombre de bandes augmente', () => {
    const nue = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const exact = (300 * 500 ** 3) / 12;

    const erreur = (bandes: number) =>
      Math.abs(uncrackedProperties(nue, 15, bandes).I - exact) / exact;

    expect(erreur(2000)).toBeLessThanOrEqual(erreur(50));
    expect(erreur(2000)).toBeLessThan(1e-6);
  });
});
