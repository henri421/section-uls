import { describe, it, expect } from 'vitest';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { polygonArea, polygonCentroid } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('circularSection', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const diameter = 600;
  const exactArea = Math.PI * (diameter / 2) ** 2;

  it('converge vers l aire theorique du cercle quand le nombre de segments augmente', () => {
    const coarse = circularSection({ diameter, concrete, rebars: [], segments: 8 });
    const fine = circularSection({ diameter, concrete, rebars: [], segments: 64 });

    if (coarse.geometry.kind !== 'polygon' || fine.geometry.kind !== 'polygon') {
      throw new Error('expected polygon geometry');
    }

    const coarseError = Math.abs(polygonArea(coarse.geometry.vertices) - exactArea) / exactArea;
    const fineError = Math.abs(polygonArea(fine.geometry.vertices) - exactArea) / exactArea;

    expect(fineError).toBeLessThan(coarseError);
    expect(fineError).toBeLessThan(0.005); // < 0.5% a 64 segments
  });

  it('centre le polygone sur son propre centroide (proche de (0,0))', () => {
    const section = circularSection({ diameter, concrete, rebars: [], segments: 32 });
    if (section.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');

    const centroid = polygonCentroid(section.geometry.vertices);
    expect(centroid.y).toBeCloseTo(0, 6);
    expect(centroid.z).toBeCloseTo(0, 6);
  });

  it('utilise 32 segments par defaut si non precise', () => {
    const section = circularSection({ diameter, concrete, rebars: [] });
    if (section.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');
    expect(section.geometry.vertices).toHaveLength(32);
  });
});

describe('circularRebarCage', () => {
  it('genere le bon nombre de barres, toutes au meme rayon et de la bonne aire', () => {
    const steel = createSteel(500, 200000, ec2Recommended());
    const cage = circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel });

    expect(cage).toHaveLength(8);

    const expectedRadius = 600 / 2 - 50 - 20 / 2; // 240
    for (const bar of cage) {
      const r = Math.sqrt(bar.y ** 2 + bar.z ** 2);
      expect(r).toBeCloseTo(expectedRadius, 6);
    }

    const expectedArea = Math.PI * (20 / 2) ** 2;
    expect(cage[0].area).toBeCloseTo(expectedArea, 6);
  });

  it('applique rotationOffset a toute la cage (premiere barre decalee de l angle donne)', () => {
    const steel = createSteel(500, 200000, ec2Recommended());
    const cage = circularRebarCage({
      diameter: 600,
      cover: 50,
      barDiameter: 20,
      count: 4,
      steel,
      rotationOffset: Math.PI / 4,
    });

    const cageRadius = 600 / 2 - 50 - 20 / 2; // 240
    expect(cage[0].y).toBeCloseTo(cageRadius * Math.cos(Math.PI / 4), 6);
    expect(cage[0].z).toBeCloseTo(cageRadius * Math.sin(Math.PI / 4), 6);
  });
});
