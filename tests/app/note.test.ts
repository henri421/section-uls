/**
 * Tests d'acceptation de la note de calcul commune (etape 8, lot 8.7) :
 * contenu range dans les sections de la note d'aedificium-ui, conclusions
 * generees depuis les blocs qui portent un taux.
 *
 * Purs (aucun jsdom) : ils tournent sur le banc local.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noteDeCalculHtml, texteVisible, type ElementNote } from 'aedificium-ui';

import type { SectionModel } from '../../src/index';
import {
  rectangularSection,
  createConcrete,
  createSteel,
  ec2Recommended,
  verifyShear,
  verifyDetailing,
  verifyServiceUniaxial,
  verifyCrackWidth,
  verifyServiceState,
  sectionCurvature,
} from '../../src/index';
import { modelToForm } from '../../app/src/form';
import { calculerSorties, modeleParDefaut, type Sortie } from '../../app/src/sorties';
import { blocsDEntree, hypothesesDeLaNote, noteDuCalcul } from '../../app/src/note-view';
import { TITRE_FLEXION_ELU } from '../../app/src/uls-view';
import { blocTranchant, blocDispositions } from '../../app/src/checks-view';
import { blocContraintes, blocFissuration, blocCourbure } from '../../app/src/service-view';
import { blocEtatFissuration } from '../../app/src/state-view';
import { STYLES_TRACE } from '../../app/src/export';

const lire = (chemin: string): string => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');

const CARTOUCHE = { projet: 'Immeuble Les Tilleuls', element: 'Poteau P3', date: '2026-10-27' };

function toutCoche(): SectionModel {
  const m = modeleParDefaut();
  return {
    ...m,
    action: { N: 500, My: 80, Mz: 0 },
    checks: { ...m.checks!, service: true, shear: true, detailing: true, restraint: true, sectionState: true },
  };
}

const sortie = (m: SectionModel): Sortie => calculerSorties(modelToForm(m));

type Bloc = Extract<ElementNote, { type: 'bloc' }>;
const blocs = (els: ElementNote[] | undefined): Bloc[] => (els ?? []).filter((e): e is Bloc => e.type === 'bloc');
const titresDe = (els: ElementNote[] | undefined): string[] => blocs(els).map((b) => b.bloc.titre);
const figures = (els: ElementNote[] | undefined) =>
  (els ?? []).filter((e): e is Extract<ElementNote, { type: 'figure' }> => e.type === 'figure');

// --- Cartouche --------------------------------------------------------------

describe('cartouche', () => {
  it('projet, element et date recopies ; outil et norme fixes', () => {
    const c = noteDuCalcul(sortie(modeleParDefaut()), CARTOUCHE).cartouche;
    expect(c.projet).toBe('Immeuble Les Tilleuls');
    expect(c.element).toBe('Poteau P3');
    expect(c.date).toBe('2026-10-27');
    expect(c.outil).toBe('section-uls');
    expect(c.norme).toBe('EN 1992-1-1:2004');
  });

  it('element vide : nom du modele, sinon « Section »', () => {
    const nomme = noteDuCalcul(sortie({ ...modeleParDefaut(), name: 'Poutre P8' }), { ...CARTOUCHE, element: '  ' });
    expect(nomme.cartouche.element).toBe('Poutre P8');
    const anonyme = { ...modeleParDefaut() };
    delete anonyme.name;
    expect(noteDuCalcul(sortie(anonyme), { ...CARTOUCHE, element: '' }).cartouche.element).toBe('Section');
  });
});

// --- Rangement --------------------------------------------------------------

describe('rangement par section', () => {
  const s = sortie(toutCoche());
  const n = noteDuCalcul(s, CARTOUCHE);
  const sec = n.sections;

  it('ni combinaisons ni conclusions saisies : les actions sont des valeurs de calcul', () => {
    expect(sec.combinaisons ?? []).toHaveLength(0);
    expect((sec as Record<string, unknown>).conclusions).toBeUndefined();
  });

  it('geometrie : blocs Géométrie et Armatures, puis le dessin de la section legende', () => {
    expect(titresDe(sec.geometrie)).toEqual(['Géométrie', 'Armatures']);
    const f = figures(sec.geometrie);
    expect(f).toHaveLength(1);
    expect(f[0].svg).toBe(s.dessins.find((d) => d.suffixe === 'section')!.svg);
    expect(f[0].legende ?? '').not.toBe('');
  });

  it('materiaux : le bloc Matériaux des donnees d entree', () => {
    expect(titresDe(sec.materiaux)).toEqual(['Matériaux']);
    expect(blocs(sec.materiaux)[0].bloc.lignes.map((l) => l.libelle)).toContain('fck');
  });

  it('hypotheses : la liste hypothesesDeLaNote d abord, puis profil normatif et parametres de service', () => {
    const h = sec.hypotheses ?? [];
    expect(h[0]).toEqual({ type: 'liste', items: hypothesesDeLaNote(s.resolu) });
    expect(titresDe(h)).toEqual(['Identification et profil normatif', 'Paramètres de service assumés']);
  });

  it('charges : sollicitation ELU puis sollicitations de service', () => {
    expect(titresDe(sec.charges)).toEqual(['Sollicitation ELU', 'Sollicitations de service']);
  });

  it('chaque bloc d entree sort une fois et une seule, hors calculs', () => {
    const entrees = blocsDEntree(s.modele, s.resolu, s.parametres).map((b) => b.titre);
    const ranges = [sec.geometrie, sec.materiaux, sec.hypotheses, sec.charges].flatMap(titresDe);
    expect([...ranges].sort()).toEqual([...entrees].sort());
  });

  it('calculs : tous les blocs de la sortie dans l ordre, puis le diagramme N-My legende', () => {
    expect(titresDe(sec.calculs)).toEqual(s.blocs.map((b) => b.titre));
    const f = figures(sec.calculs);
    expect(f).toHaveLength(1);
    expect(f[0].svg).toBe(s.dessins.find((d) => d.suffixe === 'diagramme-n-my')!.svg);
    expect(f[0].legende ?? '').toMatch(/N-My/);
    expect((sec.calculs ?? []).at(-1)?.type).toBe('figure');
  });

  it('conversion d un bloc : lignes recopiees sans symbole, verdict en derniere ligne, note recopiee', () => {
    const tete = blocs(sec.calculs)[0].bloc;
    const source = s.blocs[0];
    expect(tete.titre).toBe(TITRE_FLEXION_ELU);
    expect(tete.lignes.slice(0, -1)).toEqual(source.lignes.map((l) => ({ symbole: '', libelle: l.libelle, valeur: l.valeur })));
    expect(tete.lignes.at(-1)).toEqual({ symbole: '', libelle: 'Verdict', valeur: source.verdict!.texte });
    expect(tete.note).toBe(source.note);
    const sansVerdict = s.blocs.findIndex((b) => b.verdict === null);
    expect(blocs(sec.calculs)[sansVerdict].bloc.lignes).toHaveLength(s.blocs[sansVerdict].lignes.length);
  });

  it('ELU seul : pas de bloc de service, ni en charges ni en hypotheses', () => {
    const seul = noteDuCalcul(sortie(modeleParDefaut()), CARTOUCHE).sections;
    expect(titresDe(seul.charges)).toEqual(['Sollicitation ELU']);
    expect(titresDe(seul.hypotheses)).toEqual(['Identification et profil normatif']);
  });
});

// --- Taux portes par les blocs ----------------------------------------------

const profil = ec2Recommended();
const beton = createConcrete(30, profil);
const acier = createSteel(500, 200000, profil);
const poutre = () =>
  rectangularSection({ width: 300, height: 500, concrete: beton, rebars: [{ depthFromTop: 450, area: 1000, steel: acier }] });

describe('taux des blocs (BlocService.taux)', () => {
  it('flexion ELU : resultat.utilization', () => {
    const s = sortie(modeleParDefaut());
    expect(s.blocs[0].taux).toBe(s.resultat.utilization);
  });

  it('effort tranchant : r.utilization ; sans calcul : NaN', () => {
    const r = verifyShear(poutre(), { V_Ed: 150, N_Ed: 0 }, profil, { links: { Asw: 100, s: 200, fywk: 500 } });
    expect(blocTranchant({ resultat: r }, 150).taux).toBe(r.utilization);
    expect(blocTranchant({ motif: 'hors domaine' }, 150).taux).toBeNaN();
  });

  it('contraintes en service : max(|σc| / limite, |σs| / limite) ; non converge : NaN', () => {
    const r = verifyServiceUniaxial(poutre(), { N: 0, M: 120 });
    const attendu = Math.max(Math.abs(r.sigmaC) / r.sigmaCLimit, Math.abs(r.sigmaS) / r.sigmaSLimit);
    expect(blocContraintes({ resultat: r }).taux).toBeCloseTo(attendu, 12);
    expect(blocContraintes({ resultat: verifyServiceUniaxial(poutre(), { N: 4000, M: 5 }) }).taux).toBeNaN();
    expect(blocContraintes({ motif: 'pas de combinaison' }).taux).toBeNaN();
  });

  it('ouverture de fissures : w_k / w_max ; sans calcul : NaN', () => {
    const r = verifyCrackWidth(poutre(), { N: 0, M: 120 });
    expect(blocFissuration({ resultat: r }).taux).toBeCloseTo(r.wk / r.wMax, 12);
    expect(blocFissuration({ motif: 'hors domaine' }).taux).toBeNaN();
  });

  it('etat de fissuration : meme taux que les contraintes, sur l etat retenu', () => {
    const r = verifyServiceState(poutre(), { N: 0, M: 120 }, {});
    const attendu = Math.max(Math.abs(r.sigmaC) / r.sigmaCLimit, Math.abs(r.sigmaS) / r.sigmaSLimit);
    expect(blocEtatFissuration({ resultat: r }).taux).toBeCloseTo(attendu, 12);
    expect(blocEtatFissuration({ motif: 'pas de combinaison' }).taux).toBeNaN();
  });

  it('dispositions constructives : verification sans ratio (null) ; sans calcul : NaN', () => {
    const r = verifyDetailing(poutre(), 'beam', { web: { asw: 100, s: 200, fywk: 500 } });
    expect(blocDispositions({ resultat: r }).taux).toBeNull();
    expect(blocDispositions({ motif: 'hors domaine' }).taux).toBeNaN();
  });

  it('blocs qui ne verifient rien : pas de taux', () => {
    const c = sectionCurvature(poutre(), { N: 0, M: 80 }, { n: 15, beta: 0.5 });
    expect(blocCourbure({ resultat: c }).taux).toBeUndefined();
    const s = sortie(modeleParDefaut());
    for (const b of s.blocs.slice(1)) expect(b.taux).toBeUndefined(); // sous-blocs de la flexion
  });

  it('un pieu circulaire refuse le tranchant : verification hors domaine, pas disparue', () => {
    const m = toutCoche();
    const s = sortie({
      ...m,
      geometry: { kind: 'circle', diameter: 600 },
      reinforcement: { kind: 'circular-cage', cover: 50, stirrupDiameter: 10, barDiameter: 20, count: 8 },
    });
    const v = noteDuCalcul(s, CARTOUCHE).verifications.find((x) => x.nom === 'Effort tranchant');
    expect(v).toBeDefined();
    expect(v!.taux).toBeNaN();
    expect(v!.ok).toBe(false);
  });
});

// --- Verifications ----------------------------------------------------------

describe('verifications', () => {
  it('ELU seul : la flexion, clause §6.1, taux et verdict du resultat', () => {
    const s = sortie(modeleParDefaut());
    expect(noteDuCalcul(s, CARTOUCHE).verifications).toEqual([
      { nom: TITRE_FLEXION_ELU, clause: '§6.1', taux: s.resultat.utilization, ok: s.resultat.ok },
    ]);
  });

  it('tout coche : une verification par bloc porteur d un taux, dans l ordre des blocs, clause tiree du titre', () => {
    const s = sortie(toutCoche());
    const v = noteDuCalcul(s, CARTOUCHE).verifications;
    const porteurs = s.blocs.filter((b) => b.taux !== undefined);
    expect(v).toHaveLength(porteurs.length);
    expect(v.map((x) => x.nom)).toEqual([
      TITRE_FLEXION_ELU,
      'État de fissuration',
      'Contraintes en service',
      'Ouverture de fissures',
      'Effort tranchant',
      'Dispositions constructives',
    ]);
    expect(v.map((x) => x.clause)).toEqual(['§6.1', '§7.1(2)', '§7.2', '§7.3', '§6.2', '§9']);
    porteurs.forEach((b, i) => {
      expect(v[i].ok).toBe(b.verdict?.ok ?? false);
      if (b.taux === null) expect(v[i].taux).toBeNull();
      else if (Number.isNaN(b.taux)) expect(v[i].taux).toBeNaN();
      else expect(v[i].taux).toBe(b.taux);
    });
  });

  it('sans verdict ni taux (courbure, etat ELU, deformation genee, Meyer) : pas dans les conclusions', () => {
    const noms = noteDuCalcul(sortie(toutCoche()), CARTOUCHE).verifications.map((x) => x.nom).join(' | ');
    expect(noms).not.toMatch(/Courbure|État sous sollicitation|Déformation gênée|Meyer/);
  });
});

// --- Note HTML complete -----------------------------------------------------

describe('note HTML complete', () => {
  const html = noteDeCalculHtml(noteDuCalcul(sortie(toutCoche()), CARTOUCHE), STYLES_TRACE);
  const t = texteVisible(html);

  it('sections dans l ordre, sans « Combinaisons de charges »', () => {
    const titres = [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => texteVisible(m[1]).trim());
    expect(titres).toEqual([
      '1. Géométrie',
      '2. Matériaux',
      '3. Hypothèses',
      '4. Cas de charges',
      '5. Calculs et vérifications',
      '6. Conclusions',
    ]);
  });

  it('conclusions : dispositions constructives sans taux chiffre, determinante nommee, aucun NaN', () => {
    expect(t).toMatch(/Dispositions constructives[\s|]*§9[\s|]*—/);
    expect(t).toMatch(/Vérification déterminante\s*:/);
    expect(html).not.toContain('NaN');
  });
});

// --- Cablage (lecture du source) --------------------------------------------

describe('cablage', () => {
  const main = lire('../../app/src/main.ts');
  const exportTs = lire('../../app/src/export.ts');

  it('le volet Sorties porte les champs projet et element, gardes dans localStorage', () => {
    expect(main).toMatch(/data-role="projet"/);
    expect(main).toMatch(/data-role="element"/);
    expect(main).toContain('section-uls:cartouche');
  });

  it('exporterNote passe par noteDuCalcul et la note commune ; plus de note locale dans export.ts', () => {
    expect(main).toMatch(/noteDeCalculHtml\(\s*noteDuCalcul\(/);
    expect(main).toMatch(/import\s*\{[^}]*noteDeCalculHtml[^}]*\}\s*from\s*'aedificium-ui'/);
    expect(exportTs).not.toMatch(/export function noteDeCalculHtml|export interface NoteDeCalcul|export const STYLES_NOTE/);
  });
});
