import { describe, it, expect } from 'vitest';
import { minimumRestraintArea, thicknessFactor } from '../../src/detailing/restraint';
import { rectangularSection } from '../../src/geometry/rectangle';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile); // f_ctm = 2,565 MPa
const steel = createSteel(500, 200000, profile);

/** Voile de `h` mm d'epaisseur, 1 m de developpe, deux nappes a 50 mm du parement. */
function voile(h: number) {
  return rectangularSection({
    width: 1000,
    height: h,
    concrete,
    rebars: [
      { depthFromTop: 50, area: 1000, steel },
      { depthFromTop: h - 50, area: 1000, steel },
    ],
  });
}

describe('facteur d epaisseur k (§7.3.2(2))', () => {
  it('vaut 1,0 jusqu a 300 mm et 0,65 a partir de 800 mm', () => {
    expect(thicknessFactor(200)).toBeCloseTo(1.0, 12);
    expect(thicknessFactor(300)).toBeCloseTo(1.0, 12);
    expect(thicknessFactor(800)).toBeCloseTo(0.65, 12);
    expect(thicknessFactor(1500)).toBeCloseTo(0.65, 12);
  });

  it('interpole lineairement entre les deux', () => {
    // A mi-chemin de 300 et 800, soit 550 mm : (1,0 + 0,65) / 2 = 0,825.
    expect(thicknessFactor(550)).toBeCloseTo(0.825, 12);
  });

  it('decroit avec l epaisseur — c est tout le sens du facteur', () => {
    // Les contraintes d auto-equilibre se developpent d autant moins qu une
    // piece est epaisse : un element massif exige RELATIVEMENT moins d acier.
    expect(thicknessFactor(400)).toBeLessThan(thicknessFactor(300));
    expect(thicknessFactor(700)).toBeLessThan(thicknessFactor(400));
  });
});

describe('minimumRestraintArea — zone tendue entiere (EN 1992-1-1 §7.3.2)', () => {
  it('gene CENTREE sur un voile massif : calcul repris a la main', () => {
    const r = minimumRestraintArea(voile(1000), 'central');

    // Gene centree : toute la section est tendue avant fissuration.
    expect(r.kc).toBeCloseTo(1.0, 12);
    expect(r.k).toBeCloseTo(0.65, 12);
    expect(r.Act).toBeCloseTo(1000 * 1000, 6);
    expect(r.fctEff).toBeCloseTo(2.5649, 3);
    expect(r.sigmaS).toBeCloseTo(500, 12);

    // A_s,min = kc · k · f_ct,eff · A_ct / sigma_s
    const attendu = (1.0 * 0.65 * 2.5649 * 1e6) / 500;
    expect(r.AsMin).toBeCloseTo(attendu, 0);
    expect(r.massive).toBe(true);
  });

  it('gene de FLEXION : kc = 0,4 et seule la moitie de la section est tendue', () => {
    const r = minimumRestraintArea(voile(1000), 'bending');

    expect(r.kc).toBeCloseTo(0.4, 12);
    // Section non fissuree symetrique : l axe neutre est a mi-hauteur.
    expect(r.Act).toBeCloseTo((1000 * 1000) / 2, 6);
    expect(r.AsMin).toBeCloseTo((0.4 * 0.65 * 2.5649 * 0.5e6) / 500, 0);
  });

  it('un voile mince exige RELATIVEMENT plus d acier qu un voile massif', () => {
    // Comparaison a aire de beton egale : c est le facteur k qui parle.
    const mince = minimumRestraintArea(voile(250), 'central');
    const massif = minimumRestraintArea(voile(1000), 'central');

    expect(mince.AsMin / mince.Act).toBeGreaterThan(massif.AsMin / massif.Act);
  });

  it('la compression reduit kc en flexion (eq. 7.2)', () => {
    const sans = minimumRestraintArea(voile(1000), 'bending');
    const avec = minimumRestraintArea(voile(1000), 'bending', { NEd: 2000 });

    expect(avec.kc).toBeLessThan(sans.kc);
    expect(avec.AsMin).toBeLessThan(sans.AsMin);
  });

  it('la resistance a la traction au JEUNE AGE est decisive et se parametre', () => {
    // Le Zwang des elements massifs vient de la chaleur d hydratation : la
    // fissuration survient alors que le beton n a pas atteint f_ctm a 28 jours.
    // Prendre f_ctm par defaut SURESTIME donc l acier necessaire.
    const jeune = minimumRestraintArea(voile(1000), 'central', { fctEff: 1.5 });
    const vingtHuit = minimumRestraintArea(voile(1000), 'central');

    expect(jeune.fctEff).toBeCloseTo(1.5, 12);
    expect(jeune.AsMin).toBeLessThan(vingtHuit.AsMin);
  });

  it('une contrainte d acier limitee augmente l acier exige', () => {
    // sigma_s se limite pour respecter une ouverture de fissure visee
    // (tableaux 7.2N/7.3N) : plus elle baisse, plus il faut d acier.
    const limite = minimumRestraintArea(voile(1000), 'central', { sigmaS: 200 });
    const pleine = minimumRestraintArea(voile(1000), 'central');

    expect(limite.AsMin).toBeCloseTo(pleine.AsMin * (500 / 200), 6);
  });
});

describe('minimumRestraintArea — zone EFFICACE, pratique des elements massifs', () => {
  it('reduit fortement l acier exige sur une piece epaisse', () => {
    // Sur un element massif, seule une peau participe reellement a la
    // maitrise de l ouverture des fissures : la retenir divise l acier par
    // plusieurs, ce qui est tout l enjeu du dimensionnement au Zwang.
    const entiere = minimumRestraintArea(voile(1000), 'central');
    const efficace = minimumRestraintArea(voile(1000), 'central', { effectiveZoneOnly: true });

    expect(efficace.basis).toBe('zone-efficace');
    expect(efficace.Act).toBeLessThan(entiere.Act);
    expect(efficace.AsMin).toBeLessThan(entiere.AsMin / 2);
  });

  it('ne change presque rien sur une piece mince, ou la peau est toute la piece', () => {
    // h = 200 : h_c,ef plafonne a h/2 sur chaque face, donc la zone efficace
    // couvre toute la section. C est la borne de completude du §7.3.2(3).
    const entiere = minimumRestraintArea(voile(200), 'central');
    const efficace = minimumRestraintArea(voile(200), 'central', { effectiveZoneOnly: true });

    expect(efficace.Act).toBeCloseTo(entiere.Act, 6);
  });

  it('refuse une geometrie non rectangulaire plutot que de l approximer', () => {
    const pieu = circularSection({
      diameter: 800,
      concrete,
      segments: 32,
      rebars: circularRebarCage({ diameter: 800, cover: 50, barDiameter: 20, count: 10, steel }),
    });

    expect(() => minimumRestraintArea(pieu, 'central')).toThrow(/rectangulaire/i);
  });
});
