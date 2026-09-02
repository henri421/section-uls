import { describe, it, expect } from 'vitest';
import { polygonArea, polygonCentroid } from '../../src/geometry/polygon';

describe('Section en T — aire et centroide, recalcul manuel par decomposition', () => {
  it('aire et centroide du polygone correspondent a la decomposition rectangle-par-rectangle', () => {
    // Table (aile) 600x150 en haut, ame (nervure) 250x350 en dessous, centree
    // sous la table. Origine du repere brut : coin superieur gauche de
    // l'aile, y vers la droite, z vers le bas.
    const vertices = [
      { y: 0, z: 0 },
      { y: 600, z: 0 },
      { y: 600, z: 150 },
      { y: 425, z: 150 },
      { y: 425, z: 500 },
      { y: 175, z: 500 },
      { y: 175, z: 150 },
      { y: 0, z: 150 },
    ];

    // --- Calcul manuel independant, par decomposition en deux rectangles ---
    const flangeArea = 600 * 150; // 90000 mm²
    const flangeCentroidZ = 150 / 2; // 75 mm, depuis le sommet

    const webArea = 250 * 350; // 87500 mm²
    const webCentroidZ = 150 + 350 / 2; // 325 mm, depuis le sommet

    const totalAreaHand = flangeArea + webArea; // 177500 mm²
    const centroidZHand = (flangeArea * flangeCentroidZ + webArea * webCentroidZ) / totalAreaHand;
    const centroidYHand = 300; // symetrie : aile (0-600) et ame (175-425) toutes deux centrees sur y=300

    expect(centroidZHand).toBeCloseTo(198.2394, 3);

    // --- Formule du lacet (geometry/polygon.ts) ---
    const area = polygonArea(vertices);
    const centroid = polygonCentroid(vertices);

    expect(area).toBeCloseTo(totalAreaHand, 6);
    expect(centroid.y).toBeCloseTo(centroidYHand, 6);
    expect(centroid.z).toBeCloseTo(centroidZHand, 3);
  });
});
