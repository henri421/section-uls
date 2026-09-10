import { describe, it, expect } from 'vitest';
import {
  minimumRestraintArea,
  thicknessFactor,
  effectiveRestraintHeight,
} from '../../src/detailing/restraint';
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

/**
 * LE DEFAUT CORRIGE : hcEff employait les branches de la FLEXION sur un
 * bridage CENTRE, ce qui sous-estimait l'armature d'environ 43 % sur un
 * radier de 1,30 m.
 */
describe('effectiveRestraintHeight — traction centree, pas flexion', () => {
  it('branche 5 a 30 sur le cas de validation', () => {
    // h/d1 = 1300/55 = 23,6 -> 0,10·h + 2·d1 = 240 mm.
    expect(effectiveRestraintHeight(1300, 55, 'central')).toBeCloseTo(240, 6);
  });

  it('la meme geometrie lue en FLEXION tombe dans une autre branche', () => {
    expect(effectiveRestraintHeight(1300, 55, 'bending')).toBeCloseTo(0.05 * 1300 + 2 * 55, 6);
  });

  it('les branches extremes', () => {
    expect(effectiveRestraintHeight(200, 50, 'central')).toBeCloseTo(100, 6); // ecrete a h/2
    expect(effectiveRestraintHeight(3000, 50, 'central')).toBeCloseTo(250, 6); // 5·d1
  });

  it('jamais plus que h/2', () => {
    expect(effectiveRestraintHeight(300, 60, 'central')).toBeLessThanOrEqual(150);
    expect(effectiveRestraintHeight(1300, 55, 'central')).toBeLessThanOrEqual(650);
  });

  it('la methode ec2 applique le texte : 2,5·d1', () => {
    expect(effectiveRestraintHeight(1300, 55, 'central', 'ec2')).toBeCloseTo(137.5, 6);
  });
});

describe('facteur d epaisseur k — les deux conventions nationales', () => {
  it('ne melange pas les bornes de l une avec la pente de l autre', () => {
    expect(thicknessFactor(1300, 'ec2')).toBeCloseTo(0.65, 9);
    expect(thicknessFactor(1300, 'de')).toBeCloseTo(0.5, 9);
    expect(thicknessFactor(200, 'ec2')).toBeCloseTo(1.0, 9);
    expect(thicknessFactor(200, 'de')).toBeCloseTo(0.8, 9);
    expect(thicknessFactor(550, 'ec2')).toBeCloseTo(1.0 - 0.5 * 0.35, 9);
    expect(thicknessFactor(550, 'de')).toBeCloseTo(0.8 - 0.5 * 0.3, 9);
  });

  it('la convention EC2 reste le defaut', () => {
    expect(thicknessFactor(1300)).toBeCloseTo(0.65, 9);
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
    //
    // C'est l'approche MINCE qui suit exactement le rapport des contraintes.
    // Le resultat RETENU, lui, est desormais borne par l'approche epaisse —
    // qui est precisement ce que la zone efficace apporte : elle empeche
    // l'acier d'exploser quand sigma_s est limitee, sans le laisser descendre
    // sous la borne anti-plastification.
    const limite = minimumRestraintArea(voile(1000), 'central', { sigmaS: 200 });
    const pleine = minimumRestraintArea(voile(1000), 'central');

    expect(limite.AsMince).toBeCloseTo(pleine.AsMince * (500 / 200), 6);
    expect(limite.AsMin).toBeGreaterThan(pleine.AsMin);
    expect(limite.AsMin).toBeLessThan(limite.AsMince);
  });
});

