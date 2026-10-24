/**
 * Tests d'acceptation de l'etape 8.2 (finitions) : notations, arrondis,
 * accents, titre, phrases types, sur le texte VISIBLE (resultat a l'ecran,
 * dessins, note, CSV, page). Le controle lui-meme vit dans aedificium-ui
 * (`constatsAffichage`).
 *
 * Le formulaire, construit par main.ts, n'est pas couvert ici : il se juge a
 * l'ecran.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NOMS_GRECS, constatsAffichage, contenuBalise, texteVisible } from 'aedificium-ui';
import type { SectionModel } from '../../src/index';
import { modelToForm } from '../../app/src/form';
import { STYLES_NOTE, noteDeCalculHtml, resultatsEnCsv } from '../../app/src/export';
import { blocsDEntree, hypothesesDeLaNote } from '../../app/src/note-view';
import { calculerSorties, modeleParDefaut } from '../../app/src/sorties';

const TITRE = 'Sections en béton armé';
const lire = (chemin: string): string => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');
const controler = (nom: string, html: string): string[] => constatsAffichage(texteVisible(html)).map((c) => `${nom} : ${c}`);

function toutCoche(): SectionModel {
  const m = modeleParDefaut();
  return {
    ...m,
    action: { N: 500, My: 80, Mz: 0 },
    checks: { ...m.checks!, service: true, shear: true, detailing: true, restraint: true, sectionState: true },
  };
}

function poutre(): SectionModel {
  const m = toutCoche();
  return {
    ...m,
    name: 'Poutre',
    geometry: { kind: 'rectangle', width: 300, height: 500 },
    reinforcement: {
      kind: 'rectangular-layout',
      cover: 30,
      stirrupDiameter: 8,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    },
    action: { N: 0, My: 150, Mz: 0 },
  };
}

const MODELES: [string, SectionModel][] = [
  ['par defaut', modeleParDefaut()],
  ['tout coche', toutCoche()],
  ['poutre', poutre()],
  ['ruine', { ...modeleParDefaut(), action: { N: 500, My: 900, Mz: 0 } }],
];

function sorties() {
  const ecran: string[] = [];
  const notes: string[] = [];
  const csv: string[] = [];
  for (const [, m] of MODELES) {
    const s = calculerSorties(modelToForm(m));
    ecran.push(s.resultatHtml, ...s.dessins.map((d) => d.svg));
    const entrees = blocsDEntree(s.modele, s.resolu, s.parametres);
    notes.push(
      noteDeCalculHtml(
        {
          titre: s.modele.name ?? 'Section',
          date: '2026-10-24',
          entrees,
          dessins: s.dessins.map((d) => d.svg),
          verifications: s.blocs,
          hypotheses: hypothesesDeLaNote(s.resolu),
        },
        STYLES_NOTE
      )
    );
    csv.push(resultatsEnCsv([...entrees, ...s.blocs]));
  }
  return { ecran, notes, csv };
}

describe('texte visible : notations, arrondis, accents, phrases types', () => {
  const s = sorties();

  it('resultat a l ecran et dessins', () => {
    expect(s.ecran.flatMap((h, i) => controler(`ecran ${i}`, h))).toEqual([]);
  });

  it('note de calcul', () => {
    expect(s.notes.flatMap((h, i) => controler(`note ${i}`, h))).toEqual([]);
  });

  it('page (index.html)', () => {
    expect(controler('page', lire('../../app/index.html'))).toEqual([]);
  });

  it('CSV : texte brut, ni « _ » ni nom de lettre grecque ni balise', () => {
    for (const c of s.csv) {
      expect(c).not.toContain('_');
      expect(c).not.toMatch(NOMS_GRECS);
      expect(c).not.toContain('<');
    }
  });
});

describe('titre', () => {
  const page = lire('../../app/index.html');

  it('titre de la page sans tiret, majuscule initiale', () => {
    expect(contenuBalise(page, 'h1')).toBe(TITRE);
    expect(contenuBalise(page, 'title')?.startsWith(TITRE)).toBe(true);
  });

  it('titre en grand', () => {
    const regle = /(^|\n)(header\s+)?h1\s*\{([^}]*)\}/.exec(lire('../../app/src/style.css'))?.[3] ?? '';
    expect(regle).toMatch(/font-size:\s*1\.75rem/);
    expect(regle).toMatch(/font-weight:\s*600/);
  });
});

describe('main.ts passe par les fonctions testees', () => {
  it('calcul des sorties', () => {
    const main = lire('../../app/src/main.ts');
    expect(main).toContain("from './sorties'");
    expect(main).toContain('calculerSorties(');
    expect(main).not.toMatch(/function modeleParDefaut|function blocsDeService|function blocsDeVerifications|function htmlResultat/);
  });
});
