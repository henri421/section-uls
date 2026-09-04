import { describe, it, expect } from 'vitest';
import { dataBounds, includeOrigin, niceTicks, padBounds } from '../../app/src/plot';
import type { PlotPoint } from '../../app/src/plot';

/**
 * Verifie qu'un pas est de la forme 1, 2 ou 5 fois une puissance de dix,
 * c'est-a-dire un pas qu'un lecteur suit sans effort.
 */
function mantisseDuPas(pas: number): number {
  const puissance = 10 ** Math.floor(Math.log10(pas));
  return pas / puissance;
}

function estPasLisible(pas: number): boolean {
  const mantisse = mantisseDuPas(pas);
  return [1, 2, 5, 10].some((m) => Math.abs(mantisse - m) < 1e-9);
}

function pasDe(ticks: number[]): number {
  return ticks[1] - ticks[0];
}

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

describe('graduations lisibles', () => {
  it('gradue [0, 100] par pas de 20 ou 25, en ordre croissant et dans la plage', () => {
    const ticks = niceTicks(0, 100, 5);

    expect(ticks.length).toBeGreaterThan(1);
    const pas = pasDe(ticks);
    expect([20, 25]).toContain(pas);

    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(100);
    }
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it('inclut exactement la graduation zero sur une plage franchissant zero', () => {
    const ticks = niceTicks(-30, 70, 5);

    // L'axe passe par zero : cette graduation ne doit jamais manquer, et pas
    // davantage etre remplacee par un 1e-16 qui s'afficherait « 0,0 » par
    // chance.
    expect(ticks).toContain(0);
  });

  it('rend un pas de la forme 1/2/5 x 10^k sur une plage minuscule', () => {
    const ticks = niceTicks(0, 0.003, 5);

    expect(ticks.length).toBeGreaterThan(1);
    expect(estPasLisible(pasDe(ticks))).toBe(true);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(0.003);
    }
  });

  it('rend un pas de la forme 1/2/5 x 10^k sur une plage enorme', () => {
    const ticks = niceTicks(0, 4e6, 5);

    expect(ticks.length).toBeGreaterThan(1);
    expect(estPasLisible(pasDe(ticks))).toBe(true);
    for (const t of ticks) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(4e6);
    }
  });

  it('ne boucle pas indefiniment sur une plage d etendue nulle', () => {
    const ticks = niceTicks(42, 42, 5);

    expect(ticks.length).toBeLessThanOrEqual(1);
  });

  it('borne le nombre de graduations meme si la cible est absurde', () => {
    expect(niceTicks(0, 1, 0).length).toBeLessThan(100);
    expect(niceTicks(0, 1, -3).length).toBeLessThan(100);
  });
});
