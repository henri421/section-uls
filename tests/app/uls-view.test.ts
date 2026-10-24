import { describe, it, expect } from 'vitest';
import {
  resolveModel,
  verifySection,
  capacityAtAngle,
  FORMAT_VERSION,
  ENGINE_VERSION,
} from '../../src/index';
import type { SectionModel } from '../../src/index';

import { blocsFlexionUls, TITRE_FLEXION_ELU, NOTE_BRAS_DE_LEVIER } from '../../app/src/uls-view';

/**
 * La flexion ELU mise en blocs.
 *
 * Ces blocs sont lus a la fois par l'ecran, le CSV et la note : c'est ce qui
 * garantit que la note porte la verification ELU affichee.
 */

function poutre(My: number): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    name: 'Poutre',
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    geometry: { kind: 'rectangle', width: 300, height: 500 },
    reinforcement: {
      kind: 'rectangular-layout',
      cover: 30,
      stirrupDiameter: 8,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    },
    action: { N: 0, My, Mz: 0 },
  };
}

function blocs(My: number) {
  const resolu = resolveModel(poutre(My));
  const resultat = verifySection(resolu.section, resolu.action, resolu.norm, { mode: 'constant-N' });
  const etatAxe =
    resultat.neutralAxis === null
      ? null
      : capacityAtAngle(resolu.section, resultat.neutralAxis.angle, resolu.action.N, resolu.norm);
  return { liste: blocsFlexionUls(resolu, resultat, etatAxe), resultat };
}

describe('blocsFlexionUls', () => {
  it('le premier bloc porte le verdict ELU et le taux', () => {
    const { liste, resultat } = blocs(100);
    const tete = liste[0];

    expect(tete.titre).toBe(TITRE_FLEXION_ELU);
    expect(tete.verdict).not.toBeNull();
    expect(tete.verdict?.ok).toBe(resultat.ok);
    expect(tete.verdict?.texte).toMatch(/^Vérifié — taux 0,\d+$/);
  });

  it('un moment excessif rend un verdict defavorable', () => {
    const { liste } = blocs(400);
    expect(liste[0].verdict?.ok).toBe(false);
    expect(liste[0].verdict?.texte).toMatch(/^Non vérifié/);
  });

  it('rend le moment résistant calcule à la main', () => {
    // 3 HA20 : A_s = 942,5 mm², f_yd = 500 / 1,15 = 434,8 MPa, F_s = 409,8 kN.
    // d = 500 − 30 − 8 − 10 = 452 mm ; f_cd = 25 / 1,5 = 16,67 MPa.
    // Parabole-rectangle : alpha = 0,8095, beta = 0,416.
    // x = 409,8e3 / (0,8095 × 300 × 16,67) = 101,2 mm ; z = 452 − 0,416 × 101,2 = 409,9 mm.
    // M_Rd = 409,8 × 0,4099 = 168,0 kN·m.
    const { liste } = blocs(100);
    const resistance = liste.find((b) => b.titre === 'Résistance');
    const ligne = resistance?.lignes.find((l) => l.libelle === 'Moment résistant');
    const valeur = Number(ligne?.valeur.replace(/\s/g, '').replace(',', '.').replace('kN.m', ''));

    expect(valeur).toBeGreaterThan(168.0 * 0.99);
    expect(valeur).toBeLessThan(168.0 * 1.01);
  });

  it('rend les groupes de l ecran, dans l ordre', () => {
    const titres = blocs(100).liste.map((b) => b.titre);
    expect(titres).toEqual([
      TITRE_FLEXION_ELU,
      'Sollicitation',
      'Résistance',
      'Équilibre de la section',
      'Matériaux',
      'Ferraillage',
    ]);
  });

  it('joint l explication des deux bras de levier à l\'équilibre, en texte brut', () => {
    const equilibre = blocs(100).liste.find((b) => b.titre === 'Équilibre de la section');
    expect(equilibre?.note).toBe(NOTE_BRAS_DE_LEVIER);
    expect(NOTE_BRAS_DE_LEVIER).not.toMatch(/[<>]/);
  });

  it('n affiche aucun NaN', () => {
    for (const b of blocs(100).liste) {
      for (const l of b.lignes) expect(l.valeur, `${b.titre} / ${l.libelle}`).not.toContain('NaN');
    }
  });
});
