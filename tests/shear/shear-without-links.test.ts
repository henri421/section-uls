import { describe, it, expect } from 'vitest';
import { shearWithoutLinks } from '../../src/shear/shear-without-links';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import type { NormProfile } from '../../src/model/norm-profile';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poutre 300x500, C25/30, un lit tendu a 450 mm de la fibre superieure. */
function poutre(As: number) {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete,
    rebars: [{ area: As, depthFromTop: 450, steel }],
  });
}

describe('shearWithoutLinks — V_Rd,c (§6.2.2)', () => {
  it('retrouve un calcul mene a la main, terme par terme', () => {
    const bw = 300;
    const d = 450;
    const fck = 25;
    const As = 3 * ((Math.PI * 20 ** 2) / 4); // 3 HA20

    // --- Calcul manuel independant, eq. 6.2.a ---
    const CRdc = 0.18 / 1.5; // = 0,12
    const k = 1 + Math.sqrt(200 / d); // = 1 + 2/3
    const rhoL = As / (bw * d);
    const vMin = 0.035 * k ** 1.5 * Math.sqrt(fck);
    const terme = CRdc * k * (100 * rhoL * fck) ** (1 / 3);
    const VRdcMain = (terme * bw * d) / 1000; // N -> kN
    const plancherMain = (vMin * bw * d) / 1000;

    // Valeurs de reference, controlees ici independamment du module.
    expect(CRdc).toBeCloseTo(0.12, 9);
    expect(k).toBeCloseTo(1.6666667, 6);
    expect(rhoL).toBeCloseTo(0.0069813, 7);
    expect(vMin).toBeCloseTo(0.37654, 5);
    expect(VRdcMain).toBeCloseTo(70.036, 3);
    expect(plancherMain).toBeCloseTo(50.833, 3);

    // --- Ce que produit le module ---
    const r = shearWithoutLinks(poutre(As), 0, profile);

    expect(r.CRdc).toBeCloseTo(CRdc, 9);
    expect(r.k).toBeCloseTo(k, 9);
    expect(r.rhoL).toBeCloseTo(rhoL, 12);
    expect(r.vMin).toBeCloseTo(vMin, 9);
    expect(r.sigmaCp).toBeCloseTo(0, 12);
    expect(r.VRdcEquation).toBeCloseTo(VRdcMain, 6);
    expect(r.VRdcMinimum).toBeCloseTo(plancherMain, 6);
    expect(r.minimumGoverns).toBe(false);
    expect(r.VRdc).toBeCloseTo(70.036, 3);
  });

  it('ecrete k a 2,0 quand d ne depasse pas 200 mm', () => {
    // Dalle mince : 1 + sqrt(200/170) = 2,085 > 2,0.
    const dalle = rectangularSection({
      width: 1000,
      height: 200,
      concrete,
      rebars: [{ area: 1000, depthFromTop: 170, steel }],
    });

    const r = shearWithoutLinks(dalle, 0, profile);

    expect(1 + Math.sqrt(200 / 170)).toBeGreaterThan(2);
    expect(r.k).toBeCloseTo(2.0, 9);
  });

  it('ecrete rho_l a 0,02 quand la section est fortement armee', () => {
    // 9 HA20 = 2827 mm² sur 300x450 : rho reel 2,09 %.
    const As = 9 * ((Math.PI * 20 ** 2) / 4);
    const rhoReel = As / (300 * 450);
    expect(rhoReel).toBeGreaterThan(0.02);

    const r = shearWithoutLinks(poutre(As), 0, profile);

    expect(r.rhoL).toBeCloseTo(0.02, 12);

    // Et l'ecretage se voit sur le resultat : une section encore plus armee
    // ne rend rien de plus.
    const encorePlus = shearWithoutLinks(poutre(2 * As), 0, profile);
    expect(encorePlus.VRdc).toBeCloseTo(r.VRdc, 9);
  });

  it('applique le plancher 6.2.b sur une section faiblement armee', () => {
    // 2 HA12 = 226 mm² : rho = 0,168 %, sous le seuil ou 6.2.a passe sous v_min.
    const As = 2 * ((Math.PI * 12 ** 2) / 4);

    const r = shearWithoutLinks(poutre(As), 0, profile);

    expect(r.VRdcEquation).toBeCloseTo(43.524, 3);
    expect(r.VRdcMinimum).toBeCloseTo(50.833, 3);
    expect(r.minimumGoverns).toBe(true);
    expect(r.VRdc).toBeCloseTo(50.833, 3);
  });

  it('augmente la resistance sous effort normal de compression', () => {
    const As = 3 * ((Math.PI * 20 ** 2) / 4);
    const sans = shearWithoutLinks(poutre(As), 0, profile);
    const avec = shearWithoutLinks(poutre(As), 300, profile); // 300 kN de compression

    // sigma_cp = 300 000 N / 150 000 mm² = 2 MPa
    expect(avec.sigmaCp).toBeCloseTo(2.0, 9);
    expect(avec.VRdc).toBeGreaterThan(sans.VRdc);
    // Gain = k1 * sigma_cp * bw * d = 0,15 * 2 * 135 000 / 1000
    expect(avec.VRdc - sans.VRdc).toBeCloseTo((0.15 * 2 * 300 * 450) / 1000, 6);
  });

  it('annule sigma_cp en traction plutot que de la rendre negative', () => {
    const As = 3 * ((Math.PI * 20 ** 2) / 4);
    const sans = shearWithoutLinks(poutre(As), 0, profile);
    const traction = shearWithoutLinks(poutre(As), -300, profile);

    expect(traction.sigmaCp).toBeCloseTo(0, 12);
    expect(traction.VRdc).toBeCloseTo(sans.VRdc, 9);
  });

  it('plafonne sigma_cp a 0,2 f_cd', () => {
    const As = 3 * ((Math.PI * 20 ** 2) / 4);
    const fcd = 25 / 1.5;

    const r = shearWithoutLinks(poutre(As), 2000, profile); // 13,3 MPa bruts

    expect(r.sigmaCp).toBeCloseTo(0.2 * fcd, 9);
  });

  it('tire C_Rd,c du gamma_c du profil normatif, pas d une constante', () => {
    const As = 3 * ((Math.PI * 20 ** 2) / 4);
    const autre: NormProfile = { ...profile, name: 'accidentel', gammaC: 1.2 };

    const r = shearWithoutLinks(poutre(As), 0, autre);

    expect(r.CRdc).toBeCloseTo(0.18 / 1.2, 12);
  });

  it('laisse parametrer C_Rd,c, k1 et v_min', () => {
    const As = 3 * ((Math.PI * 20 ** 2) / 4);
    const r = shearWithoutLinks(poutre(As), 0, profile, { CRdc: 0.15, k1: 0.1, vMin: 0.5 });

    expect(r.CRdc).toBeCloseTo(0.15, 12);
    expect(r.k1).toBeCloseTo(0.1, 12);
    expect(r.vMin).toBeCloseTo(0.5, 12);
  });

  it('refuse une geometrie non rectangulaire', () => {
    const As = 3 * ((Math.PI * 20 ** 2) / 4);
    const section = poutre(As);
    const polygonale = { ...section, geometry: { kind: 'polygon' as const, vertices: [] } };

    expect(() => shearWithoutLinks(polygonale, 0, profile)).toThrow(/rectangulaire/i);
  });
});
