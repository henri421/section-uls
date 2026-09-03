import { describe, it, expect } from 'vitest';
import { formToModel, modelToForm, parsePoints, formatPoints, FormError } from '../../app/src/form';
import { parseModel, serializeModel, FORMAT_VERSION, ENGINE_VERSION } from '../../src/index';
import type { SectionModel } from '../../src/index';

function base(): Omit<SectionModel, 'geometry' | 'reinforcement'> {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    action: { N: 500, My: 1, Mz: 1 },
  };
}

const SEPT_FORMES: SectionModel[] = [
  { ...base(), geometry: { kind: 'rectangle', width: 400, height: 600 },
    reinforcement: { kind: 'rectangular-layout', cover: 30, stirrupDiameter: 8,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } },
             { face: 'top', bars: { diameter: 12, maxSpacing: 150 } }] } },
  { ...base(), geometry: { kind: 'circle', diameter: 600, segments: 48 },
    reinforcement: { kind: 'circular-cage', cover: 50, stirrupDiameter: 12,
      barDiameter: 20, count: 8, rotationOffset: 0.2 } },
  { ...base(), geometry: { kind: 'polygon', vertices: [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 } ] },
    reinforcement: { kind: 'rows', rows: [
      { from: { y: 50, z: 450 }, to: { y: 250, z: 450 }, bars: { count: 3, diameter: 20 } },
      { from: { y: 50, z: 50 }, to: { y: 250, z: 50 },
        bars: { diameter: 12, maxSpacing: 150 }, endpoints: 'exclude' } ] } },
  { ...base(), geometry: { kind: 'polygon', vertices: [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 } ] },
    reinforcement: { kind: 'bars', bars: [{ y: 150, z: 450, area: 314 }] } },
];

describe('conversion formulaire <-> modele', () => {
  it('aller-retour sur toutes les formes de geometrie et de ferraillage', () => {
    for (const modele of SEPT_FORMES) {
      expect(formToModel(modelToForm(modele))).toEqual(modele);
    }
  });

  it('le modele reconstruit passe la validation du noyau', () => {
    // Controle croise : la couche de saisie ne doit pas pouvoir produire un
    // modele que le format lui-meme rejetterait.
    for (const modele of SEPT_FORMES) {
      const reconstruit = formToModel(modelToForm(modele));
      expect(() => parseModel(serializeModel(reconstruit))).not.toThrow();
    }
  });

  it('un nom vide est omis, jamais rendu comme chaine vide', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.name = '';
    expect(formToModel(form).name).toBeUndefined();
  });

  it('un optionnel laisse vide est omis, jamais rendu comme zero', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.stirrupDiameter = '';
    const modele = formToModel(form);
    expect(modele.reinforcement.kind).toBe('rectangular-layout');
    if (modele.reinforcement.kind === 'rectangular-layout') {
      expect(modele.reinforcement.stirrupDiameter).toBeUndefined();
    }
  });

  it('refuse une valeur non numerique en nommant le champ', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.fck = 'vingt-cinq';
    expect(() => formToModel(form)).toThrow(FormError);
    expect(() => formToModel(form)).toThrow(/fck/);
  });

  it('refuse un sommet mal forme en nommant la ligne', () => {
    expect(() => parsePoints('0;0\n100;abc\n100;100', 'sommets')).toThrow(/ligne 2/);
  });

  it('analyse et reconstitue une liste de points', () => {
    const texte = '0 ; 0\n300 ; 0\n300 ; 500';
    const points = parsePoints(texte, 'sommets');
    expect(points).toEqual([{ y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }]);
    expect(parsePoints(formatPoints(points), 'sommets')).toEqual(points);
  });

  it('ignore les lignes vides et les espaces surnumeraires', () => {
    expect(parsePoints('\n  0;0  \n\n  100 ; 200 \n', 'sommets'))
      .toEqual([{ y: 0, z: 0 }, { y: 100, z: 200 }]);
  });
});
