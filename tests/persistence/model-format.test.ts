import { describe, it, expect } from 'vitest';
import { FORMAT_VERSION, ENGINE_VERSION } from '../../src/persistence/model-format';
import type { SectionModel } from '../../src/persistence/model-format';

describe('format de modele', () => {
  it('expose une version de format entiere et une version de moteur', () => {
    expect(Number.isInteger(FORMAT_VERSION)).toBe(true);
    expect(FORMAT_VERSION).toBeGreaterThan(0);
    expect(typeof ENGINE_VERSION).toBe('string');
    expect(ENGINE_VERSION.length).toBeGreaterThan(0);
  });

  it('un modele complet satisfait le type', () => {
    // Ce test ne verifie pas un comportement : il fige la FORME du type.
    // S'il cesse de compiler, c'est que le format a change — ce qui doit
    // etre un acte delibere, accompagne d'une montee de FORMAT_VERSION.
    const modele: SectionModel = {
      formatVersion: FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      name: 'Pieu P12',
      norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1.0, nBands: 200 },
      concrete: { fck: 25 },
      steel: { fyk: 500, Es: 200000 },
      geometry: { kind: 'circle', diameter: 600, segments: 32 },
      reinforcement: {
        kind: 'circular-cage',
        cover: 50,
        stirrupDiameter: 12,
        barDiameter: 20,
        count: 8,
      },
      action: { N: 1200, My: 1, Mz: 1 },
    };

    expect(modele.geometry.kind).toBe('circle');
  });

  it('un modele de version 3 porte les quatre blocs, tous optionnels', () => {
    // Meme role que le test precedent : figer la FORME. Les quatre blocs sont
    // ecrits ici sur un modele complet, mais aucun n'est requis — c'est ce que
    // prouve le test precedent, qui compile sans eux.
    const modele: SectionModel = {
      formatVersion: FORMAT_VERSION,
      engineVersion: ENGINE_VERSION,
      norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1.0, nBands: 200 },
      concrete: { fck: 30 },
      steel: { fyk: 500, Es: 200000 },
      geometry: { kind: 'rectangle', width: 300, height: 900 },
      reinforcement: {
        kind: 'rectangular-layout',
        cover: 40,
        rows: [{ face: 'bottom', bars: { count: 4, diameter: 20 } }],
      },
      action: { N: 0, My: 250, Mz: 0 },
      elementType: 'beam',
      shear: { V_Ed: 180, links: { Asw: 100.5, s: 200, fywk: 500 }, cotTheta: 2.5 },
      restraint: { type: 'central', fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true },
      meyer: {
        h: 900, d1: 50, ds: 16, wk: 0.2, fctm: 2.9, kzt: 0.5,
        cas: 'traction', bridage: 'exterieur', kmode: 'lineaire',
      },
    };

    expect(modele.shear?.links?.Asw).toBe(100.5);
    expect(modele.meyer?.cas).toBe('traction');
  });
});
