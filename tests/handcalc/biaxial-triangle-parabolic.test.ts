import { describe, it, expect } from 'vitest';
import { integratePolygonBiaxial } from '../../src/integration/fiber-polygon-biaxial';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import type { PolygonGeometry } from '../../src/geometry/polygon';

describe('Flexion deviee — triangle sur branche parabolique, recalcul manuel ferme', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile); // fcd = 25/1.5 = 16.6667 MPa

  // Triangle : sommet en (0,0), base horizontale de (-100,300) a (200,300).
  // A la hauteur z : largeur w(z) = z, milieu de bande ybar(z) = z/6.
  // Volontairement NON centre sur le centroide : l'integration se fait autour
  // de l'origine du repere fourni, ce qui rend le calcul a la main direct.
  const geometry: PolygonGeometry = {
    kind: 'polygon',
    vertices: [
      { y: 0, z: 0 },
      { y: 200, z: 300 },
      { y: -100, z: 300 },
    ],
  };

  const section = { geometry, concrete, rebars: [] };

  // Fibre extreme calee sur epsC2 (et non epsCu2) : toute la zone comprimee
  // est sur la branche parabolique, aucun plateau, aucune fibre tendue.
  // sigma(z) = fcd * (1 - (z/300)^2).
  const champ = (z: number) => concrete.epsC2 * (1 - z / 300);

  // --- Valeurs fermees, calculees a la main ---
  const fcd = concrete.fcd;
  const N_main = (fcd * 2.25e4) / 1000; // kN
  const My_main = (-fcd * 3.6e6) / 1e6; // kN·m
  const Mz_main = (fcd * 6.0e5) / 1e6; // kN·m

  it('les valeurs manuelles sont bien celles annoncees dans la spec', () => {
    expect(N_main).toBeCloseTo(375, 6);
    expect(My_main).toBeCloseTo(-60, 6);
    expect(Mz_main).toBeCloseTo(10, 6);
  });

  it('l integration par fibres retrouve les trois integrales fermees', () => {
    const r = integratePolygonBiaxial(section, champ, 4000);

    expect(Math.abs(r.N - N_main) / Math.abs(N_main)).toBeLessThan(1e-4);
    expect(Math.abs(r.My - My_main) / Math.abs(My_main)).toBeLessThan(1e-4);
    expect(Math.abs(r.Mz - Mz_main) / Math.abs(Mz_main)).toBeLessThan(1e-4);
  });

  it('le point d application de la compression est retrouve, et rien n est tendu', () => {
    const r = integratePolygonBiaxial(section, champ, 4000);

    expect(r.tension).toBeNull();
    expect(r.compression).not.toBeNull();
    expect(r.compression!.z).toBeCloseTo(160, 1);
    expect(r.compression!.y).toBeCloseTo(160 / 6, 1);
    expect(r.compression!.force).toBeCloseTo(N_main, 1);
  });

  it('convergence : l erreur decroit quand le nombre de bandes augmente', () => {
    const erreur = (nBands: number) => {
      const r = integratePolygonBiaxial(section, champ, nBands);
      return Math.abs(r.Mz - Mz_main) / Math.abs(Mz_main);
    };

    const e50 = erreur(50);
    const e500 = erreur(500);

    expect(e500).toBeLessThan(e50);
    expect(e500).toBeLessThan(1e-3);
  });
});
