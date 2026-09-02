import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import type { Section } from '../../src/model/section';
import type { RectangularGeometry } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

// Ce test decouple deliberement "la conversion depthFromTop -> z de
// rectangularSection est correcte" (teste ailleurs) de "integrateRectangle
// consomme correctement un z donne" : la Section/RebarLayer est construite a
// la main, sans passer par rectangularSection, avec un z non nul et
// asymetrique (150, distinct du z=200 issu du fixture depthFromTop=450
// utilise dans les tests handcalc).
describe('integrateRectangle - isometrie (y,z) de RebarLayer testee independamment', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile); // fcd = 25/1.5 = 16.66667 MPa

  it('applique arm = -z pour une nappe placee a z=150 (hors centroide)', () => {
    // fyk=500, Es=200000 -> fyd = 500/1.15 = 434.7826... MPa
    //                        epsYd = fyd/Es = 434.7826/200000 = 0.00217391...
    const steel = createSteel(500, 200000, profile);

    // Section/RebarLayer construite a la main (PAS via rectangularSection) :
    // nappe de 1000 mm2 a z=150 (150 mm sous le centroide, cote fibre
    // inferieure puisque z est positif vers le bas).
    const section: Section & { geometry: RectangularGeometry } = {
      geometry: { kind: 'rectangle', width: 300, height: 500 },
      concrete,
      rebars: [{ y: 0, z: 150, area: 1000, steel }],
    };

    // Champ de deformation uniforme sur le plateau du beton (meme astuce que
    // fiber-rectangle.test.ts) : sigma_beton(eps) = fcd partout, y compris
    // au droit de l'armature (beton "deplace").
    const strainAt = () => concrete.epsC2; // eps = 0.002

    const result = integrateRectangle(section, strainAt, 100);

    // Calcul a la main :
    // - eps = epsC2 = 0.002 < epsYd (0.00217391...) => acier encore elastique
    //   sigma_acier = Es * eps = 200000 * 0.002 = 400 MPa
    // - sigma_beton(eps) = fcd = 25/1.5 = 16.66667 MPa (plateau, eps == epsC2)
    //
    // Contribution des bandes de beton brut (symetriques autour du centroide,
    // champ de deformation uniforme) :
    //   N_gross = fcd * b * h / 1000 = 16.66667 * 300 * 500 / 1000 = 2500 kN
    //   M_gross = 0 (symetrie des bandes)
    //
    // Contribution nette de la nappe (acier moins beton deplace au meme eps) :
    //   netForce = (sigma_acier - sigma_beton) * area
    //            = (400 - 16.66667) * 1000 = 383333.33 N = 383.33333 kN
    //   arm = -z = -150 mm  (c'est precisement la convention testee ici :
    //     une nappe SOUS le centroide, a z positif, recoit un bras NEGATIF)
    //   M_rebar = netForce_kN * arm_mm / 1000 = 383.33333 * (-150) / 1000
    //           = -57.5 kN.m
    //
    // Totaux attendus :
    //   N = N_gross + N_rebar = 2500 + 383.33333 = 2883.33333 kN
    //   M = M_gross + M_rebar = 0 + (-57.5) = -57.5 kN.m
    expect(result.N).toBeCloseTo(2883.33333, 3);
    expect(result.M).toBeCloseTo(-57.5, 6);
  });
});
