import { describe, it, expect } from 'vitest';
import { resolveModel } from '../../src/persistence/resolve';
import { FORMAT_VERSION, ENGINE_VERSION } from '../../src/persistence/model-format';
import type { SectionModel } from '../../src/persistence/model-format';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { sectionCurvature } from '../../src/service/curvature';
import { verifyShear } from '../../src/shear/verify-shear';
import { verifyDetailing } from '../../src/detailing/verify-detailing';
import { minimumRestraintArea } from '../../src/detailing/restraint';
import {
  meyerRestraintReinforcement,
  facteurContraintesPropres,
} from '../../src/detailing/meyer-restraint';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { rectangularRebarLayout, rebarRow } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function base(): Omit<SectionModel, 'geometry' | 'reinforcement'> {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1.0, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    action: { N: 500, My: 1, Mz: 1 },
  };
}

describe('resolveModel', () => {
  it('rend les materiaux derives des entrees', () => {
    const r = resolveModel({
      ...base(),
      geometry: { kind: 'rectangle', width: 400, height: 600 },
      reinforcement: { kind: 'bars', bars: [{ y: 0, z: 250, area: 942 }] },
    });

    expect(r.concrete.fcd).toBeCloseTo(25 / 1.5, 9);
    expect(r.steel.fyd).toBeCloseTo(500 / 1.15, 9);
    expect(r.norm.nBands).toBe(200);
    expect(r.action).toEqual({ N: 500, My: 1, Mz: 1 });
  });

  it('rectangle + ferraillage par faces : resultat identique a la construction manuelle', () => {
    const modele: SectionModel = {
      ...base(),
      geometry: { kind: 'rectangle', width: 400, height: 400 },
      reinforcement: {
        kind: 'rectangular-layout',
        cover: 30,
        stirrupDiameter: 8,
        rows: [
          { face: 'bottom', bars: { count: 3, diameter: 20 } },
          { face: 'top', bars: { count: 3, diameter: 20 } },
        ],
      },
    };

    const aLaMain = rectangularSection({
      width: 400,
      height: 400,
      concrete,
      rebars: rectangularRebarLayout({
        width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
        rows: [
          { face: 'bottom', bars: { count: 3, diameter: 20 } },
          { face: 'top', bars: { count: 3, diameter: 20 } },
        ],
      }).bars,
    });

    const r = resolveModel(modele);
    const attendu = verifyBiaxial(aLaMain, { N: 500, My: 1, Mz: 1 }, profile);
    const obtenu = verifyBiaxial(r.section, r.action, r.norm);

    expect(obtenu.M_Rd_magnitude).toBe(attendu.M_Rd_magnitude);
    expect(obtenu.neutralAxis.angle).toBe(attendu.neutralAxis.angle);
  });

  it('cercle + cage : resultat identique a la construction manuelle', () => {
    const modele: SectionModel = {
      ...base(),
      action: { N: 1200, My: 1, Mz: 1 },
      geometry: { kind: 'circle', diameter: 600, segments: 32 },
      reinforcement: {
        kind: 'circular-cage', cover: 50, stirrupDiameter: 12, barDiameter: 20, count: 8,
      },
    };

    const aLaMain = circularSection({
      diameter: 600,
      segments: 32,
      concrete,
      rebars: circularRebarCage({
        diameter: 600, cover: 50, stirrupDiameter: 12, barDiameter: 20, count: 8, steel,
      }),
    });

    const r = resolveModel(modele);
    expect(verifyBiaxial(r.section, r.action, r.norm).M_Rd_magnitude).toBe(
      verifyBiaxial(aLaMain, { N: 1200, My: 1, Mz: 1 }, profile).M_Rd_magnitude
    );
  });

  it('polygone + lits : resultat identique, et le recentrage porte sur sommets ET armatures', () => {
    // Coordonnees brutes, origine au coin superieur gauche de la table :
    // c'est `polygonSection` qui recentre l'ensemble.
    const vertices = [
      { y: 0, z: 0 }, { y: 600, z: 0 }, { y: 600, z: 150 }, { y: 425, z: 150 },
      { y: 425, z: 500 }, { y: 175, z: 500 }, { y: 175, z: 150 }, { y: 0, z: 150 },
    ];

    const modele: SectionModel = {
      ...base(),
      action: { N: 0, My: 1, Mz: 1 },
      geometry: { kind: 'polygon', vertices },
      reinforcement: {
        kind: 'rows',
        rows: [{ from: { y: 200, z: 450 }, to: { y: 400, z: 450 }, bars: { count: 3, diameter: 20 } }],
      },
    };

    const aLaMain = polygonSection({
      vertices,
      concrete,
      rebars: rebarRow({
        from: { y: 200, z: 450 }, to: { y: 400, z: 450 },
        bars: { count: 3, diameter: 20 }, steel,
      }).bars,
    });

    const r = resolveModel(modele);
    expect(verifyBiaxial(r.section, r.action, r.norm).M_Rd_magnitude).toBe(
      verifyBiaxial(aLaMain, { N: 0, My: 1, Mz: 1 }, profile).M_Rd_magnitude
    );
  });

  it('rend les sollicitations de service pretes a etre passees aux modules de service', () => {
    // Forme `Action` du noyau — `{N, M}`, pas `{N, My, Mz}` — pour qu'aucune
    // conversion ne reste a la charge de l'appelant : c'est exactement ce
    // que prennent verifyServiceUniaxial, verifyCrackWidth et
    // sectionCurvature.
    const r = resolveModel({
      ...base(),
      geometry: { kind: 'rectangle', width: 400, height: 600 },
      reinforcement: { kind: 'bars', bars: [{ y: 0, z: -250, area: 942 }] },
      serviceActions: {
        characteristic: { N: -120, M: 85 },
        quasiPermanent: { N: -90, M: 60 },
      },
    });

    expect(r.serviceActions).toEqual({
      characteristic: { N: -120, M: 85 },
      quasiPermanent: { N: -90, M: 60 },
    });

    // Preuve que la forme rendue se consomme telle quelle.
    const qp = r.serviceActions?.quasiPermanent;
    if (qp === undefined) throw new Error('sollicitation quasi-permanente attendue');
    expect(() => sectionCurvature(r.section, qp)).not.toThrow();
  });

  it('n invente pas de sollicitations de service quand le modele n en porte pas', () => {
    // Un {N: 0, M: 0} par defaut donnerait des contraintes et une courbure
    // nulles, affichables et fausses : l'absence doit rester une absence.
    const r = resolveModel({
      ...base(),
      geometry: { kind: 'rectangle', width: 400, height: 600 },
      reinforcement: { kind: 'bars', bars: [{ y: 0, z: -250, area: 942 }] },
    });
    expect(r.serviceActions).toBeUndefined();
  });

  it('rend une seule des deux combinaisons quand une seule est donnee', () => {
    const r = resolveModel({
      ...base(),
      geometry: { kind: 'rectangle', width: 400, height: 600 },
      reinforcement: { kind: 'bars', bars: [{ y: 0, z: -250, area: 942 }] },
      serviceActions: { quasiPermanent: { N: 0, M: 60 } },
    });
    expect(r.serviceActions).toEqual({ quasiPermanent: { N: 0, M: 60 } });
    expect(r.serviceActions?.characteristic).toBeUndefined();
  });

  it('refuse un appariement geometrie/ferraillage incoherent, meme sans passer par parseModel', () => {
    // resolveModel peut recevoir un modele construit a la main, qui n'a
    // jamais ete valide par parseModel : la verification doit donc exister
    // ici aussi, et ne pas se reposer sur celle de la lecture.
    expect(() =>
      resolveModel({
        ...base(),
        geometry: { kind: 'circle', diameter: 600 },
        reinforcement: {
          kind: 'rectangular-layout', cover: 30,
          rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
        },
      })
    ).toThrow();
  });
});

