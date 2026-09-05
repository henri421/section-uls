import { describe, it, expect } from 'vitest';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import {
  webReinforcementRatio,
  minimumWebRatio,
  checkWebReinforcement,
} from '../../src/detailing/transverse';

const profil = ec2Recommended();
const acier = createSteel(500, 200000, profil);

function poutre(fck: number) {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: createConcrete(fck, profil),
    rebars: [{ depthFromTop: 450, area: 1000, steel: acier }],
  });
}

/** Aire de deux brins d'un cadre de diametre `phi`. */
function cadre(phi: number): number {
  return 2 * ((Math.PI * phi ** 2) / 4);
}

describe('taux d armature d ame (eq. 9.4)', () => {
  it('vaut Asw / (s·bw·sin alpha) pour des cadres droits', () => {
    // HA8 a deux brins tous les 200 mm dans une ame de 300 mm :
    // Asw = 100,53096 mm² ; rho_w = 100,53096 / (200 · 300) = 1,675516e-3
    expect(webReinforcementRatio({ asw: cadre(8), s: 200, fywk: 500 }, 300)).toBeCloseTo(
      1.675516e-3,
      9
    );
  });

  it("fait bien intervenir sin(alpha) : des cadres a 45° donnent un taux multiplie par racine de 2", () => {
    const droit = webReinforcementRatio({ asw: cadre(8), s: 200, fywk: 500 }, 300);
    const incline = webReinforcementRatio(
      { asw: cadre(8), s: 200, fywk: 500, alpha: 45 },
      300
    );
    expect(incline).toBeCloseTo(droit * Math.SQRT2, 12);
  });
});

describe('taux minimal d armature d ame (eq. 9.5N)', () => {
  it('vaut 0,08·racine(fck)/fyk sur un C25/30 arme en B500', () => {
    // 0,08 · 5 / 500 = 8,0e-4
    expect(minimumWebRatio(25, 500)).toBeCloseTo(8.0e-4, 12);
  });

  it('croit comme la racine de fck : le C50/60 donne 1,131371e-3', () => {
    // 0,08 · 7,0710678118654755 / 500 = 1,1313708498984762e-3
    expect(minimumWebRatio(50, 500)).toBeCloseTo(1.1313708498984762e-3, 12);
    expect(minimumWebRatio(50, 500) / minimumWebRatio(25, 500)).toBeCloseTo(Math.SQRT2, 12);
  });

  it("se refere a la limite elastique des CADRES, pas des armatures longitudinales", () => {
    expect(minimumWebRatio(25, 400)).toBeCloseTo(0.08 * 5 / 400, 12);
  });
});

describe('verdict d armature d ame (§9.2.2(5))', () => {
  it('conclut a la conformite au-dessus du minimum', () => {
    const r = checkWebReinforcement(poutre(25), { asw: cadre(8), s: 200, fywk: 500 });
    expect(r.rhoW).toBeCloseTo(1.675516e-3, 9);
    expect(r.rhoWMin).toBeCloseTo(8.0e-4, 12);
    expect(r.ok).toBe(true);
    expect(r.missingArea).toBe(0);
  });

  it("signale un ferraillage insuffisant et chiffre l'aire manquante par cours", () => {
    // HA6 a deux brins tous les 400 mm : Asw = 56,548668 mm²
    // rho_w = 56,548668 / (400 · 300) = 4,712389e-4 < 8,0e-4
    // Asw,min = 8,0e-4 · 400 · 300 = 96 mm² ; manque 39,451332 mm²
    const r = checkWebReinforcement(poutre(25), { asw: cadre(6), s: 400, fywk: 500 });
    expect(r.rhoW).toBeCloseTo(4.712389e-4, 9);
    expect(r.aswMin).toBeCloseTo(96, 9);
    expect(r.missingArea).toBeCloseTo(39.451332, 6);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/9\.2\.2/);
  });

  it("declare non conforme une poutre depourvue de tout cadre", () => {
    const r = checkWebReinforcement(poutre(25), undefined);
    expect(r.rhoW).toBe(0);
    expect(r.ok).toBe(false);
    // Sans espacement, l'aire manquante par cours n'a pas de valeur : ne rien
    // rendre plutot qu'un nombre invente.
    expect(r.aswMin).toBeNull();
    expect(r.missingArea).toBeNull();
    expect(r.reason).toMatch(/aucune armature d ame/);
  });

  it("accepte une largeur d ame imposee plutot que celle du rectangle", () => {
    const r = checkWebReinforcement(poutre(25), { asw: cadre(8), s: 200, fywk: 500 }, { bw: 600 });
    expect(r.rhoW).toBeCloseTo(cadre(8) / (200 * 600), 12);
  });

  it('refuse une geometrie non rectangulaire sans largeur d ame imposee', () => {
    const triangle = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 300, z: 0 },
        { y: 0, z: 600 },
      ],
      concrete: createConcrete(25, profil),
      rebars: [{ y: 100, z: 400, area: 1000, steel: acier }],
    });
    expect(() =>
      checkWebReinforcement(triangle, { asw: cadre(8), s: 200, fywk: 500 })
    ).toThrow(/non rectangulaire/);
  });
});
