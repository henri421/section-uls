import { describe, it, expect } from 'vitest';
import { parseModel, serializeModel, ModelParseError } from '../../src/persistence/parse';
import {
  FORMAT_VERSION,
  ENGINE_VERSION,
  SUPPORTED_FORMAT_VERSIONS,
} from '../../src/persistence/model-format';
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

  it('refuse nBands egal a zero, en le nommant', () => {
    // nBands=0 donnerait une integration sans aucune bande : contrairement
    // a un compte de barres, il n'a aucun sens a zero.
    const json = avecAlteration((m) => {
      (m.norm as Record<string, unknown>).nBands = 0;
    });
    expect(() => parseModel(json)).toThrow(/norm\.nBands/);
  });

  it('accepte un compte de barres a zero : lit vide ou modele en cours de saisie', () => {
    // Distinct de nBands : un lit vide est licite (etabli en session 3, cf.
    // le test "un lit vide est licite et ne renvoie aucune barre" sur
    // `rebarRow`), et une future interface doit pouvoir enregistrer un
    // modele dont les armatures ne sont pas encore posees.
    const json = avecAlteration((m) => {
      m.reinforcement = { kind: 'rectangular-layout', cover: 30, rows: [
        { face: 'bottom', bars: { count: 0, diameter: 20 } },
      ] };
    });
    const lu = parseModel(json);
    if (lu.reinforcement.kind !== 'rectangular-layout') throw new Error('type inattendu');
    expect(lu.reinforcement.rows[0].bars).toEqual({ count: 0, diameter: 20 });
  });

  it('accepte une cage circulaire de zero barres, pour la meme raison', () => {
    // Meme principe applique a `circular-cage.count` : une cage sans barre
    // est le meme cas d'un modele en cours de saisie, et ne provoque aucune
    // division par zero cote resolution (la boucle de repartition angulaire
    // ne s'execute simplement pas quand count vaut 0).
    const json = avecAlteration((m) => {
      m.geometry = { kind: 'circle', diameter: 600 };
      m.reinforcement = { kind: 'circular-cage', cover: 50, barDiameter: 20, count: 0 };
    });
    const lu = parseModel(json);
    if (lu.reinforcement.kind !== 'circular-cage') throw new Error('type inattendu');
    expect(lu.reinforcement.count).toBe(0);
  });

  it('rend Infinity lisible dans le message, plutot que le "null" de JSON.stringify', () => {
    // 1e400 est un litteral JSON syntaxiquement valide (JSON n'impose pas de
    // borne sur l'exposant), mais deborde la precision IEEE 754 au parsing
    // et devient Infinity. Comme JSON.stringify(Infinity) vaut "null", un
    // message naif dirait a tort « recu null » pour une valeur qui n'est
    // pourtant pas nulle. Ecrit en JSON brut : passer par JSON.stringify
    // (comme le fait avecAlteration) effacerait l'Infinity avant meme
    // d'atteindre parseModel.
    const json = `{
      "formatVersion": ${FORMAT_VERSION},
      "engineVersion": ${JSON.stringify(ENGINE_VERSION)},
      "norm": { "name": "EC2_recommended", "gammaC": 1.5, "gammaS": 1.15, "alphaCc": 1.0, "nBands": 200 },
      "concrete": { "fck": 1e400 },
      "steel": { "fyk": 500, "Es": 200000 },
      "geometry": { "kind": "rectangle", "width": 400, "height": 600 },
      "reinforcement": { "kind": "rectangular-layout", "cover": 30, "rows": [{ "face": "bottom", "bars": { "count": 3, "diameter": 20 } }] },
      "action": { "N": 500, "My": 1, "Mz": 1 }
    }`;
    expect(() => parseModel(json)).toThrow(/Infinity/);
    expect(() => parseModel(json)).toThrow(/concrete\.fck/);
  });
});

