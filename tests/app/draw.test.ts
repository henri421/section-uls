import { describe, it, expect } from 'vitest';
import { boundingBox, neutralAxisSegment, outlineOf, barRadius } from '../../app/src/draw';
import { resolveModel } from '../../src/index';
import type { SectionModel } from '../../src/index';
import { FORMAT_VERSION, ENGINE_VERSION, polygonArea } from '../../src/index';

function modeleRectangle(): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    geometry: { kind: 'rectangle', width: 400, height: 600 },
    reinforcement: {
      kind: 'rectangular-layout', cover: 30, stirrupDiameter: 8,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    },
    action: { N: 500, My: 1, Mz: 0 },
  };
}

describe('geometrie du trace', () => {
  it('le contour rendu a la meme aire que la section calculee', () => {
    const { section } = resolveModel(modeleRectangle());
    const contour = outlineOf(section);

    expect(polygonArea(contour)).toBeCloseTo(400 * 600, 6);
  });

  it('les barres du trace tombent aux positions du modele resolu', () => {
    const { section } = resolveModel(modeleRectangle());
    const contour = outlineOf(section);
    const boite = boundingBox(contour);

    expect(boite.yMin).toBeCloseTo(-200, 9);
    expect(boite.yMax).toBeCloseTo(200, 9);
    expect(boite.zMin).toBeCloseTo(-300, 9);
    expect(boite.zMax).toBeCloseTo(300, 9);

    // Le trace dessine exactement `section.rebars` : pas de copie parallele.
    expect(section.rebars.map((r) => r.y)).toEqual([-152, 0, 152]);
  });

  it('axe neutre horizontal : le segment traverse la boite de part en part', () => {
    const boite = { yMin: -200, yMax: 200, zMin: -300, zMax: 300 };
    // angle 0 : zeta = z, donc la droite est z = offset.
    const s = neutralAxisSegment(boite, 0, 100);

    expect(s).not.toBeNull();
    expect(s!.a.z).toBeCloseTo(100, 9);
    expect(s!.b.z).toBeCloseTo(100, 9);
    expect(Math.min(s!.a.y, s!.b.y)).toBeCloseTo(-200, 9);
    expect(Math.max(s!.a.y, s!.b.y)).toBeCloseTo(200, 9);
  });

  it('axe neutre vertical : la droite est y = -offset', () => {
    const boite = { yMin: -200, yMax: 200, zMin: -300, zMax: 300 };
    // angle pi/2 : zeta = -y, donc zeta = offset vaut y = -offset.
    const s = neutralAxisSegment(boite, Math.PI / 2, 50);

    expect(s).not.toBeNull();
    expect(s!.a.y).toBeCloseTo(-50, 9);
    expect(s!.b.y).toBeCloseTo(-50, 9);
    expect(Math.min(s!.a.z, s!.b.z)).toBeCloseTo(-300, 9);
    expect(Math.max(s!.a.z, s!.b.z)).toBeCloseTo(300, 9);
  });

  it('axe neutre diagonal : les deux extremites sont sur la droite', () => {
    const boite = { yMin: -200, yMax: 200, zMin: -300, zMax: 300 };
    const angle = Math.PI / 4;
    const offset = 20;
    const s = neutralAxisSegment(boite, angle, offset);

    expect(s).not.toBeNull();
    const zeta = (p: { y: number; z: number }) =>
      -p.y * Math.sin(angle) + p.z * Math.cos(angle);
    expect(zeta(s!.a)).toBeCloseTo(offset, 6);
    expect(zeta(s!.b)).toBeCloseTo(offset, 6);
  });

  it('une droite qui ne coupe pas la boite ne rend aucun segment', () => {
    const boite = { yMin: -200, yMax: 200, zMin: -300, zMax: 300 };
    expect(neutralAxisSegment(boite, 0, 5000)).toBeNull();
  });

  it('le rayon dessine d une barre decoule de son aire', () => {
    expect(barRadius(Math.PI * 100)).toBeCloseTo(10, 9); // HA20 -> rayon 10
  });
});

import { splitByLine, zetaOf } from '../../app/src/draw';

describe('decoupage du contour par l axe neutre', () => {
  const carre = [
    { y: -200, z: -200 },
    { y: 200, z: -200 },
    { y: 200, z: 200 },
    { y: -200, z: 200 },
  ];

  it('axe horizontal a mi-hauteur : deux moities d aire egale', () => {
    const { compressed, tensioned } = splitByLine(carre, 0, 0);

    expect(polygonArea(compressed)).toBeCloseTo(400 * 200, 6);
    expect(polygonArea(tensioned)).toBeCloseTo(400 * 200, 6);
  });

  it('la compression est du cote des zeta inferieurs, donc en haut a angle nul', () => {
    const { compressed } = splitByLine(carre, 0, 0);
    // angle 0 : zeta = z, donc la zone comprimee est celle des z negatifs.
    expect(Math.max(...compressed.map((p) => p.z))).toBeCloseTo(0, 9);
    expect(Math.min(...compressed.map((p) => p.z))).toBeCloseTo(-200, 9);
  });

  it('les deux parts se conservent : leur somme redonne l aire totale', () => {
    // Un decoupage en diagonale, ou aucune des deux parts n'est triviale.
    const { compressed, tensioned } = splitByLine(carre, Math.PI / 4, 30);
    const total = polygonArea(carre);

    expect(polygonArea(compressed) + polygonArea(tensioned)).toBeCloseTo(total, 6);
    expect(polygonArea(compressed)).toBeGreaterThan(0);
    expect(polygonArea(tensioned)).toBeGreaterThan(0);
  });

  it('une droite hors du contour laisse une part vide et l autre entiere', () => {
    const loin = splitByLine(carre, 0, 5000);
    expect(polygonArea(loin.compressed)).toBeCloseTo(polygonArea(carre), 6);
    expect(loin.tensioned).toHaveLength(0);

    const autreCote = splitByLine(carre, 0, -5000);
    expect(autreCote.compressed).toHaveLength(0);
    expect(polygonArea(autreCote.tensioned)).toBeCloseTo(polygonArea(carre), 6);
  });

  it('zetaOf redonne bien la coordonnee perpendiculaire du solveur', () => {
    expect(zetaOf({ y: 0, z: 100 }, 0)).toBeCloseTo(100, 9);
    expect(zetaOf({ y: 100, z: 0 }, Math.PI / 2)).toBeCloseTo(-100, 9);
  });
});
