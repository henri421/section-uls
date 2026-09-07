import { describe, it, expect } from 'vitest';
import { crackingState, verifyServiceState } from '../../src/service/cracking-state';
import { verifyServiceUniaxial } from '../../src/service/verify-service';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete, fctmDepuisFck } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profil = ec2Recommended();
const beton = createConcrete(25, profil);
const acier = createSteel(500, 200000, profil);

/**
 * Poutre 300 × 500, C25/30, 3 HA16 en fibre inferieure a 205 mm du
 * centroide (enrobage d'axe 45 mm).
 */
function poutre() {
  const As = 3 * ((Math.PI * 16 ** 2) / 4); // 603,19 mm²
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: [{ y: 0, z: 205, area: As, steel: acier }],
  });
}

describe('crackingState — critere du §7.1(2)', () => {
  /**
   * RECALCUL A LA MAIN, section homogeneisee non fissuree, n = 15 :
   *
   *   A_s        = 3 · π·16²/4                    =    603,19 mm²
   *   (n−1)·A_s  = 14 · 603,19                    =   8 444,6 mm²
   *   A          = 300·500 + 8 444,6              = 158 444,6 mm²
   *   S          = 8 444,6 · 205                  = 1 731 143 mm³
   *   z_G        = S / A                          =     10,93 mm
   *   I(z=0)     = 300·500³/12 + 8 444,6·205²     = 3 479,9·10⁶ mm⁴
   *   I₀         = I − A·z_G²                     = 3 461,0·10⁶ mm⁴
   *   f_ctm      = 0,30·25^(2/3)                  =      2,565 MPa
   *   M_cr       = I₀·f_ctm / (250 − z_G)         =     37,13 kN·m
   */
  it('rend le moment de fissuration de la section homogeneisee', () => {
    const resultat = crackingState(poutre(), { N: 0, M: 20 });

    expect(resultat.uncracked.zG).toBeCloseTo(10.93, 1);
    expect(resultat.uncracked.I / 1e6).toBeCloseTo(3461.0, 0);
    expect(resultat.fctEff).toBeCloseTo(2.565, 3);
    expect(resultat.Mcr).not.toBeNull();
    expect(resultat.Mcr!).toBeCloseTo(37.13, 1);
    expect(resultat.McrReason).toBeNull();
  });

  it('sous le moment de fissuration, la section est NON fissuree', () => {
    const resultat = crackingState(poutre(), { N: 0, M: 30 });

    expect(resultat.state).toBe('uncracked');
    expect(resultat.criterionState).toBe('uncracked');
    expect(resultat.forced).toBe(false);
    expect(resultat.uncracked.sigmaCt).toBeLessThan(resultat.fctEff);
    expect(resultat.uncracked.tensionFibre).toBe('bottom');
  });

  it('au-dela, elle est fissuree', () => {
    const resultat = crackingState(poutre(), { N: 0, M: 45 });

    expect(resultat.state).toBe('cracked');
    expect(resultat.uncracked.sigmaCt).toBeGreaterThan(resultat.fctEff);
  });

  /** Le critere et le moment de fissuration doivent designer le MEME point. */
  it('au moment de fissuration exactement, la traction extreme vaut f_ct,eff', () => {
    const Mcr = crackingState(poutre(), { N: 0, M: 20 }).Mcr!;
    const auSeuil = crackingState(poutre(), { N: 0, M: Mcr });

    expect(auSeuil.uncracked.sigmaCt).toBeCloseTo(fctmDepuisFck(25), 6);
  });

  /**
   * SIGNE, piege principal du module : un moment POSITIF comprime la fibre
   * SUPERIEURE (l'integrateur compte le moment avec un bras `−z`). La face
   * tendue est donc la fibre inferieure, et elle s'inverse avec le moment.
   */
  it('un moment negatif tend la fibre superieure', () => {
    const positif = crackingState(poutre(), { N: 0, M: 30 });
    const negatif = crackingState(poutre(), { N: 0, M: -30 });

    expect(positif.uncracked.tensionFibre).toBe('bottom');
    expect(positif.uncracked.sigmaCTop).toBeGreaterThan(0);

    expect(negatif.uncracked.tensionFibre).toBe('top');
    expect(negatif.uncracked.sigmaCBottom).toBeGreaterThan(0);
    expect(negatif.Mcr!).toBeLessThan(0);
  });

  it('une compression retarde la fissuration, une traction l avance', () => {
    const sansEffort = crackingState(poutre(), { N: 0, M: 20 }).Mcr!;
    const comprime = crackingState(poutre(), { N: 300, M: 20 }).Mcr!;
    const tendu = crackingState(poutre(), { N: -100, M: 20 }).Mcr!;

    expect(comprime).toBeGreaterThan(sansEffort);
    expect(tendu).toBeLessThan(sansEffort);
  });

  /**
   * Quand l'effort normal fissure deja seul, `M_cr` serait calculable et
   * trompeur : la fissuration ne depend alors pas du moment.
   */
  it('refuse un moment de fissuration quand l effort normal fissure deja seul', () => {
    // Traction centree amenant sigma bien au-dela de f_ctm.
    const resultat = crackingState(poutre(), { N: -600, M: 0 });

    expect(resultat.state).toBe('cracked');
    expect(resultat.Mcr).toBeNull();
    expect(resultat.McrReason).toMatch(/effort normal seul/);
  });

  it('forcer un etat le retient et le signale', () => {
    const force = crackingState(poutre(), { N: 0, M: 45 }, { mode: 'uncracked' });

    expect(force.criterionState).toBe('cracked');
    expect(force.state).toBe('uncracked');
    expect(force.forced).toBe(true);

    // Forcer l'etat que le critere designe deja n'est pas un forcage.
    const conforme = crackingState(poutre(), { N: 0, M: 45 }, { mode: 'cracked' });
    expect(conforme.forced).toBe(false);
  });

  it('une f_ct,eff plus faible avance la fissuration', () => {
    const aVingtHuitJours = crackingState(poutre(), { N: 0, M: 30 });
    const auJeuneAge = crackingState(poutre(), { N: 0, M: 30 }, { fctEff: 1.5 });

    expect(aVingtHuitJours.state).toBe('uncracked');
    expect(auJeuneAge.state).toBe('cracked');
    expect(auJeuneAge.Mcr!).toBeLessThan(aVingtHuitJours.Mcr!);
  });
});

