import { describe, it, expect } from 'vitest';
import { spacingOptions, faceSegment, rebarRow } from '../../src/geometry/rebar-layout';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const steel = createSteel(500, 200000, ec2Recommended());

describe('faceSegment', () => {
  it('longueur utile d une face inferieure : b moins deux distances d axe', () => {
    // b = 1000, enrobage 30, etrier 8, HA14 -> a = 30 + 8 + 7 = 45.
    const segment = faceSegment({
      width: 1000,
      height: 500,
      cover: 30,
      stirrupDiameter: 8,
      diameter: 14,
      face: 'bottom',
    });

    expect(segment.length).toBeCloseTo(910, 9);
    expect(segment.from).toEqual({ y: -455, z: 205 });
    expect(segment.to).toEqual({ y: 455, z: 205 });
    expect(segment.endpoints).toBe('include');
  });

  it('un lit lateral exclut ses extremites, qui sont les barres d angle', () => {
    const segment = faceSegment({
      width: 400,
      height: 800,
      cover: 30,
      stirrupDiameter: 8,
      diameter: 12,
      face: 'left',
    });

    expect(segment.endpoints).toBe('exclude');
    expect(segment.length).toBeCloseTo(800 - 2 * 44, 9);
  });
});

describe('spacingOptions', () => {
  /**
   * LE CAS QUI A MOTIVE LA FONCTION. « Ø14 tous les 150 » sur une largeur de
   * 1000 : la longueur utile vaut 910, et le plus petit nombre conforme est
   * 8 barres a 130 mm. La lecture spontanee « 1000/150 = 6,67 » suggere 6 ou
   * 7 — l'ecart, c'est l'enrobage, et il doit se VOIR.
   */
  it('enumere les nombres voisins avec leur espacement reel', () => {
    const options = spacingOptions({ length: 910, maxSpacing: 150 });

    expect(options.map((o) => o.count)).toEqual([6, 7, 8, 9]);

    const par = (count: number) => options.find((o) => o.count === count)!;

    expect(par(6).spacing).toBeCloseTo(182, 6);
    expect(par(6).ok).toBe(false);

    // 151,67 mm : deux millimetres au-dessus du maximum. Aucune regle ne dit
    // de le cacher, et lui seul explique pourquoi l'app propose 8.
    expect(par(7).spacing).toBeCloseTo(151.667, 3);
    expect(par(7).ok).toBe(false);

    expect(par(8).spacing).toBeCloseTo(130, 6);
    expect(par(8).ok).toBe(true);
    expect(par(8).strict).toBe(true);

    expect(par(9).spacing).toBeCloseTo(113.75, 6);
    expect(par(9).ok).toBe(true);
  });

  it('un seul nombre porte la marque strict, et c est le plus petit conforme', () => {
    const options = spacingOptions({ length: 910, maxSpacing: 150 });
    const stricts = options.filter((o) => o.strict);

    expect(stricts).toHaveLength(1);
    expect(stricts[0].count).toBe(8);

    // Tous les nombres conformes sont au-dessus du strict, aucun en dessous.
    for (const option of options) {
      if (option.ok) expect(option.count).toBeGreaterThanOrEqual(8);
    }
  });

  /**
   * COHERENCE AVEC LA POSE. Le nombre marque `strict` doit etre exactement
   * celui que `rebarRow` produit : l'app proposerait sinon un ferraillage
   * different de celui qu'elle dessine.
   */
  it('le nombre strict est celui que rebarRow pose reellement', () => {
    const cas = [
      { length: 910, maxSpacing: 150 },
      { length: 400, maxSpacing: 150 },
      { length: 1000, maxSpacing: 200 },
      { length: 305, maxSpacing: 100 },
    ];

    for (const { length, maxSpacing } of cas) {
      const strict = spacingOptions({ length, maxSpacing }).find((o) => o.strict)!;
      const pose = rebarRow({
        from: { y: -length / 2, z: 0 },
        to: { y: length / 2, z: 0 },
        bars: { diameter: 14, maxSpacing },
        steel,
      });

      expect(strict.count).toBe(pose.summary.count);
      expect(strict.spacing).toBeCloseTo(pose.summary.spacing, 9);
    }
  });

  it('mode exclude : meme coherence sur un lit lateral', () => {
    const length = 712;
    const maxSpacing = 200;

    const strict = spacingOptions({ length, maxSpacing, endpoints: 'exclude' }).find(
      (o) => o.strict
    )!;
    const pose = rebarRow({
      from: { y: 0, z: -length / 2 },
      to: { y: 0, z: length / 2 },
      bars: { diameter: 12, maxSpacing },
      steel,
      endpoints: 'exclude',
    });

    expect(strict.count).toBe(pose.summary.count);
  });

  it('un espacement qui tombe juste est conforme malgre l arithmetique flottante', () => {
    // 900/150 = 6 intervalles exactement -> 7 barres a 150,000 mm.
    const options = spacingOptions({ length: 900, maxSpacing: 150 });
    const strict = options.find((o) => o.strict)!;

    expect(strict.count).toBe(7);
    expect(strict.spacing).toBeCloseTo(150, 9);
    expect(strict.ok).toBe(true);
  });

  it('n enumere jamais moins de deux barres, un lit d une barre n ayant pas d espacement', () => {
    const options = spacingOptions({ length: 100, maxSpacing: 150 });

    expect(options.every((o) => o.count >= 2)).toBe(true);
    expect(options.find((o) => o.strict)!.count).toBe(2);
  });

  it('refuse un espacement ou une longueur qui n ont pas de sens', () => {
    expect(() => spacingOptions({ length: 910, maxSpacing: 0 })).toThrow(/maxSpacing/);
    expect(() => spacingOptions({ length: 0, maxSpacing: 150 })).toThrow(/longueur/);
  });
});
