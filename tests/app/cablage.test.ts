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

function choisir(dom: JSDOM, nom: string, valeur: string): void {
  const element = dom.window.document.querySelector(`select[data-champ="${nom}"]`);
  if (element === null) throw new Error(`liste "${nom}" absente du formulaire`);
  const select = element as HTMLSelectElement;
  select.value = valeur;
  select.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function cocher(dom: JSDOM, nom: string, valeur: boolean): void {
  const element = dom.window.document.querySelector(`input[type="checkbox"][data-champ="${nom}"]`);
  if (element === null) throw new Error(`case a cocher "${nom}" absente du formulaire`);
  const input = element as HTMLInputElement;
  input.checked = valeur;
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

/**
 * Le domaine My-Mz, trace SUR BOUTON seulement.
 *
 * `interactionCurveAtN` enchaine une resolution droite par point : 77 a 380 ms
 * pour 24 a 72 points (mesure du 2026-09-04), l'ordre de grandeur d'une
 * verification complete. Le declencher au recalcul automatique figerait la page
 * a chaque frappe — c'est mot pour mot la regression du mode proportionnel du
 * 2026-09-04, vecue comme « les efforts ne se mettent plus a jour ».
 */
describe('domaine My-Mz', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * Le domaine se repere par son propre conteneur, pas par son libelle :
   * l'avertissement de flexion deviee du graphe N-M nomme lui aussi le
   * « domaine My-Mz », et chercher ce texte confondrait les deux.
   */
  function domaine(dom: JSDOM): Element | null {
    return dom.window.document.querySelector('#diagramme #domaine-mymz');
  }

  function cliquerTracerDomaine(dom: JSDOM): void {
    const bouton = dom.window.document.querySelector('[data-action="tracer-domaine"]');
    if (bouton === null) throw new Error('le bouton de trace du domaine est absent');
    bouton.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    // Le trace est differe d'un tour de boucle pour laisser peindre l'attente,
    // comme le mode proportionnel : il faut donc laisser filer la minuterie.
    vi.advanceTimersByTime(1);
  }

  it('n est PAS trace au chargement', async () => {
    const dom = await monterApplication();
    expect(domaine(dom)).toBeNull();
  });

  it("REGRESSION : le recalcul automatique ne l'arme jamais", async () => {
    const dom = await monterApplication();

    saisir(dom, 'My', '120');
    vi.advanceTimersByTime(500);

    expect(domaine(dom)).toBeNull();
  });

  it('apparait sur clic, sans NaN, en portant l effort normal du trace', async () => {
    const dom = await monterApplication();
    cliquerTracerDomaine(dom);

    const zone = domaine(dom);
    expect(zone).not.toBeNull();
    expect(zone?.innerHTML).not.toContain('NaN');
    // Un domaine My-Mz sans son N ne veut rien dire.
    expect(zone?.textContent).toMatch(/500/);
  });

  it('redevient obsolete des que la saisie change', async () => {
    // Le domaine est trace a N fixe : le garder a l'ecran apres un changement
    // de sollicitation montrerait un domaine qui n'est plus celui du calcul.
    const dom = await monterApplication();
    cliquerTracerDomaine(dom);
    expect(domaine(dom)).not.toBeNull();

    saisir(dom, 'N', '600');
    vi.advanceTimersByTime(500);

    expect(domaine(dom)).toBeNull();
  });
});

/**
 * Les trois verifications de SERVICE dans la page.
 *
 * Livrees aux sessions 6, 7 et 8, elles n'etaient appelees nulle part dans
 * `app/` : l'utilisateur, qui se sert de la page publiee, ne voyait que
 * l'ELU. Ces tests fixent le contrat d'affichage — et surtout le garde-fou
 * qui empeche un module optionnel d'effacer le resultat principal.
 *
 * Cout mesure le 2026-09-05 : 9 a 24 ms par verification, contre 25 a 120 ms
 * pour le recalcul ELU. Elles partent donc AVEC le reste, sans bouton.
 */
describe('verifications de service', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function service(dom: JSDOM): Element {
    const element = dom.window.document.querySelector('#resultat #service');
    if (element === null) throw new Error('la section Service est absente du panneau de resultats');
    return element;
  }

  function bloc(dom: JSDOM, nom: string): Element {
    const element = service(dom).querySelector(`[data-bloc="${nom}"]`);
    if (element === null) throw new Error(`le bloc de service "${nom}" est absent`);
    return element;
  }

  /** Nombre de lignes chiffrees : zero signifie « pas calcule ». */
  function lignes(dom: JSDOM, nom: string): number {
    return bloc(dom, nom).querySelectorAll('.ligne').length;
  }

  /**
   * Le verdict de l'ELU, et lui seul : les blocs de service portent leurs
   * propres verdicts, mais imbriques. Celui de l'ELU est enfant DIRECT du
   * panneau.
   */
  function verdictElu(dom: JSDOM): string {
    return dom.window.document.querySelector('#resultat > .verdict')?.textContent ?? '';
  }

  it('la section Service est affichee des le chargement, sans aucun clic', async () => {
    const dom = await monterApplication();
    expect(service(dom)).not.toBeNull();
    expect(bloc(dom, 'contraintes').textContent).toMatch(/7\.2/);
    expect(bloc(dom, 'fissuration').textContent).toMatch(/7\.3/);
    expect(bloc(dom, 'courbure').textContent).toMatch(/7\.4\.3/);
  });

  it('les trois verifications sont reellement calculees sur le modele de depart', async () => {
    const dom = await monterApplication();
    expect(lignes(dom, 'contraintes')).toBeGreaterThan(0);
    expect(lignes(dom, 'fissuration')).toBeGreaterThan(0);
    expect(lignes(dom, 'courbure')).toBeGreaterThan(0);
  });

  it('ne contient jamais NaN', async () => {
    // Les modules rendent `NaN` sur leur chemin d'echec : un bloc qui n'a pas
    // converge ne doit afficher AUCUN chiffre, pas un chiffre illisible.
    const dom = await monterApplication();
    expect(service(dom).innerHTML).not.toContain('NaN');
  });

  it('le bloc courbure porte TOUJOURS qu il ne s agit pas d une fleche', async () => {
    const dom = await monterApplication();
    expect(bloc(dom, 'courbure').textContent).toMatch(/pas.*fleche/i);

    // Y compris apres un changement de sollicitation.
    saisir(dom, 'serviceQpM', '250');
    vi.advanceTimersByTime(500);
    expect(bloc(dom, 'courbure').textContent).toMatch(/pas.*fleche/i);
  });

  it('changer une sollicitation de service change le service, PAS le verdict ELU', async () => {
    const dom = await monterApplication();
    const eluAvant = verdictElu(dom);
    const courbureAvant = bloc(dom, 'courbure').textContent;
    const contraintesAvant = bloc(dom, 'contraintes').textContent;

    saisir(dom, 'serviceQpM', '120');
    vi.advanceTimersByTime(500);

    expect(bloc(dom, 'courbure').textContent).not.toBe(courbureAvant);
    expect(verdictElu(dom)).toBe(eluAvant);
    // La quasi-permanente ne gouverne PAS le §7.2 : les contraintes ne
    // bougent pas. Si elles bougeaient, les deux combinaisons seraient
    // cablees sur la meme verification.
    expect(bloc(dom, 'contraintes').textContent).toBe(contraintesAvant);
  });

  it('changer la combinaison caracteristique change les contraintes', async () => {
    const dom = await monterApplication();
    const avant = bloc(dom, 'contraintes').textContent;

    saisir(dom, 'serviceCarM', '140');
    vi.advanceTimersByTime(500);

    expect(bloc(dom, 'contraintes').textContent).not.toBe(avant);
  });

  it('une combinaison non saisie donne un motif, pas un bloc muet', async () => {
    // C'est le cas d'un fichier de format v1, qui ne porte aucun service.
    const dom = await monterApplication();

    saisir(dom, 'serviceCarN', '');
    saisir(dom, 'serviceCarM', '');
    vi.advanceTimersByTime(500);

    expect(lignes(dom, 'contraintes')).toBe(0);
    expect(bloc(dom, 'contraintes').textContent).toMatch(/saisie|renseign/i);
    // Les verifications quasi-permanentes, elles, restent calculees.
    expect(lignes(dom, 'courbure')).toBeGreaterThan(0);
  });

  it('REGRESSION : une geometrie circulaire n efface PAS le resultat', async () => {
    // `verifyCrackWidth` LEVE sur toute geometrie non rectangulaire. Laisser
    // l'exception remonter au `try` global du recalcul remplacerait tout le
    // resultat ELU par un message d'erreur — parce qu'un module OPTIONNEL n'a
    // pas pu s'appliquer. L'appel doit etre protege localement.
    const dom = await monterApplication();
    choisir(dom, 'geometryKind', 'circle');
    vi.advanceTimersByTime(500);

    expect(verdictElu(dom)).toMatch(/taux/i);
    // Aucune exception brute n'a fuite : le nom de la fonction du noyau ne
    // doit jamais atteindre l'ecran.
    expect(resultat(dom)).not.toContain('verifyCrackWidth');

    // Le bloc fissuration explique la geometrie, sans chiffre.
    expect(lignes(dom, 'fissuration')).toBe(0);
    expect(bloc(dom, 'fissuration').textContent).toMatch(/rectangulaire/i);

    // Les deux autres verifications acceptent les polygones : elles restent
    // calculees, et le dire evite de croire tout le service perdu.
    expect(lignes(dom, 'contraintes')).toBeGreaterThan(0);
    expect(lignes(dom, 'courbure')).toBeGreaterThan(0);
    expect(service(dom).innerHTML).not.toContain('NaN');
  });

  it('un Mz non nul a l ELU informe, il ne bloque JAMAIS le service', async () => {
    // Le modele de depart porte Mz = 40. Les verifications de service portent
    // sur des combinaisons DIFFERENTES, saisies separement et uniaxiales : la
    // quasi-permanente exclut d'ailleurs le vent, qui apporte le plus souvent
    // le moment transversal. Refuser de calculer sur ce motif refuserait le
    // cas normal.
    const dom = await monterApplication();

    expect(service(dom).querySelector('.note-deviee')).not.toBeNull();
    expect(lignes(dom, 'contraintes')).toBeGreaterThan(0);
    expect(lignes(dom, 'fissuration')).toBeGreaterThan(0);
    expect(lignes(dom, 'courbure')).toBeGreaterThan(0);

    saisir(dom, 'Mz', '0');
    vi.advanceTimersByTime(500);

    expect(service(dom).querySelector('.note-deviee')).toBeNull();
    expect(lignes(dom, 'contraintes')).toBeGreaterThan(0);
  });
});

