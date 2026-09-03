import { describe, it, expect } from 'vitest';
import { parseModel, serializeModel, ModelParseError } from '../../src/persistence/parse';
import { FORMAT_VERSION, ENGINE_VERSION } from '../../src/persistence/model-format';
import type { SectionModel } from '../../src/persistence/model-format';

function modeleValide(): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1.0, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    geometry: { kind: 'rectangle', width: 400, height: 600 },
    reinforcement: {
      kind: 'rectangular-layout',
      cover: 30,
      stirrupDiameter: 8,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    },
    action: { N: 500, My: 1, Mz: 1 },
  };
}

/** Serialise un modele valide en y injectant une alteration. */
function avecAlteration(alterer: (m: Record<string, unknown>) => void): string {
  const brut = JSON.parse(JSON.stringify(modeleValide())) as Record<string, unknown>;
  alterer(brut);
  return JSON.stringify(brut);
}

describe('parseModel', () => {
  it('accepte un modele valide et rend un objet equivalent', () => {
    const lu = parseModel(JSON.stringify(modeleValide()));
    expect(lu).toEqual(modeleValide());
  });

  it('accepte les quatre formes de ferraillage et les trois de geometrie', () => {
    const polygone = { ...modeleValide(), geometry: { kind: 'polygon' as const, vertices: [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 },
    ] }, reinforcement: { kind: 'bars' as const, bars: [{ y: 150, z: 450, area: 314 }] } };
    expect(parseModel(JSON.stringify(polygone)).geometry.kind).toBe('polygon');

    const cercle = { ...modeleValide(), geometry: { kind: 'circle' as const, diameter: 600 },
      reinforcement: { kind: 'circular-cage' as const, cover: 50, barDiameter: 20, count: 8 } };
    expect(parseModel(JSON.stringify(cercle)).reinforcement.kind).toBe('circular-cage');

    const lits = { ...modeleValide(), geometry: { kind: 'polygon' as const, vertices: [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 },
    ] }, reinforcement: { kind: 'rows' as const, rows: [
      { from: { y: 50, z: 450 }, to: { y: 250, z: 450 }, bars: { diameter: 12, maxSpacing: 150 } },
    ] } };
    expect(parseModel(JSON.stringify(lits)).reinforcement.kind).toBe('rows');
  });

  it('refuse un JSON syntaxiquement invalide', () => {
    expect(() => parseModel('{ ceci nest pas du json')).toThrow(ModelParseError);
  });

  it('refuse une version de format inconnue, en la nommant', () => {
    const json = avecAlteration((m) => { m.formatVersion = 99; });
    expect(() => parseModel(json)).toThrow(/formatVersion/);
    expect(() => parseModel(json)).toThrow(/99/);
  });

  it('refuse un champ manquant en nommant son chemin', () => {
    const json = avecAlteration((m) => { delete (m.concrete as Record<string, unknown>).fck; });
    expect(() => parseModel(json)).toThrow(/concrete\.fck/);
  });

  it('refuse un type faux en nommant le chemin exact, indice de tableau compris', () => {
    const json = avecAlteration((m) => {
      m.geometry = { kind: 'polygon', vertices: [
        { y: 0, z: 0 }, { y: 100, z: 0 }, { y: 100, z: 'abc' },
      ] };
      m.reinforcement = { kind: 'bars', bars: [] };
    });
    expect(() => parseModel(json)).toThrow(/geometry\.vertices\[2\]\.z/);
  });

  it('refuse une valeur non physique', () => {
    expect(() => parseModel(avecAlteration((m) => {
      (m.geometry as Record<string, unknown>).width = -400;
    }))).toThrow(/geometry\.width/);

    expect(() => parseModel(avecAlteration((m) => {
      (m.concrete as Record<string, unknown>).fck = 0;
    }))).toThrow(/concrete\.fck/);
  });

  it('refuse un polygone de moins de trois sommets', () => {
    const json = avecAlteration((m) => {
      m.geometry = { kind: 'polygon', vertices: [{ y: 0, z: 0 }, { y: 100, z: 0 }] };
      m.reinforcement = { kind: 'bars', bars: [] };
    });
    expect(() => parseModel(json)).toThrow(/vertices/);
  });

  it('refuse un nombre de barres non entier', () => {
    const json = avecAlteration((m) => {
      m.reinforcement = { kind: 'rectangular-layout', cover: 30, rows: [
        { face: 'bottom', bars: { count: 2.5, diameter: 20 } },
      ] };
    });
    expect(() => parseModel(json)).toThrow(/count/);
  });

  it('refuse un discriminant kind inconnu', () => {
    const json = avecAlteration((m) => { m.geometry = { kind: 'triangle', a: 1 }; });
    expect(() => parseModel(json)).toThrow(/geometry\.kind/);
  });

  it('refuse un ferraillage incompatible avec la geometrie', () => {
    // Un ferraillage par faces n'a de sens que sur un rectangle : sans
    // largeur ni hauteur, les positions ne sont pas calculables.
    const json = avecAlteration((m) => {
      m.geometry = { kind: 'circle', diameter: 600 };
    });
    expect(() => parseModel(json)).toThrow(/rectangular-layout/);
  });

  it('accepte l absence des champs optionnels', () => {
    const json = avecAlteration((m) => {
      delete m.name;
      delete (m.reinforcement as Record<string, unknown>).stirrupDiameter;
    });
    const lu = parseModel(json);
    expect(lu.name).toBeUndefined();
  });
});