describe('parseModel : les versions du format', () => {
  it('lit la version 1, ou les sollicitations de service n existent pas', () => {
    // C'est la garantie de retrocompatibilite : tout fichier deja enregistre
    // par l'utilisateur porte formatVersion 1. Une egalite stricte avec
    // FORMAT_VERSION le rendrait illisible du jour ou la version monte.
    const json = avecAlteration((m) => {
      m.formatVersion = 1;
      delete m.serviceActions;
    });
    const lu = parseModel(json);
    expect(lu.formatVersion).toBe(1);
    expect(lu.serviceActions).toBeUndefined();
  });

  it('la version courante est 3 et les trois versions sont lues', () => {
    expect(FORMAT_VERSION).toBe(3);
    expect([...SUPPORTED_FORMAT_VERSIONS]).toEqual([1, 2, 3]);
  });

  it('lit les deux combinaisons de service', () => {
    const json = avecAlteration((m) => {
      m.serviceActions = {
        characteristic: { N: -120, M: 85 },
        quasiPermanent: { N: -90, M: 60 },
      };
    });
    const lu = parseModel(json);
    expect(lu.serviceActions).toEqual({
      characteristic: { N: -120, M: 85 },
      quasiPermanent: { N: -90, M: 60 },
    });
  });

  it('accepte une seule des deux combinaisons : elles sont independamment optionnelles', () => {
    const seuleCaract = parseModel(
      avecAlteration((m) => {
        m.serviceActions = { characteristic: { N: 0, M: 120 } };
      })
    );
    expect(seuleCaract.serviceActions).toEqual({ characteristic: { N: 0, M: 120 } });
    expect(seuleCaract.serviceActions?.quasiPermanent).toBeUndefined();

    const seuleQp = parseModel(
      avecAlteration((m) => {
        m.serviceActions = { quasiPermanent: { N: 0, M: 90 } };
      })
    );
    expect(seuleQp.serviceActions).toEqual({ quasiPermanent: { N: 0, M: 90 } });
    expect(seuleQp.serviceActions?.characteristic).toBeUndefined();
  });

  it('refuse une version 4, en nommant les versions qu il sait lire', () => {
    const json = avecAlteration((m) => {
      m.formatVersion = 4;
    });
    expect(() => parseModel(json)).toThrow(/formatVersion/);
    expect(() => parseModel(json)).toThrow(/4/);
    expect(() => parseModel(json)).toThrow(/1, 2, 3/);
  });

  it('refuse un serviceActions mal forme en nommant le champ fautif', () => {
    expect(() =>
      parseModel(
        avecAlteration((m) => {
          m.serviceActions = { characteristic: { N: 100 } };
        })
      )
    ).toThrow(/serviceActions\.characteristic\.M/);

    expect(() =>
      parseModel(
        avecAlteration((m) => {
          m.serviceActions = { quasiPermanent: { N: 'beaucoup', M: 60 } };
        })
      )
    ).toThrow(/serviceActions\.quasiPermanent\.N/);

    expect(() =>
      parseModel(
        avecAlteration((m) => {
          m.serviceActions = 'aucune';
        })
      )
    ).toThrow(/serviceActions/);
  });

  it('ecrit toujours la version courante, meme pour un modele relu en version 1', () => {
    // Sinon un modele charge en version 1 puis enrichi de sollicitations de
    // service se reecrirait en annoncant la version 1 tout en portant un
    // champ qui n'y existe pas : le fichier mentirait sur son propre format.
    const v1 = parseModel(
      avecAlteration((m) => {
        m.formatVersion = 1;
      })
    );
    expect(v1.formatVersion).toBe(1);
    expect(parseModel(serializeModel(v1)).formatVersion).toBe(FORMAT_VERSION);
  });

  it('accepte un N de service nul ou negatif : la traction est un cas de service courant', () => {
    const lu = parseModel(
      avecAlteration((m) => {
        m.serviceActions = { quasiPermanent: { N: -45, M: 0 } };
      })
    );
    expect(lu.serviceActions?.quasiPermanent).toEqual({ N: -45, M: 0 });
  });
});

/**
 * Blocs de la version 3 : type d'element, effort tranchant, deformation genee
 * (§7.3.2) et methode Meyer. Tous OPTIONNELS et INDEPENDANTS les uns des
 * autres — c'est le mecanisme meme qui a permis a la version 2 de ne rendre
 * illisible aucun fichier deja enregistre.
 */
