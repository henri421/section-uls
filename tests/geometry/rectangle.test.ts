import { describe, it, expect } from 'vitest';
import { rectangularSection, rectangleToPolygon } from '../../src/geometry/rectangle';
import { polygonArea, polygonCentroid } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';

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

describe('rectangleToPolygon', () => {
  it('produit un contour a quatre sommets, centre sur le centroide, de meme aire', () => {
    const poly = rectangleToPolygon({ kind: 'rectangle', width: 300, height: 500 });

    expect(poly.kind).toBe('polygon');
    expect(poly.vertices).toHaveLength(4);
    expect(polygonArea(poly.vertices)).toBeCloseTo(300 * 500, 6);

    const c = polygonCentroid(poly.vertices);
    expect(c.y).toBeCloseTo(0, 9);
    expect(c.z).toBeCloseTo(0, 9);

    // z vers le bas : la fibre superieure est a -height/2
    const zs = poly.vertices.map((v) => v.z);
    expect(Math.min(...zs)).toBeCloseTo(-250, 9);
    expect(Math.max(...zs)).toBeCloseTo(250, 9);
  });
});

describe('rectangularSection — armatures deja positionnees', () => {
  it('accepte des RebarLayer et conserve leurs coordonnees telles quelles', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    });

    const section = rectangularSection({ width: 400, height: 600, concrete, rebars: layout.bars });

    expect(section.rebars).toHaveLength(3);
    expect(section.rebars.map((r) => r.y)).toEqual([-152, 0, 152]);
    expect(section.rebars.every((r) => r.z === 252)).toBe(true);
  });

  it('la forme historique depthFromTop reste inchangee', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ depthFromTop: 450, area: 1000, steel }],
    });

    expect(section.rebars[0].y).toBe(0);
    expect(section.rebars[0].z).toBe(200);
  });
});
