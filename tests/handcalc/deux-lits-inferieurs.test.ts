import { describe, it, expect } from 'vitest';
import { resolveModel, verifySection, FORMAT_VERSION, ENGINE_VERSION } from '../../src/index';
import type { SectionModel } from '../../src/index';

/**
 * Poutre a DEUX lits inferieurs : le second pose par sa profondeur d (lit
 * libre, format 5). Recalcul manuel du moment resistant.
 *
 * b = 300 mm, h = 500 mm, C25/30, B500 ; enrobage 30, etrier Ø8.
 *   lit 1 (face inferieure) : 3 HA20, d1 = 500 − 30 − 8 − 10 = 452 mm
 *   lit 2 (lit libre)       : 3 HA20, d2 = 402 mm (50 mm au-dessus)
 *
 * A_s = 6 × π × 10² = 1885,0 mm² ; f_yd = 500 / 1,15 = 434,78 MPa
 * F_s = 1885,0 × 434,78 = 819,55 kN, si les deux lits plastifient.
 * d = (452 + 402) / 2 = 427 mm (lits d'aires egales).
 *
 * Bloc parabole-rectangle (f_ck ≤ 50) : alpha = 1 − 0,002 / (3 × 0,0035) = 0,8095,
 * f_cd = 25 / 1,5 = 16,667 MPa.
 *   x = 819 550 / (0,8095 × 16,667 × 300) = 202,5 mm
 *   lit 2 : eps = 0,0035 × (402 / 202,5 − 1) = 3,45 ‰ > eps_yd = 2,17 ‰ : plastifie
 * Profondeur de la resultante de compression, beta × x avec
 *   beta = (1/2 − (0,002/0,0035)² / 12) / (1 − 0,002 / (3 × 0,0035)) = 0,4160
 *   beta × x = 84,2 mm ; z = 427 − 84,2 = 342,8 mm
 *   M_Rd = 819,55 × 0,3428 = 280,9 kN·m
 */
const M_RD_MAIN = 280.9; // kN·m

function poutre(lits: SectionModel['reinforcement']): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 400 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    geometry: { kind: 'rectangle', width: 300, height: 500 },
    reinforcement: lits,
    action: { N: 0, My: 200, Mz: 0 },
  };
}

function momentResistant(m: SectionModel): number {
  const resolu = resolveModel(m);
  const r = verifySection(resolu.section, resolu.action, resolu.norm, { mode: 'constant-N' });
  if (r.M_Rd === null) throw new Error('M_Rd attendu');
  return r.M_Rd.y;
}

describe('Deux lits inferieurs, le second en lit libre par d — recalcul manuel', () => {
  it('M_Rd du solveur = calcul a la main, a 1 % pres', () => {
    const M = momentResistant(
      poutre({
        kind: 'rectangular-layout',
        cover: 30,
        stirrupDiameter: 8,
        rows: [
          { face: 'bottom', bars: { count: 3, diameter: 20 } },
          { face: 'depth', d: 402, bars: { count: 3, diameter: 20 } },
        ],
      })
    );

    expect(M).toBeGreaterThan(M_RD_MAIN * 0.99);
    expect(M).toBeLessThan(M_RD_MAIN * 1.01);
  });

  it('le second lit compte : M_Rd superieur a celui du seul lit inferieur', () => {
    const unLit = momentResistant(
      poutre({
        kind: 'rectangular-layout',
        cover: 30,
        stirrupDiameter: 8,
        rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
      })
    );
    expect(unLit).toBeLessThan(M_RD_MAIN * 0.7);
  });
});