describe('minimumRestraintArea — les deux approches, et la plus petite retenue', () => {
  /**
   * CE QUI A CHANGE, et pourquoi. La case « zone efficace » choisissait UNE
   * approche ; la norme ne fixe pas de frontiere nette entre element mince et
   * epais. Les deux sont desormais calculees et la plus petite retenue,
   * l approche epaisse etant bornee par `k·f_ct,eff·A_ct/f_yk`.
   */
  it('rend les deux approches, la borne, et retient la plus petite', () => {
    const r = minimumRestraintArea(voile(1000), 'central');

    expect(r.AsMin).toBeCloseTo(Math.min(r.AsMince, r.AsEpais), 9);
    expect(r.AsEpais).toBeGreaterThanOrEqual(r.Borne);
    expect(['mince', 'epaisse']).toContain(r.approach);
  });

  /**
   * Avec `sigma_s = f_yk` — le defaut — la borne anti-plastification EGALE
   * l approche mince quand `k_c = 1` : `k·f_ct,eff·A_ct/f_yk` et
   * `k_c·k·f_ct,eff·A_ct/sigma_s` sont alors la meme expression. La zone
   * efficace ne mord donc QUE lorsque `sigma_s` est limitee, ce qui est
   * exactement son role — reduire l acier sans laisser la fissure s ouvrir.
   */
  it('a sigma_s = f_yk, la borne rejoint l approche mince et rien n est reduit', () => {
    const r = minimumRestraintArea(voile(1000), 'central');

    expect(r.Borne).toBeCloseTo(r.AsMince, 6);
    expect(r.AsMin).toBeCloseTo(r.AsMince, 6);
  });

  it('avec une sigma_s limitee, la zone efficace REDUIT l acier exige', () => {
    const r = minimumRestraintArea(voile(1000), 'central', { sigmaS: 200 });

    expect(r.approach).toBe('epaisse');
    expect(r.AsMin).toBeLessThan(r.AsMince);
    expect(r.AsMin).toBeCloseTo(r.AsEpais, 9);
  });

  /**
   * `k` traduit une reduction a l echelle de la SECTION ENTIERE ; l approche
   * par zone efficace raisonne sur la peau qui travaille. L y appliquer une
   * seconde fois retirerait 35 % d acier, du mauvais cote.
   */
  it('l approche epaisse ne depend NI de k NI de k_c', () => {
    const ec2 = minimumRestraintArea(voile(1000), 'central', { sigmaS: 200 });
    const de = minimumRestraintArea(voile(1000), 'central', {
      sigmaS: 200,
      thicknessConvention: 'de',
    });

    expect(de.k).toBeCloseTo(0.5, 9);
    expect(ec2.k).toBeCloseTo(0.65, 9);
    expect(de.AsEpais).toBeCloseTo(ec2.AsEpais, 6);
  });

  it('le total et la valeur par nappe sont rendus separement', () => {
    // Le facteur 2 entre les deux est la cause classique d un ecart avec une
    // feuille de calcul : aucun des deux ne doit sortir sans etre nomme.
    const r = minimumRestraintArea(voile(1000), 'central');

    expect(r.nappes).toBe(2);
    expect(r.AsMinParNappe).toBeCloseTo(r.AsMin / 2, 9);
    expect(minimumRestraintArea(voile(1000), 'bending').nappes).toBe(1);
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

/**
 * LE CAS DE VALIDATION de `SPEC_correction_Asmin_bridage.md` §7, recalcule a
 * la main de facon independante.
 *
 * Il est le CONTRAT COMMUN avec l'outil As,min de la suite : les deux
 * implementations sont separees, aucun code n'est partage, et c'est ce cas-ci
 * qui garantit qu'elles ne divergent pas.
 */
describe('cas de validation partage avec l outil As,min de la suite', () => {
  const betonC30 = createConcrete(30, profile);

  /** Radier 1300 mm, nappes a 55 mm du parement (enrobage 45 + Ø20/2). */
  function radier() {
    return rectangularSection({
      width: 1000,
      height: 1300,
      concrete: betonC30,
      rebars: [
        { depthFromTop: 55, area: 3000, steel },
        { depthFromTop: 1300 - 55, area: 3000, steel },
      ],
    });
  }

  /** f_ct,eff = k_zt · f_ctm = 0,80 × 2,8965. */
  const OPTIONS = { fctEff: 0.8 * 2.8965, sigmaS: 202.7 } as const;

  it('rend les valeurs intermediaires attendues', () => {
    const r = minimumRestraintArea(radier(), 'central', OPTIONS);

    expect(r.fctEff).toBeCloseTo(2.317, 2);
    expect(r.d1).toBeCloseTo(55, 6);
    expect(r.hcEff).toBeCloseTo(240, 0);
    expect(r.k).toBeCloseTo(0.65, 3);
    expect(r.kc).toBeCloseTo(1.0, 9);
    expect(r.Act).toBeCloseTo(1_300_000, 0);
    expect(r.AcEff).toBeCloseTo(240_000, 0);
  });

  it('rend 27,44 cm2/m par nappe, l approche epaisse gouvernant', () => {
    const r = minimumRestraintArea(radier(), 'central', OPTIONS);

    expect(r.AsMinceParNappe / 100).toBeCloseTo(48.3, 1);
    expect(r.AsEpaisParNappe / 100).toBeCloseTo(27.44, 1);
    expect(r.BorneParNappe / 100).toBeCloseTo(19.58, 1);
    expect(r.AsMinParNappe / 100).toBeCloseTo(27.44, 1);
    expect(r.approach).toBe('epaisse');
  });

  it('en convention allemande, le meme resultat est retenu', () => {
    const r = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS,
      thicknessConvention: 'de',
    });

    expect(r.k).toBeCloseTo(0.5, 9);
    expect(r.AsMinceParNappe / 100).toBeCloseTo(37.16, 1);
    expect(r.AsMinParNappe / 100).toBeCloseTo(27.44, 1);
  });

  // --- Choix de la methode ------------------------------------------------

  it('la methode ec2 applique le TEXTE : 2,5·d1', () => {
    const r = minimumRestraintArea(radier(), 'central', { ...OPTIONS, method: 'ec2' });

    expect(r.hcEff).toBeCloseTo(137.5, 1);
    expect(r.method).toBe('ec2');
  });

  it('la methode din applique les branches h/d1, et c est le defaut', () => {
    const r = minimumRestraintArea(radier(), 'central', OPTIONS);

    expect(r.hcEff).toBeCloseTo(240, 0);
    expect(r.method).toBe('din');
  });

  /**
   * Les deux choix sont INDEPENDANTS : le tableau de la spec croise les deux
   * conventions de `k` avec les MEMES branches de `h_c,ef`. Les lier
   * interdirait « branches allemandes, k de l annexe belge ».
   */
  it('la methode et la convention de k ne se commandent pas l une l autre', () => {
    const a = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS, method: 'din', thicknessConvention: 'ec2',
    });
    const b = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS, method: 'din', thicknessConvention: 'de',
    });

    expect(a.hcEff).toBeCloseTo(b.hcEff, 9);
    expect(a.k).toBeCloseTo(0.65, 9);
    expect(b.k).toBeCloseTo(0.5, 9);
  });

  // --- Forcage ------------------------------------------------------------

  it('toute grandeur peut etre imposee et court-circuite sa formule', () => {
    const r = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS,
      overrides: { hcEff: 300 },
    });

    expect(r.hcEff).toBeCloseTo(300, 9);
    expect(r.AcEff).toBeCloseTo(300 * 1000, 9);
    expect(r.sources.hcEff).toBe('impose');
    expect(r.sources.AcEff).toBe('calcule');
  });

  it('une grandeur imposee alimente la suite de la chaine', () => {
    const base = minimumRestraintArea(radier(), 'central', OPTIONS);
    const force = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS,
      overrides: { d1: 80 },
    });

    expect(force.d1).toBeCloseTo(80, 9);
    expect(force.hcEff).toBeCloseTo(0.1 * 1300 + 2 * 80, 6);
    expect(force.AsEpais).toBeGreaterThan(base.AsEpais);
  });

  /**
   * LA REGLE QUI REND LE FORCAGE ACCEPTABLE : une note de calcul qui
   * presenterait une valeur imposee comme calculee ne serait verifiable par
   * personne.
   */
  it('sources dit pour CHAQUE grandeur si elle est calculee ou imposee', () => {
    const r = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS,
      overrides: { k: 0.55, Act: 900_000 },
    });

    expect(r.sources.k).toBe('impose');
    expect(r.sources.Act).toBe('impose');
    expect(r.sources.hcEff).toBe('calcule');
    expect(r.sources.d1).toBe('calcule');
    expect(r.k).toBeCloseTo(0.55, 9);
    expect(r.Act).toBeCloseTo(900_000, 9);
  });

  /**
   * Ecreter retirerait a l ingenieur la decision qu il vient explicitement de
   * prendre ; ne rien dire la lui laisserait prendre a l aveugle.
   */
  it('une zone efficace imposee au-dela de la section AVERTIT sans ecreter', () => {
    const r = minimumRestraintArea(radier(), 'central', {
      ...OPTIONS,
      overrides: { hcEff: 900 },
    });

    expect(r.hcEff).toBeCloseTo(900, 9);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/depasse la section/);
  });

  it('le chemin CALCULE, lui, reste ecrete a h/2', () => {
    // Voile mince : la branche donnerait plus de h/2, le garde s applique.
    const r = minimumRestraintArea(voile(250), 'central');

    expect(r.hcEff).toBeLessThanOrEqual(125);
    expect(r.warnings).toEqual([]);
  });

  it('sans forcage, aucun avertissement et tout est calcule', () => {
    const r = minimumRestraintArea(radier(), 'central', OPTIONS);

    expect(r.warnings).toEqual([]);
    for (const nom of ['fctEff', 'd1', 'hcEff', 'k', 'kc', 'Act', 'AcEff', 'sigmaS'] as const) {
      expect(r.sources[nom], `${nom} devrait etre calcule`).toBe('calcule');
    }
  });
});
