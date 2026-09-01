import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('integrateRectangle', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile); // fcd=16.6667

  it('donne un moment nul pour une contrainte uniforme (symetrie autour du centroide)', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    // Deformation constante sur le plateau (epsC2 <= eps <= epsCu2) -> sigma = fcd partout
    const strainAt = () => concrete.epsC2;

    const result = integrateRectangle(section, strainAt, 100);

    // N attendu = fcd * b * h / 1000 (conversion N -> kN)
    expect(result.N).toBeCloseTo((concrete.fcd * 300 * 500) / 1000, 1);
    expect(result.M).toBeCloseTo(0, 6);
  });

  it('vaut 0 en N et M pour une section entierement tendue', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const strainAt = () => -0.001; // traction partout -> beton ne resiste pas

    const result = integrateRectangle(section, strainAt, 50);

    expect(result.N).toBe(0);
    expect(result.M).toBe(0);
  });

  it('nette le beton deplace par une nappe d armature placee au centroide', () => {
    // fyk=500, Es=200000 -> fyd = 500/1.15 = 434.7826... MPa
    //                        epsYd = fyd/Es = 434.7826/200000 = 0.00217391...
    const steel = createSteel(500, 200000, profile);

    // Nappe unique de 1000 mm2 placee exactement au centroide (depthFromTop =
    // height/2 = 250) : le bras de levier de cette nappe est donc nul, ce qui
    // isole la contribution en N sans introduire de moment a verifier a la main.
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: 1000, depthFromTop: 250, steel }],
    });
    // Champ de deformation uniforme sur le plateau du beton (meme astuce que
    // le premier test) : sigma_beton(eps) = fcd partout, y compris au droit
    // de l'armature (beton "deplace").
    const strainAt = () => concrete.epsC2; // eps = 0.002

    const result = integrateRectangle(section, strainAt, 100);

    // Calcul a la main :
    // - eps = epsC2 = 0.002 < epsYd (0.00217391...) => acier encore elastique
    //   sigma_acier = Es * eps = 200000 * 0.002 = 400 MPa
    // - sigma_beton(eps) = fcd = 25/1.5 = 16.66667 MPa (plateau, eps == epsC2)
    // - Contribution beton brut (bandes) : fcd * b * h / 1000
    //     = 16.66667 * 300 * 500 / 1000 = 2500 kN
    // - Contribution nette de la nappe (acier moins beton deplace au meme eps) :
    //     (sigma_acier - sigma_beton) * area / 1000
    //     = (400 - 16.66667) * 1000 / 1000 = 383.33333 kN
    // - N attendu = 2500 + 383.33333 = 2883.33333 kN
    expect(result.N).toBeCloseTo(2883.33333, 3);
    // M attendu = 0 : les bandes s'annulent par symetrie (comme ci-dessus) et
    // le bras de levier de la nappe est nul (depthFromTop == centroide).
    expect(result.M).toBeCloseTo(0, 6);
  });
});
