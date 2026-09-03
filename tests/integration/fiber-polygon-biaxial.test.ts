import { describe, it, expect } from 'vitest';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { integratePolygonBiaxial } from '../../src/integration/fiber-polygon-biaxial';
import { polygonSection } from '../../src/geometry/polygon';
import { rotateSection, rotatePoint } from '../../src/geometry/rotate';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

// Section en T : non convexe, plusieurs spans possibles, asymetrique en z.
const sectionT = polygonSection({
  vertices: [
    { y: 0, z: 0 },
    { y: 600, z: 0 },
    { y: 600, z: 150 },
    { y: 425, z: 150 },
    { y: 425, z: 500 },
    { y: 175, z: 500 },
    { y: 175, z: 150 },
    { y: 0, z: 150 },
  ],
  concrete,
  rebars: [
    { y: 220, z: 450, area: 804, steel },
    { y: 380, z: 450, area: 804, steel },
  ],
});

const zTop = Math.min(...sectionT.geometry.vertices.map((v) => v.z));
const champ = (z: number) => 3.5e-3 * (1 - (z - zTop) / 250);

describe('integratePolygonBiaxial', () => {
  it('non-regression : N et My identiques a integratePolygon', () => {
    const ref = integratePolygon(sectionT, champ, 400);
    const bi = integratePolygonBiaxial(sectionT, champ, 400);

    expect(Math.abs(bi.N - ref.N) / Math.abs(ref.N)).toBeLessThan(1e-12);
    expect(Math.abs(bi.My - ref.M) / Math.abs(ref.M)).toBeLessThan(1e-12);
  });

  it('Mz est nul sur une section symetrique en y, quelle que soit son asymetrie en z', () => {
    // La section en T ci-dessus est symetrique par rapport a y = centroide,
    // et ses armatures aussi : la composante Mz doit s'annuler.
    const bi = integratePolygonBiaxial(sectionT, champ, 400);

    expect(Math.abs(bi.Mz)).toBeLessThan(1e-9);
  });

  it('Mz est non nul des que les armatures rompent la symetrie en y', () => {
    const sectionAsym = polygonSection({
      vertices: sectionT.geometry.vertices.map((v) => ({ y: v.y, z: v.z })),
      concrete,
      rebars: [{ y: 100, z: 200, area: 2000, steel }],
    });

    const bi = integratePolygonBiaxial(sectionAsym, champ, 400);
    expect(Math.abs(bi.Mz)).toBeGreaterThan(1);
  });

  it('LOI DE TRANSFORMATION : le vecteur moment tourne comme un point du plan', () => {
    // Propriete centrale de la session 3, jusqu'ici seulement postulee en
    // commentaire : (M_y, M_z) = (-∫σz dA, +∫σy dA) doit se transformer sous
    // rotation du repere par la MEME matrice R(theta) qu'un point.
    //
    // Astuce qui rend la verification possible : un champ de deformation
    // lineaire en z n'est pas exprimable en fonction de z' seul dans le
    // repere tourne, donc on ne peut pas comparer les deux reperes avec un
    // tel champ. On prend donc un champ CONSTANT en traction :
    //   - constant, donc identique dans les deux reperes ;
    //   - en traction, donc le beton ne contribue rien (la loi
    //     parabole-rectangle rend zero en traction) et il ne reste que les
    //     armatures, contributions ponctuelles qui tournent exactement.
    const asym = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 500, z: 0 },
        { y: 500, z: 300 },
        { y: 200, z: 300 },
        { y: 200, z: 700 },
        { y: 0, z: 700 },
      ],
      concrete,
      rebars: [
        { y: 60, z: 640, area: 616, steel },
        { y: 140, z: 640, area: 616, steel },
        { y: 440, z: 60, area: 314, steel },
      ],
    });

    const traction = () => -1.0e-3; // toutes fibres tendues : beton a zero
    const theta = 0.63;

    const direct = integratePolygonBiaxial(asym, traction, 400);
    const tourne = integratePolygonBiaxial(rotateSection(asym, theta), traction, 400);

    // L'effort normal est un scalaire : invariant par rotation.
    expect(Math.abs(tourne.N - direct.N) / Math.abs(direct.N)).toBeLessThan(1e-12);

    // Le moment doit suivre R(theta), exactement comme un point.
    const attendu = rotatePoint({ y: direct.My, z: direct.Mz }, theta);
    expect(Math.abs(tourne.My - attendu.y) / Math.abs(attendu.y)).toBeLessThan(1e-9);
    expect(Math.abs(tourne.Mz - attendu.z) / Math.abs(attendu.z)).toBeLessThan(1e-9);

    // Garde-fou : le cas doit etre reellement discriminant, donc les deux
    // composantes doivent etre franchement non nulles.
    expect(Math.abs(direct.My)).toBeGreaterThan(1);
    expect(Math.abs(direct.Mz)).toBeGreaterThan(1);
  });

  it('resultantes separees : compression et traction, avec leurs points d application', () => {
    const bi = integratePolygonBiaxial(sectionT, champ, 400);

    expect(bi.compression).not.toBeNull();
    expect(bi.tension).not.toBeNull();
    // Forces rendues en valeur absolue, donc positives toutes les deux.
    expect(bi.compression!.force).toBeGreaterThan(0);
    expect(bi.tension!.force).toBeGreaterThan(0);
    // N est le bilan des deux.
    expect(bi.N).toBeCloseTo(bi.compression!.force - bi.tension!.force, 6);
    // La compression est du cote de la fibre superieure (z faible), la
    // traction du cote des armatures basses.
    expect(bi.compression!.z).toBeLessThan(bi.tension!.z);
  });

  it('une resultante inexistante est rendue null, jamais une force nulle a une position arbitraire', () => {
    // Section entierement comprimee : aucune fibre tendue.
    const bi = integratePolygonBiaxial(sectionT, () => 1.0e-3, 400);

    expect(bi.tension).toBeNull();
    expect(bi.compression).not.toBeNull();
  });
});