/**
 * Les trois familles de verifications de la session 11 dans la page :
 * effort tranchant (§6.2), dispositions constructives (§9) et armature
 * minimale sous deformation genee (§7.3.2).
 *
 * Meme histoire que le service aux sessions 6 a 8 : les modules etaient
 * livres et testes, mais appeles nulle part dans `app/`. L utilisateur, qui
 * se sert de la page publiee, ne voyait que la flexion.
 *
 * Ces trois modules LEVENT hors du rectangle. Le garde-fou teste ici est
 * celui de la session 10 : une exception qui remonterait au `try` global du
 * recalcul effacerait tout le resultat de flexion parce qu un module
 * OPTIONNEL n a pas pu s appliquer.
 */
describe('verifications de section : tranchant, dispositions, deformation genee', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function verifications(dom: JSDOM): Element {
    const element = dom.window.document.querySelector('#resultat #verifications');
    if (element === null) {
      throw new Error('la section des verifications est absente du panneau de resultats');
    }
    return element;
  }

  function bloc(dom: JSDOM, nom: string): Element {
    const element = verifications(dom).querySelector(`[data-bloc="${nom}"]`);
    if (element === null) throw new Error(`le bloc "${nom}" est absent`);
    return element;
  }

  function lignes(dom: JSDOM, nom: string): number {
    return bloc(dom, nom).querySelectorAll('.ligne').length;
  }

  /** Valeur affichee en face d un libelle, telle qu elle est lue a l ecran. */
  function valeur(dom: JSDOM, nomDuBloc: string, libelle: string): string {
    for (const l of bloc(dom, nomDuBloc).querySelectorAll('.ligne')) {
      if (l.querySelector('span')?.textContent === libelle) {
        return l.querySelector('strong')?.textContent ?? '';
      }
    }
    throw new Error(`aucune ligne "${libelle}" dans le bloc "${nomDuBloc}"`);
  }

  /** Nombre lu a l ecran, virgule decimale comprise. */
  function nombre(texte: string): number {
    const trouve = /-?[\d\s]+(?:,\d+)?/.exec(texte);
    if (trouve === null) throw new Error(`aucun nombre dans "${texte}"`);
    return Number(trouve[0].replace(/\s/g, '').replace(',', '.'));
  }

  function verdictElu(dom: JSDOM): string {
    return dom.window.document.querySelector('#resultat > .verdict')?.textContent ?? '';
  }

  it('les trois blocs sont calcules des le chargement, sans aucun clic', async () => {
    const dom = await monterApplication();

    expect(bloc(dom, 'tranchant').textContent).toMatch(/6\.2/);
    expect(bloc(dom, 'dispositions').textContent).toMatch(/§9/);
    expect(bloc(dom, 'zwang').textContent).toMatch(/7\.3\.2/);

    expect(lignes(dom, 'tranchant')).toBeGreaterThan(0);
    expect(lignes(dom, 'dispositions')).toBeGreaterThan(0);
    expect(lignes(dom, 'zwang')).toBeGreaterThan(0);

    expect(verifications(dom).innerHTML).not.toContain('NaN');
  });

  it('la page ECRIT que ces saisies ne sont pas enregistrees dans le modele', async () => {
    // Un utilisateur qui enregistre son modele et perd ses cadres sans
    // avertissement perd confiance dans tout le reste.
    const dom = await monterApplication();
    const saisie = dom.window.document.querySelector('#saisie')?.textContent ?? '';
    expect(saisie).toMatch(/pas (encore )?(enregistr|conserv)/i);
  });

  it('REGRESSION : une geometrie circulaire n efface PAS le resultat', async () => {
    // `verifyShear` et `minimumRestraintArea` LEVENT hors du rectangle.
    // Laisser l exception remonter au `try` global remplacerait tout le
    // resultat de flexion par un message d erreur.
    const dom = await monterApplication();
    choisir(dom, 'geometryKind', 'circle');
    vi.advanceTimersByTime(500);

    expect(verdictElu(dom)).toMatch(/taux/i);

    // Aucune exception brute n a fuite : le nom d une fonction du noyau ne
    // doit jamais atteindre l ecran.
    for (const nom of ['shearGeometry', 'verifyShear', 'minimumRestraintArea']) {
      expect(resultat(dom)).not.toContain(nom);
    }

    expect(lignes(dom, 'tranchant')).toBe(0);
    expect(bloc(dom, 'tranchant').textContent).toMatch(/rectangulaire/i);
    expect(lignes(dom, 'zwang')).toBe(0);
    expect(bloc(dom, 'zwang').textContent).toMatch(/rectangulaire/i);
    expect(verifications(dom).innerHTML).not.toContain('NaN');

    // Les dispositions d un POTEAU, elles, restent calculables sur un cercle :
    // le §9.5.2 ne demande que l aire de beton. Sur une poutre en revanche,
    // le b_t du §9.2.1.1 n a pas de definition, et le bloc le dit.
    expect(lignes(dom, 'dispositions')).toBeGreaterThan(0);

    choisir(dom, 'elementType', 'beam');
    vi.advanceTimersByTime(500);
    expect(lignes(dom, 'dispositions')).toBe(0);
    expect(bloc(dom, 'dispositions').textContent).toMatch(/rectangulaire/i);
    expect(verdictElu(dom)).toMatch(/taux/i);
  });

  it('changer V_Ed change le tranchant, PAS le verdict de flexion', async () => {
    const dom = await monterApplication();
    const eluAvant = verdictElu(dom);

    saisir(dom, 'V_Ed', '90');
    vi.advanceTimersByTime(500);
    const premier = valeur(dom, 'tranchant', 'V_Ed');
    expect(nombre(premier)).toBeCloseTo(90, 1);

    saisir(dom, 'V_Ed', '260');
    vi.advanceTimersByTime(500);

    expect(nombre(valeur(dom, 'tranchant', 'V_Ed'))).toBeCloseTo(260, 1);
    expect(verdictElu(dom)).toBe(eluAvant);
  });

  it('declarer des cadres fait apparaitre V_Rd,s et V_Rd,max', async () => {
    const dom = await monterApplication();
    expect(bloc(dom, 'tranchant').textContent).not.toContain('V_Rd,s');

    saisir(dom, 'Asw', '100');
    saisir(dom, 'sCadres', '200');
    vi.advanceTimersByTime(500);

    expect(bloc(dom, 'tranchant').textContent).toContain('V_Rd,s');
    expect(bloc(dom, 'tranchant').textContent).toContain('V_Rd,max');
    expect(verifications(dom).innerHTML).not.toContain('NaN');
  });

  it('un cot theta hors du §6.2.3(2) n efface que le bloc tranchant', async () => {
    // Le noyau REFUSE la valeur plutot que de l ecreter en silence. Ce refus
    // est un resultat du seul module concerne, pas une panne de la page.
    const dom = await monterApplication();

    saisir(dom, 'Asw', '100');
    saisir(dom, 'sCadres', '200');
    saisir(dom, 'cotTheta', '3');
    vi.advanceTimersByTime(500);

    expect(lignes(dom, 'tranchant')).toBe(0);
    expect(bloc(dom, 'tranchant').textContent).toMatch(/6\.2\.3/);
    expect(verdictElu(dom)).toMatch(/taux/i);
    expect(lignes(dom, 'dispositions')).toBeGreaterThan(0);
  });

  it('passer de poutre a dalle fait disparaitre l exigence d armature d ame', async () => {
    // Le §6.2.1(4) dispense les dalles du minimum d ame. L exiger
    // declarerait non conformes toutes les dalles courantes.
    const dom = await monterApplication();

    choisir(dom, 'elementType', 'beam');
    vi.advanceTimersByTime(500);
    expect(bloc(dom, 'dispositions').textContent).toContain('rho_w');

    choisir(dom, 'elementType', 'slab');
    vi.advanceTimersByTime(500);
    expect(bloc(dom, 'dispositions').textContent).not.toContain('rho_w');
    expect(bloc(dom, 'dispositions').textContent).toMatch(/sans objet/i);
    expect(verifications(dom).innerHTML).not.toContain('NaN');
  });

  it('cocher la zone efficace REDUIT l armature exigee sous deformation genee', async () => {
    // Ecart assume au texte de l EN 1992-1-1, retenu par la pratique pour
    // les pieces epaisses : l ecart est considerable, il doit se voir.
    const dom = await monterApplication();
    const avant = nombre(valeur(dom, 'zwang', 'A_s,min'));

    cocher(dom, 'zoneEfficace', true);
    vi.advanceTimersByTime(500);

    const apres = nombre(valeur(dom, 'zwang', 'A_s,min'));
    expect(apres).toBeLessThan(avant);
    expect(bloc(dom, 'zwang').textContent).toMatch(/efficace/i);
  });

  it('un poteau n explose pas : le N de l ELU sert d effort normal du §9.5.2', async () => {
    // `minimumLongitudinalArea` LEVE sur un poteau dont `N_Ed` est absent.
    // La sollicitation ELU deja saisie le fournit — il n y a pas d autre
    // effort normal a l ELU que celui-la.
    const dom = await monterApplication();

    choisir(dom, 'elementType', 'column');
    vi.advanceTimersByTime(500);

    expect(lignes(dom, 'dispositions')).toBeGreaterThan(0);
    expect(resultat(dom)).not.toMatch(/minimumLongitudinalArea/);
    const avec500 = nombre(valeur(dom, 'dispositions', 'A_s,min'));

    // Le minimum du §9.5.2 vaut max(0,10·N_Ed/f_yd ; 0,002·A_c) : un effort
    // normal dix fois plus grand doit le faire croitre. S il ne bougeait pas,
    // c est que le N de l ELU ne serait pas celui du §9.5.2.
    saisir(dom, 'N', '5000');
    vi.advanceTimersByTime(500);

    expect(nombre(valeur(dom, 'dispositions', 'A_s,min'))).toBeGreaterThan(avec500);
  });
});
