import { describe, it, expect } from 'vitest';
import { rotatePoint, rotateSection, rotateMomentBack } from '../../src/geometry/rotate';
import { polygonSection, polygonArea, polygonCentroid } from '../../src/geometry/polygon';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

describe('rotation', () => {
  it('theta = 0 est l identite', () => {
    const p = rotatePoint({ y: 37, z: -12 }, 0);
    expect(p.y).toBeCloseTo(37, 12);
    expect(p.z).toBeCloseTo(-12, 12);
  });

  it('theta = 90 deg envoie l axe y sur l axe z negatif', () => {
    const p = rotatePoint({ y: 1, z: 0 }, Math.PI / 2);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(-1, 12);
  });

  it('la rotation est une isometrie : aire et centroide preserves', () => {
    // Section en T, non convexe et non symetrique en z.
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
      rebars: [],
    });

    const aireInitiale = polygonArea(section.geometry.vertices);
    const tournee = rotateSection(section, 0.7);

    expect(polygonArea(tournee.geometry.vertices)).toBeCloseTo(aireInitiale, 6);
    const c = polygonCentroid(tournee.geometry.vertices);
    expect(c.y).toBeCloseTo(0, 6);
    expect(c.z).toBeCloseTo(0, 6);
  });

  it('les armatures tournent avec la geometrie, la section d origine est intacte', () => {
    const section = rectangularSection({
      width: 400,
      height: 600,
      concrete,
      rebars: [{ y: 150, z: 250, area: 314, steel }],
    });

    const tournee = rotateSection(section, Math.PI / 2);

    expect(tournee.rebars[0].y).toBeCloseTo(250, 9);
    expect(tournee.rebars[0].z).toBeCloseTo(-150, 9);
    expect(tournee.rebars[0].area).toBe(314);

    // La section d'origine n'a pas bouge.
    expect(section.rebars[0].y).toBe(150);
    expect(section.geometry.kind).toBe('rectangle');
  });

  it('un rectangle est converti en polygone avant rotation', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const tournee = rotateSection(section, 0.3);

    expect(tournee.geometry.kind).toBe('polygon');
    expect(tournee.geometry.vertices).toHaveLength(4);
    expect(polygonArea(tournee.geometry.vertices)).toBeCloseTo(300 * 500, 6);
  });

  it('rotateMomentBack est l inverse exact de la rotation du moment', () => {
    const theta = 0.87;
    const m = { y: 123.4, z: -56.7 };

    const tourne = rotatePoint(m, theta); // le moment se transforme comme un point
    const revenu = rotateMomentBack(tourne, theta);

    expect(revenu.y).toBeCloseTo(m.y, 10);
    expect(revenu.z).toBeCloseTo(m.z, 10);
  });
});
