import { describe, it, expect } from 'vitest';
import { polygonWidthAtZ, polygonSpansAtZ } from '../../src/geometry/scanline';

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

describe('polygonSpansAtZ - spans multiples (polygone non convexe avec trou)', () => {
  // Forme en U (deux jambes verticales reliees par une base), pour verifier
  // le cas a spans multiples (un vrai trou entre les deux jambes).
  //
  // Jambe gauche : y in [-500,-300], z in [300,500).
  // Jambe droite : y in [ 300, 500], z in [300,500).
  // Base pleine largeur : y in [-500,500], z in [500,700).
  // Trou (aucune matiere) : y in (-300,300), z in [300,500).
  const vertices = [
    { y: -500, z: 300 },
    { y: -300, z: 300 },
    { y: -300, z: 500 },
    { y: 300, z: 500 },
    { y: 300, z: 300 },
    { y: 500, z: 300 },
    { y: 500, z: 700 },
    { y: -500, z: 700 },
  ];

  // Trace independant (a la main, arete par arete) a z=400, un echantillon
  // franchement interieur aux jambes (loin de tout sommet) :
  //   - arete (-300,300)->(-300,500) : verticale y=-300, z in [300,500) -> croise a y=-300
  //   - arete (300,500)->(300,300)   : verticale y=300,  z in [300,500) -> croise a y=300
  //   - arete (500,300)->(500,700)   : verticale y=500,  z in [300,700) -> croise a y=500
  //   - arete (-500,700)->(-500,300) : verticale y=-500, z in [300,700) -> croise a y=-500
  //   (les 4 aretes horizontales, a z=300,500,700, ne contribuent jamais)
  // Croisements tries : [-500, -300, 300, 500] -> deux spans apparies :
  //   [-500,-300] (jambe gauche, largeur 200) et [300,500] (jambe droite, largeur 200).
  it('donne exactement deux spans (les deux jambes) a z=400, strictement entre les jambes et la base', () => {
    const spans = polygonSpansAtZ(vertices, 400);

    expect(spans).toHaveLength(2);
    expect(spans[0].yStart).toBeCloseTo(-500, 6);
    expect(spans[0].yEnd).toBeCloseTo(-300, 6);
    expect(spans[1].yStart).toBeCloseTo(300, 6);
    expect(spans[1].yEnd).toBeCloseTo(500, 6);

    // La largeur totale (somme des deux jambes) doit aussi etre correcte.
    expect(polygonWidthAtZ(vertices, 400)).toBeCloseTo(400, 6);
  });

  it('donne aussi exactement deux spans a z=300, exactement a la jonction bas des jambes', () => {
    // A z=300 (borne basse demi-ouverte des aretes verticales des jambes ET
    // des aretes verticales exterieures, toutes deux avec zMin=300), les
    // quatre aretes verticales sont actives simultanement (meme trace qu'a
    // z=400) : croisements [-500,-300,300,500] -> memes deux spans.
    const spans = polygonSpansAtZ(vertices, 300);

    expect(spans).toHaveLength(2);
    expect(spans[0]).toEqual({ yStart: -500, yEnd: -300 });
    expect(spans[1]).toEqual({ yStart: 300, yEnd: 500 });
  });

  it('donne exactement un seul span pleine largeur a travers la base pleine (z=600)', () => {
    // A z=600, seules les deux aretes verticales exterieures (y=-500 et
    // y=500, z in [300,700)) sont actives ; les aretes verticales des
    // jambes (zMax=500) ne le sont plus (600 >= 500). Un seul span,
    // pleine largeur de la base : [-500, 500].
    const spans = polygonSpansAtZ(vertices, 600);

    expect(spans).toHaveLength(1);
    expect(spans[0].yStart).toBeCloseTo(-500, 6);
    expect(spans[0].yEnd).toBeCloseTo(500, 6);
    expect(polygonWidthAtZ(vertices, 600)).toBeCloseTo(1000, 6);
  });
});

describe('polygonWidthAtZ - touche de sommet : cas "pic" vs cas "vallee"', () => {
  // Losange : sommet "pic" en haut (z=-100, les deux aretes voisines
  // descendent vers z=0), sommet "vallee" en bas (z=100, les deux aretes
  // voisines remontent depuis z=0) - structurellement different du
  // triangle ci-dessus, qui ne couvre que le cas "vallee" (apex avec les
  // deux voisins a z superieur).
  const vertices = [
    { y: 0, z: -100 },
    { y: 100, z: 0 },
    { y: 0, z: 100 },
    { y: -100, z: 0 },
  ];

  it('largeur nulle au sommet "pic" (z=-100, les deux aretes voisines sont EN DESSOUS)', () => {
    // Trace : a z=-100, les aretes (0,-100)->(100,0) et (-100,0)->(0,-100)
    // sont actives (zMin=-100 inclus, zMax=0 exclu) et s'interpolent
    // toutes deux exactement a y=0 -> deux croisements confondus [0,0] ->
    // un span degenere {yStart:0, yEnd:0} -> largeur 0.
    expect(polygonWidthAtZ(vertices, -100)).toBeCloseTo(0, 6);
  });

  it('largeur nulle au sommet "vallee" (z=100, les deux aretes voisines sont AU-DESSUS)', () => {
    // Trace : a z=100, les aretes (100,0)->(0,100) et (0,100)->(-100,0)
    // ont toutes deux zMax=100, exclu par la convention demi-ouverte
    // -> aucun croisement -> aucun span -> largeur 0. Cas structurellement
    // proche de l'apex du triangle ci-dessus, inclus ici pour completude
    // sur cette forme precise (losange).
    expect(polygonWidthAtZ(vertices, 100)).toBeCloseTo(0, 6);
  });
});
