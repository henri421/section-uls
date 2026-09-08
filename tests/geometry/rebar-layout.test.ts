import { describe, it, expect } from 'vitest';
import { rebarRow, formatRow, rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const steel = createSteel(500, 200000, ec2Recommended());

describe('rebarRow', () => {
  it('mode count : n barres reparties uniformement, extremites incluses', () => {
    const row = rebarRow({
      from: { y: -150, z: 200 },
      to: { y: 150, z: 200 },
      bars: { count: 4, diameter: 20 },
      steel,
    });

    expect(row.bars).toHaveLength(4);
    expect(row.bars.map((b) => b.y)).toEqual([-150, -50, 50, 150]);
    expect(row.bars.every((b) => b.z === 200)).toBe(true);

    const aireUneBarre = (Math.PI * 20 ** 2) / 4; // 314.159 mm²
    expect(row.bars[0].area).toBeCloseTo(aireUneBarre, 9);
    expect(row.summary).toEqual({
      count: 4,
      diameter: 20,
      spacing: 100,
      totalArea: 4 * aireUneBarre,
    });
  });

  it('mode count : une barre unique est placee au milieu du segment', () => {
    const row = rebarRow({
      from: { y: -150, z: 0 },
      to: { y: 150, z: 0 },
      bars: { count: 1, diameter: 12 },
      steel,
    });

    expect(row.bars).toHaveLength(1);
    expect(row.bars[0].y).toBeCloseTo(0, 9);
    expect(row.summary.spacing).toBe(0);
  });

  it('mode maxSpacing : l espacement demande est un MAXIMUM, jamais depasse', () => {
    // 400 mm utiles, "Ø12 tous les 150" -> ceil(400/150) = 3 intervalles,
    // donc 4 barres a 133.3 mm reels. Jamais 3 barres a 150 avec un
    // intervalle residuel de 100 en bout.
    const row = rebarRow({
      from: { y: -200, z: 0 },
      to: { y: 200, z: 0 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
    });

    expect(row.bars).toHaveLength(4);
    expect(row.summary.spacing).toBeCloseTo(400 / 3, 9);
    expect(row.summary.spacing).toBeLessThanOrEqual(150);
    expect(row.bars[0].y).toBeCloseTo(-200, 9);
    expect(row.bars[3].y).toBeCloseTo(200, 9);
  });

  it('endpoints exclude : seules les barres intermediaires sont posees', () => {
    // Lit lateral d'un poteau : les barres d'angle appartiennent deja aux
    // lits inferieur et superieur, il ne faut pas les compter deux fois.
    const row = rebarRow({
      from: { y: -100, z: -200 },
      to: { y: -100, z: 200 },
      bars: { count: 3, diameter: 16 },
      steel,
      endpoints: 'exclude',
    });

    expect(row.bars).toHaveLength(3);
    expect(row.bars.map((b) => b.z)).toEqual([-100, 0, 100]);
    expect(row.bars.every((b) => b.y === -100)).toBe(true);
  });

  it('endpoints exclude en mode maxSpacing : ceil(L/s) - 1 barres intermediaires', () => {
    const row = rebarRow({
      from: { y: 0, z: -200 },
      to: { y: 0, z: 200 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
      endpoints: 'exclude',
    });

    // ceil(400/150) = 3 intervalles -> 2 barres intermediaires a 133.3 mm
    expect(row.bars).toHaveLength(2);
    expect(row.summary.spacing).toBeCloseTo(400 / 3, 9);
  });

  it('un lit vide est licite et ne renvoie aucune barre', () => {
    const row = rebarRow({
      from: { y: 0, z: 0 },
      to: { y: 0, z: 100 },
      bars: { count: 0, diameter: 12 },
      steel,
    });

    expect(row.bars).toHaveLength(0);
    expect(row.summary.totalArea).toBe(0);
  });

  it('rejette un nombre de barres negatif et un espacement non positif', () => {
    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { count: -1, diameter: 12 }, steel })
    ).toThrow();

    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { diameter: 12, maxSpacing: 0 }, steel })
    ).toThrow();
  });

  it('rejette un nombre de barres non entier', () => {
    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { count: 2.5, diameter: 12 }, steel })
    ).toThrow();
  });

  it('mode maxSpacing avec L = 0 : une barre unique en include, aucune en exclude', () => {
    // Segment degenere (from === to) : cas limite d'un lit reduit a un point
    // (ex. armature isolee saisie via la primitive de segment).
    const rowInclude = rebarRow({
      from: { y: 50, z: 50 },
      to: { y: 50, z: 50 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
    });

    expect(rowInclude.bars).toHaveLength(1);
    expect(rowInclude.bars[0].y).toBeCloseTo(50, 9);
    expect(rowInclude.bars[0].z).toBeCloseTo(50, 9);
    expect(rowInclude.summary.spacing).toBe(0);

    const rowExclude = rebarRow({
      from: { y: 50, z: 50 },
      to: { y: 50, z: 50 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
      endpoints: 'exclude',
    });

    expect(rowExclude.bars).toHaveLength(0);
  });
});

