import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

import { svgAutonome, PALETTE, STYLES_TRACE } from '../../app/src/export';

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

    for (const variable of ['--encre', '--compression', '--traction']) {
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