describe('verifyServiceState — les limites du §7.2 sur l etat retenu', () => {
  /**
   * CE QUE LE MODULE CORRIGE. `verifyServiceUniaxial` suppose toujours la
   * section fissuree ; sur une section qui ne fissure pas, cela reporte
   * toute la traction sur les armatures et surestime `sigma_s`.
   */
  it('en etat I, sigma_s est bien plus faible qu en etat II', () => {
    const section = poutre();
    const action = { N: 0, M: 30 };

    const retenu = verifyServiceState(section, action);
    const etatII = verifyServiceUniaxial(section, action);

    expect(retenu.cracking.state).toBe('uncracked');
    expect(retenu.cracked).toBeNull();
    expect(retenu.sigmaS).toBeLessThan(etatII.sigmaS);
    expect(retenu.converged).toBe(true);
  });

  it('en etat II, il delegue a la methode n et rend son resultat', () => {
    const section = poutre();
    const action = { N: 0, M: 120 };

    const retenu = verifyServiceState(section, action);
    const etatII = verifyServiceUniaxial(section, action);

    expect(retenu.cracking.state).toBe('cracked');
    expect(retenu.cracked).not.toBeNull();
    expect(retenu.sigmaS).toBeCloseTo(etatII.sigmaS, 6);
    expect(retenu.sigmaC).toBeCloseTo(etatII.sigmaC, 6);
  });

  it('applique les limites k1·fck et k3·fyk et conclut', () => {
    const resultat = verifyServiceState(poutre(), { N: 0, M: 30 });

    expect(resultat.sigmaCLimit).toBeCloseTo(0.6 * 25, 9);
    expect(resultat.sigmaSLimit).toBeCloseTo(0.8 * 500, 9);
    expect(resultat.ok).toBe(true);
    expect(resultat.reason).toBeUndefined();
  });

  /**
   * L'etat I comble un angle mort : la methode n REFUSE la section
   * entierement comprimee, faute d'axe neutre. La forme fermee de l'etat I,
   * elle, la traite sans difficulte.
   */
  it('traite la section entierement comprimee, que la methode n refuse', () => {
    const section = poutre();
    const action = { N: 1500, M: 10 };

    expect(verifyServiceUniaxial(section, action).converged).toBe(false);

    const retenu = verifyServiceState(section, action);
    expect(retenu.cracking.state).toBe('uncracked');
    expect(retenu.converged).toBe(true);
    expect(retenu.cracking.uncracked.sigmaCt).toBe(0);
    expect(retenu.cracking.uncracked.tensionFibre).toBeNull();
    expect(retenu.cracking.uncracked.neutralAxisZ).toBeNull();
    expect(retenu.sigmaS).toBe(0);
  });
});
