import { describe, it, expect } from 'vitest';
import {
  barArea,
  barDiameterOf,
  isInsideOutline,
  checkBarPlacement,
  skinBars,
} from '../../src/geometry/bar-placement';
import { rectangleToPolygon } from '../../src/geometry/rectangle';

/** Rectangle 300 × 500, centre sur son centroide. */
const RECTANGLE = rectangleToPolygon({ kind: 'rectangle', width: 300, height: 500 }).vertices;

/** Section en T : table 600 × 150 en haut, ame 200 sur 350 en dessous. */
const SECTION_EN_T = [
  { y: -300, z: -250 },
  { y: 300, z: -250 },
  { y: 300, z: -100 },
  { y: 100, z: -100 },
  { y: 100, z: 250 },
  { y: -100, z: 250 },
  { y: -100, z: -100 },
  { y: -300, z: -100 },
];

describe('barArea et barDiameterOf', () => {
  it('sont exactement inverses l une de l autre', () => {
    for (const diametre of [8, 10, 12, 14, 16, 20, 25, 32, 40]) {
      expect(barDiameterOf(barArea(diametre))).toBeCloseTo(diametre, 12);
    }
  });

  it('un HA20 fait bien 314 mm²', () => {
    expect(barArea(20)).toBeCloseTo(314.159, 3);
  });
});

describe('isInsideOutline', () => {
  it('accepte un point interieur et refuse un point exterieur', () => {
    expect(isInsideOutline(RECTANGLE, { y: 0, z: 0 })).toBe(true);
    expect(isInsideOutline(RECTANGLE, { y: 100, z: 200 })).toBe(true);
    expect(isInsideOutline(RECTANGLE, { y: 200, z: 0 })).toBe(false);
    expect(isInsideOutline(RECTANGLE, { y: 0, z: 400 })).toBe(false);
  });

  it('accepte un point exactement sur le bord', () => {
    expect(isInsideOutline(RECTANGLE, { y: 150, z: 0 })).toBe(true);
    expect(isInsideOutline(RECTANGLE, { y: -150, z: 250 })).toBe(true);
  });

  /**
   * Le test passe par les intervalles pleins a la cote `z` : il vaut donc sur
   * un contour quelconque, et pas seulement sur un rectangle. Dans l ame
   * d une section en T, un point qui serait dans la table est dehors.
   */
  it('suit la forme reelle du contour, ame d une section en T comprise', () => {
    // Dans la table, en haut, largeur 600.
    expect(isInsideOutline(SECTION_EN_T, { y: 250, z: -200 })).toBe(true);
    // A la meme abscisse mais dans l ame, largeur 200 : dehors.
    expect(isInsideOutline(SECTION_EN_T, { y: 250, z: 100 })).toBe(false);
    expect(isInsideOutline(SECTION_EN_T, { y: 50, z: 100 })).toBe(true);
  });
});

