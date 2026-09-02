import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('integratePolygon', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);

  it('non-regression : un rectangle modelise en polygone donne le meme resultat que integrateRectangle', () => {
    const width = 300;
    const height = 500;

    const rectSection = rectangularSection({ width, height, concrete, rebars: [] });
    const polySection = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: width, z: 0 },
        { y: width, z: height },
        { y: 0, z: height },
      ],
      concrete,
      rebars: [],
    });

    const strainAt = () => concrete.epsC2; // plateau, constante quel que soit z

    const rectResult = integrateRectangle(rectSection, strainAt, 200);
    const polyResult = integratePolygon(polySection, strainAt, 200);

    const relN = Math.abs(polyResult.N - rectResult.N) / Math.abs(rectResult.N);
    expect(relN).toBeLessThan(1e-9);
    expect(Math.abs(polyResult.M)).toBeLessThan(1e-6); // symetrie -> M quasi nul
    expect(Math.abs(rectResult.M)).toBeLessThan(1e-6);
  });

  it('largeur variable : un triangle asymetrique en hauteur donne un moment non nul', () => {
    const polySection = polygonSection({
      vertices: [
        { y: -150, z: 100 },
        { y: 150, z: 100 },
        { y: 0, z: -100 },
      ],
      concrete,
      rebars: [],
    });

    // Champ de deformation constant est ecarte ici : le centroide annule par
    // construction le moment de premier ordre de la geometrie, donc toute
    // contrainte spatialement constante donne M = 0 quelle que soit
    // l'asymetrie de la section (proprite du centroide, pas un defaut
    // d'implementation). Pour verifier que la largeur variable (etroite au
    // sommet, large a la base) produit bien un moment non nul, on utilise un
    // champ de deformation lineaire realiste (0 en fibre superieure, epsCu2
    // en fibre inferieure) — c'est precisement ce que `strainAt` est cense
    // representer ("champ lineaire suppose").
    const zValues = polySection.geometry.vertices.map((v) => v.z);
    const zTop = Math.min(...zValues);
    const zBottom = Math.max(...zValues);
    const strainAt = (z: number) => (concrete.epsCu2 * (z - zTop)) / (zBottom - zTop);
    const result = integratePolygon(polySection, strainAt, 200);

    expect(result.N).toBeGreaterThan(0);
    expect(Math.abs(result.M)).toBeGreaterThan(1); // largeur variable -> moment non nul
  });

  it('nette le beton deplace par une nappe d armature placee au centroide (rectangle en polygone)', () => {
    // Meme rectangle 300x500 que le test de non-regression ci-dessus, avec
    // une seule nappe d'armature ajoutee. fyk=500, Es=200000 ->
    // fyd = 500/1.15 = 434.7826... MPa, epsYd = fyd/Es = 0.00217391...
    const steel = createSteel(500, 200000, profile);

    // Sommets bruts du rectangle : (0,0),(300,0),(300,500),(0,500). Le centre
    // geometrique brut est (150, 250). `polygonSection` recentre tout sur le
    // centroide : une armature placee en (150, 250) se retrouve donc a
    // y=0, z=0 dans la section stockee, c-a-d exactement au centroide -> bras
    // de levier nul, ce qui isole la contribution en N sans introduire de
    // moment a verifier a la main (meme astuce que le test equivalent de
    // `fiber-rectangle.test.ts`).
    const polySection = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 300, z: 0 },
        { y: 300, z: 500 },
        { y: 0, z: 500 },
      ],
      concrete,
      rebars: [{ y: 150, z: 250, area: 1000, steel }],
    });

    // Champ de deformation uniforme sur le plateau du beton (meme astuce que
    // le test de non-regression) : sigma_beton(eps) = fcd partout, y compris
    // au droit de l'armature (beton "deplace").
    const strainAt = () => concrete.epsC2; // eps = 0.002

    const result = integratePolygon(polySection, strainAt, 200);

    // Calcul a la main :
    // - eps = epsC2 = 0.002 < epsYd (0.00217391...) => acier encore elastique
    //   sigma_acier = Es * eps = 200000 * 0.002 = 400 MPa
    // - sigma_beton(eps) = fcd = 25/1.5 = 16.66667 MPa (plateau, eps == epsC2)
    // - Contribution beton brut (bandes, geometrie 300x500) :
    //     fcd * b * h / 1000 = 16.66667 * 300 * 500 / 1000 = 2500 kN
    // - Contribution nette de la nappe (acier moins beton deplace au meme eps) :
    //     (sigma_acier - sigma_beton) * area / 1000
    //     = (400 - 16.66667) * 1000 / 1000 = 383.33333 kN
    // - N attendu = 2500 + 383.33333 = 2883.33333 kN
    expect(result.N).toBeCloseTo(2883.33333, 3);
    // M attendu = 0 : les bandes s'annulent par symetrie (rectangle centre) et
    // le bras de levier de la nappe est nul (rebar exactement au centroide).
    expect(result.M).toBeCloseTo(0, 6);
  });
});
