import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import {
  svgAutonome,
  resultatsEnCsv,
  noteDeCalculHtml,
  PALETTE,
  STYLES_TRACE,
} from '../../app/src/export';
import type { BlocService } from '../../app/src/service-view';
import { sansCalcul } from '../../app/src/service-view';

/**
 * Tests des SORTIES : ce qui quitte la page.
 *
 * Tout ce qui compose un document est PUR — aucune API de navigateur — donc
 * tout se teste ici. Le telechargement seul touche au navigateur, et il est
 * teste dans `cablage.test.ts`.
 */

const CHEMIN_CSS = fileURLToPath(new URL('../../app/src/style.css', import.meta.url));

/** Le SVG tel que `dessiner()` le produit, reduit a ce qui compte ici. */
const SVG_SECTION =
  '<svg viewBox="-40 -40 480 480" preserveAspectRatio="xMidYMid meet">' +
  '<polygon points="-200,-200 200,-200 200,200 -200,200" class="zone-comprimee" />' +
  '<polygon points="-200,-200 200,-200 200,200 -200,200" class="contour" stroke-width="1.3" />' +
  '<circle cx="-150" cy="150" r="10" class="barre-tendue" />' +
  '</svg>';

/** Analyse le document comme un vrai lecteur de SVG : en XML, pas en HTML. */
function analyserSvg(document: string): Document {
  const dom = new JSDOM(document, { contentType: 'image/svg+xml' });
  return dom.window.document;
}

