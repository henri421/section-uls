import { describe, it, expect } from 'vitest';
import {
  FCTM_PAR_CLASSE,
  facteurContraintesPropres,
  meyerRestraintReinforcement,
  choixDeBarres,
} from '../../src/detailing/meyer-restraint';
import type { MeyerParams } from '../../src/detailing/meyer-restraint';

/**
 * Valeurs de reference du document de specification fourni par l'utilisateur
 * (methode G. et R. Meyer, « Rissbreitenbeschraenkung nach DIN 1045 »,
 * chapitre 1), §9. Elles ont ete RECALCULEES A LA MAIN avant d'etre inscrites
 * ici : les huit concordent. Ce ne sont donc pas des valeurs ajustees sur
 * l'implementation, mais une reference externe.
 *
 * Tolerance du document : +/- 1 mm².
 */
const TOLERANCE = 1;

/** Parametres communs du §9 : d1 = 40, ds = 16, wk = 0,3, C30/37, k lineaire. */
function cas(surcharge: Partial<MeyerParams>): MeyerParams {
  return {
    h: 1300,
    d1: 40,
    ds: 16,
    wk: 0.3,
    fctm: 2.9,
    kzt: 0.5,
    cas: 'traction',
    bridage: 'exterieur',
    ...surcharge,
  };
}

describe('table des classes de beton (tableau 1.2)', () => {
  it('porte les dix classes du document', () => {
    expect(FCTM_PAR_CLASSE['C20/25']).toBe(2.2);
    expect(FCTM_PAR_CLASSE['C30/37']).toBe(2.9);
    expect(FCTM_PAR_CLASSE['C50/60']).toBe(4.1);
    expect(FCTM_PAR_CLASSE['C70/85']).toBe(4.6);
    expect(Object.keys(FCTM_PAR_CLASSE)).toHaveLength(10);
  });
});

describe('facteur k de contraintes propres', () => {
  it('mode lineaire : 0,8 jusqu a 300 mm, 0,5 a partir de 800 mm', () => {
    expect(facteurContraintesPropres(200, 'lineaire')).toBeCloseTo(0.8, 12);
    expect(facteurContraintesPropres(300, 'lineaire')).toBeCloseTo(0.8, 12);
    expect(facteurContraintesPropres(800, 'lineaire')).toBeCloseTo(0.5, 12);
    expect(facteurContraintesPropres(1300, 'lineaire')).toBeCloseTo(0.5, 12);
  });

  it('mode lineaire : interpolation entre 300 et 800', () => {
    // h = 400 : 0,8 - (100/500)*0,3 = 0,74
    expect(facteurContraintesPropres(400, 'lineaire')).toBeCloseTo(0.74, 12);
    // h = 550, a mi-chemin : 0,8 - (250/500)*0,3 = 0,65
    expect(facteurContraintesPropres(550, 'lineaire')).toBeCloseTo(0.65, 12);
  });

  it('mode parabolique : meme depart, plancher repousse a 1000 mm', () => {
    expect(facteurContraintesPropres(300, 'parabolique')).toBeCloseTo(0.8, 12);
    expect(facteurContraintesPropres(1000, 'parabolique')).toBeCloseTo(0.5, 12);
    // h = 500 : 0,5 + 0,612*(1 - 0,5)^2 = 0,653
    expect(facteurContraintesPropres(500, 'parabolique')).toBeCloseTo(0.653, 12);
  });

  it('les deux modes different entre 300 et 1000 mm', () => {
    expect(facteurContraintesPropres(600, 'parabolique')).not.toBeCloseTo(
      facteurContraintesPropres(600, 'lineaire'),
      3
    );
  });
});

describe('meyerRestraintReinforcement — cas de reference du §9', () => {
  it('cas principal : traction, bridage exterieur, kzt = 0,5, h = 1300', () => {
    const r = meyerRestraintReinforcement(cas({}));

    expect(r.fctEff).toBeCloseTo(1.45, 12);
    expect(r.k).toBeCloseTo(0.5, 12);
    expect(r.kc).toBeCloseTo(1.0, 12);
    expect(r.Acr).toBeCloseTo(100000, 6);
    expect(r.AcFace).toBeCloseTo(650000, 6);
    expect(r.hGrenz).toBeCloseTo(400, 9);
    expect(r.regime).toBe('fissuration-achevee');

    expect(r.AsFace).toBeCloseTo(1749.6, 0);
    expect(Math.abs(r.AsFace - 1749.6)).toBeLessThan(TOLERANCE);
    // Traction centree : une nappe par face, donc le double au total.
    expect(r.AsTotal).toBeCloseTo(3499.2, 0);
  });

  it('meme configuration en bridage INTERIEUR', () => {
    const r = meyerRestraintReinforcement(cas({ bridage: 'interieur' }));

    expect(r.regime).toBe('interieur');
    expect(Math.abs(r.AsFace - 802.8)).toBeLessThan(TOLERANCE);
  });

  it('le bridage interieur est quasi insensible a l epaisseur', () => {
    // L'effort ne vient que de la peau : As ne depend de h que par le plafond
    // de Acr, qui ne mord que sur les pieces minces.
    const mince = meyerRestraintReinforcement(cas({ bridage: 'interieur', h: 800 }));
    const epais = meyerRestraintReinforcement(cas({ bridage: 'interieur', h: 2000 }));

    expect(mince.AsFace).toBeCloseTo(epais.AsFace, 6);
  });

  it('abaque traction / exterieur / kzt = 0,5 / phi 16', () => {
    const attendu: Array<[number, number]> = [
      [400, 1077.0],
      [800, 1310.9],
      [1300, 1749.6],
      [1600, 1966.4],
    ];

    for (const [h, As] of attendu) {
      const r = meyerRestraintReinforcement(cas({ h }));
      expect(Math.abs(r.AsFace - As)).toBeLessThan(TOLERANCE);
    }
  });

  it('les autres familles a h = 1300', () => {
    // Gene centree exterieure a 28 jours.
    const centree28 = meyerRestraintReinforcement(cas({ kzt: 1.0 }));
    expect(Math.abs(centree28.AsFace - 2474.3)).toBeLessThan(TOLERANCE);

    // Biegezwang de chaleur d hydratation.
    const flexionHydratation = meyerRestraintReinforcement(cas({ cas: 'flexion' }));
    expect(Math.abs(flexionHydratation.AsFace - 983.2)).toBeLessThan(TOLERANCE);
    // Une seule face tendue en flexion : pas de doublement.
    expect(flexionHydratation.AsTotal).toBeCloseTo(flexionHydratation.AsFace, 9);

    // Biegezwang exterieur a 28 jours.
    const flexion28 = meyerRestraintReinforcement(cas({ cas: 'flexion', kzt: 1.0 }));
    expect(Math.abs(flexion28.AsFace - 1390.4)).toBeLessThan(TOLERANCE);
  });
});

