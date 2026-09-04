import { describe, it, expect } from 'vitest';
import { verifyServiceUniaxial } from '../../src/service/verify-service';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function poutre() {
  const As = 3 * (Math.PI * 20 ** 2) / 4;
  return rectangularSection({
    width: 300, height: 500, concrete,
    rebars: [{ depthFromTop: 450, area: As, steel }],
  });
}

describe('verifyServiceUniaxial', () => {
  it('flexion simple : les contraintes sont positives et l axe neutre est dans la section', () => {
    const r = verifyServiceUniaxial(poutre(), { N: 0, M: 100 });

    expect(r.converged).toBe(true);
    expect(r.sigmaC).toBeGreaterThan(0);
    expect(r.sigmaS).toBeGreaterThan(0);
    expect(r.neutralAxisZ).toBeGreaterThan(-250);
    expect(r.neutralAxisZ).toBeLessThan(250);
  });

  it('LINEARITE : doubler le moment double les contraintes sans deplacer l axe neutre', () => {
    // Signature du comportement elastique. Un solveur qui deplacerait l'axe
    // neutre en flexion simple sous un moment double serait faux, et aucun
    // test de valeur unique ne le verrait.
    const simple = verifyServiceUniaxial(poutre(), { N: 0, M: 100 });
    const double = verifyServiceUniaxial(poutre(), { N: 0, M: 200 });

    expect(double.neutralAxisZ).toBeCloseTo(simple.neutralAxisZ, 9);
    expect(double.sigmaC / simple.sigmaC).toBeCloseTo(2, 9);
    expect(double.sigmaS / simple.sigmaS).toBeCloseTo(2, 9);
  });

  it('un coefficient d equivalence plus grand abaisse l axe neutre et charge l acier', () => {
    // CORRECTION (voir rapport) : le plan attendait haut.sigmaS < bas.sigmaS,
    // mais le recalcul ferme (x, z = d-x/3, sigmaS = M/(As*z)) donne
    // sigmaS(n=10) = 262,989 MPa et sigmaS(n=20) = 272,789 MPa. Un n plus
    // grand approfondit l'axe neutre (x plus grand), ce qui REDUIT le bras
    // de levier z = d - x/3 et donc AUGMENTE la contrainte acier a moment
    // constant — coherent avec « charge l'acier » du titre du test. La
    // formule etait inversee, corrigee ici sans toucher au solveur.
    const bas = verifyServiceUniaxial(poutre(), { N: 0, M: 100 }, { n: 10 });
    const haut = verifyServiceUniaxial(poutre(), { N: 0, M: 100 }, { n: 20 });

    expect(haut.neutralAxisZ).toBeGreaterThan(bas.neutralAxisZ);
    expect(haut.sigmaS).toBeGreaterThan(bas.sigmaS);
  });

  it('un effort normal de compression remonte l axe neutre', () => {
    const sansN = verifyServiceUniaxial(poutre(), { N: 0, M: 100 });
    const avecN = verifyServiceUniaxial(poutre(), { N: 200, M: 100 });

    expect(avecN.converged).toBe(true);
    expect(avecN.neutralAxisZ).toBeGreaterThan(sansN.neutralAxisZ);
  });

  it('CONTINUITE : la branche N nul et la branche N tres petit convergent au meme endroit', () => {
    // Le piege de cette session : deux formulations distinctes qui devraient
    // se rejoindre. Si elles divergent, l'une des deux est fausse.
    const nul = verifyServiceUniaxial(poutre(), { N: 0, M: 100 });
    const presqueNul = verifyServiceUniaxial(poutre(), { N: 1e-6, M: 100 });

    expect(presqueNul.neutralAxisZ).toBeCloseTo(nul.neutralAxisZ, 4);
    expect(presqueNul.sigmaC).toBeCloseTo(nul.sigmaC, 4);
  });

  it('section entierement comprimee : non convergence annoncee, jamais un chiffre trompeur', () => {
    // L'hypothese de fissuration est alors caduque : c'est la section NON
    // fissuree qui s'applique, et ce module ne la couvre pas.
    const r = verifyServiceUniaxial(poutre(), { N: 5000, M: 1 });

    expect(r.converged).toBe(false);
    expect(r.reason).toMatch(/comprimee/i);
    expect(Number.isNaN(r.sigmaC)).toBe(true);
  });

  it('verdict : sous les limites, la section est verifiee', () => {
    const r = verifyServiceUniaxial(poutre(), { N: 0, M: 50 });

    expect(r.ok).toBe(true);
    expect(r.reason).toBeUndefined();
    expect(r.sigmaCLimit).toBeCloseTo(0.6 * 25, 9);
    expect(r.sigmaSLimit).toBeCloseTo(0.8 * 500, 9);
  });

  it('verdict : le motif distingue le depassement beton du depassement acier', () => {
    const acier = verifyServiceUniaxial(poutre(), { N: 0, M: 160 });
    expect(acier.ok).toBe(false);
    expect(acier.reason).toMatch(/acier/i);

    // Limites resserrees pour forcer le depassement beton seul.
    const beton = verifyServiceUniaxial(poutre(), { N: 0, M: 100 }, {
      limits: { k1: 0.2, k3: 0.8 },
    });
    expect(beton.ok).toBe(false);
    expect(beton.reason).toMatch(/beton/i);
  });

  it('les limites sont parametrables', () => {
    const r = verifyServiceUniaxial(poutre(), { N: 0, M: 50 }, {
      limits: { k1: 0.45, k3: 0.7 },
    });

    expect(r.sigmaCLimit).toBeCloseTo(0.45 * 25, 9);
    expect(r.sigmaSLimit).toBeCloseTo(0.7 * 500, 9);
  });
});