describe('checkBarPlacement', () => {
  it('ne signale rien sur une disposition saine', () => {
    const defauts = checkBarPlacement(RECTANGLE, [
      { y: -105, z: 205, diameter: 20 },
      { y: 0, z: 205, diameter: 20 },
      { y: 105, z: 205, diameter: 20 },
    ]);

    expect(defauts).toEqual([]);
  });

  it('signale une barre hors du contour en la nommant par son rang', () => {
    const defauts = checkBarPlacement(RECTANGLE, [
      { y: 0, z: 205, diameter: 20 },
      { y: 0, z: 2000, diameter: 20 },
    ]);

    expect(defauts).toHaveLength(1);
    expect(defauts[0].kind).toBe('outside');
    expect(defauts[0].bars).toEqual([1]);
    expect(defauts[0].message).toMatch(/Barre 2/);
    expect(defauts[0].message).toMatch(/hors du contour/);
  });

  it('signale un chevauchement, avec les deux barres et les deux distances', () => {
    // Axes a 15 mm, contact a (20 + 20)/2 = 20 mm : elles se chevauchent.
    const defauts = checkBarPlacement(RECTANGLE, [
      { y: 0, z: 205, diameter: 20 },
      { y: 15, z: 205, diameter: 20 },
    ]);

    expect(defauts).toHaveLength(1);
    expect(defauts[0].kind).toBe('overlap');
    expect(defauts[0].bars).toEqual([0, 1]);
    expect(defauts[0].message).toMatch(/15 mm/);
    expect(defauts[0].message).toMatch(/20 mm/);
  });

  it('deux barres exactement tangentes ne se chevauchent pas', () => {
    const defauts = checkBarPlacement(RECTANGLE, [
      { y: 0, z: 205, diameter: 20 },
      { y: 20, z: 205, diameter: 20 },
    ]);

    expect(defauts).toEqual([]);
  });

  /** Corriger une barre a la fois serait une facon lente de lire ce qu on sait. */
  it('rend TOUS les defauts, pas seulement le premier', () => {
    const defauts = checkBarPlacement(RECTANGLE, [
      { y: 0, z: 205, diameter: 20 },
      { y: 5, z: 205, diameter: 20 },
      { y: 0, z: 9000, diameter: 20 },
    ]);

    expect(defauts.filter((d) => d.kind === 'overlap')).toHaveLength(1);
    expect(defauts.filter((d) => d.kind === 'outside')).toHaveLength(1);
  });

  it('le chevauchement tient compte des diametres, pas d une distance fixe', () => {
    const grosses = checkBarPlacement(RECTANGLE, [
      { y: 0, z: 0, diameter: 32 },
      { y: 25, z: 0, diameter: 32 },
    ]);
    const fines = checkBarPlacement(RECTANGLE, [
      { y: 0, z: 0, diameter: 8 },
      { y: 25, z: 0, diameter: 8 },
    ]);

    expect(grosses).toHaveLength(1); // contact a 32 mm
    expect(fines).toEqual([]); // contact a 8 mm
  });
});

describe('skinBars', () => {
  it('pose des paires symetriques entre les deux cotes', () => {
    const barres = skinBars({
      width: 300,
      axisDistance: 45,
      zFrom: -100,
      zTo: 100,
      countPerFace: 3,
      diameter: 12,
    });

    expect(barres).toHaveLength(6);
    expect(barres.map((b) => b.y)).toEqual([-105, 105, -105, 105, -105, 105]);
    expect(barres.map((b) => b.z)).toEqual([-100, -100, 0, 0, 100, 100]);
    expect(barres.every((b) => b.diameter === 12)).toBe(true);
  });

  it('une barre par face se place au milieu de l intervalle', () => {
    const barres = skinBars({
      width: 400,
      axisDistance: 50,
      zFrom: -200,
      zTo: 200,
      countPerFace: 1,
      diameter: 10,
    });

    expect(barres).toHaveLength(2);
    expect(barres.map((b) => b.z)).toEqual([0, 0]);
    expect(barres.map((b) => b.y)).toEqual([-150, 150]);
  });

  it('les barres posees sont bien dans la section', () => {
    const barres = skinBars({
      width: 300,
      axisDistance: 45,
      zFrom: -150,
      zTo: 150,
      countPerFace: 4,
      diameter: 12,
    });

    expect(checkBarPlacement(RECTANGLE, barres)).toEqual([]);
  });

  it('refuse un nombre ou un diametre qui n ont pas de sens', () => {
    const base = { width: 300, axisDistance: 45, zFrom: -100, zTo: 100, diameter: 12 };
    expect(() => skinBars({ ...base, countPerFace: 0 })).toThrow(/nombre de barres/);
    expect(() => skinBars({ ...base, countPerFace: 2.5 })).toThrow(/nombre de barres/);
    expect(() => skinBars({ ...base, countPerFace: 3, diameter: 0 })).toThrow(/diametre/);
  });
});