describe('parseModel : les blocs de la version 3', () => {
  const blocsComplets = {
    elementType: 'beam',
    shear: { V_Ed: 180, links: { Asw: 100.5, s: 200, fywk: 500 }, cotTheta: 2.0 },
    restraint: { type: 'central', fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true },
    meyer: {
      h: 800, d1: 50, ds: 16, wk: 0.2, fctm: 2.9, kzt: 0.5,
      cas: 'traction', bridage: 'exterieur', kmode: 'parabolique',
    },
  };

  it('lit un fichier de version 2 : aucun des quatre blocs n est invente', () => {
    const json = avecAlteration((m) => {
      m.formatVersion = 2;
      m.serviceActions = { quasiPermanent: { N: -90, M: 60 } };
    });
    const lu = parseModel(json);
    expect(lu.formatVersion).toBe(2);
    expect(lu.serviceActions).toEqual({ quasiPermanent: { N: -90, M: 60 } });
    expect(lu.elementType).toBeUndefined();
    expect(lu.shear).toBeUndefined();
    expect(lu.restraint).toBeUndefined();
    expect(lu.meyer).toBeUndefined();
  });

  it('lit les quatre blocs d une version 3 complete', () => {
    const lu = parseModel(avecAlteration((m) => Object.assign(m, blocsComplets)));
    expect(lu.elementType).toBe('beam');
    expect(lu.shear).toEqual({
      V_Ed: 180,
      links: { Asw: 100.5, s: 200, fywk: 500 },
      cotTheta: 2.0,
    });
    expect(lu.restraint).toEqual({
      type: 'central',
      fctEff: 1.8,
      sigmaS: 320,
      effectiveZoneOnly: true,
    });
    expect(lu.meyer).toEqual({
      h: 800, d1: 50, ds: 16, wk: 0.2, fctm: 2.9, kzt: 0.5,
      cas: 'traction', bridage: 'exterieur', kmode: 'parabolique',
    });
  });

  it('accepte chaque bloc isolement : les quatre sont independamment optionnels', () => {
    for (const [nom, valeur] of Object.entries(blocsComplets)) {
      const lu = parseModel(avecAlteration((m) => { m[nom] = valeur; })) as unknown as Record<
        string,
        unknown
      >;
      expect(lu[nom]).not.toBeUndefined();
      for (const autre of Object.keys(blocsComplets)) {
        if (autre !== nom) expect(lu[autre]).toBeUndefined();
      }
    }
  });

  it('accepte un tranchant sans cadres et sans cot theta : seul V_Ed est exige', () => {
    // Un effort tranchant se saisit avant d'avoir choisi les cadres, et le
    // §6.2.2 rend deja un verdict sans eux. Exiger `links` interdirait
    // d'enregistrer un cas en cours d'etude.
    const lu = parseModel(avecAlteration((m) => { m.shear = { V_Ed: 120 }; }));
    expect(lu.shear).toEqual({ V_Ed: 120 });
    expect(lu.shear?.links).toBeUndefined();
    expect(lu.shear?.cotTheta).toBeUndefined();
  });

  it('accepte un V_Ed nul ou negatif : seul son module est confronte', () => {
    expect(parseModel(avecAlteration((m) => { m.shear = { V_Ed: 0 }; })).shear).toEqual({ V_Ed: 0 });
    expect(parseModel(avecAlteration((m) => { m.shear = { V_Ed: -180 }; })).shear).toEqual({
      V_Ed: -180,
    });
  });

  it('accepte une gene et une saisie Meyer reduites a leurs champs obligatoires', () => {
    const lu = parseModel(
      avecAlteration((m) => {
        m.restraint = { type: 'bending' };
        m.meyer = {
          h: 500, d1: 40, ds: 12, wk: 0.3, fctm: 2.6, kzt: 1.0,
          cas: 'flexion', bridage: 'interieur',
        };
      })
    );
    expect(lu.restraint).toEqual({ type: 'bending' });
    expect(lu.meyer?.kmode).toBeUndefined();
  });

  it('refuse un bloc mal forme en nommant le champ fautif', () => {
    expect(() =>
      parseModel(avecAlteration((m) => { m.shear = { links: { Asw: 100, s: 200, fywk: 500 } }; }))
    ).toThrow(/shear\.V_Ed/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.shear = { V_Ed: 180, links: { Asw: 100, s: 0, fywk: 500 } }; }))
    ).toThrow(/shear\.links\.s/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.meyer = { ...blocsComplets.meyer, kzt: undefined }; }))
    ).toThrow(/meyer\.kzt/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.restraint = { type: 'central', fctEff: -1 }; }))
    ).toThrow(/restraint\.fctEff/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.restraint = { type: 'central', effectiveZoneOnly: 'oui' }; }))
    ).toThrow(/restraint\.effectiveZoneOnly/);

    expect(() => parseModel(avecAlteration((m) => { m.shear = 180; }))).toThrow(/shear/);
  });

  it('refuse une valeur d enumeration inconnue, en nommant celle qui a ete lue', () => {
    // L'erreur qu'un fichier edite a la main produira : le type d'element
    // ecrit en francais, alors que le modele attend les valeurs du noyau.
    const francais = avecAlteration((m) => { m.elementType = 'poutre'; });
    expect(() => parseModel(francais)).toThrow(/elementType/);
    expect(() => parseModel(francais)).toThrow(/poutre/);
    expect(() => parseModel(francais)).toThrow(/beam/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.meyer = { ...blocsComplets.meyer, cas: 'cisaillement' }; }))
    ).toThrow(/meyer\.cas/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.meyer = { ...blocsComplets.meyer, bridage: 'externe' }; }))
    ).toThrow(/meyer\.bridage/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.meyer = { ...blocsComplets.meyer, kmode: 'quadratique' }; }))
    ).toThrow(/meyer\.kmode/);

    expect(() =>
      parseModel(avecAlteration((m) => { m.restraint = { type: 'centree' }; }))
    ).toThrow(/restraint\.type/);
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

  it('aller-retour avec les deux sollicitations de service', () => {
    const m: SectionModel = {
      ...modeleValide(),
      serviceActions: {
        characteristic: { N: -120, M: 85 },
        quasiPermanent: { N: -90, M: 60.5 },
      },
    };
    expect(parseModel(serializeModel(m))).toEqual(m);
  });

  it('aller-retour avec une seule des deux sollicitations de service', () => {
    const caract: SectionModel = {
      ...modeleValide(),
      serviceActions: { characteristic: { N: 0, M: 120 } },
    };
    expect(parseModel(serializeModel(caract))).toEqual(caract);

    const qp: SectionModel = {
      ...modeleValide(),
      serviceActions: { quasiPermanent: { N: 0, M: 90 } },
    };
    const reluQp = parseModel(serializeModel(qp));
    expect(reluQp).toEqual(qp);
    // La combinaison absente ne doit pas reapparaitre a l'ecriture, meme
    // vide : une sollicitation de service {0, 0} n'est pas « pas de
    // sollicitation », et ferait afficher un resultat de service invente.
    expect(serializeModel(qp)).not.toContain('characteristic');
  });

  it('sans sollicitations de service, le champ n apparait pas dans le JSON', () => {
    // Ni `"serviceActions": null` (que la relecture refuserait, un null
    // n'etant pas un objet), ni `"serviceActions": {}` (qui mentirait sur
    // l'intention : le modele n'en porte pas, il n'en porte pas de vides).
    const texte = serializeModel(modeleValide());
    expect(texte).not.toContain('serviceActions');
    expect(parseModel(texte).serviceActions).toBeUndefined();
  });

  it('l ordre des cles reste stable pour les sollicitations de service', () => {
    const normal: SectionModel = {
      ...modeleValide(),
      serviceActions: {
        characteristic: { N: -120, M: 85 },
        quasiPermanent: { N: -90, M: 60 },
      },
    };
    const desordre: SectionModel = {
      ...modeleValide(),
      serviceActions: {
        quasiPermanent: { M: 60, N: -90 },
        characteristic: { M: 85, N: -120 },
      },
    };
    expect(serializeModel(desordre)).toBe(serializeModel(normal));
  });

  it('aller-retour avec les quatre blocs de la version 3', () => {
    const m: SectionModel = {
      ...modeleValide(),
      elementType: 'beam',
      shear: { V_Ed: 180, links: { Asw: 100.5, s: 200, fywk: 500 }, cotTheta: 2.0 },
      restraint: { type: 'central', fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true },
      meyer: {
        h: 800, d1: 50, ds: 16, wk: 0.2, fctm: 2.9, kzt: 0.5,
        cas: 'traction', bridage: 'exterieur', kmode: 'parabolique',
      },
    };
    expect(parseModel(serializeModel(m))).toEqual(m);
  });

  it('aller-retour avec un seul des quatre blocs, et avec leurs champs facultatifs absents', () => {
    const partiels: SectionModel[] = [
      { ...modeleValide(), elementType: 'slab' },
      { ...modeleValide(), shear: { V_Ed: 120 } },
      { ...modeleValide(), shear: { V_Ed: 120, cotTheta: 1.5 } },
      { ...modeleValide(), restraint: { type: 'bending' } },
      {
        ...modeleValide(),
        meyer: {
          h: 500, d1: 40, ds: 12, wk: 0.3, fctm: 2.6, kzt: 1.0,
          cas: 'flexion', bridage: 'interieur',
        },
      },
    ];

    for (const partiel of partiels) {
      expect(parseModel(serializeModel(partiel))).toEqual(partiel);
    }

    // Un champ facultatif absent ne doit pas reapparaitre a l'ecriture : un
    // `cotTheta: 2.5` inscrit d'office ferait passer un defaut du moteur pour
    // un choix d'ingenieur, et le figerait le jour ou ce defaut changerait.
    expect(serializeModel({ ...modeleValide(), shear: { V_Ed: 120 } })).not.toContain('cotTheta');
    expect(serializeModel({ ...modeleValide(), shear: { V_Ed: 120 } })).not.toContain('links');
    expect(serializeModel({ ...modeleValide(), restraint: { type: 'bending' } })).not.toContain(
      'effectiveZoneOnly'
    );
  });

  it('sans les blocs de la version 3, aucun d eux n apparait dans le JSON', () => {
    // Meme regle que `serviceActions` : ni `null`, que la relecture
    // refuserait, ni objet vide, qui mentirait sur l'intention.
    const texte = serializeModel(modeleValide());
    for (const bloc of ['elementType', 'shear', 'restraint', 'meyer']) {
      expect(texte).not.toContain(bloc);
    }
    const relu = parseModel(texte);
    expect(relu.elementType).toBeUndefined();
    expect(relu.shear).toBeUndefined();
    expect(relu.restraint).toBeUndefined();
    expect(relu.meyer).toBeUndefined();
  });

  it('l ordre des cles reste stable pour les blocs de la version 3', () => {
    const normal: SectionModel = {
      ...modeleValide(),
      elementType: 'beam',
      shear: { V_Ed: 180, links: { Asw: 100.5, s: 200, fywk: 500 }, cotTheta: 2.0 },
      restraint: { type: 'central', fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true },
      meyer: {
        h: 800, d1: 50, ds: 16, wk: 0.2, fctm: 2.9, kzt: 0.5,
        cas: 'traction', bridage: 'exterieur', kmode: 'parabolique',
      },
    };
    const desordre = {
      meyer: {
        kmode: 'parabolique', bridage: 'exterieur', cas: 'traction',
        kzt: 0.5, fctm: 2.9, wk: 0.2, ds: 16, d1: 50, h: 800,
      },
      restraint: { effectiveZoneOnly: true, sigmaS: 320, fctEff: 1.8, type: 'central' },
      shear: { cotTheta: 2.0, links: { fywk: 500, s: 200, Asw: 100.5 }, V_Ed: 180 },
      elementType: 'beam',
      ...modeleValide(),
    } as SectionModel;

    expect(serializeModel(desordre)).toBe(serializeModel(normal));
  });

  it('un modele relu en version 1 puis enrichi se reecrit en version 3', () => {
    const v1 = parseModel(avecAlteration((m) => { m.formatVersion = 1; }));
    const enrichi: SectionModel = { ...v1, elementType: 'column', shear: { V_Ed: 45 } };
    const relu = parseModel(serializeModel(enrichi));
    expect(relu.formatVersion).toBe(FORMAT_VERSION);
    expect(relu.elementType).toBe('column');
    expect(relu.shear).toEqual({ V_Ed: 45 });
  });

  it('produit un JSON indente, lisible et versionne en tete', () => {
    const texte = serializeModel(modeleValide());
    expect(texte).toContain('\n  "formatVersion"');
    expect(texte.indexOf('"formatVersion"')).toBeLessThan(texte.indexOf('"geometry"'));
  });
});
