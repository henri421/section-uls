import { describe, it, expect } from 'vitest';
import { polygonWidthAtZ } from '../../src/geometry/scanline';

describe('polygonWidthAtZ', () => {
  it('donne une largeur constante pour un rectangle centre sur son centroide', () => {
    // Rectangle 300x500 deja centre (comme produit par polygonSection).
    const vertices = [
      { y: -150, z: -250 },
      { y: 150, z: -250 },
      { y: 150, z: 250 },
      { y: -150, z: 250 },
    ];

    expect(polygonWidthAtZ(vertices, -200)).toBeCloseTo(300, 6);
    expect(polygonWidthAtZ(vertices, 0)).toBeCloseTo(300, 6);
    expect(polygonWidthAtZ(vertices, 200)).toBeCloseTo(300, 6);
  });

  it('donne une largeur variable (triangle, largeur nulle au sommet)', () => {
    // Triangle isocele, base en bas (z=100, largeur 300), sommet en haut (z=-100, y=0).
    const vertices = [
      { y: -150, z: 100 },
      { y: 150, z: 100 },
      { y: 0, z: -100 },
    ];

    // Au sommet exact : largeur nulle.
    expect(polygonWidthAtZ(vertices, -100)).toBeCloseTo(0, 6);
    // A mi-hauteur (z=0, a mi-chemin entre sommet -100 et base 100) : interpolation
    // lineaire de la largeur, de 0 (sommet) a 300 (base) -> largeur = 150.
    expect(polygonWidthAtZ(vertices, 0)).toBeCloseTo(150, 6);
  });
});
