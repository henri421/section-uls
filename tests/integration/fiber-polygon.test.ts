import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
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
});
