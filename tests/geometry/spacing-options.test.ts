import { describe, it, expect } from 'vitest';
import {
  spacingOptions,
  barsAtPitch,
  faceSegment,
  rectangularRebarLayout,
} from '../../src/geometry/rebar-layout';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const steel = createSteel(500, 200000, ec2Recommended());

describe('faceSegment', () => {
  it('distingue la longueur de POSE et l ETENDUE de la face', () => {
    // b = 1000, enrobage 30, etrier 8, HA14 -> a = 30 + 8 + 7 = 45.
    const segment = faceSegment({
      width: 1000,
      height: 500,
      cover: 30,
      stirrupDiameter: 8,
      diameter: 14,
      face: 'bottom',
    });

    // La pose va d'axe a axe...
    expect(segment.length).toBeCloseTo(910, 9);
    // ...mais le pas se compte sur la largeur entiere. L'ecart, c'est 2a, et
    // le confondre coutait une barre de trop.
    expect(segment.extent).toBe(1000);
    expect(segment.from).toEqual({ y: -455, z: 205 });
    expect(segment.endpoints).toBe('include');
  });

  it('un lit lateral compte son pas sur la HAUTEUR', () => {
    const segment = faceSegment({
      width: 400,
      height: 800,
      cover: 30,
      stirrupDiameter: 8,
      diameter: 12,
      face: 'left',
    });

    expect(segment.extent).toBe(800);
    expect(segment.length).toBeCloseTo(800 - 2 * 44, 9);
    expect(segment.endpoints).toBe('exclude');
  });
});

describe('barsAtPitch', () => {
  /**
   * LA REGLE, dans le cas qui l'a fait ecrire : « Ø14 tous les 150 » sur
   * 1000 de large fait 1000/150 = 6,67 barres, donc 7 au plus. Jamais 8.
   */
  it('ne depasse jamais ceil(etendue / pas)', () => {
    expect(barsAtPitch(1000, 150)).toBe(7);
    expect(barsAtPitch(1000, 150)).toBeLessThanOrEqual(Math.ceil(1000 / 150));
  });

  it('retient le nombre le PLUS PROCHE, qui represente le mieux l acier reel', () => {
    expect(barsAtPitch(900, 150)).toBe(6); // 6,0 exactement
    expect(barsAtPitch(920, 150)).toBe(6); // 6,13 -> 6
    expect(barsAtPitch(1000, 150)).toBe(7); // 6,67 -> 7
  });

  it('une face porte toujours au moins une barre', () => {
    // Le pas depasse le double de l'etendue : `round` tomberait a zero, et un
    // lit demande ne doit pas disparaitre en silence.
    expect(barsAtPitch(100, 300)).toBe(1);
  });

  /**
   * En mode `exclude`, DEUX barres de la face sont les barres d'angle, deja
   * posees par les lits inferieur et superieur. En retrancher une seule
   * ferait franchir le plafond a la face entiere.
   */
  it('en mode exclude, retranche les deux barres d angle', () => {
    expect(barsAtPitch(1000, 200, 'exclude')).toBe(3); // 5 au total sur la face
    expect(barsAtPitch(1000, 200, 'exclude') + 2).toBe(barsAtPitch(1000, 200));
  });

  it('ne descend jamais sous zero en mode exclude', () => {
    expect(barsAtPitch(100, 300, 'exclude')).toBe(0);
  });

  it('refuse un pas qui n a pas de sens', () => {
    expect(() => barsAtPitch(1000, 0)).toThrow(/pas invalide/);
  });
});

describe('spacingOptions', () => {
  /** Les parametres de la face qui a motive toute l affaire. */
  const FACE_DE_DALLE = { extent: 1000, length: 910, maxSpacing: 150 };

  it('propose le plancher et le plafond de la regle, et rien au-dela', () => {
    const options = spacingOptions(FACE_DE_DALLE);

    // floor(6,67) = 6 et ceil(6,67) = 7. Le 8 d'autrefois a disparu : c est
    // le nombre meme que la regle ecarte.
    expect(options.map((o) => o.count)).toEqual([6, 7]);
    expect(options.every((o) => o.count <= Math.ceil(1000 / 150))).toBe(true);
  });

  it('affiche l espacement REEL, mesure sur la longueur de pose', () => {
    const options = spacingOptions(FACE_DE_DALLE);
    const par = (count: number) => options.find((o) => o.count === count)!;

    expect(par(6).spacing).toBeCloseTo(910 / 5, 6); // 182 mm
    expect(par(7).spacing).toBeCloseTo(910 / 6, 6); // 151,7 mm
  });

  /**
   * CONSEQUENCE ASSUMEE de la regle : le nombre retenu peut donner un
   * espacement reel legerement superieur au pas demande, la pose se faisant
   * sur `b − 2a` et non sur `b`. C est un arbitrage d ingenieur, il
   * s affiche, et le nombre voisin reste a un clic.
   */
  it('le nombre retenu peut depasser le pas de quelques millimetres', () => {
    const retenu = spacingOptions(FACE_DE_DALLE).find((o) => o.strict)!;

    expect(retenu.count).toBe(7);
    expect(retenu.spacing).toBeGreaterThan(150);
    expect(retenu.ok).toBe(false);
  });

  it('un seul nombre porte la marque strict', () => {
    expect(spacingOptions(FACE_DE_DALLE).filter((o) => o.strict)).toHaveLength(1);
  });

  /**
   * COHERENCE AVEC LA POSE, la propriete qui compte : le nombre marque
   * `strict` doit etre exactement celui que `rectangularRebarLayout` pose.
   * L'app proposerait sinon un ferraillage different de celui qu'elle
   * dessine.
   */
  it('le nombre marque est celui qui est reellement pose', () => {
    const cas = [
      { width: 1000, maxSpacing: 150, diameter: 14 },
      { width: 400, maxSpacing: 150, diameter: 12 },
      { width: 1200, maxSpacing: 200, diameter: 16 },
      { width: 305, maxSpacing: 100, diameter: 10 },
    ];

    for (const { width, maxSpacing, diameter } of cas) {
      const segment = faceSegment({
        width,
        height: 500,
        cover: 30,
        stirrupDiameter: 8,
        diameter,
        face: 'bottom',
      });

      const marque = spacingOptions({
        extent: segment.extent,
        length: segment.length,
        maxSpacing,
        endpoints: segment.endpoints,
      }).find((o) => o.strict)!;

      const pose = rectangularRebarLayout({
        width,
        height: 500,
        cover: 30,
        stirrupDiameter: 8,
        steel,
        rows: [{ face: 'bottom', bars: { diameter, maxSpacing } }],
      });

      expect(marque.count).toBe(pose.rows[0].count);
      expect(marque.spacing).toBeCloseTo(pose.rows[0].spacing, 9);
    }
  });

  it('un pas qui tombe juste ne propose qu un nombre', () => {
    // 900/150 = 6 exactement : plancher et plafond se confondent.
    const options = spacingOptions({ extent: 900, length: 810, maxSpacing: 150 });

    expect(options.map((o) => o.count)).toEqual([6]);
    expect(options[0].strict).toBe(true);
  });

  it('refuse une etendue, une longueur ou un pas qui n ont pas de sens', () => {
    expect(() => spacingOptions({ extent: 1000, length: 910, maxSpacing: 0 })).toThrow(
      /maxSpacing/
    );
    expect(() => spacingOptions({ extent: 1000, length: 0, maxSpacing: 150 })).toThrow(/longueur/);
    expect(() => spacingOptions({ extent: 0, length: 910, maxSpacing: 150 })).toThrow(/etendue/);
  });
});
