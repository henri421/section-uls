import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import type { BiaxialResult } from '../../src/solvers/uls-biaxial';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poteau carre 400x400, ferraillage symetrique : 4 coins + 4 milieux de face. */
function poteauCarre() {
  const layout = rectangularRebarLayout({
    width: 400,
    height: 400,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
      { face: 'left', bars: { count: 1, diameter: 20 } },
      { face: 'right', bars: { count: 1, diameter: 20 } },
    ],
  });
  return rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
}

/**
 * Assertion partagee : le moment resistant doit etre colineaire au moment
 * sollicitant (produit vectoriel normalise sous 1e-4). Une racine non
 * convergee acceptee sans controle de residu se trahirait ici en premier,
 * puisque `verifyBiaxial` ne recherche que des theta ou la colinearite est
 * (presque) exacte — c'est la definition meme de la racine cherchee.
 */
function assertColinear(r: BiaxialResult, action: { My: number; Mz: number }): void {
  expect(r.converged).toBe(true);
  const produitVectoriel = r.M_Rd.y * action.Mz - r.M_Rd.z * action.My;
  expect(Math.abs(produitVectoriel) / r.M_Rd_magnitude).toBeLessThan(1e-4);
}

describe('verifyBiaxial', () => {
  it('refuse une sollicitation sans direction de moment', () => {
    expect(() => verifyBiaxial(poteauCarre(), { N: 500, My: 0, Mz: 0 }, profile)).toThrow();
  });

  it('non-regression : une sollicitation autour de y seul redonne le resultat du solveur droit', () => {
    const section = poteauCarre();
    const droit = verifyUniaxial(section, { N: 800, M: 0 }, profile);
    const devie = verifyBiaxial(section, { N: 800, My: 1, Mz: 0 }, profile);

    expect(devie.converged).toBe(true);
    expect(Math.abs(devie.M_Rd.y - droit.M_Rd) / Math.abs(droit.M_Rd)).toBeLessThan(1e-6);
    expect(Math.abs(devie.M_Rd.z)).toBeLessThan(1e-6);
    expect(Math.abs(devie.neutralAxis.angle)).toBeLessThan(1e-4);
    expect(Math.abs(devie.neutralAxisDepth - droit.neutralAxisDepth)).toBeLessThan(1e-3);

    // La racine tombe ici exactement sur un point de balayage (theta = 0) :
    // elle doit etre comptee UNE fois, pas deux. Sans deduplication, le
    // balayage la detecte a la fois comme echantillon et comme encadrement
    // de l'intervalle precedent.
    expect(devie.rootCount).toBe(1);
  });

  it('seule la direction du moment sollicitant compte, pas sa magnitude', () => {
    const section = poteauCarre();
    const petit = verifyBiaxial(section, { N: 500, My: 1, Mz: 0.5 }, profile);
    const grand = verifyBiaxial(section, { N: 500, My: 1000, Mz: 500 }, profile);

    expect(grand.M_Rd_magnitude).toBeCloseTo(petit.M_Rd_magnitude, 6);
  });

  it('porte de validation : a 45 deg sur un poteau carre symetrique, les deux composantes sont egales', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 600, My: 1, Mz: 1 }, profile);

    expect(r.converged).toBe(true);
    expect(r.M_Rd.y).toBeGreaterThan(0);
    expect(r.M_Rd.z).toBeGreaterThan(0);
    expect(Math.abs(r.M_Rd.y - r.M_Rd.z) / r.M_Rd.y).toBeLessThan(1e-4);

    // Axe neutre parallele a une diagonale : |cos| = |sin|.
    const t = r.neutralAxis.angle;
    expect(Math.abs(Math.abs(Math.cos(t)) - Math.abs(Math.sin(t)))).toBeLessThan(1e-3);
  });

  it('symetries d orientation : les quatre directions cardinales donnent la meme capacite', () => {
    const section = poteauCarre();
    const directions = [
      { My: 1, Mz: 0 },
      { My: 0, Mz: 1 },
      { My: -1, Mz: 0 },
      { My: 0, Mz: -1 },
    ];

    const magnitudes = directions.map(
      (d) => verifyBiaxial(section, { N: 600, ...d }, profile).M_Rd_magnitude
    );

    for (const m of magnitudes) {
      expect(Math.abs(m - magnitudes[0]) / magnitudes[0]).toBeLessThan(1e-6);
    }
  });

  it('le moment resistant est colineaire et de meme sens que le moment sollicitant', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 400, My: 3, Mz: -2 }, profile);

    const produitVectoriel = r.M_Rd.y * -2 - r.M_Rd.z * 3;
    const produitScalaire = r.M_Rd.y * 3 + r.M_Rd.z * -2;

    expect(Math.abs(produitVectoriel) / r.M_Rd_magnitude).toBeLessThan(1e-4);
    expect(produitScalaire).toBeGreaterThan(0);
  });

  it('budget : la convergence tient en moins de 60 resolutions droites', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 600, My: 1, Mz: 1 }, profile);
    expect(r.innerSolves).toBeLessThanOrEqual(60);
  });

  it('le bras de levier recoupe M = F * z en flexion simple', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 0, My: 1, Mz: 1 }, profile);

    expect(r.leverArm).not.toBeNull();
    expect(r.compression).not.toBeNull();
    expect(r.tension).not.toBeNull();
    // N = 0 : les deux resultantes sont egales en module, et M = F * z.
    expect(r.compression!.force).toBeCloseTo(r.tension!.force, 3);
    const produit = (r.compression!.force * r.leverArm!) / 1000; // kN * mm -> kN·m
    expect(Math.abs(produit - r.M_Rd_magnitude) / r.M_Rd_magnitude).toBeLessThan(1e-3);
  });

  it('forme du diagramme d interaction : la capacite croit puis decroit avec N', () => {
    // Signature de toute section en beton arme sous flexion composee : a
    // faible effort normal, la section est sous-comprimee (l'axe neutre est
    // proche de la fibre tendue) et ajouter de la compression eloigne l'axe
    // neutre, ce qui AUGMENTE le bras de levier interne et donc M_Rd. Au-dela
    // du point d'equilibre (balanced point), le beton comprime s'epuise avant
    // que l'acier tendu ait plastifie : ajouter encore de la compression ne
    // fait plus que reduire la reserve de flexion, et M_Rd chute. Le diagramme
    // d'interaction (N, M_Rd) est donc en cloche, pas monotone.
    const section = poteauCarre();
    const direction = { My: 1, Mz: 1 };

    const m0 = verifyBiaxial(section, { N: 0, ...direction }, profile).M_Rd_magnitude;
    const m600 = verifyBiaxial(section, { N: 600, ...direction }, profile).M_Rd_magnitude;
    const m1200 = verifyBiaxial(section, { N: 1200, ...direction }, profile).M_Rd_magnitude;
    const m2400 = verifyBiaxial(section, { N: 2400, ...direction }, profile).M_Rd_magnitude;

    expect(m1200).toBeGreaterThan(m600);
    expect(m600).toBeGreaterThan(m0);
    expect(m2400).toBeLessThan(m1200);
  });

  it('ordre de grandeur : la flexion diagonale a 45 deg est moins efficace que la flexion droite', () => {
    // A effort normal egal, la zone comprimee en flexion diagonale est un
    // triangle (coin du poteau), moins efficace qu'une bande rectangulaire
    // pleine largeur en flexion droite : la capacite doit donc etre
    // strictement inferieure a celle du solveur droit, mais rester du meme
    // ordre de grandeur (pas effondree). Bornes larges et deliberement non
    // resserrees sur la valeur observee : ce sont des garde-fous
    // d'ordre de grandeur, pas des valeurs de reference.
    const section = poteauCarre();
    const droit = verifyUniaxial(section, { N: 600, M: 0 }, profile);
    const diagonal = verifyBiaxial(section, { N: 600, My: 1, Mz: 1 }, profile);

    const ratio = diagonal.M_Rd_magnitude / droit.M_Rd;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(1.0);
  });

  it('controle de residu : la colinearite tient sur tous les cas de sollicitation testes', () => {
    // Preuve que le controle du residu ajoute a l'acceptation d'une racine
    // (echantillon ou sortie d'illinois) empeche effectivement toute racine
    // non convergee de fuiter jusqu'a l'appelant : sur chacun des cas deja
    // couverts par ce fichier (45 deg, les quatre directions cardinales,
    // N = 0), la colinearite mesuree ici est independante des tolerances
    // internes du solveur — elle est recalculee depuis le resultat public.
    const section = poteauCarre();
    const cas: Array<{ N: number; My: number; Mz: number }> = [
      { N: 600, My: 1, Mz: 1 }, // 45 deg
      { N: 600, My: 1, Mz: 0 }, // cardinal +y
      { N: 600, My: 0, Mz: 1 }, // cardinal +z
      { N: 600, My: -1, Mz: 0 }, // cardinal -y
      { N: 600, My: 0, Mz: -1 }, // cardinal -z
      { N: 0, My: 1, Mz: 1 }, // N = 0
      { N: 400, My: 3, Mz: -2 }, // colineaire
      { N: 800, My: 1, Mz: 0 }, // non-regression
    ];

    for (const action of cas) {
      const r = verifyBiaxial(section, action, profile);
      assertColinear(r, action);
    }
  });
});
