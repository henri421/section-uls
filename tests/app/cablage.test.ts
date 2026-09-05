import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

/**
 * Tests du CABLAGE de l'interface.
 *
 * La session 5 avait assume de ne pas tester le DOM, en gardant le cablage
 * mince et en testant la logique pure a cote. Ce pari a coute une vraie
 * regression : les efforts sollicitants ne se mettaient plus a jour, et
 * aucune suite ne le voyait. On teste donc desormais le cablage lui-meme,
 * sur ce qui compte : saisir une valeur doit changer le resultat affiche.
 *
 * On charge la vraie page et le vrai module — pas une reimplementation.
 */

const CHEMIN_HTML = fileURLToPath(new URL('../../app/index.html', import.meta.url));

async function monterApplication(): Promise<JSDOM> {
  const html = readFileSync(CHEMIN_HTML, 'utf8');
  const dom = new JSDOM(html, { url: 'http://localhost/', pretendToBeVisual: true });

  const g = globalThis as unknown as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLInputElement = dom.window.HTMLInputElement;
  g.HTMLSelectElement = dom.window.HTMLSelectElement;
  g.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  g.localStorage = dom.window.localStorage;
  g.Blob = dom.window.Blob;
  g.URL = dom.window.URL;

  // Import a chaud : le module se cable au chargement, sur le document
  // qu'on vient d'installer.
  vi.resetModules();
  await import('../../app/src/main');

  return dom;
}

function champ(dom: JSDOM, nom: string): HTMLInputElement {
  const element = dom.window.document.querySelector(`input[data-champ="${nom}"]`);
  if (element === null) throw new Error(`champ "${nom}" absent du formulaire`);
  return element as HTMLInputElement;
}

function saisir(dom: JSDOM, nom: string, valeur: string): void {
  const input = champ(dom, nom);
  input.value = valeur;
  input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function resultat(dom: JSDOM): string {
  return dom.window.document.querySelector('#resultat')?.textContent ?? '';
}

describe('cablage de l interface', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('la page affiche un resultat au chargement', async () => {
    const dom = await monterApplication();
    expect(resultat(dom)).toMatch(/taux/i);
  });

  it("REGRESSION : changer l'effort normal met le resultat a jour", async () => {
    const dom = await monterApplication();
    const avant = resultat(dom);

    saisir(dom, 'N', '1500');
    vi.advanceTimersByTime(500); // au-dela du delai d'apaisement

    const apres = resultat(dom);
    expect(apres).not.toBe(avant);
    expect(apres).toContain('1500');
  });

  it('REGRESSION : changer le moment met le resultat a jour', async () => {
    const dom = await monterApplication();

    saisir(dom, 'My', '107');
    vi.advanceTimersByTime(500);
    const premier = resultat(dom);
    expect(premier).toContain('107');

    saisir(dom, 'My', '200');
    vi.advanceTimersByTime(500);
    const second = resultat(dom);

    expect(second).toContain('200');
    expect(second).not.toBe(premier);
  });

  it('une saisie invalide affiche l erreur SANS effacer le dernier resultat', async () => {
    const dom = await monterApplication();

    saisir(dom, 'My', '107');
    vi.advanceTimersByTime(500);

    saisir(dom, 'My', 'abc');
    vi.advanceTimersByTime(500);

    const texte = resultat(dom);
    expect(texte).toMatch(/expression attendue/i);
    expect(texte).toMatch(/taux/i); // le dernier resultat valide est conserve
  });

  it('une expression est evaluee dans le champ', async () => {
    const dom = await monterApplication();

    saisir(dom, 'width', '400');
    saisir(dom, 'height', '300+200');
    vi.advanceTimersByTime(500);

    // 500 mm de hauteur : le resultat doit etre calcule, pas en erreur.
    expect(resultat(dom)).toMatch(/taux/i);
    expect(resultat(dom)).not.toMatch(/expression attendue/i);
  });

  it('la section se dessine', async () => {
    const dom = await monterApplication();
    const svg = dom.window.document.querySelector('#section svg');
    expect(svg).not.toBeNull();
  });
});

describe('le mode proportionnel ne part jamais tout seul', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("REGRESSION : le recalcul automatique reste en « N constant »", async () => {
    // Le mode proportionnel coute plusieurs secondes et il est synchrone :
    // le declencher a chaque frappe fige la page, ce qui se lit a l'ecran
    // comme des valeurs qui ne se mettent plus a jour. Il ne doit partir que
    // sur action explicite.
    const dom = await monterApplication();

    saisir(dom, 'My', '107');
    vi.advanceTimersByTime(500);

    expect(resultat(dom)).toContain('N constant');
    expect(resultat(dom)).not.toContain('proportionnel');
  });

  it("aucune liste deroulante ne permet d'armer le mode couteux en continu", () => {
    // La liste deroulante « chemin de chargement » avait precisement cet
    // effet : la retirer supprime le piege plutot que de le documenter.
    const dom = new JSDOM(readFileSync(CHEMIN_HTML, 'utf8'));
    expect(dom.window.document.querySelector('select[data-champ="mode"]')).toBeNull();
  });
});

/**
 * Le diagramme d'interaction N-M, trace en continu avec le reste.
 *
 * Il peut l'etre parce qu'il ne coute rien : `interactionDiagramNM` ne resout
 * RIEN — chaque profondeur d'axe neutre donne son couple (N, M) par une simple
 * integration. Mesure le 2026-09-04 : 3 a 9 ms pour 72 a 200 points, contre 25
 * a 120 ms pour le recalcul complet deja en place.
 */
describe('diagramme N-M', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function diagramme(dom: JSDOM): HTMLElement {
    const element = dom.window.document.querySelector('#diagramme');
    if (element === null) throw new Error('la zone #diagramme est absente de la page');
    return element as HTMLElement;
  }

  it('est trace des le chargement, sans aucun clic', async () => {
    const dom = await monterApplication();
    expect(diagramme(dom).querySelector('svg')).not.toBeNull();
  });

  it('ne contient jamais NaN', async () => {
    // Un NaN dans un attribut SVG ne leve rien : il efface silencieusement le
    // trace. Aucune assertion de forme ne le verrait, celle-ci si.
    const dom = await monterApplication();
    expect(diagramme(dom).innerHTML).not.toContain('NaN');
  });

  it('deplace le point sollicitant quand le moment change', async () => {
    const dom = await monterApplication();

    saisir(dom, 'My', '100');
    vi.advanceTimersByTime(500);
    const premier = diagramme(dom).innerHTML;

    saisir(dom, 'My', '250');
    vi.advanceTimersByTime(500);

    expect(diagramme(dom).innerHTML).not.toBe(premier);
    expect(diagramme(dom).innerHTML).not.toContain('NaN');
  });

  it('avertit que le point sort du plan du graphe en flexion deviee', async () => {
    // Le modele par defaut porte Mz = 40 : le point sollicitant n'appartient
    // PAS au plan (N, My). Le graphe reste exact, mais il ne dit plus rien du
    // verdict — il faut l'ecrire plutot que de laisser croire le contraire.
    const dom = await monterApplication();
    expect(diagramme(dom).textContent).toMatch(/deviee/i);

    saisir(dom, 'Mz', '0');
    vi.advanceTimersByTime(500);

    expect(diagramme(dom).textContent).not.toMatch(/deviee/i);
  });
});
