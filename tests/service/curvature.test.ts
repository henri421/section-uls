import { describe, it, expect } from 'vitest';
import { sectionCurvature } from '../../src/service/curvature';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poutre() {
  return rectangularSection({
    width: 300, height: 500, concrete,
    rebars: rectangularRebarLayout({
      width: 300, height: 500, cover: 30, stirrupDiameter: 8, steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    }).bars,
  });
}

describe('sectionCurvature', () => {
  it('sous le moment de fissuration, la section n est pas fissuree', () => {
    const r = sectionCurvature(poutre(), { N: 0, M: 20 });

    expect(r.converged).toBe(true);
    expect(r.cracked).toBe(false);
    expect(r.zeta).toBe(0);
    expect(r.curvatureCracked).toBeNull();
    expect(r.curvature).toBeCloseTo(r.curvatureUncracked, 12);
  });

  it('au-dela, la section fissure et l interpolation demarre', () => {
    const r = sectionCurvature(poutre(), { N: 0, M: 100 });

    expect(r.cracked).toBe(true);
    expect(r.zeta).toBeGreaterThan(0);
    expect(r.zeta).toBeLessThan(1);
    expect(r.curvatureCracked).not.toBeNull();
  });

  it('ENCADREMENT : la courbure interpolee reste entre les deux etats', () => {
    // Propriete structurelle de l'interpolation. Un test qui ne peut pas
    // passer par hasard : il faut vraiment que zeta soit dans [0,1] et que
    // la combinaison soit convexe.
    for (const M of [45, 60, 100, 200, 400]) {
      const r = sectionCurvature(poutre(), { N: 0, M });
      expect(r.curvatureCracked).not.toBeNull();
      expect(r.curvature).toBeGreaterThanOrEqual(r.curvatureUncracked);
      expect(r.curvature).toBeLessThanOrEqual(r.curvatureCracked!);
    }
  });

  it('CONTINUITE du branchement etat-I / etat-II, isolee a beta = 1', () => {
    // Ce test controle le BRANCHEMENT, pas la physique du beta.
    //
    // L'eq. 7.18 n'est continue en M_cr que pour beta = 1 : juste au-dessus
    // du moment de fissuration, M_cr/M tend vers 1 donc zeta tend vers
    // (1 - beta). Avec le defaut beta = 0,5, la courbure saute donc
    // structurellement d'un demi-ecart entre les deux etats — c'est une
    // propriete de la NORME, pas un defaut d'implementation. On fixe donc
    // beta = 1 pour isoler ce qu'on veut reellement verifier.
    const mcr = sectionCurvature(poutre(), { N: 0, M: 100 }).crackingMoment;

    const avant = sectionCurvature(poutre(), { N: 0, M: mcr * 0.999 }, { beta: 1 });
    const apres = sectionCurvature(poutre(), { N: 0, M: mcr * 1.001 }, { beta: 1 });

    expect(avant.cracked).toBe(false);
    expect(apres.cracked).toBe(true);
    const saut = Math.abs(apres.curvature - avant.curvature) / avant.curvature;
    expect(saut).toBeLessThan(1e-2);
  });

  it('le saut a M_cr avec beta = 0,5 vaut bien (1 - beta) fois l ecart des deux etats', () => {
    // Corollaire du test precedent : le saut n'est pas un accident, il est
    // previsible et se retrouve analytiquement.
    //
    // Choix de epsilon = 1e-6, et non 1e-3 comme dans le test de continuite
    // voisin : zeta = 1 - beta(M_cr/M)^2 vaut (0,5 + epsilon) au premier
    // ordre en M = M_cr(1+epsilon), pas exactement 0,5. A epsilon = 1e-3,
    // cet ecart au premier ordre (~1e-3) suffit a lui seul a deplacer la
    // courbure de ~1e-9, soit deja le double de la tolerance toBeCloseTo(9).
    // A epsilon = 1e-6, l'ecart tombe vers ~1e-12, confortablement sous le
    // seuil — sans toucher a la tolerance. Ne pas « simplifier » en revenant
    // a un epsilon plus lisible du type 1e-3 : le test redeviendrait faux.
    const mcr = sectionCurvature(poutre(), { N: 0, M: 100 }).crackingMoment;
    const apres = sectionCurvature(poutre(), { N: 0, M: mcr * (1 + 1e-6) });

    expect(apres.curvatureCracked).not.toBeNull();
    const attendu =
      0.5 * apres.curvatureCracked! + 0.5 * apres.curvatureUncracked;
    expect(apres.curvature).toBeCloseTo(attendu, 9);
  });

  it('SENS PHYSIQUE : zeta tend vers 1 quand le moment croit bien au-dela de M_cr', () => {
    const modere = sectionCurvature(poutre(), { N: 0, M: 60 });
    const eleve = sectionCurvature(poutre(), { N: 0, M: 500 });

    expect(eleve.zeta).toBeGreaterThan(modere.zeta);
    expect(eleve.zeta).toBeGreaterThan(0.99);
  });

  it('SENS PHYSIQUE : une charge de longue duree assouplit la section', () => {
    // beta traduit la duree du chargement (§7.4.3(3)) : 1,0 pour une charge
    // unique de courte duree, 0,5 pour une charge soutenue ou repetee, ou
    // l'adherence acier-beton se degrade. Un beta plus FAIBLE signifie donc
    // MOINS de participation du beton tendu, donc une courbure PLUS forte.
    //
    // Dans zeta = 1 - beta(M_cr/M)^2, un beta plus grand donne un zeta plus
    // petit, donc plus de poids a l'etat non fissure, donc une section plus
    // raide : la formule et la physique disent la meme chose.
    const courteDuree = sectionCurvature(poutre(), { N: 0, M: 100 }, { beta: 1 });
    const longueDuree = sectionCurvature(poutre(), { N: 0, M: 100 }, { beta: 0.5 });

    expect(longueDuree.curvature).toBeGreaterThan(courteDuree.curvature);
  });

  it('la raideur effective est coherente avec la courbure', () => {
    const r = sectionCurvature(poutre(), { N: 0, M: 100 });
    // EI = M / (1/r), avec M en N·mm.
    expect(r.effectiveStiffness).toBeCloseTo((100 * 1e6) / r.curvature, -6);
  });

  it('un moment nul ne fait pas diviser par zero', () => {
    const r = sectionCurvature(poutre(), { N: 0, M: 0 });

    expect(r.converged).toBe(true);
    expect(r.curvature).toBe(0);
    expect(r.cracked).toBe(false);
  });
});
