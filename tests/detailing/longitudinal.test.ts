import { describe, it, expect } from 'vitest';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import {
  minimumLongitudinalArea,
  maximumLongitudinalArea,
  providedLongitudinalArea,
  checkLongitudinal,
} from '../../src/detailing/longitudinal';

const profil = ec2Recommended();
const acier = createSteel(500, 200000, profil);

/** Poutre 300x500, un lit tendu a 450 mm de la fibre superieure. */
function poutre(fck: number, aireAcier: number) {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: createConcrete(fck, profil),
    rebars: [{ depthFromTop: 450, area: aireAcier, steel: acier }],
  });
}

describe('armature longitudinale minimale — poutre (§9.2.1.1)', () => {
  it("retient le terme 0,26·fctm/fyk·bt·d quand il gouverne (C25/30, fyk 500)", () => {
    // fctm = 0,30·25^(2/3) = 2,564964 MPa
    // 0,26 · 2,564964 / 500 = 1,3337812e-3 > 1,3e-3 : le terme principal gouverne
    // As,min = 1,3337812e-3 · 300 · 450 = 180,060 mm²
    const section = poutre(25, 1000);
    expect(minimumLongitudinalArea(section, 'beam')).toBeCloseTo(180.0605, 3);
  });

  it("retient le plancher 0,0013·bt·d quand le terme principal lui est inferieur (C20/25)", () => {
    // fctm = 0,30·20^(2/3) = 2,210419 MPa
    // 0,26 · 2,210419 / 500 = 1,1494178e-3 < 1,3e-3 : c'est le PLANCHER qui gouverne
    // As,min = 0,0013 · 300 · 450 = 175,5 mm²
    const section = poutre(20, 1000);
    expect(minimumLongitudinalArea(section, 'beam')).toBeCloseTo(175.5, 9);
  });

  it('accepte une hauteur utile imposee plutot que celle deduite des armatures', () => {
    const section = poutre(20, 1000);
    // 0,0013 · 300 · 400 = 156 mm²
    expect(minimumLongitudinalArea(section, 'beam', { d: 400 })).toBeCloseTo(156, 9);
  });

  it("deduit d du centre de gravite des armatures tendues, pas de la barre la plus eloignee", () => {
    // Deux lits tendus : 440 et 460 mm de la fibre superieure, aires egales.
    // Le centre de gravite est a 450 mm, alors que la barre la plus eloignee
    // est a 460 mm — les deux conventions ne donnent pas le meme d.
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete: createConcrete(20, profil),
      rebars: [
        { depthFromTop: 440, area: 500, steel: acier },
        { depthFromTop: 460, area: 500, steel: acier },
      ],
    });
    expect(minimumLongitudinalArea(section, 'beam')).toBeCloseTo(0.0013 * 300 * 450, 9);
  });
});

describe('armature longitudinale minimale — dalle (§9.3.1.1)', () => {
  it('applique le meme minimum que la poutre', () => {
    const dalle = rectangularSection({
      width: 1000,
      height: 200,
      concrete: createConcrete(25, profil),
      rebars: [{ depthFromTop: 170, area: 800, steel: acier }],
    });
    // 1,3337812e-3 · 1000 · 170 = 226,7428 mm²
    expect(minimumLongitudinalArea(dalle, 'slab')).toBeCloseTo(226.7428, 3);
    expect(minimumLongitudinalArea(dalle, 'slab')).toBeCloseTo(
      minimumLongitudinalArea(dalle, 'beam'),
      9
    );
  });
});

