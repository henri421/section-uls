import { describe, it, expect } from 'vitest';
import { parseModel, serializeModel } from '../../src/persistence/parse';
import { resolveChecks } from '../../src/persistence/resolve';
import { FORMAT_VERSION, ENGINE_VERSION } from '../../src/persistence/model-format';
import type { SectionModel } from '../../src/persistence/model-format';

function modeleMinimal(): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    geometry: { kind: 'rectangle', width: 300, height: 500 },
    reinforcement: {
      kind: 'rectangular-layout',
      cover: 30,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 16 } }],
    },
    action: { N: 0, My: 100, Mz: 0 },
  };
}

describe('checks : lecture et ecriture', () => {
  it('fait l aller-retour sans rien perdre', () => {
    const modele = modeleMinimal();
    modele.checks = {
      service: true,
      shear: false,
      detailing: true,
      restraint: true,
      sectionState: false,
      restraintReferential: 'meyer',
      cracking: { mode: 'uncracked', fctEff: 1.8 },
    };

    expect(parseModel(serializeModel(modele)).checks).toEqual(modele.checks);
  });

  it('n invente aucun drapeau absent', () => {
    const modele = modeleMinimal();
    modele.checks = { service: true };

    expect(parseModel(serializeModel(modele)).checks).toEqual({ service: true });
  });

  it('un modele sans checks reste sans checks', () => {
    expect(parseModel(serializeModel(modeleMinimal())).checks).toBeUndefined();
  });

  it('refuse un drapeau qui n est pas un booleen, en nommant le champ', () => {
    const brut = JSON.parse(serializeModel(modeleMinimal()));
    brut.checks = { service: 'oui' };
    expect(() => parseModel(JSON.stringify(brut))).toThrow(/checks\.service/);
  });

  it('refuse un referentiel inconnu en listant ceux qu il accepte', () => {
    const brut = JSON.parse(serializeModel(modeleMinimal()));
    brut.checks = { restraintReferential: 'din' };
    expect(() => parseModel(JSON.stringify(brut))).toThrow(/checks\.restraintReferential/);
    expect(() => parseModel(JSON.stringify(brut))).toThrow(/ec2/);
  });

  it('refuse un mode de fissuration inconnu', () => {
    const brut = JSON.parse(serializeModel(modeleMinimal()));
    brut.checks = { cracking: { mode: 'fissure' } };
    expect(() => parseModel(JSON.stringify(brut))).toThrow(/checks\.cracking\.mode/);
  });
});

describe('resolveChecks : les defauts', () => {
  /**
   * L ENJEU DE LA VERSION 4. Un fichier anterieur ne porte aucun drapeau. Le
   * rouvrir doit montrer exactement les memes verifications que la veille,
   * ni plus ni moins — donc les deduire de ce que le fichier CONTIENT.
   */
  it('un fichier ancien retrouve les verifications que ses donnees impliquent', () => {
    const modele = modeleMinimal();
    delete modele.checks;
    modele.serviceActions = { quasiPermanent: { N: 0, M: 60 } };
    modele.shear = { V_Ed: 120 };

    const resolu = resolveChecks(modele);

    expect(resolu.service).toBe(true);
    expect(resolu.shear).toBe(true);
    // Ni type d element, ni bloc de gene : rien n apparait qui n etait la.
    expect(resolu.detailing).toBe(false);
    expect(resolu.restraint).toBe(false);
  });

  it('un fichier ancien sans aucune donnee optionnelle ne verifie que la flexion', () => {
    const resolu = resolveChecks(modeleMinimal());

    expect(resolu.service).toBe(false);
    expect(resolu.shear).toBe(false);
    expect(resolu.detailing).toBe(false);
    expect(resolu.restraint).toBe(false);
  });

  it('le bloc Meyer suffit a cocher la deformation genee', () => {
    const modele = modeleMinimal();
    modele.meyer = {
      h: 800, d1: 40, ds: 16, wk: 0.3, fctm: 2.6, kzt: 0.5,
      cas: 'traction', bridage: 'exterieur',
    };

    expect(resolveChecks(modele).restraint).toBe(true);
  });

  /**
   * `sectionState` ne peut pas se deduire : aucun fichier ancien n en porte
   * la trace, et la verification ne reclame aucune saisie supplementaire.
   */
  it('l etat sous sollicitation est actif par defaut', () => {
    expect(resolveChecks(modeleMinimal()).sectionState).toBe(true);
  });

  it('un drapeau explicite l emporte toujours sur la deduction', () => {
    const modele = modeleMinimal();
    modele.serviceActions = { quasiPermanent: { N: 0, M: 60 } };
    modele.checks = { service: false, sectionState: false };

    const resolu = resolveChecks(modele);
    expect(resolu.service).toBe(false);
    expect(resolu.sectionState).toBe(false);
  });

  it('le referentiel par defaut est le comparatif, et la fissuration automatique', () => {
    const resolu = resolveChecks(modeleMinimal());

    expect(resolu.restraintReferential).toBe('both');
    expect(resolu.cracking.mode).toBe('auto');
    expect(resolu.cracking.fctEff).toBeUndefined();
  });
});
