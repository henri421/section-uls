/**
 * Version anglaise (lot 8.8) : page `en/index.html` de meme squelette que la
 * page francaise, et AUCUN reste de francais dans ce qui s'affiche en anglais.
 * Chaque sortie passe par les memes traducteurs que main.ts, sur plusieurs
 * sections (rectangle, cercle, polygone ; poteau, poutre, dalle ; chaque
 * referentiel de deformation genee) et sur les erreurs de saisie de chaque
 * champ. Le formulaire, construit par main.ts dans le document, se controle
 * dans le navigateur. Le francais est couvert par les autres tests, inchanges.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { constatsAffichage, contenuBalise, definirLangue, noteDeCalculHtml, texteVisible } from 'aedificium-ui';
import type { SectionModel } from '../../src/index';
import { STYLES_TRACE, resultatsEnCsv } from '../../app/src/export';
import { modelToForm, type FormState } from '../../app/src/form';
import { blocsDEntree, noteDuCalcul } from '../../app/src/note-view';
import { calculerSorties, modeleParDefaut } from '../../app/src/sorties';
import { notationHtml, tr, trBlocs, trHtml } from '../../app/src/textes';

const lire = (chemin: string): string => readFileSync(fileURLToPath(new URL(chemin, import.meta.url)), 'utf8');
/** Mots francais sans accent : le controle commun ne les voit pas. */
const MOTS_FR =
  /(?<![\p{L}'])(de|la|le|les|du|des|et|pour|sur|par|une|est|avec|sans|aux|au|ou|dans|selon|entre|ne|pas|non|oui|barre|barres|armature|armatures|beton|effort|fois|sous|axe|lits|cadres|poutre|poteau|dalle|calcul|resultat)(?![\p{L}'-])/iu;
const motsFrancais = (texte: string): string[] =>
  texte
    .split(/\n|\s*\|\s*|(?<=[.:;])\s/)
    .filter((l) => MOTS_FR.test(l))
    .map((l) => `mot francais sans accent : « ${l.trim().slice(0, 120)} »`);
const controler = (nom: string, html: string): string[] => {
  const t = texteVisible(html).replace(/Version française/g, '');
  return [...constatsAffichage(t, { langue: 'en' }), ...motsFrancais(t)].map((c) => `${nom} : ${c}`);
};
/** CSV : la virgule y est le separateur, pas une virgule decimale. */
const controlerCsv = (nom: string, csv: string): string[] =>
  [...constatsAffichage(csv, { langue: 'en' }), ...motsFrancais(csv.split(/[\n;,]/).join('\n'))]
    .filter((c) => !c.startsWith('virgule decimale'))
    .map((c) => `${nom} : ${c}`);

/** Squelette d'une page : les attributs que lit le script, dans l'ordre. */
function squelette(html: string): string[] {
  return [...html.matchAll(/\s(id|data-[a-z-]+|type|inputmode|accept|value)="([^"]*)"/g)].map((m) => `${m[1]}=${m[2]}`);
}

function toutCoche(): SectionModel {
  const m = modeleParDefaut();
  return {
    ...m,
    action: { N: 500, My: 80, Mz: 0 },
    checks: { ...m.checks!, service: true, shear: true, detailing: true, restraint: true, sectionState: true },
  };
}

/** Sections et options : chaque famille de sortie au moins une fois. */
function variantes(): Array<[string, FormState]> {
  const base = modelToForm(toutCoche());
  return [
    ['par defaut', modelToForm(modeleParDefaut())],
    ['tout coche', base],
    ['ruine', modelToForm({ ...toutCoche(), action: { N: 500, My: 900, Mz: 0 } })],
    ['biaxial', modelToForm({ ...toutCoche(), action: { N: 500, My: 120, Mz: 60 } })],
    ['traction', modelToForm({ ...toutCoche(), action: { N: -300, My: 20, Mz: 0 } })],
    ['poutre', { ...base, elementType: 'beam', N: '0', My: '150', V_Ed: '120' }],
    ['dalle', { ...base, elementType: 'slab', N: '0', My: '60', V_Ed: '40' }],
    ['flexion genee', { ...base, restraintType: 'bending' }],
    ['meyer', { ...base, restraintReferential: 'meyer' }],
    ['deux referentiels', { ...base, restraintReferential: 'both', thicknessConvention: 'de', restraintMethod: 'din' }],
    ['fissure', { ...base, crackingMode: 'cracked' }],
    ['non fissure', { ...base, crackingMode: 'uncracked' }],
    [
      'cercle',
      { ...base, geometryKind: 'circle', diameter: '500', segments: '48', reinforcementKind: 'circular-cage', cageBarDiameter: '16', cageCount: '10', cageRotationOffset: '0' },
    ],
    ['polygone', { ...base, geometryKind: 'polygon', vertices: '-200 ; -300\n200 ; -300\n200 ; 300\n-200 ; 300' }],
  ];
}