describe('regime de fissuration', () => {
  it('une piece mince en bridage exterieur reste en FISSURE UNIQUE', () => {
    // h_grenz = 5*d1/k. Avec d1 = 60 et h = 250 (k = 0,8), h_grenz = 375 > 250.
    const r = meyerRestraintReinforcement(cas({ h: 250, d1: 60 }));
    expect(r.regime).toBe('fissure-unique');
  });

  it('les elements massifs courants sont en FISSURATION ACHEVEE', () => {
    // Remarque du §5 : h_grenz vaut 30 a 50 cm en traction, donc le regime est
    // presque toujours celui-ci des que la piece est massive.
    for (const h of [600, 1000, 1500, 2500]) {
      expect(meyerRestraintReinforcement(cas({ h })).regime).toBe('fissuration-achevee');
    }
  });

  it('en flexion, la bascule se fait beaucoup plus tard (12,5 au lieu de 5)', () => {
    const traction = meyerRestraintReinforcement(cas({ h: 1300 }));
    const flexion = meyerRestraintReinforcement(cas({ h: 1300, cas: 'flexion' }));

    expect(flexion.hGrenz).toBeCloseTo(2.5 * traction.hGrenz, 9);
  });
});

describe('domaines refuses', () => {
  it('le garde-fou du terme negatif est INATTEIGNABLE par le chemin normal', () => {
    // Resultat etabli en ecrivant ce test, et contraire a ce que laissait
    // croire le pseudo-code de la specification : la selection de regime
    // interdit d'atteindre le cas negatif.
    //
    // Demonstration, en traction : le regime « fissuration achevee » exige
    // h >= h_grenz = 5·d1/k, donc d1 <= k·h/5. Il s'ensuit 2,5·d1 <= 0,5·k·h,
    // qui reste sous le plafond h/2, donc A_cr = 2,5·d1·b. Le terme vaut
    // alors k·A_c,face − 0,4·A_cr = 0,5·k·h·b − d1·b, positif des que
    // d1 < 0,5·k·h — or on vient d'etablir d1 <= 0,2·k·h. Meme raisonnement
    // en flexion, avec 12,5 au lieu de 5.
    //
    // Le garde-fou est CONSERVE malgre tout : il ne coute rien et protegerait
    // un appel futur qui contournerait la selection de regime.
    for (const h of [400, 600, 900, 1300, 2000, 3000]) {
      for (const d1 of [25, 40, 60, 80, 120]) {
        for (const nature of ['traction', 'flexion'] as const) {
          const r = meyerRestraintReinforcement(cas({ h, d1, cas: nature }));
          expect(Number.isFinite(r.AsFace)).toBe(true);
          expect(r.AsFace).toBeGreaterThan(0);
        }
      }
    }
  });

  it('refuse une epaisseur ou un diametre absurdes plutot que de rendre NaN', () => {
    expect(() => meyerRestraintReinforcement(cas({ h: 0 }))).toThrow();
    expect(() => meyerRestraintReinforcement(cas({ ds: 0 }))).toThrow();
    expect(() => meyerRestraintReinforcement(cas({ wk: 0 }))).toThrow();
  });
});

describe('choixDeBarres', () => {
  it('reprend l exemple du §9', () => {
    const c = choixDeBarres(1749.6, 16);

    expect(c.aireBarre).toBeCloseTo(201.06, 2);
    expect(c.nParMetre).toBe(9);
    expect(c.espacement).toBeCloseTo(1000 / 9, 6);
    expect(c.AsFournie).toBeCloseTo(1809.6, 1);
  });

  it('arrondit TOUJOURS vers le haut : l acier fourni couvre l acier requis', () => {
    for (const As of [100, 405, 1000, 1749.6, 3000]) {
      const c = choixDeBarres(As, 16);
      expect(c.AsFournie).toBeGreaterThanOrEqual(As);
    }
  });
});