/**
 * Les quatre blocs de la version 3, rendus PRETS A L'EMPLOI : chaque test
 * appelle vraiment le module de calcul avec ce que rend `resolveModel`. Un
 * test de forme dirait que les cles sont la ; seul l'appel prouve qu'aucune
 * conversion ne reste a la charge de l'appelant.
 */
describe('resolveModel : les blocs de la version 3', () => {
  function poutre(): SectionModel {
    return {
      ...base(),
      action: { N: -60, My: 250, Mz: 0 },
      geometry: { kind: 'rectangle', width: 300, height: 900 },
      reinforcement: {
        kind: 'rectangular-layout',
        cover: 40,
        stirrupDiameter: 8,
        rows: [
          { face: 'bottom', bars: { count: 4, diameter: 20 } },
          { face: 'top', bars: { count: 2, diameter: 12 } },
        ],
      },
    };
  }

  it('rend un effort tranchant que verifyShear consomme tel quel', () => {
    const r = resolveModel({
      ...poutre(),
      shear: { V_Ed: 180, links: { Asw: 100.5, s: 200, fywk: 500 }, cotTheta: 1.5 },
    });

    const s = r.shear;
    if (s === undefined) throw new Error('bloc tranchant attendu');

    // L'effort normal concomitant est celui de l'ELU : le tranchant se
    // verifie a l'ELU, et un second N saisissable ouvrirait la porte a un
    // fichier ou les deux se contredisent.
    expect(s.action).toEqual({ V_Ed: 180, N_Ed: -60 });
    expect(s.options.links).toEqual({ Asw: 100.5, s: 200, fywk: 500 });

    const verdict = verifyShear(r.section, s.action, r.norm, s.options);
    // Preuve que le cot theta du modele atteint bien le calcul, et n'est pas
    // remplace en route par le defaut de 2,5.
    expect(verdict.withLinks?.cotTheta).toBe(1.5);
    expect(verdict.VRds).toBeGreaterThan(0);
  });

  it('rend un tranchant sans cadres, sans en inventer', () => {
    const r = resolveModel({ ...poutre(), shear: { V_Ed: 120 } });
    const s = r.shear;
    if (s === undefined) throw new Error('bloc tranchant attendu');

    expect(s.options.links).toBeUndefined();
    expect(s.options.cotTheta).toBeUndefined();

    const verdict = verifyShear(r.section, s.action, r.norm, s.options);
    expect(verdict.withLinks).toBeNull();
    expect(verdict.VRdc).toBeGreaterThan(0);
  });

  it('rend un type d element que verifyDetailing consomme tel quel', () => {
    const r = resolveModel({ ...poutre(), elementType: 'slab' });
    expect(r.elementType).toBe('slab');

    const verdict = verifyDetailing(r.section, r.elementType ?? 'beam', {
      longitudinal: { NEd: r.action.N },
    });
    // Une dalle est dispensee du minimum d'armature d'ame du §9.2.2(5) : la
    // valeur rendue est bien celle du modele, et non un defaut.
    expect(verdict.elementType).toBe('slab');
    expect(verdict.web.applicable).toBe(false);
  });

  it('rend une gene que minimumRestraintArea consomme telle quelle', () => {
    const r = resolveModel({
      ...poutre(),
      restraint: { type: 'central', fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true },
    });

    const g = r.restraint;
    if (g === undefined) throw new Error('bloc de gene attendu');
    expect(g.type).toBe('central');
    expect(g.options).toEqual({ fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true });

    const constat = minimumRestraintArea(r.section, g.type, g.options);
    expect(constat.fctEff).toBe(1.8);
    expect(constat.sigmaS).toBe(320);
    expect(constat.basis).toBe('zone-efficace');
  });

  it('rend une gene reduite a sa nature : les defauts restent ceux du §7.3.2', () => {
    const r = resolveModel({ ...poutre(), restraint: { type: 'bending' } });
    const g = r.restraint;
    if (g === undefined) throw new Error('bloc de gene attendu');

    expect(g.options).toEqual({});
    // Aucun `NEd` transmis, DELIBEREMENT : le §7.3.2 se verifie ici sous la
    // seule deformation genee, et l'effort normal de l'ELU n'y a pas cours.
    expect(g.options.NEd).toBeUndefined();

    const constat = minimumRestraintArea(r.section, g.type, g.options);
    expect(constat.fctEff).toBeCloseTo(2.5648, 3); // f_ctm d'un C25/30
    expect(constat.sigmaS).toBe(500); // f_yk, defaut du §7.3.2(2)
    expect(constat.kc).toBe(0.4); // flexion pure, N_Ed absent
  });

  it('rend une saisie Meyer que meyerRestraintReinforcement consomme telle quelle', () => {
    const meyer = {
      h: 800, d1: 50, ds: 16, wk: 0.2, fctm: 2.9, kzt: 0.5,
      cas: 'traction' as const, bridage: 'exterieur' as const, kmode: 'parabolique' as const,
    };
    const r = resolveModel({ ...poutre(), meyer });

    expect(r.meyer).toEqual(meyer);

    const m = r.meyer;
    if (m === undefined) throw new Error('bloc Meyer attendu');
    const constat = meyerRestraintReinforcement(m);
    expect(constat.fctEff).toBeCloseTo(0.5 * 2.9, 9);
    expect(constat.k).toBeCloseTo(facteurContraintesPropres(800, 'parabolique'), 9);
    expect(constat.AsFace).toBeGreaterThan(0);
  });

  it('n invente aucun des quatre blocs quand le modele n en porte pas', () => {
    const r = resolveModel(poutre());
    expect(r.elementType).toBeUndefined();
    expect(r.shear).toBeUndefined();
    expect(r.restraint).toBeUndefined();
    expect(r.meyer).toBeUndefined();
  });
});
