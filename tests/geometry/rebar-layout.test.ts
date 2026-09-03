import { describe, it, expect } from 'vitest';
import { rebarRow } from '../../src/geometry/rebar-layout';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const steel = createSteel(500, 200000, ec2Recommended());

describe('rebarRow', () => {
  it('mode count : n barres reparties uniformement, extremites incluses', () => {
    const row = rebarRow({
      from: { y: -150, z: 200 },
      to: { y: 150, z: 200 },
      bars: { count: 4, diameter: 20 },
      steel,
    });

    expect(row.bars).toHaveLength(4);
    expect(row.bars.map((b) => b.y)).toEqual([-150, -50, 50, 150]);
    expect(row.bars.every((b) => b.z === 200)).toBe(true);

    const aireUneBarre = (Math.PI * 20 ** 2) / 4; // 314.159 mm²
    expect(row.bars[0].area).toBeCloseTo(aireUneBarre, 9);
    expect(row.summary).toEqual({
      count: 4,
      diameter: 20,
      spacing: 100,
      totalArea: 4 * aireUneBarre,
    });
  });

  it('mode count : une barre unique est placee au milieu du segment', () => {
    const row = rebarRow({
      from: { y: -150, z: 0 },
      to: { y: 150, z: 0 },
      bars: { count: 1, diameter: 12 },
      steel,
    });

    expect(row.bars).toHaveLength(1);
    expect(row.bars[0].y).toBeCloseTo(0, 9);
    expect(row.summary.spacing).toBe(0);
  });

  it('mode maxSpacing : l espacement demande est un MAXIMUM, jamais depasse', () => {
    // 400 mm utiles, "Ø12 tous les 150" -> ceil(400/150) = 3 intervalles,
    // donc 4 barres a 133.3 mm reels. Jamais 3 barres a 150 avec un
    // intervalle residuel de 100 en bout.
    const row = rebarRow({
      from: { y: -200, z: 0 },
      to: { y: 200, z: 0 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
    });

    expect(row.bars).toHaveLength(4);
    expect(row.summary.spacing).toBeCloseTo(400 / 3, 9);
    expect(row.summary.spacing).toBeLessThanOrEqual(150);
    expect(row.bars[0].y).toBeCloseTo(-200, 9);
    expect(row.bars[3].y).toBeCloseTo(200, 9);
  });

  it('endpoints exclude : seules les barres intermediaires sont posees', () => {
    // Lit lateral d'un poteau : les barres d'angle appartiennent deja aux
    // lits inferieur et superieur, il ne faut pas les compter deux fois.
    const row = rebarRow({
      from: { y: -100, z: -200 },
      to: { y: -100, z: 200 },
      bars: { count: 3, diameter: 16 },
      steel,
      endpoints: 'exclude',
    });

    expect(row.bars).toHaveLength(3);
    expect(row.bars.map((b) => b.z)).toEqual([-100, 0, 100]);
    expect(row.bars.every((b) => b.y === -100)).toBe(true);
  });

  it('endpoints exclude en mode maxSpacing : ceil(L/s) - 1 barres intermediaires', () => {
    const row = rebarRow({
      from: { y: 0, z: -200 },
      to: { y: 0, z: 200 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
      endpoints: 'exclude',
    });

    // ceil(400/150) = 3 intervalles -> 2 barres intermediaires a 133.3 mm
    expect(row.bars).toHaveLength(2);
    expect(row.summary.spacing).toBeCloseTo(400 / 3, 9);
  });

  it('un lit vide est licite et ne renvoie aucune barre', () => {
    const row = rebarRow({
      from: { y: 0, z: 0 },
      to: { y: 0, z: 100 },
      bars: { count: 0, diameter: 12 },
      steel,
    });

    expect(row.bars).toHaveLength(0);
    expect(row.summary.totalArea).toBe(0);
  });

  it('rejette un nombre de barres negatif et un espacement non positif', () => {
    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { count: -1, diameter: 12 }, steel })
    ).toThrow();

    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { diameter: 12, maxSpacing: 0 }, steel })
    ).toThrow();
  });
});
