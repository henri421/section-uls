import { describe, it, expect } from 'vitest';
import { resolveModel } from '../../src/persistence/resolve';
import { FORMAT_VERSION, ENGINE_VERSION } from '../../src/persistence/model-format';
import type { SectionModel } from '../../src/persistence/model-format';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { sectionCurvature } from '../../src/service/curvature';
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
