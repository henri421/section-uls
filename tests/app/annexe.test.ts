// Lot E (audit R4) : annexe nationale luxembourgeoise preremplie, coefficients modifiables.
import { afterEach, describe, expect, it } from 'vitest';
import { definirLangue, noteDeCalculHtml, texteVisible } from 'aedificium-ui';
import { parseModel, serializeModel } from '../../src/index';
import { coefsDeLAnnexe } from '../../app/src/annexe';
import { appliquerAnnexe, formToModel, modelToForm } from '../../app/src/form';
import { noteDuCalcul } from '../../app/src/note-view';
import { calculerSorties, modeleParDefaut } from '../../app/src/sorties';

const CARTOUCHE = { projet: 'P', element: 'E', date: '2026-11-17' };

describe('annexe nationale', () => {
  afterEach(() => definirLangue('fr'));

  it('Luxembourg : alpha_cc = 0,85, gamma_c et gamma_s recommandes, sources AN-LU', () => {
    const lu = coefsDeLAnnexe('lu');
    expect(lu.alphaCc.valeur).toBe(0.85);
    expect(lu.alphaCc.source).toMatch(/^ILNAS-EN 1992-1-1\/AN-LU:2020, 3\.1\.6\(1\)P : valeur présumée/);
    expect(lu.gammaC.valeur).toBe(1.5);
    expect(lu.gammaS.valeur).toBe(1.15);
    expect(lu.gammaC.source).toMatch(/recommandée présumée retenue/);
  });

  it('par defaut : valeurs recommandees ; changer d annexe repremplit les champs', () => {
    const f = modelToForm(modeleParDefaut());
    expect(f.annexe).toBe('recommande');
    const lu = appliquerAnnexe(f, 'lu');
    expect(lu.alphaCc).toBe('0.85');
    expect(lu.annexe).toBe('lu');
    expect(appliquerAnnexe(lu, 'recommande').alphaCc).toBe('1');
  });

  it('nom du profil enregistre et relu : EC2_LU, puis EC2_LU_personnalise si une valeur change', () => {
    const lu = appliquerAnnexe(modelToForm(modeleParDefaut()), 'lu');
    const m = formToModel(lu);
    expect(m.norm.name).toBe('EC2_LU');
    expect(modelToForm(parseModel(serializeModel(m))).annexe).toBe('lu');
    const imp = formToModel({ ...lu, gammaC: '1.4' });
    expect(imp.norm.name).toBe('EC2_LU_personnalise');
    expect(modelToForm(imp).annexe).toBe('lu');
    expect(formToModel(modelToForm(modeleParDefaut())).norm.name).toBe('EC2_recommended');
  });

  it('note : norme, annexe, sources, valeur imposee et avertissement', () => {
    const note = noteDuCalcul(calculerSorties({ ...appliquerAnnexe(modelToForm(modeleParDefaut()), "lu"), gammaC: "1.4" }), CARTOUCHE);
    expect(note.cartouche.norme).toContain('AN-LU:2020');
    expect(note.avertissements?.[0]).toMatch(/^Annexe nationale luxembourgeoise/);
    const texte = texteVisible(noteDeCalculHtml(note, ''));
    expect(texte).toContain('ILNAS-EN 1992-1-1/AN-LU:2020, 3.1.6(1)P');
    expect(texte).toContain('imposée');
    expect(texte).toMatch(/0,85/);
  });

  it('valeurs recommandees : ni avertissement ni mention luxembourgeoise', () => {
    const note = noteDuCalcul(calculerSorties(modelToForm(modeleParDefaut())), CARTOUCHE);
    expect(note.cartouche.norme).toBe('EN 1992-1-1:2004');
    expect(note.avertissements ?? []).toHaveLength(0);
  });
});
