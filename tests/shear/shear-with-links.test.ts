import { describe, it, expect } from 'vitest';
import { shearWithLinks } from '../../src/shear/shear-with-links';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poutre 300x500, C25/30, un lit tendu a 450 mm de la fibre superieure. */
function poutre() {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete,
    rebars: [{ area: 3 * ((Math.PI * 20 ** 2) / 4), depthFromTop: 450, steel }],
  });
}

/** Cadres HA8 a deux brins, tous les 200 mm. */
const cadres = { Asw: 2 * ((Math.PI * 8 ** 2) / 4), s: 200, fywk: 500 };

describe('shearWithLinks — treillis a inclinaison variable (§6.2.3)', () => {
  it('retrouve un calcul mene a la main, eq. 6.8 et 6.9', () => {
    const bw = 300;
    const d = 450;
    const fck = 25;
    const Asw = 2 * ((Math.PI * 8 ** 2) / 4);
    const s = 200;
    const cot = 2.5;

    // --- Calcul manuel independant ---
    const fywd = 500 / 1.15;
    const z = 0.9 * d;
    const nu1 = 0.6 * (1 - fck / 250);
    const fcd = 25 / 1.5;
    const alphaCw = 1;

    const VRdsMain = ((Asw / s) * z * fywd * cot) / 1000;
    const VRdmaxMain = (alphaCw * bw * z * nu1 * fcd) / (cot + 1 / cot) / 1000;

    expect(Asw).toBeCloseTo(100.531, 3);
    expect(z).toBeCloseTo(405, 9);
    expect(nu1).toBeCloseTo(0.54, 9);
    expect(fywd).toBeCloseTo(434.783, 3);
    expect(VRdsMain).toBeCloseTo(221.277, 3);
    expect(VRdmaxMain).toBeCloseTo(377.069, 3);

    // --- Ce que produit le module ---
    const r = shearWithLinks(poutre(), cadres, profile);

    expect(r.cotTheta).toBeCloseTo(2.5, 12);
    expect(r.z).toBeCloseTo(z, 9);
    expect(r.nu1).toBeCloseTo(nu1, 12);
    expect(r.fywd).toBeCloseTo(fywd, 9);
    expect(r.VRds).toBeCloseTo(VRdsMain, 6);
    expect(r.VRdmax).toBeCloseTo(VRdmaxMain, 6);
  });

  it('retient le MINIMUM des deux resistances', () => {
    const r = shearWithLinks(poutre(), cadres, profile);

    expect(r.VRd).toBeCloseTo(Math.min(r.VRds, r.VRdmax), 12);
    expect(r.VRd).toBeCloseTo(r.VRds, 12);
    expect(r.strutsGovern).toBe(false);
  });

  it('signale que les bielles gouvernent quand V_Rd,max est le plus faible', () => {
    // Cadres tres serres : les armatures ne sont plus le maillon faible.
    const serres = { Asw: 2 * ((Math.PI * 12 ** 2) / 4), s: 75, fywk: 500 };

    const r = shearWithLinks(poutre(), serres, profile);

    expect(r.VRds).toBeGreaterThan(r.VRdmax);
    expect(r.VRd).toBeCloseTo(r.VRdmax, 12);
    expect(r.strutsGovern).toBe(true);
  });

  it('montre l arbitrage : V_Rd,max est maximal a cot theta = 1, V_Rd,s y est minimal', () => {
    const a = shearWithLinks(poutre(), cadres, profile, { cotTheta: 1 });
    const b = shearWithLinks(poutre(), cadres, profile, { cotTheta: 1.75 });
    const c = shearWithLinks(poutre(), cadres, profile, { cotTheta: 2.5 });

    // V_Rd,max decroit de cot theta = 1 vers 2,5 : c'est en 1 qu'il est maximal.
    expect(a.VRdmax).toBeGreaterThan(b.VRdmax);
    expect(b.VRdmax).toBeGreaterThan(c.VRdmax);
    expect(a.VRdmax).toBeCloseTo(546.75, 2);

    // V_Rd,s croit dans le meme sens : plus cot theta est grand, moins il
    // faut de cadres pour un meme effort.
    expect(a.VRds).toBeLessThan(b.VRds);
    expect(b.VRds).toBeLessThan(c.VRds);
    expect(a.VRds).toBeCloseTo(88.511, 3);
  });

  it('cot theta vaut 2,5 par defaut', () => {
    const defaut = shearWithLinks(poutre(), cadres, profile);
    const explicite = shearWithLinks(poutre(), cadres, profile, { cotTheta: 2.5 });

    expect(defaut.cotTheta).toBeCloseTo(2.5, 12);
    expect(defaut.VRds).toBeCloseTo(explicite.VRds, 12);
  });

  it('accepte les bornes 1 et 2,5 mais REFUSE hors du domaine', () => {
    expect(() => shearWithLinks(poutre(), cadres, profile, { cotTheta: 1 })).not.toThrow();
    expect(() => shearWithLinks(poutre(), cadres, profile, { cotTheta: 2.5 })).not.toThrow();

    // Refus explicite, pas d'ecretage silencieux.
    expect(() => shearWithLinks(poutre(), cadres, profile, { cotTheta: 0.9 })).toThrow(/cot/i);
    expect(() => shearWithLinks(poutre(), cadres, profile, { cotTheta: 3 })).toThrow(/cot/i);
  });

  it('refuse un espacement ou une aire de cadres non positifs', () => {
    expect(() => shearWithLinks(poutre(), { ...cadres, s: 0 }, profile)).toThrow(/espacement/i);
    expect(() => shearWithLinks(poutre(), { ...cadres, Asw: 0 }, profile)).toThrow(/A_sw|aire/i);
  });

  it('refuse une geometrie non rectangulaire', () => {
    const polygonale = { ...poutre(), geometry: { kind: 'polygon' as const, vertices: [] } };

    expect(() => shearWithLinks(polygonale, cadres, profile)).toThrow(/rectangulaire/i);
  });
});