describe('rectangularRebarLayout', () => {
  it('positionne les barres selon enrobage + etrier + demi-diametre', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    });

    const a = 30 + 8 + 10; // 48 mm d'axe
    expect(layout.bars).toHaveLength(3);
    expect(layout.bars.every((b) => b.z === 600 / 2 - a)).toBe(true); // 252, z vers le bas
    expect(layout.bars.map((b) => b.y)).toEqual([-(200 - a), 0, 200 - a]); // -152, 0, 152
  });

  it('face top : le lit est place du cote de la fibre superieure (z negatif)', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'top', bars: { count: 2, diameter: 20 } }],
    });

    expect(layout.bars.every((b) => b.z === -(600 / 2 - 48))).toBe(true); // -252
  });

  it('les lits lateraux ne redoublent pas les barres d angle : 4+4+2+2 donne 12 barres', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 4, diameter: 20 } },
        { face: 'top', bars: { count: 4, diameter: 20 } },
        { face: 'left', bars: { count: 2, diameter: 20 } },
        { face: 'right', bars: { count: 2, diameter: 20 } },
      ],
    });

    expect(layout.bars).toHaveLength(12);

    // Aucune position dupliquee (le controle qui attrape le double comptage).
    const cles = new Set(layout.bars.map((b) => `${b.y.toFixed(6)}:${b.z.toFixed(6)}`));
    expect(cles.size).toBe(12);

    // Les lits lateraux sont bien a l'interieur, jamais sur les coins.
    const zAngles = [600 / 2 - 48, -(600 / 2 - 48)];
    const lateraux = layout.bars.filter((b) => Math.abs(Math.abs(b.y) - (200 - 48)) < 1e-9);
    expect(lateraux).toHaveLength(4 + 4); // 4 barres d'angle des lits bas/haut + 4 laterales
    expect(lateraux.filter((b) => !zAngles.some((z) => Math.abs(b.z - z) < 1e-9))).toHaveLength(4);
  });

  it('un recapitulatif est rendu par lit, dans l ordre de saisie', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { diameter: 12, maxSpacing: 150 } },
      ],
    });

    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0].count).toBe(3);
    expect(layout.rows[0].diameter).toBe(20);
    expect(layout.rows[1].diameter).toBe(12);

    // REGLE DU PAS, comptee sur l'ETENDUE de la face : 400/150 = 2,67, donc
    // 3 barres et jamais 4. L'espacement REEL qui en resulte, mesure entre
    // les axes extremes sur 400 − 2·36 = 328, vaut 164 mm — au-dela du pas
    // demande, et c'est la consequence assumee de la regle.
    expect(layout.rows[1].count).toBe(3);
    expect(layout.rows[1].spacing).toBeCloseTo(328 / 2, 6);
  });

  /**
   * LE CAS QUI A FAIT CHANGER LA REGLE. « Ø14 tous les 150 » sur une bande
   * de dalle d'un metre : 1000/150 = 6,67, donc 7 barres au plus.
   *
   * L'ancienne formule comptait `ceil((b − 2a)/s)` intervalles puis ajoutait
   * une barre pour les extremites, et rendait 8 — soit 20 % d'acier de trop
   * dans une section dont le moment resistant s'en trouvait surestime.
   */
  it('« Ø14 tous les 150 » sur 1000 de large donne 7 barres, jamais 8', () => {
    const layout = rectangularRebarLayout({
      width: 1000,
      height: 250,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'bottom', bars: { diameter: 14, maxSpacing: 150 } }],
    });

    expect(layout.rows[0].count).toBe(7);
    expect(layout.bars).toHaveLength(7);

    // Plafond de la regle : jamais plus que ceil(1000/150).
    expect(layout.rows[0].count).toBeLessThanOrEqual(Math.ceil(1000 / 150));

    // Longueur de pose 1000 − 2·45 = 910, sur 6 intervalles : 151,7 mm.
    expect(layout.rows[0].spacing).toBeCloseTo(910 / 6, 6);
  });

  it('un lit lateral compte son pas sur la HAUTEUR, extremites retranchees', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 1000,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'left', bars: { diameter: 12, maxSpacing: 200 } }],
    });

    // 1000/200 = 5 barres au pas sur la face, dont DEUX sont les barres
    // d'angle deja posees par les lits inferieur et superieur : ce lit n'en
    // pose que 3. La face en porte bien 5 au total, le plafond de la regle.
    expect(layout.rows[0].count).toBe(3);
  });

  it('stirrupDiameter est optionnel et vaut 0 par defaut', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      steel,
      rows: [{ face: 'bottom', bars: { count: 2, diameter: 20 } }],
    });

    expect(layout.bars[0].z).toBeCloseTo(300 - (30 + 10), 9); // 260
  });
});

describe('formatRow', () => {
  it('lit a plusieurs barres : format avec espacement', () => {
    const text = formatRow({ count: 4, diameter: 12, spacing: 133.4, totalArea: 452.4 });
    expect(text).toBe('4 HA12 @ 133 mm = 452 mm²');
  });

  it('lit a moins de deux barres : format sans espacement', () => {
    const text = formatRow({ count: 1, diameter: 12, spacing: 0, totalArea: 113.1 });
    expect(text).toBe('1 HA12 = 113 mm²');
  });
});
