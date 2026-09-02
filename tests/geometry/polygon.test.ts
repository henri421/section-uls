import { describe, it, expect } from 'vitest';
import { polygonArea, polygonCentroid, polygonSection } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('polygonArea / polygonCentroid (formule du lacet)', () => {
  it('retrouve aire et centroide d un rectangle 300x500 defini par ses 4 coins bruts', () => {
    const vertices = [
      { y: 0, z: 0 },
      { y: 300, z: 0 },
      { y: 300, z: 500 },
      { y: 0, z: 500 },
    ];

    expect(polygonArea(vertices)).toBeCloseTo(150000, 6);
    const centroid = polygonCentroid(vertices);
    expect(centroid.y).toBeCloseTo(150, 6);
    expect(centroid.z).toBeCloseTo(250, 6);
  });

  it('retrouve aire et centroide d un triangle rectangle (cas independant du rectangle)', () => {
    // Triangle rectangle : angle droit a l'origine, cotes 300 (horizontal) et 400 (vertical).
    const vertices = [
      { y: 0, z: 0 },
      { y: 300, z: 0 },
      { y: 0, z: 400 },
    ];

    // Aire = base*hauteur/2 ; centroide = moyenne des sommets (proprietes standard du triangle).
    expect(polygonArea(vertices)).toBeCloseTo(60000, 6);
    const centroid = polygonCentroid(vertices);
    expect(centroid.y).toBeCloseTo(100, 6);
    expect(centroid.z).toBeCloseTo(133.3333, 3);
  });
});

describe('polygonSection', () => {
  it('centre les sommets et les armatures sur le centroide calcule', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);

    const section = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 300, z: 0 },
        { y: 300, z: 500 },
        { y: 0, z: 500 },
      ],
      concrete,
      rebars: [{ y: 150, z: 450, area: 1000, steel: null as never }],
    });

    if (section.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');
    // Coin (0,0) brut, centroide (150,250) -> translate en (-150,-250).
    expect(section.geometry.vertices[0].y).toBeCloseTo(-150, 6);
    expect(section.geometry.vertices[0].z).toBeCloseTo(-250, 6);

    // Armature (150,450) brute -> (0, 200), coherent avec depthFromTop=450
    // pour un rectangle 300x500 (Task 1 : 450 - 500/2 = 200).
    expect(section.rebars[0].y).toBeCloseTo(0, 6);
    expect(section.rebars[0].z).toBeCloseTo(200, 6);
  });
});