/** Tout ce qui s'affiche pour une saisie : ecran, note, CSV ; ou l'erreur. */
function sorties(etat: FormState): { ecran: string[]; note: string; csv: string } | { erreur: string } {
  let s: ReturnType<typeof calculerSorties>;
  try {
    s = calculerSorties(etat);
  } catch (e) {
    return { erreur: notationHtml(e instanceof Error ? e.message : String(e)) };
  }
  const ecran = [s.resultatHtml, s.diagrammeHtml, ...s.dessins.map((d) => d.svg)].map(trHtml);
  const note = noteDeCalculHtml(noteDuCalcul(s, { projet: 'Hall', element: '', date: '2026-10-30' }), STYLES_TRACE);
  const csv = resultatsEnCsv(trBlocs([...blocsDEntree(s.modele, s.resolu, s.parametres), ...s.blocs]));
  return { ecran, note, csv };
}

/** Une saisie fautive par champ texte : le message d'erreur de chacun. */
function messagesDErreur(): string[] {
  const base = modelToForm(toutCoche());
  const messages = new Set<string>();
  for (const [cle, val] of Object.entries(base)) {
    if (typeof val !== 'string') continue;
    for (const mauvais of ['abc', '-1', '0', '']) {
      try {
        calculerSorties({ ...base, [cle]: mauvais } as FormState);
      } catch (e) {
        messages.add(e instanceof Error ? e.message : String(e));
      }
    }
  }
  return [...messages];
}

describe('page anglaise', () => {
  const fr = lire('../../app/index.html');
  const en = lire('../../app/en/index.html');

  it('meme squelette que la page francaise', () => {
    expect(squelette(en)).toEqual(squelette(fr));
  });

  it('langue, script commun, liens entre les deux versions', () => {
    expect(en).toContain('<html lang="en">');
    expect(en).toContain('src="../src/main.ts"');
    expect(en).toMatch(/class="barre-langue" href="\.\.\/"/);
    expect(fr).toMatch(/class="barre-langue" href="en\/"/);
  });

  it('titre anglais, aucun reste de francais', () => {
    expect(contenuBalise(en, 'h1')).toBe('Reinforced concrete sections');
    expect(controler('page', en)).toEqual([]);
  });
});

describe('affichage en anglais', () => {
  beforeEach(() => definirLangue('en'));
  afterEach(() => definirLangue('fr'));

  it('ecran, dessins, note et CSV de chaque variante', () => {
    const constats: string[] = [];
    let calcules = 0;
    for (const [nom, etat] of variantes()) {
      const s = sorties(etat);
      if ('erreur' in s) {
        constats.push(...controler(`${nom} erreur`, `<p>${s.erreur}</p>`));
        continue;
      }
      calcules++;
      constats.push(...s.ecran.flatMap((h, j) => controler(`${nom} ecran ${j}`, h)));
      constats.push(...controler(`${nom} note`, s.note));
      constats.push(...controlerCsv(`${nom} csv`, s.csv));
    }
    expect(calcules).toBeGreaterThan(10);
    expect(constats).toEqual([]);
  });

  it('messages et erreurs de saisie', () => {
    const constats: string[] = [];
    for (const m of messagesDErreur()) constats.push(...controler('saisie', `<p>${notationHtml(m)}</p>`));
    for (const m of ['Une nouvelle version est disponible. Recharger maintenant ?', 'Calcul en cours…', 'Trace du domaine en cours…', 'element absent de la page : #x']) {
      constats.push(...controler('message', `<p>${tr(m)}</p>`));
    }
    expect(constats).toEqual([]);
  });
});
