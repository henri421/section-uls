import { describe, it, expect } from 'vitest';
import { utilizationRatio } from '../../src/domains/utilization';
import { interactionCurveAtN } from '../../src/domains/interaction';
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

describe('utilizationRatio', () => {
  it('un point manifestement interieur donne un taux inferieur a 1', () => {
    const r = utilizationRatio(poteauCarre(), { N: 600, My: 20, Mz: 20 }, profile);
    expect(r.utilization).toBeLessThan(1);
    expect(r.utilization).toBeGreaterThan(0);
  });

  it('porte de validation : un point PRIS SUR le contour donne un taux voisin de 1', () => {
    // Le point n'est pas choisi arbitrairement : on le prend sur la courbe
    // rendue par le domaine, donc il est sur le contour par construction.
    const section = poteauCarre();
    const courbe = interactionCurveAtN(section, 600, profile, { steps: 24 });
    const point = courbe[7];

    const r = utilizationRatio(section, { N: 600, My: point.My, Mz: point.Mz }, profile);
    expect(r.utilization).toBeCloseTo(1, 3);
  });

  it('le taux croit proportionnellement au moment sollicitant, a N constant', () => {
    const section = poteauCarre();
    const simple = utilizationRatio(section, { N: 600, My: 50, Mz: 0 }, profile);
    const double = utilizationRatio(section, { N: 600, My: 100, Mz: 0 }, profile);

    expect(double.utilization / simple.utilization).toBeCloseTo(2, 6);
  });

  it('un effort normal hors domaine rend un taux infini et un motif', () => {
    const r = utilizationRatio(poteauCarre(), { N: 1e9, My: 10, Mz: 0 }, profile);
    expect(r.utilization).toBe(Infinity);
    expect(r.reason).toMatch(/effort normal/i);
  });

  it('mode proportionnel : au-dela du point d equilibre, il est plus severe que N constant', () => {
    // Au-dela du point d'equilibre, majorer N REDUIT la capacite : majorer
    // tout ensemble doit donc donner un taux superieur a celui obtenu en
    // tenant N. Un test ou les deux modes coincideraient toujours ne
    // prouverait rien.
    const section = poteauCarre();
    const action = { N: 2000, My: 60, Mz: 0 };

    const aNConstant = utilizationRatio(section, action, profile, { mode: 'constant-N' });
    const proportionnel = utilizationRatio(section, action, profile, { mode: 'proportional' });

    expect(aNConstant.utilization).toBeGreaterThan(0);
    expect(proportionnel.utilization).toBeGreaterThan(aNConstant.utilization);
  });

  it('mode proportionnel : un point sur le contour reste voisin de 1', () => {
    const section = poteauCarre();
    const courbe = interactionCurveAtN(section, 600, profile, { steps: 24 });
    const point = courbe[3];

    const r = utilizationRatio(
      section,
      { N: 600, My: point.My, Mz: point.Mz },
      profile,
      { mode: 'proportional' }
    );

    expect(r.utilization).toBeCloseTo(1, 2);
  });

  it('mode proportionnel : section tres largement depassee en flexion, taux plafonne mais fini', () => {
    // Meme au plus petit facteur d'homothetie teste (0,01), la sollicitation
    // en moment (0,01 * 20000 = 200) depasse deja la capacite a cet effort
    // normal quasi nul (~173 kN.m) : aucune racine ne se trouve dans
    // l'intervalle explore, la section est tres largement depassee. Le taux
    // doit alors etre PLAFONNE (1 / 0,01 = 100), pas invente ni confondu
    // avec le taux du mode « N constant ».
    const section = poteauCarre();
    const r = utilizationRatio(section, { N: 600, My: 20000, Mz: 0 }, profile, {
      mode: 'proportional',
    });

    expect(r.utilization).toBeGreaterThan(4);
    expect(r.utilization).toBeLessThan(Infinity);
    expect(r.utilization).toBeCloseTo(100, 6);
    expect(r.reason).toBeDefined();
    // Motif distinct de celui de l'effort normal hors domaine : ici c'est la
    // flexion qui lache, pas l'effort normal.
    expect(r.reason).not.toMatch(/effort normal/i);
  });
});