describe('svgAutonome', () => {
  it('conserve le contenu du SVG d origine', () => {
    const sortie = svgAutonome(SVG_SECTION, STYLES_TRACE);

    expect(sortie).toContain('class="zone-comprimee"');
    expect(sortie).toContain('class="contour"');
    expect(sortie).toContain('class="barre-tendue"');
    expect(sortie).toContain('viewBox="-40 -40 480 480"');
  });

  it('porte une balise style A L INTERIEUR du svg', () => {
    const racine = analyserSvg(svgAutonome(SVG_SECTION, STYLES_TRACE)).documentElement;

    expect(racine.tagName).toBe('svg');
    expect(racine.querySelector('style')).not.toBeNull();
  });

  it('declare le namespace SVG, sans quoi le fichier ne s ouvre pas hors navigateur', () => {
    const racine = analyserSvg(svgAutonome(SVG_SECTION, STYLES_TRACE)).documentElement;

    expect(racine.namespaceURI).toBe('http://www.w3.org/2000/svg');
  });

  it('DEFINIT les variables CSS du trace, sans quoi le dessin sort sans couleur', () => {
    // Le piege de toute la tache : les couleurs viennent de `:root` DANS la
    // page. Un SVG extrait tel quel s ouvre noir sur noir chez qui le recoit.
    const style = analyserSvg(svgAutonome(SVG_SECTION, STYLES_TRACE)).querySelector('style');
    const css = style?.textContent ?? '';

    for (const variable of ['--texte', '--compression', '--traction']) {
      expect(css).toContain(`${variable}:`);
    }
    // Et les classes qui les consomment, sinon les variables ne servent a rien.
    expect(css).toContain('.zone-comprimee');
    expect(css).toContain('.contour');
    expect(css).toContain('.barre-tendue');
  });

  it('ajoute un fond opaque : un dessin sans fond s imprime sur du noir', () => {
    const css =
      analyserSvg(svgAutonome(SVG_SECTION, STYLES_TRACE)).querySelector('style')?.textContent ?? '';

    expect(css).toMatch(/svg\s*\{[^}]*background/);
  });

  it('n altere pas un SVG qui declare deja son namespace', () => {
    const deja = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect /></svg>`;
    const sortie = svgAutonome(deja, STYLES_TRACE);

    expect(sortie.match(/xmlns=/g)).toHaveLength(1);
    expect(analyserSvg(sortie).documentElement.tagName).toBe('svg');
  });

  it('ne retient que le SVG quand la legende HTML le suit', () => {
    // `dessiner()` rend le trace SUIVI d une legende `<p>`, qui n est pas du
    // SVG et casserait le document XML.
    const avecLegende = `${SVG_SECTION}<p class="legende"><span>zone comprimee</span></p>`;
    const sortie = svgAutonome(avecLegende, STYLES_TRACE);

    expect(sortie).not.toContain('class="legende"');
    expect(sortie).not.toContain('zone comprimee');
    expect(analyserSvg(sortie).documentElement.tagName).toBe('svg');
  });

  it('un SVG vide ne produit pas un document casse', () => {
    const sortie = svgAutonome('', STYLES_TRACE);

    expect(sortie).not.toContain('undefined');
    const racine = analyserSvg(sortie).documentElement;
    expect(racine.tagName).toBe('svg');
    expect(racine.querySelector('style')).not.toBeNull();
  });
});

describe('la palette exportee ne derive pas de celle de la page', () => {
  it('chaque variable porte la meme valeur que dans style.css', () => {
    // Les documents exportes embarquent leur propre feuille de style : c est
    // la condition pour qu ils s ouvrent ailleurs. Ce test est ce qui empeche
    // cette copie de diverger en silence de la page qu elle represente.
    const css = readFileSync(CHEMIN_CSS, 'utf8');
    const declarations = [...PALETTE.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)];

    expect(declarations.length).toBeGreaterThan(5);

    for (const [, nom, valeur] of declarations) {
      const dansLaPage = new RegExp(`${nom}\\s*:\\s*([^;]+);`).exec(css);
      expect(dansLaPage, `${nom} absente de style.css`).not.toBeNull();
      expect(dansLaPage?.[1].trim(), `${nom} a derive de style.css`).toBe(valeur.trim());
    }
  });
});

// --- CSV des resultats -------------------------------------------------------

const BLOC_CONTRAINTES: BlocService = {
  titre: 'Contraintes en service (§7.2)',
  lignes: [
    { libelle: 'σc', valeur: '12,3 MPa (limite 15,0 MPa)' },
    { libelle: 'σs', valeur: '210,4 MPa (limite 400,0 MPa)' },
  ],
  verdict: { ok: true, texte: 'Contraintes de service verifiees' },
  note: null,
};

/** Le contenu, BOM et en-tete retires, decoupe en lignes. */
function lignesDe(csv: string): string[] {
  return csv.replace(/^\uFEFF/, '').split('\r\n').slice(1);
}

describe('resultatsEnCsv', () => {
  it('rend une ligne par grandeur affichee, colonnes separees par un point-virgule', () => {
    // Le separateur decimal est la VIRGULE (`formatNumber` la produit) : la
    // prendre aussi comme separateur de colonnes couperait chaque nombre en
    // deux. Le point-virgule est aussi ce qu attend un tableur francais.
    const lignes = lignesDe(resultatsEnCsv([BLOC_CONTRAINTES]));

    expect(lignes[0]).toBe('Contraintes en service (§7.2);σc;12,3 MPa (limite 15,0 MPa)');
    expect(lignes[1]).toBe('Contraintes en service (§7.2);σs;210,4 MPa (limite 400,0 MPa)');
  });

  it('porte un en-tete de colonnes', () => {
    const csv = resultatsEnCsv([BLOC_CONTRAINTES]).replace(/^\uFEFF/, '');
    expect(csv.split('\r\n')[0]).toBe('Bloc;Grandeur;Valeur');
  });

  it('commence par le BOM, sans quoi Excel massacre les accents et les σ', () => {
    // Le BOM est le seul moyen fiable de dire a Excel que le fichier est en
    // UTF-8. Sans lui, les libelles de ce module — σ, ρ, ζ — sortent illisibles.
    expect(resultatsEnCsv([BLOC_CONTRAINTES]).startsWith('\uFEFF')).toBe(true);
  });

  it('rapporte le verdict du bloc', () => {
    const lignes = lignesDe(resultatsEnCsv([BLOC_CONTRAINTES]));

    expect(lignes).toContain(
      'Contraintes en service (§7.2);Verdict;Contraintes de service verifiees'
    );
  });

  it('echappe un champ contenant un point-virgule, un guillemet ou un saut de ligne', () => {
    const piege: BlocService = {
      titre: 'Dispositions constructives (§9)',
      lignes: [
        { libelle: 'Violations', valeur: 'A_s < A_s,min ; cadres absents' },
        { libelle: 'Mode dit "simplifie"', valeur: 'ligne 1\nligne 2' },
      ],
      verdict: { ok: false, texte: 'Dispositions constructives non respectees' },
      note: null,
    };

    const lignes = lignesDe(resultatsEnCsv([piege]));

    expect(lignes[0]).toBe(
      'Dispositions constructives (§9);Violations;"A_s < A_s,min ; cadres absents"'
    );
    expect(lignes[1]).toBe(
      'Dispositions constructives (§9);"Mode dit ""simplifie""";"ligne 1\nligne 2"'
    );
  });

  it('SORT un module hors domaine, AVEC son motif', () => {
    // Une absence silencieuse serait pire qu une ligne vide : le lecteur
    // croirait la verification faite.
    const hors = sansCalcul(
      'Ouverture de fissures (§7.3)',
      'Geometrie non rectangulaire. Les formules du §7.3.4 supposent une zone tendue rectangulaire.'
    );

    const lignes = lignesDe(resultatsEnCsv([BLOC_CONTRAINTES, hors]));

    expect(lignes.some((l) => l.startsWith('Ouverture de fissures (§7.3);'))).toBe(true);
    expect(lignes.join('\n')).toContain('Geometrie non rectangulaire');
  });

  it('ne laisse AUCUN bloc sans ligne, meme prive de tout', () => {
    const muet: BlocService = { titre: 'Bloc muet', lignes: [], verdict: null, note: null };

    const lignes = lignesDe(resultatsEnCsv([muet]));

    expect(lignes.some((l) => l.startsWith('Bloc muet;'))).toBe(true);
  });
});

// --- Note de calcul ----------------------------------------------------------

const ENTREES: BlocService[] = [
  {
    titre: 'Geometrie',
    lignes: [
      { libelle: 'Forme', valeur: 'rectangle 400 × 400 mm' },
      { libelle: 'Aire de beton', valeur: '160000 mm²' },
    ],
    verdict: null,
    note: null,
  },
  {
    titre: 'Sollicitation ELU',
    lignes: [{ libelle: 'N', valeur: '500,0 kN' }],
    verdict: null,
    note: null,
  },
];

const VERIFICATIONS: BlocService[] = [
  {
    titre: 'Effort tranchant (§6.2)',
    lignes: [
      { libelle: 'V_Rd,c (sans armature d ame)', valeur: '82,4 kN' },
      { libelle: 'Taux V_Ed / V_Rd', valeur: '0,73' },
    ],
    verdict: { ok: true, texte: 'Effort tranchant verifie' },
    note: null,
  },
  BLOC_CONTRAINTES,
  sansCalcul(
    'Ouverture de fissures (§7.3)',
    'Geometrie non rectangulaire. Les formules du §7.3.4 supposent une zone tendue rectangulaire.'
  ),
];

const NOTE = {
  titre: 'Poteau P1',
  date: '2026-09-05',
  entrees: ENTREES,
  dessins: [SVG_SECTION],
  verifications: VERIFICATIONS,
  hypotheses: [
    'Profil normatif : valeurs recommandees de l EN 1992-1-1, hors annexe nationale.',
    'Le tranchant et la fissuration ne sont calcules que sur des sections rectangulaires.',
  ],
};

const STYLES_ESSAI = ':root { --texte: #1a1a1a; } @media print { body { background: #fff; } }';

function analyserNote(html: string): Document {
  return new JSDOM(html).window.document;
}

describe('noteDeCalculHtml', () => {
  it('porte l identification et la date', () => {
    const doc = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI));

    expect(doc.querySelector('h1')?.textContent).toContain('Poteau P1');
    expect(doc.body.textContent).toContain('2026-09-05');
  });

  it('rend les donnees d entree', () => {
    const texte = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI)).body.textContent ?? '';

    expect(texte).toContain('Geometrie');
    expect(texte).toContain('rectangle 400 × 400 mm');
    expect(texte).toContain('Sollicitation ELU');
    expect(texte).toContain('500,0 kN');
  });

  it('reprend les dessins deja produits, sans les redessiner', () => {
    const doc = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI));

    expect(doc.querySelector('svg')).not.toBeNull();
    expect(doc.querySelector('svg .contour')).not.toBeNull();
  });

  it('rend chaque verification AVEC ses valeurs intermediaires', () => {
    // Un V_Rd,c sans son detail n est pas verifiable par un tiers, et une note
    // de calcul sert precisement a etre verifiee par un tiers.
    const texte = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI)).body.textContent ?? '';

    expect(texte).toContain('V_Rd,c (sans armature d ame)');
    expect(texte).toContain('82,4 kN');
    expect(texte).toContain('Taux V_Ed / V_Rd');
    expect(texte).toContain('Effort tranchant verifie');
  });

  it('fait FIGURER un module hors domaine, avec son motif', () => {
    // Une section qui disparait sans explication fait croire au lecteur
    // qu elle a ete verifiee : c est pire qu une section incomplete assumee.
    const texte = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI)).body.textContent ?? '';

    expect(texte).toContain('Ouverture de fissures (§7.3)');
    expect(texte).toContain('Geometrie non rectangulaire');
  });

  it('ne conclut RIEN a la place de l ingenieur', () => {
    // La note rapporte les verdicts des modules, un pour un. Elle n en ajoute
    // aucun de synthese.
    const doc = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI));
    const attendus = VERIFICATIONS.filter((b) => b.verdict !== null).length;

    expect(doc.querySelectorAll('.verdict')).toHaveLength(attendus);
  });

  it('porte l avertissement de responsabilite', () => {
    const texte = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI)).body.textContent ?? '';

    expect(texte).toMatch(/aide au calcul/i);
    expect(texte).toMatch(/responsabilite incombent a l ingenieur/i);
  });

  it('rend les hypotheses et limites', () => {
    const texte = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI)).body.textContent ?? '';

    expect(texte).toContain('valeurs recommandees de l EN 1992-1-1');
    expect(texte).toContain('sections rectangulaires');
  });

  it('n affiche AUCUN NaN', () => {
    expect(noteDeCalculHtml(NOTE, STYLES_ESSAI)).not.toContain('NaN');
  });

  it('est AUTONOME : aucune ressource externe', () => {
    // La note est destinee a etre archivee et transmise. Une feuille de style
    // liee la rendrait illisible partout ailleurs que sur la machine d origine.
    const html = noteDeCalculHtml(NOTE, STYLES_ESSAI);

    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toContain('@import');
    expect(analyserNote(html).querySelector('style')?.textContent).toContain('--texte');
  });

  it('embarque une feuille de style d impression', () => {
    const css = analyserNote(noteDeCalculHtml(NOTE, STYLES_ESSAI)).querySelector('style');
    expect(css?.textContent).toContain('@media print');
  });

  it('echappe le balisage present dans les libelles', () => {
    const piege = {
      ...NOTE,
      titre: 'Poutre <script>alert(1)</script>',
      verifications: [
        { titre: 'A_s < A_s,min', lignes: [], verdict: null, note: 'sigma < 0 & rho > 1' },
      ],
    };

    const html = noteDeCalculHtml(piege, STYLES_ESSAI);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(analyserNote(html).body.textContent).toContain('sigma < 0 & rho > 1');
  });
});