describe('serializeModel', () => {
  it('aller-retour : ecrire puis relire redonne le meme modele', () => {
    const m = modeleValide();
    expect(parseModel(serializeModel(m))).toEqual(m);
  });

  it('aller-retour sur les trois geometries et les quatre ferraillages', () => {
    const carre = [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 },
    ];

    const formes: SectionModel[] = [
      modeleValide(), // rectangle + rectangular-layout
      {
        ...modeleValide(),
        geometry: { kind: 'circle', diameter: 600, segments: 48 },
        reinforcement: {
          kind: 'circular-cage', cover: 50, stirrupDiameter: 12,
          barDiameter: 20, count: 8, rotationOffset: 0.2,
        },
      },
      {
        ...modeleValide(),
        geometry: { kind: 'polygon', vertices: carre },
        reinforcement: {
          kind: 'rows',
          rows: [
            { from: { y: 50, z: 450 }, to: { y: 250, z: 450 }, bars: { count: 3, diameter: 20 } },
            { from: { y: 50, z: 50 }, to: { y: 250, z: 50 },
              bars: { diameter: 12, maxSpacing: 150 }, endpoints: 'exclude' },
          ],
        },
      },
      {
        ...modeleValide(),
        geometry: { kind: 'polygon', vertices: carre },
        reinforcement: { kind: 'bars', bars: [{ y: 150, z: 450, area: 314 }] },
      },
    ];

    for (const forme of formes) {
      expect(parseModel(serializeModel(forme))).toEqual(forme);
    }
  });

  it('deux ecritures du meme modele donnent exactement les memes octets', () => {
    const a = serializeModel(modeleValide());
    const b = serializeModel(modeleValide());
    expect(a).toBe(b);
  });

  it("l ordre des cles ne depend pas de l ordre d insertion de l appelant", () => {
    // JSON.stringify suit l'ordre d'insertion de l'objet recu : ecrire
    // l'objet a serialiser doit donc etre un acte explicite, sinon deux
    // modeles equivalents produiraient deux fichiers differents et tout
    // suivi de version deviendrait illisible.
    const normal: SectionModel = {
      ...modeleValide(),
      geometry: { kind: 'circle', diameter: 600, segments: 32 },
      reinforcement: {
        kind: 'circular-cage', cover: 50, stirrupDiameter: 12, barDiameter: 20, count: 8,
      },
    };

    // Le desordre porte AUSSI sur les cles internes de `geometry` et de
    // `reinforcement` : les melanger uniquement au niveau superieur laisserait
    // passer une implementation qui recopie ces sous-objets par reference.
    const desordre = {
      action: normal.action,
      steel: normal.steel,
      geometry: { segments: 32, diameter: 600, kind: 'circle' },
      reinforcement: {
        count: 8, barDiameter: 20, stirrupDiameter: 12, cover: 50, kind: 'circular-cage',
      },
      concrete: normal.concrete,
      norm: {
        nBands: normal.norm.nBands, alphaCc: normal.norm.alphaCc,
        gammaS: normal.norm.gammaS, gammaC: normal.norm.gammaC, name: normal.norm.name,
      },
      engineVersion: normal.engineVersion,
      formatVersion: normal.formatVersion,
    } as SectionModel;

    expect(serializeModel(desordre)).toBe(serializeModel(normal));
  });

  it('produit un JSON indente, lisible et versionne en tete', () => {
    const texte = serializeModel(modeleValide());
    expect(texte).toContain('\n  "formatVersion"');
    expect(texte.indexOf('"formatVersion"')).toBeLessThan(texte.indexOf('"geometry"'));
  });
});
