import { describe, it, expect } from 'vitest';
import { sectionStateAt } from '../../src/solvers/section-state';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profil = ec2Recommended();
const beton = createConcrete(30, profil);
const acier = createSteel(500, 200000, profil);

/** Poutre 300 × 500, C30/37, 4 HA20 en fibre inferieure (1257 mm²). */
function poutre() {
  const As = 4 * ((Math.PI * 20 ** 2) / 4);
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: [{ y: 0, z: 200, area: As, steel: acier }],
  });
}

describe('sectionStateAt', () => {
  it('sans sollicitation, la section est au repos', () => {
    const etat = sectionStateAt(poutre(), { N: 0, M: 0 }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.epsTop).toBeCloseTo(0, 9);
    expect(etat.curvature).toBeCloseTo(0, 12);
    expect(etat.bars[0].sigma).toBeCloseTo(0, 6);
    expect(etat.sigmaSMax).toBeCloseTo(0, 6);
  });

  it('retrouve la sollicitation imposee — c est la definition meme de l equilibre', () => {
    const etat = sectionStateAt(poutre(), { N: 150, M: 120 }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.N).toBeCloseTo(150, 1);
    expect(etat.M).toBeCloseTo(120, 1);
  });

  /**
   * LE CAS QUI A MOTIVE LE MODULE : `M_Ed` bien en deca de `M_Rd`. Les
   * armatures ne sont pas a `f_yd`, et c'est precisement ce qu'on veut lire.
   */
  it('sous un moment inferieur a M_Rd, l acier n est pas a f_yd', () => {
    const section = poutre();
    const MRd = verifyUniaxial(section, { N: 0, M: 0 }, profil).M_Rd;

    const etat = sectionStateAt(section, { N: 0, M: MRd / 2 }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.bars[0].sigma).toBeLessThan(0); // barre TENDUE
    expect(etat.sigmaSMax).toBeLessThan(acier.fyd);
    expect(etat.bars[0].yielded).toBe(false);
    expect(etat.utilization).toBeLessThan(1);
    expect(etat.atUltimate).toBe(false);
  });

  it('la contrainte d acier croit avec le moment', () => {
    const section = poutre();
    const MRd = verifyUniaxial(section, { N: 0, M: 0 }, profil).M_Rd;

    const contraintes = [0.2, 0.4, 0.6, 0.8].map(
      (part) => sectionStateAt(section, { N: 0, M: part * MRd }, profil).sigmaSMax
    );

    for (let i = 1; i < contraintes.length; i++) {
      expect(contraintes[i]).toBeGreaterThan(contraintes[i - 1]);
    }
    expect(contraintes[contraintes.length - 1]).toBeLessThanOrEqual(acier.fyd);
  });

  /**
   * VALIDATION CROISEE, le test le plus fort du module : porte a `M_Rd`,
   * ce solveur a deux inconnues doit retrouver l'axe neutre que
   * `verifyUniaxial` — un solveur different, a une seule inconnue, cale sur
   * le pivot beton — trouve de son cote.
   */
  it('a M_Ed = M_Rd, retrouve l axe neutre de verifyUniaxial', () => {
    const section = poutre();
    const ultime = verifyUniaxial(section, { N: 0, M: 0 }, profil);

    const etat = sectionStateAt(section, { N: 0, M: ultime.M_Rd }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.neutralAxisDepth).not.toBeNull();
    expect(etat.neutralAxisDepth!).toBeCloseTo(ultime.neutralAxisDepth, 1);
    expect(etat.epsTop).toBeCloseTo(beton.epsCu2, 5);
    expect(etat.atUltimate).toBe(true);
  });

  it('meme validation croisee en flexion composee', () => {
    const section = poutre();
    const N = 400;
    const ultime = verifyUniaxial(section, { N, M: 0 }, profil);

    const etat = sectionStateAt(section, { N, M: ultime.M_Rd }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.neutralAxisDepth!).toBeCloseTo(ultime.neutralAxisDepth, 1);
  });

  /**
   * Une section sous-armee plastifie avant l'ecrasement du beton : a
   * l'ultime, l'armature tendue est bien a `f_yd`.
   */
  it('a l ultime, l armature tendue d une section sous-armee a plastifie', () => {
    const section = poutre();
    const MRd = verifyUniaxial(section, { N: 0, M: 0 }, profil).M_Rd;

    const etat = sectionStateAt(section, { N: 0, M: MRd }, profil);

    expect(etat.bars[0].yielded).toBe(true);
    expect(etat.sigmaSMax).toBeCloseTo(acier.fyd, 3);
  });

  /**
   * REFUSER PLUTOT QU INVENTER. Au-dela de `M_Rd` il n'existe aucun etat
   * d'equilibre : rendre une contrainte d'acier aurait l'apparence d'une
   * reponse.
   */
  it('refuse un moment au-dela de la resistance, avec un motif', () => {
    const section = poutre();
    const MRd = verifyUniaxial(section, { N: 0, M: 0 }, profil).M_Rd;

    const etat = sectionStateAt(section, { N: 0, M: MRd * 1.5 }, profil);

    expect(etat.converged).toBe(false);
    expect(etat.reason).toMatch(/moment resistant/);
    expect(etat.bars).toEqual([]);
  });

  it('refuse un effort normal que la section ne peut pas porter', () => {
    const etat = sectionStateAt(poutre(), { N: 50000, M: 0 }, profil);

    expect(etat.converged).toBe(false);
    expect(etat.reason).toMatch(/effort normal/);
  });

  it('un moment negatif tend la fibre superieure', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete: beton,
      rebars: [
        { y: 0, z: 200, area: 1257, steel: acier },
        { y: 0, z: -200, area: 1257, steel: acier },
      ],
    });

    const negatif = sectionStateAt(section, { N: 0, M: -150 }, profil);

    expect(negatif.converged).toBe(true);
    expect(negatif.epsTop).toBeLessThan(0); // fibre superieure TENDUE
    expect(negatif.epsBottom).toBeGreaterThan(0);
    // La barre haute est celle qui travaille en traction.
    const barreHaute = negatif.bars.find((b) => b.z === -200)!;
    expect(barreHaute.sigma).toBeLessThan(0);
  });

  it('rend l etat de CHAQUE barre, y compris celles qui sont comprimees', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete: beton,
      rebars: [
        { y: -100, z: 200, area: 628, steel: acier },
        { y: 100, z: 200, area: 628, steel: acier },
        { y: 0, z: -200, area: 402, steel: acier },
      ],
    });

    const etat = sectionStateAt(section, { N: 0, M: 200 }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.bars).toHaveLength(3);

    // Les deux barres du lit inferieur sont a la meme cote, donc au meme
    // etat : la flexion droite ne distingue pas leur position en `y`.
    expect(etat.bars[0].sigma).toBeCloseTo(etat.bars[1].sigma, 9);
    expect(etat.bars[0].sigma).toBeLessThan(0);

    // La barre superieure est comprimee.
    expect(etat.bars[2].sigma).toBeGreaterThan(0);
    expect(etat.sigmaScMax).toBeGreaterThan(0);

    // L'effort de chaque barre suit sa contrainte et sa section.
    for (const barre of etat.bars) {
      expect(barre.force).toBeCloseTo((barre.sigma * barre.area) / 1000, 9);
    }
  });

  it('une section entierement comprimee n a pas d axe neutre', () => {
    const etat = sectionStateAt(poutre(), { N: 2000, M: 10 }, profil);

    expect(etat.converged).toBe(true);
    expect(etat.epsTop).toBeGreaterThan(0);
    expect(etat.epsBottom).toBeGreaterThan(0);
    expect(etat.neutralAxisDepth).toBeNull();
    expect(etat.sigmaSMax).toBe(0);
  });
});
