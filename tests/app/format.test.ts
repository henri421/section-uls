import { describe, it, expect } from 'vitest';
import { formatUtilization, formatNumber, formatAngleDegrees } from '../../app/src/format';

describe('mise en forme', () => {
  it('arrondit les grandeurs a une precision lisible', () => {
    expect(formatNumber(1234.5678, 1)).toBe('1234,6');
    expect(formatNumber(0.5, 2)).toBe('0,50');
    expect(formatNumber(-12.345, 2)).toBe('-12,35');
  });

  it('rend les angles en degres', () => {
    expect(formatAngleDegrees(Math.PI / 4)).toBe('45,0');
    expect(formatAngleDegrees(0)).toBe('0,0');
  });

  it("n'affiche JAMAIS un taux arrondi qui contredit le verdict", () => {
    // Le piege : 0,999 arrondi a deux decimales donne « 1,00 », affiche a
    // cote d'un verdict favorable — et 1,001 donne « 1,00 » a cote d'un
    // verdict defavorable. Dans les deux cas le lecteur croit lire la
    // limite exacte. L'arrondi ne doit jamais franchir 1.
    expect(formatUtilization(0.999)).toBe('0,99');
    expect(formatUtilization(1.001)).toBe('1,01');
    expect(formatUtilization(0.9999)).toBe('0,99');
    expect(formatUtilization(1.0001)).toBe('1,01');
  });

  it('affiche exactement 1,00 quand le taux vaut exactement 1', () => {
    expect(formatUtilization(1)).toBe('1,00');
  });

  it('rend un taux infini de facon explicite, jamais « Infinity »', () => {
    expect(formatUtilization(Infinity)).toBe('hors domaine');
  });
});