describe('armature longitudinale minimale — poteau (§9.5.2)', () => {
  it("retient 0,10·N_Ed/fyd quand l'effort normal gouverne", () => {
    const section = poutre(25, 2000);
    // 0,10 · 2000 kN / (500/1,15) = 0,1 · 2 000 000 N · 1,15 / 500 = 460 mm²
    // plancher : 0,002 · 150 000 = 300 mm² < 460
    expect(minimumLongitudinalArea(section, 'column', { NEd: 2000 })).toBeCloseTo(460, 9);
  });

  it("retient le plancher 0,002·Ac quand l'effort normal est faible", () => {
    const section = poutre(25, 2000);
    // 0,10 · 500 kN / (500/1,15) = 115 mm² < 0,002 · 150 000 = 300 mm²
    expect(minimumLongitudinalArea(section, 'column', { NEd: 500 })).toBeCloseTo(300, 9);
  });

  it("refuse de calculer un minimum de poteau sans effort normal : c'est une entree", () => {
    const section = poutre(25, 2000);
    expect(() => minimumLongitudinalArea(section, 'column')).toThrow(/N_Ed/);
  });
});

describe('armature longitudinale maximale (0,04·Ac)', () => {
  it("vaut 0,04·Ac pour les trois types d'element", () => {
    const section = poutre(25, 2000);
    for (const type of ['beam', 'slab', 'column'] as const) {
      expect(maximumLongitudinalArea(section, type)).toBeCloseTo(6000, 9);
    }
  });

  it("se fonde sur l'aire REELLE de la section, pas sur un rectangle circonscrit", () => {
    // Triangle 300 x 600 : aire = 90 000 mm², donc 0,04·Ac = 3 600 mm².
    const triangle = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 300, z: 0 },
        { y: 0, z: 600 },
      ],
      concrete: createConcrete(25, profil),
      rebars: [{ y: 100, z: 400, area: 1000, steel: acier }],
    });
    expect(maximumLongitudinalArea(triangle, 'column')).toBeCloseTo(3600, 6);
  });
});

describe('verdict longitudinal', () => {
  it('conclut a la conformite quand As est entre le minimum et le maximum', () => {
    const section = poutre(25, 1000);
    const r = checkLongitudinal(section, 'beam');
    expect(r.asProvided).toBeCloseTo(1000, 9);
    expect(r.asMin).toBeCloseTo(180.0605, 3);
    expect(r.asMax).toBeCloseTo(6000, 9);
    expect(r.underReinforced).toBe(false);
    expect(r.overReinforced).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('signale une section sous-armee', () => {
    const r = checkLongitudinal(poutre(25, 100), 'beam');
    expect(r.underReinforced).toBe(true);
    expect(r.overReinforced).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('signale une section dont l armature reelle depasse le maximum', () => {
    const r = checkLongitudinal(poutre(25, 8000), 'beam');
    expect(r.overReinforced).toBe(true);
    expect(r.underReinforced).toBe(false);
    expect(r.ok).toBe(false);
  });

  it("somme l'aire reelle de tous les lits, tendus comme comprimes", () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete: createConcrete(25, profil),
      rebars: [
        { depthFromTop: 450, area: 600, steel: acier },
        { depthFromTop: 50, area: 400, steel: acier },
      ],
    });
    expect(providedLongitudinalArea(section)).toBeCloseTo(1000, 9);
  });
});

describe('domaine de validite', () => {
  it('refuse une geometrie non rectangulaire pour le minimum, plutot que d inventer bt', () => {
    const triangle = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 300, z: 0 },
        { y: 0, z: 600 },
      ],
      concrete: createConcrete(25, profil),
      rebars: [{ y: 100, z: 400, area: 1000, steel: acier }],
    });
    expect(() => minimumLongitudinalArea(triangle, 'beam')).toThrow(/non rectangulaire/);
  });

  it('refuse une poutre sans armature ni hauteur utile imposee', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete: createConcrete(25, profil),
      rebars: [],
    });
    expect(() => minimumLongitudinalArea(section, 'beam', { steel: acier })).toThrow(
      /hauteur utile/
    );
  });

  it("prend l'acier de reference en option quand la section n'en porte aucun", () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete: createConcrete(20, profil),
      rebars: [],
    });
    expect(minimumLongitudinalArea(section, 'beam', { d: 450, steel: acier })).toBeCloseTo(
      175.5,
      9
    );
  });
});
