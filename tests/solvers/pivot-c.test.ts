import { describe, it, expect } from 'vitest';
import { interactionCurveNM, interactionDiagramNM } from '../../src/domains/interaction';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import { sectionStateAt } from '../../src/solvers/section-state';
import { capacityAtAngle, verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { ultimateStrainField, verifyUniaxial } from '../../src/solvers/uls-uniaxial';

const profile = ec2Recommended();
const steel = createSteel(500, 200000, profile);

/** Poteau 300 x 300, 4 HA20, axes des barres a 50 mm des faces. */
function poteau(fck = 30, top = 2, bottom = 2, diametre = 20) {
  const concrete = createConcrete(fck, profile);
  const rangs = [
    { face: 'top' as const, bars: { count: top, diameter: diametre } },
    ...(bottom > 0 ? [{ face: 'bottom' as const, bars: { count: bottom, diameter: 20 } }] : []),
  ];
  return rectangularSection({
    width: 300, height: 300, concrete,
    rebars: rectangularRebarLayout({
      width: 300, height: 300, cover: 30, stirrupDiameter: 10, steel, rows: rangs,
    }).bars,
  });
}

describe('ultimateStrainField — figure 6.1 de l EN 1992-1-1', () => {
  for (const fck of [30, 70]) {
    const c = createConcrete(fck, profile);
    const h = 300;
    const zC = (1 - c.epsC2 / c.epsCu2) * h; // cote du point C, 6.1(5)

    it(`fck ${fck} : pivot B jusqu a x = h, fibre extreme a epsCu2`, () => {
      const champ = ultimateStrainField(0, h, 200, c);
      expect(champ(0)).toBeCloseTo(c.epsCu2, 12);
      expect(champ(200)).toBeCloseTo(0, 12);
    });

    it(`fck ${fck} : continu en x = h`, () => {
      const avant = ultimateStrainField(0, h, h, c);
      const apres = ultimateStrainField(0, h, h * (1 + 1e-9), c);
      for (const z of [0, zC, h]) expect(apres(z)).toBeCloseTo(avant(z), 9);
      expect(avant(h)).toBeCloseTo(0, 12);
    });

    it(`fck ${fck} : au-dela de h, tout tourne autour de C, a epsC2`, () => {
      for (const x of [1.01 * h, 2 * h, 50 * h]) {
        const champ = ultimateStrainField(0, h, x, c);
        expect(champ(zC)).toBeCloseTo(c.epsC2, 12);
        expect(champ(x)).toBeCloseTo(0, 12);
        expect(champ(0)).toBeLessThanOrEqual(c.epsCu2);
      }
    });

    it(`fck ${fck} : x infini donne la deformation uniforme epsC2`, () => {
      const champ = ultimateStrainField(0, h, Infinity, c);
      for (const z of [0, zC, h]) expect(champ(z)).toBe(c.epsC2);
    });
  }
});

describe('Pivot C — poteau 300 x 300, C30, 4 HA20, calcul a la main', () => {
  it('compression pure : N = fcd*Ac + (sigma_s(epsC2) - fcd)*As, sans plafonner a fyd', () => {
    // epsC2 = 2,0 pour mille < epsYd = 2,17 pour mille : l acier n est PAS
    // plastifie, sigma_s = 200000 * 0,002 = 400 MPa et non 434,8.
    const As = 4 * (Math.PI * 20 ** 2) / 4; // 1256,64 mm²
    const main = (20 * 90000 + (400 - 20) * As) / 1000; // 2277,5 kN
    expect(main).toBeCloseTo(2277.52, 1);

    const courbe = interactionCurveNM(poteau(), profile, { steps: 80 });
    const sommet = courbe[courbe.length - 1];
    expect(sommet.neutralAxisDepth).toBe(Infinity);
    expect(sommet.N).toBeCloseTo(main, 1);
    expect(sommet.M).toBeCloseTo(0, 6);
  });

  it('x = 2h : effort et moment du calcul a la main', () => {
    // dC = 3/7 h = 128,571 ; x - dC = 471,429
    // Beton : palier sur dC, parabole au-dela, t = (z - dC) / 471,429 de 0 a 0,36364
    //   F = 6000 * (128,571 + 171,429 - 471,429 * t^3 / 3) = 1754,66 kN
    //   M = 66,122 - 61,265 = 4,857 kN·m
    // Barre haute z = 50  : eps = 2,333 pour mille -> fyd = 434,78, beton deplace 20
    // Barre basse z = 250 : eps = 1,485 pour mille -> 296,97,      beton deplace 18,673
    //   F = 628,32 * (414,78 + 278,30) = 435,47 kN
    //   M = 628,32 * (414,78 - 278,30) * 100 = 8,576 kN·m
    const N_main = 2190.13;
    const M_main = 13.433;

    const r = verifyUniaxial(poteau(), { N: N_main, M: 0 }, profile);
    expect(r.converged).toBe(true);
    expect(Math.abs(r.neutralAxisDepth - 600)).toBeLessThan(6);
    expect(Math.abs(r.M_Rd - M_main) / M_main).toBeLessThan(0.01);
  });

  it('au-dessus de la compression pure, le solveur refuse', () => {
    expect(verifyUniaxial(poteau(), { N: 2277, M: 0 }, profile).converged).toBe(true);
    expect(verifyUniaxial(poteau(), { N: 2279, M: 0 }, profile).converged).toBe(false);
  });

  it('effort et moment sont continus au passage de x = h', () => {
    const courbe = interactionCurveNM(poteau(), profile, { steps: 4000 });
    const proches = courbe.filter((p) => p.neutralAxisDepth > 280 && p.neutralAxisDepth < 320);
    expect(proches.length).toBeGreaterThan(2);
    for (let i = 1; i < proches.length; i++) {
      expect(Math.abs(proches[i].N - proches[i - 1].N)).toBeLessThan(10);
      expect(Math.abs(proches[i].M - proches[i - 1].M)).toBeLessThan(1);
    }
  });
});

describe('Pivot C — fck > 50, epsC2 et epsCu2 varient', () => {
  it('C70 : compression pure a fyd, car epsC2 = 2,42 pour mille depasse epsYd', () => {
    const c = createConcrete(70, profile);
    expect(c.epsC2).toBeCloseTo(2.416e-3, 5);
    expect(c.epsCu2).toBeCloseTo(2.656e-3, 5);
    const As = 4 * (Math.PI * 20 ** 2) / 4;
    const main = (c.fcd * 90000 + (steel.fyd - c.fcd) * As) / 1000;
    const courbe = interactionCurveNM(poteau(70), profile, { steps: 40 });
    expect(courbe[courbe.length - 1].N).toBeCloseTo(main, 1);
  });
});

describe('Pivot C — N_R(x) n est plus monotone sur une section tres dissymetrique', () => {
  // Beaucoup d acier en haut, rien en bas : les barres hautes sont AU-DESSUS de
  // C, leur deformation retombe vers epsC2 quand x grandit, et leur contrainte
  // baisse de fyd a 400 MPa.
  const section = () => poteau(30, 4, 0, 32);

  it('le sommet du domaine est interieur, pas a la deformation uniforme', () => {
    const courbe = interactionCurveNM(section(), profile, { steps: 400 });
    const nMax = Math.max(...courbe.map((p) => p.N));
    expect(nMax).toBeGreaterThan(courbe[courbe.length - 1].N);
  });

  it('entre les deux, le solveur converge et rend le plus grand moment', () => {
    const courbe = interactionCurveNM(section(), profile, { steps: 400 });
    const sommet = courbe.reduce((a, b) => (b.N > a.N ? b : a));
    const uniforme = courbe[courbe.length - 1];
    const N = (sommet.N + uniforme.N) / 2;

    const r = verifyUniaxial(section(), { N, M: 0 }, profile);
    expect(r.converged).toBe(true);
    expect(r.N_Rd).toBeCloseTo(N, 3);
    expect(r.neutralAxisDepth).toBeLessThan(sommet.neutralAxisDepth);
  });
});

describe('Pivot C — solveurs devie et etat de section', () => {
  it('le solveur devie retrouve le solveur droit sous forte compression', () => {
    const N = 2000;
    const droit = verifyUniaxial(poteau(), { N, M: 0 }, profile);
    const etat = capacityAtAngle(poteau(), 0, N, profile);
    expect(droit.neutralAxisDepth).toBeGreaterThan(300);
    expect(etat!.M.y).toBeCloseTo(droit.M_Rd, 6);

    const devie = verifyBiaxial(poteau(), { N, My: droit.M_Rd, Mz: 0 }, profile);
    expect(devie.converged).toBe(true);
    expect(devie.M_Rd_magnitude).toBeCloseTo(droit.M_Rd, 2);
  });

  it('le diagramme complet ferme du cote compression, au meme point', () => {
    const d = interactionDiagramNM(poteau(), profile, { steps: 40 });
    const milieu = d.length / 2;
    expect(d[milieu - 1].N).toBeCloseTo(d[milieu].N, 6);
    expect(d[milieu - 1].M).toBeCloseTo(d[milieu].M, 6);
  });

  it('sectionStateAt admet la meme frontiere que le solveur ELU', () => {
    const N = 2000;
    const { M_Rd } = verifyUniaxial(poteau(), { N, M: 0 }, profile);
    expect(sectionStateAt(poteau(), { N, M: 0.98 * M_Rd }, profile).converged).toBe(true);
    expect(sectionStateAt(poteau(), { N, M: 1.03 * M_Rd }, profile).converged).toBe(false);
    expect(sectionStateAt(poteau(), { N, M: -1.03 * M_Rd }, profile).converged).toBe(false);
  });

  it('sectionStateAt : en compression centree, epsC2 et non epsCu2', () => {
    const c = createConcrete(30, profile);
    const sommet = sectionStateAt(poteau(), { N: 2277, M: 0 }, profile);
    expect(sommet.converged).toBe(true);
    expect(sommet.epsCMax).toBeLessThanOrEqual(c.epsC2 * 1.001);
    expect(sectionStateAt(poteau(), { N: 2300, M: 0 }, profile).converged).toBe(false);
  });

  it('sectionStateAt dit l ultime aussi au pivot C', () => {
    const N = 2000;
    const { M_Rd } = verifyUniaxial(poteau(), { N, M: 0 }, profile);
    // Tout juste au-dela de M_Rd, dans la tolerance : le solveur se pose sur la frontiere.
    const bord = sectionStateAt(poteau(), { N, M: 1.0005 * M_Rd }, profile);
    expect(bord.converged).toBe(true);
    expect(bord.atUltimate).toBe(true);
    expect(bord.epsCMax).toBeLessThan(createConcrete(30, profile).epsCu2);
  });
});
