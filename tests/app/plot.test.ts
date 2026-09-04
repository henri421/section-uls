import { describe, it, expect } from 'vitest';
import { dataBounds, includeOrigin, padBounds } from '../../app/src/plot';
import type { PlotPoint } from '../../app/src/plot';

describe('cadrage d un nuage de points', () => {
  it('rend les bornes exactes d un nuage ordinaire', () => {
    const nuage: PlotPoint[] = [
      { x: -2, y: 10 },
      { x: 5, y: -3 },
      { x: 1, y: 7 },
    ];

    expect(dataBounds(nuage)).toEqual({ xMin: -2, xMax: 5, yMin: -3, yMax: 10 });
  });

  it('rend null sur un tableau vide, sans inventer de bornes', () => {
    expect(dataBounds([])).toBeNull();
  });

  it('ouvre un intervalle non degenere autour d un point unique', () => {
    const bornes = dataBounds([{ x: 3, y: -4 }]);
    expect(bornes).not.toBeNull();

    const elargi = padBounds(bornes as NonNullable<typeof bornes>, 0.05);

    // Etendue non nulle : sans cela, la transformation vers l'ecran
    // diviserait par zero.
    expect(elargi.xMax - elargi.xMin).toBeGreaterThan(0);
    expect(elargi.yMax - elargi.yMin).toBeGreaterThan(0);

    // Et centree sur le point : le point unique reste au milieu du cadre.
    expect((elargi.xMin + elargi.xMax) / 2).toBeCloseTo(3, 12);
    expect((elargi.yMin + elargi.yMax) / 2).toBeCloseTo(-4, 12);
  });

  it('elargit proportionnellement une etendue non nulle', () => {
    const elargi = padBounds({ xMin: 0, xMax: 100, yMin: -50, yMax: 50 }, 0.1);

    expect(elargi.xMin).toBeCloseTo(-10, 12);
    expect(elargi.xMax).toBeCloseTo(110, 12);
    expect(elargi.yMin).toBeCloseTo(-60, 12);
    expect(elargi.yMax).toBeCloseTo(60, 12);
  });

  it('etend vers zero un nuage entierement negatif sans deplacer l autre borne', () => {
    const etendu = includeOrigin({ xMin: -30, xMax: -10, yMin: -8, yMax: -2 });

    expect(etendu).toEqual({ xMin: -30, xMax: 0, yMin: -8, yMax: 0 });
  });

  it('etend vers zero un nuage entierement positif sans deplacer l autre borne', () => {
    const etendu = includeOrigin({ xMin: 10, xMax: 30, yMin: 2, yMax: 8 });

    expect(etendu).toEqual({ xMin: 0, xMax: 30, yMin: 0, yMax: 8 });
  });

  it('ne change rien a des bornes contenant deja l origine', () => {
    const bornes = { xMin: -5, xMax: 5, yMin: -1, yMax: 9 };

    expect(includeOrigin(bornes)).toEqual(bornes);
  });
});
