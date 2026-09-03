import { describe, it, expect } from 'vitest';
import { interactionCurveAtN, interactionCurveNM } from '../../src/domains/interaction';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poteauCarre() {
  return rectangularSection({
    width: 400, height: 400, concrete,
    rebars: rectangularRebarLayout({
      width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
        { face: 'left', bars: { count: 1, diameter: 20 } },
        { face: 'right', bars: { count: 1, diameter: 20 } },
      ],
    }).bars,
  });
}

describe('interactionCurveAtN', () => {
  it('rend une courbe fermee, sans repeter le premier point', () => {
    const courbe = interactionCurveAtN(poteauCarre(), 600, profile, { steps: 24 });

    expect(courbe).toHaveLength(24);
    expect(courbe[0].neutralAxisAngle).toBeCloseTo(0, 12);
    // Le dernier point ne doit pas etre le premier : c'est a l'appelant de refermer.
    expect(courbe[23].neutralAxisAngle).toBeGreaterThan(courbe[0].neutralAxisAngle);
    expect(courbe[23].neutralAxisAngle).toBeLessThan(2 * Math.PI);
  });

  it('chaque point coincide avec verifyBiaxial dans sa propre direction', () => {
    // Controle croise : le domaine et le solveur devie doivent decrire la
    // meme surface. On prend un point de la courbe, on relit sa direction de
    // moment, et on demande au solveur la capacite dans cette direction.
    const section = poteauCarre();
    const courbe = interactionCurveAtN(section, 600, profile, { steps: 24 });
    const point = courbe[5];

    const parLeSolveur = verifyBiaxial(section, { N: 600, My: point.My, Mz: point.Mz }, profile);

    expect(parLeSolveur.converged).toBe(true);
    expect(parLeSolveur.M_Rd.y).toBeCloseTo(point.My, 6);
    expect(parLeSolveur.M_Rd.z).toBeCloseTo(point.Mz, 6);
  });

  it('la courbe d un poteau carre symetrique est invariante par rotation de 90 deg', () => {
    const courbe = interactionCurveAtN(poteauCarre(), 600, profile, { steps: 24 });
    const magnitude = (i: number) => Math.hypot(courbe[i].My, courbe[i].Mz);

    // 24 pas sur 2*pi : un quart de tour vaut exactement 6 pas.
    for (let i = 0; i < 24; i++) {
      expect(magnitude((i + 6) % 24)).toBeCloseTo(magnitude(i), 6);
    }
  });

  it('omet les orientations ou l effort normal est hors plage, sans inventer de point', () => {
    // Effort normal absurde : aucune orientation ne le supporte.
    const courbe = interactionCurveAtN(poteauCarre(), 1e9, profile, { steps: 12 });
    expect(courbe).toHaveLength(0);
  });
});

describe('interactionCurveNM', () => {
  it('couvre de la traction dominante a la compression quasi uniforme', () => {
    const courbe = interactionCurveNM(poteauCarre(), profile, { steps: 40 });

    expect(courbe.length).toBe(40);
    expect(courbe[0].N).toBeLessThan(0); // profondeur faible : traction
    expect(courbe[39].N).toBeGreaterThan(2000); // profondeur grande : compression
    // Profondeurs strictement croissantes.
    for (let i = 1; i < courbe.length; i++) {
      expect(courbe[i].neutralAxisDepth).toBeGreaterThan(courbe[i - 1].neutralAxisDepth);
    }
  });

  it('a la forme en cloche : le moment croit puis decroit avec l effort normal', () => {
    const courbe = interactionCurveNM(poteauCarre(), profile, { steps: 60 });
    const moments = courbe.map((p) => p.M);
    const iMax = moments.indexOf(Math.max(...moments));

    // Le maximum est interieur, pas a une extremite : c'est le point d'equilibre.
    expect(iMax).toBeGreaterThan(0);
    expect(iMax).toBeLessThan(courbe.length - 1);
  });

  it('chaque point coincide avec le solveur droit au meme effort normal', () => {
    const section = poteauCarre();
    const courbe = interactionCurveNM(section, profile, { steps: 40 });
    const point = courbe[25];

    const parLeSolveur = verifyUniaxial(section, { N: point.N, M: 0 }, profile);

    expect(parLeSolveur.converged).toBe(true);
    expect(parLeSolveur.M_Rd).toBeCloseTo(point.M, 4);
    expect(parLeSolveur.neutralAxisDepth).toBeCloseTo(point.neutralAxisDepth, 4);
  });
});
