import { describe, it, expect } from 'vitest';
import { verifyDetailing } from '../../src/detailing/verify-detailing';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

const AIRE_HA20 = Math.PI * 10 ** 2;

/** Poutre 300x500, `n` HA20 en fibre inferieure. */
function poutre(n: number) {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete,
    rebars: [{ depthFromTop: 450, area: n * AIRE_HA20, steel }],
  });
}

const CADRES_COURANTS = { asw: 2 * Math.PI * 4 ** 2, s: 200, fywk: 500 };

describe('verifyDetailing', () => {
  it('conclut favorablement sur une poutre correctement armee', () => {
    const r = verifyDetailing(poutre(3), 'beam', { web: CADRES_COURANTS });

    expect(r.longitudinal.ok).toBe(true);
    expect(r.web.ok).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('signale une poutre sous-armee', () => {
    // Un seul HA8 : tres en dessous du minimum du §9.2.1.1.
    const maigre = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ depthFromTop: 450, area: Math.PI * 4 ** 2, steel }],
    });
    const r = verifyDetailing(maigre, 'beam', { web: CADRES_COURANTS });

    expect(r.longitudinal.underReinforced).toBe(true);
    expect(r.ok).toBe(false);
    expect(r.violations).toHaveLength(1);
    expect(r.violations[0]).toMatch(/9\.2\.1\.1/);
  });

  it('remonte les DEUX regles quand la section est sur-armee ET sans cadres', () => {
    // 0,04·Ac = 6000 mm² : 25 HA20 font 7854 mm², au-dela du maximum.
    const r = verifyDetailing(poutre(25), 'beam');

    expect(r.longitudinal.overReinforced).toBe(true);
    expect(r.web.ok).toBe(false);
    expect(r.ok).toBe(false);
    // Plusieurs regles peuvent etre enfreintes a la fois : un motif unique en
    // cacherait une.
    expect(r.violations).toHaveLength(2);
    expect(r.violations.join(' ')).toMatch(/9\.2\.1\.1/);
    expect(r.violations.join(' ')).toMatch(/9\.2\.2/);
  });

  it('le minimum d armature d ame ne s applique PAS a une dalle', () => {
    // §6.2.1(4) : dans les dalles, ou une redistribution transversale des
    // efforts est possible, le minimum d armature d ame peut etre omis.
    // L'appliquer declarerait non conformes toutes les dalles courantes, qui
    // n'en portent aucune.
    const dalle = rectangularSection({
      width: 1000,
      height: 200,
      concrete,
      rebars: [{ depthFromTop: 160, area: 6 * AIRE_HA20, steel }],
    });
    const r = verifyDetailing(dalle, 'slab');

    expect(r.web.applicable).toBe(false);
    expect(r.longitudinal.ok).toBe(true);
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });

  it('le minimum d armature d ame ne s applique PAS a un poteau', () => {
    // Les armatures transversales de poteau relevent du §9.5.3, qui porte sur
    // des diametres et des espacements, pas sur un taux rho_w.
    const poteau = rectangularSection({
      width: 400,
      height: 400,
      concrete,
      rebars: [
        { depthFromTop: 50, area: 4 * AIRE_HA20, steel },
        { depthFromTop: 350, area: 4 * AIRE_HA20, steel },
      ],
    });
    const r = verifyDetailing(poteau, 'column', { longitudinal: { NEd: 1000 } });

    expect(r.web.applicable).toBe(false);
    expect(r.ok).toBe(true);
  });

  it('n avance aucun ferraillage : il constate, il ne prescrit pas', () => {
    const r = verifyDetailing(poutre(1), 'beam', { web: CADRES_COURANTS });
    const texte = JSON.stringify(r);

    // Aucune formulation prescriptive : le module dit ce qui manque, jamais ce
    // qu'il faut poser. La regle vient de la session 4 et elle tient.
    expect(texte).not.toMatch(/prevoir|disposer|placer|il faut poser/i);
  });
});
