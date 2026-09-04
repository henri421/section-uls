import { describe, it, expect } from 'vitest';
import { formToModel, modelToForm } from '../../app/src/form';
import { outlineOf, boundingBox, neutralAxisSegment } from '../../app/src/draw';
import {
  resolveModel,
  verifySection,
  polygonArea,
  FORMAT_VERSION,
  ENGINE_VERSION,
} from '../../src/index';
import type { SectionModel } from '../../src/index';

/**
 * Coherence de bout en bout : la chaine que parcourt l'interface —
 * formulaire, modele, resolution, verification — doit rendre exactement ce
 * que rend un appel direct au noyau. L'interface ne doit RIEN changer au
 * resultat.
 *
 * Le cablage DOM lui-meme n'est pas teste automatiquement (choix assume,
 * documente dans la spec de session 5) : il est garde mince, et tout ce qui
 * calcule vit dans les modules purs testes par ailleurs.
 */

function modeleDevie(): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    name: 'Poteau P1',
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
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
    action: { N: 500, My: 80, Mz: 40 },
  };
}

describe('chaine de bout en bout de l interface', () => {
  it('le passage par le formulaire ne change pas le verdict', () => {
    const modele = modeleDevie();

    const direct = resolveModel(modele);
    const verdictDirect = verifySection(direct.section, direct.action, direct.norm);

    // Le meme modele, apres un aller-retour par l'etat du formulaire.
    const parLeFormulaire = resolveModel(formToModel(modelToForm(modele)));
    const verdictFormulaire = verifySection(
      parLeFormulaire.section,
      parLeFormulaire.action,
      parLeFormulaire.norm
    );

    expect(verdictFormulaire.ok).toBe(verdictDirect.ok);
    expect(verdictFormulaire.utilization).toBe(verdictDirect.utilization);
    expect(verdictFormulaire.M_Rd).toEqual(verdictDirect.M_Rd);
    expect(verdictFormulaire.neutralAxis).toEqual(verdictDirect.neutralAxis);
  });

  it('le trace montre la geometrie reellement calculee, et un axe neutre oblique', () => {
    const resolu = resolveModel(modeleDevie());
    const resultat = verifySection(resolu.section, resolu.action, resolu.norm);

    const contour = outlineOf(resolu.section);
    expect(polygonArea(contour)).toBeCloseTo(400 * 400, 6);

    // Les barres dessinees sont celles de la section resolue, pas une copie.
    expect(resolu.section.rebars).toHaveLength(6);

    // Sollicitation deviee (My et Mz tous deux non nuls) : l'axe neutre doit
    // etre franchement oblique, et traverser la section.
    expect(resultat.neutralAxis).not.toBeNull();
    const angle = resultat.neutralAxis!.angle;
    expect(Math.abs(Math.sin(angle))).toBeGreaterThan(1e-3);
    expect(Math.abs(Math.cos(angle))).toBeGreaterThan(1e-3);

    const segment = neutralAxisSegment(
      boundingBox(contour),
      angle,
      resultat.neutralAxis!.offset
    );
    expect(segment).not.toBeNull();
  });
});
