import { describe, it, expect } from 'vitest';
import { effectiveTensionArea, equivalentBarDiameter, barDiameterOf } from '../../src/service/effective-area';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poutre(hauteur = 500) {
  return rectangularSection({
    width: 300, height: hauteur, concrete,
    rebars: rectangularRebarLayout({
      width: 300, height: hauteur, cover: 30, stirrupDiameter: 8, steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    }).bars,
  });
}

describe('aire effective de beton tendu', () => {
  it('le diametre se deduit exactement de l aire d une barre unique', () => {
    expect(barDiameterOf(Math.PI * 100)).toBeCloseTo(20, 9);
    expect(barDiameterOf(Math.PI * 64)).toBeCloseTo(16, 9);
  });

  it('le diametre equivalent pondere par le carre des diametres', () => {
    // Eq. 7.12 : phi_eq = somme(n*phi²) / somme(n*phi)
    // Deux HA20 et deux HA12 : (2*400 + 2*144)/(2*20 + 2*12) = 1088/64 = 17
    const aires = [
      Math.PI * 100, Math.PI * 100,
      Math.PI * 36, Math.PI * 36,
    ];
    expect(equivalentBarDiameter(aires)).toBeCloseTo(17, 6);
  });

  it('retient le minimum des trois hauteurs effectives — cas (h-x)/3', () => {
    // h = 500, d = 452, x = 164,585 : min(2,5*48 = 120 ; 111,805 ; 250)
    const r = effectiveTensionArea(poutre(), 164.585);
    expect(r.hcEff).toBeCloseTo(111.805, 2);
    expect(r.acEff).toBeCloseTo(300 * 111.805, 0);
  });

  it('retient le minimum des trois hauteurs effectives — cas 2,5(h-d)', () => {
    // Axe neutre tres haut : (h-x)/3 devient grand, c'est 2,5(h-d) qui gouverne.
    const r = effectiveTensionArea(poutre(), 20);
    expect(r.hcEff).toBeCloseTo(2.5 * 48, 6);
  });

  it('le terme h/2 ne peut JAMAIS gouverner des que l axe neutre est dans la section', () => {
    // Propriete algebrique, pas un choix d'implementation :
    //   (h-x)/3 < h/2  <=>  2(h-x) < 3h  <=>  -2x < h  <=>  x > -h/2
    // toujours vrai pour x >= 0. Le terme h/2 de l'eq. du §7.3.2(3) est donc
    // une borne de completude, structurellement dominee par (h-x)/3 en
    // flexion. Ce test le CONSTATE au lieu de pretendre le declencher — une
    // version anterieure du plan attendait qu'il gouverne, ce qui etait
    // mathematiquement impossible.
    for (const x of [0, 10, 100, 400]) {
      const r = effectiveTensionArea(poutre(), x);
      expect(r.hcEff).toBeLessThan(500 / 2);
      expect(r.hcEff).toBeCloseTo(Math.min(2.5 * 48, (500 - x) / 3), 6);
    }
  });

  it('SEULES les armatures situees dans la bande effective sont comptees', () => {
    // Une barre haute, hors de la bande effective, ne doit pas entrer dans
    // A_s,eff — c'est l'erreur naturelle de cette formule.
    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: rectangularRebarLayout({
        width: 300, height: 500, cover: 30, stirrupDiameter: 8, steel,
        rows: [
          { face: 'bottom', bars: { count: 3, diameter: 20 } },
          { face: 'top', bars: { count: 2, diameter: 20 } },
        ],
      }).bars,
    });

    const r = effectiveTensionArea(section, 164.585);
    // Seules les 3 barres basses comptent.
    expect(r.asEff).toBeCloseTo(3 * Math.PI * 100, 3);
    expect(r.bars).toHaveLength(3);
  });

  it('refuse une geometrie non rectangulaire, sans l approximer', () => {
    // Les formules du §7.3.2(3) supposent une zone tendue rectangulaire.
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const polygonale = { ...section, geometry: { kind: 'polygon' as const, vertices: [
      { y: -150, z: -250 }, { y: 150, z: -250 }, { y: 0, z: 250 },
    ] } };

    expect(() => effectiveTensionArea(polygonale, 100)).toThrow(/rectangulaire/i);
  });
});
