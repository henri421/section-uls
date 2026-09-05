import { describe, it, expect } from 'vitest';
import { verifyShear } from '../../src/shear/verify-shear';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poutre 300x500, C25/30, 3 HA20 en face inferieure : V_Rd,c = 70,04 kN. */
function poutre() {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete,
    rebars: [{ area: 3 * ((Math.PI * 20 ** 2) / 4), depthFromTop: 450, steel }],
  });
}

/** Cadres HA8 a deux brins tous les 200 mm : V_Rd,s = 221,3, V_Rd,max = 377,1 kN. */
const cadres = { Asw: 2 * ((Math.PI * 8 ** 2) / 4), s: 200, fywk: 500 };

describe('verifyShear — verdict d effort tranchant', () => {
  it('conclut sans cadres quand V_Ed ne depasse pas V_Rd,c', () => {
    const r = verifyShear(poutre(), { V_Ed: 50, N_Ed: 0 }, profile);

    expect(r.VRdc).toBeCloseTo(70.036, 3);
    expect(r.ok).toBe(true);
    expect(r.shearReinforcementRequired).toBe(false);
    expect(r.VRd).toBeCloseTo(70.036, 3);
    expect(r.utilization).toBeCloseTo(50 / 70.036, 4);
    expect(r.failureMode).toBeNull();
    expect(r.reason).toBeUndefined();
    expect(r.VRds).toBeNull();
    expect(r.VRdmax).toBeNull();
  });

  it('sans cadres et V_Ed > V_Rd,c : le motif est « armatures necessaires », pas « section trop petite »', () => {
    const r = verifyShear(poutre(), { V_Ed: 100, N_Ed: 0 }, profile);

    expect(r.ok).toBe(false);
    expect(r.shearReinforcementRequired).toBe(true);
    expect(r.failureMode).toBe('armatures-necessaires');
    expect(r.reason).toMatch(/armatures d ame/i);
    expect(r.reason).not.toMatch(/trop petite/i);
  });

  it('conclut favorablement avec des cadres suffisants', () => {
    const r = verifyShear(poutre(), { V_Ed: 200, N_Ed: 0 }, profile, { links: cadres });

    expect(r.shearReinforcementRequired).toBe(true);
    expect(r.VRds).toBeCloseTo(221.277, 3);
    expect(r.VRdmax).toBeCloseTo(377.069, 3);
    expect(r.VRd).toBeCloseTo(221.277, 3);
    expect(r.ok).toBe(true);
    expect(r.failureMode).toBeNull();
  });

  it('distingue « cadres insuffisants » de « bielles ecrasees »', () => {
    // 300 kN : au-dela de V_Rd,s (221) mais en deca de V_Rd,max (377).
    const manqueDeCadres = verifyShear(poutre(), { V_Ed: 300, N_Ed: 0 }, profile, {
      links: cadres,
    });

    expect(manqueDeCadres.ok).toBe(false);
    expect(manqueDeCadres.failureMode).toBe('cadres-insuffisants');
    expect(manqueDeCadres.reason).toMatch(/cadres/i);

    // 400 kN : au-dela de V_Rd,max. Aucun cadre supplementaire n'y changera rien.
    const sectionTropPetite = verifyShear(poutre(), { V_Ed: 400, N_Ed: 0 }, profile, {
      links: cadres,
    });

    expect(sectionTropPetite.ok).toBe(false);
    expect(sectionTropPetite.failureMode).toBe('bielles-ecrasees');
    expect(sectionTropPetite.reason).not.toBe(manqueDeCadres.reason);
    expect(sectionTropPetite.reason).toMatch(/bielle|section/i);
  });

  it('des cadres tres serres ne sauvent pas une section trop petite', () => {
    const serres = { Asw: 2 * ((Math.PI * 12 ** 2) / 4), s: 75, fywk: 500 };
    const r = verifyShear(poutre(), { V_Ed: 400, N_Ed: 0 }, profile, { links: serres });

    expect(r.VRds).toBeGreaterThan(400);
    expect(r.ok).toBe(false);
    expect(r.failureMode).toBe('bielles-ecrasees');
  });

  it('transmet l effort normal a V_Rd,c', () => {
    const sans = verifyShear(poutre(), { V_Ed: 50, N_Ed: 0 }, profile);
    const comprime = verifyShear(poutre(), { V_Ed: 50, N_Ed: 300 }, profile);

    expect(comprime.VRdc).toBeGreaterThan(sans.VRdc);
  });

  it('transmet cot theta au calcul des bielles', () => {
    const a = verifyShear(poutre(), { V_Ed: 200, N_Ed: 0 }, profile, {
      links: cadres,
      cotTheta: 1,
    });

    expect(a.VRdmax).toBeCloseTo(546.75, 2);
    expect(a.VRds).toBeCloseTo(88.511, 3);
    expect(a.failureMode).toBe('cadres-insuffisants');
  });

  it('refuse un cot theta hors du domaine', () => {
    expect(() =>
      verifyShear(poutre(), { V_Ed: 200, N_Ed: 0 }, profile, { links: cadres, cotTheta: 3 })
    ).toThrow(/cot/i);
  });

  it('refuse une geometrie non rectangulaire', () => {
    const polygonale = { ...poutre(), geometry: { kind: 'polygon' as const, vertices: [] } };

    expect(() => verifyShear(polygonale, { V_Ed: 50, N_Ed: 0 }, profile)).toThrow(/rectangulaire/i);
  });

  it('raisonne sur la valeur absolue de l effort tranchant', () => {
    const positif = verifyShear(poutre(), { V_Ed: 100, N_Ed: 0 }, profile);
    const negatif = verifyShear(poutre(), { V_Ed: -100, N_Ed: 0 }, profile);

    expect(negatif.utilization).toBeCloseTo(positif.utilization, 12);
    expect(negatif.ok).toBe(positif.ok);
  });
});
