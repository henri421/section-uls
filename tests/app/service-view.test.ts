import { describe, it, expect } from 'vitest';
import {
  noteFlexionDeviee,
  obstacleFissuration,
  blocContraintes,
  blocFissuration,
  blocCourbure,
} from '../../app/src/service-view';
import type { BlocService } from '../../app/src/service-view';
import type { CrackResult } from '../../src/index';
import {
  rectangularSection,
  rectangularRebarLayout,
  polygonSection,
  circularSection,
  createConcrete,
  createSteel,
  ec2Recommended,
  verifyServiceUniaxial,
  verifyCrackWidth,
  sectionCurvature,
} from '../../src/index';

const profil = ec2Recommended();
const beton = createConcrete(30, profil);
const acier = createSteel(500, 200000, profil);

function rectangle() {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: [{ depthFromTop: 450, area: 1000, steel: acier }],
  });
}

function pieu() {
  return circularSection({ diameter: 600, concrete: beton, rebars: [] });
}

/** Section en Te : polygonale, donc hors domaine de la fissuration. */
function sectionEnTe() {
  return polygonSection({
    vertices: [
      { y: -400, z: -250 },
      { y: 400, z: -250 },
      { y: 400, z: -100 },
      { y: 100, z: -100 },
      { y: 100, z: 250 },
      { y: -100, z: 250 },
      { y: -100, z: -100 },
      { y: -400, z: -100 },
    ],
    concrete: beton,
    rebars: [],
  });
}

describe('note de flexion deviee', () => {
  it('une sollicitation ELU droite n appelle aucune precision', () => {
    expect(noteFlexionDeviee(0)).toBeNull();
  });

  it('un Mz ELU non nul appelle une PRECISION, jamais un refus de calculer', () => {
    // Le Mz de l ELU ne concerne pas le service : les combinaisons de service
    // sont saisies separement et sont uniaxiales {N, M} par construction.
    const note = noteFlexionDeviee(12.5);

    expect(note).not.toBeNull();
    expect(note).toMatch(/flexion deviee|deviee/i);
    expect(note).toContain('12,5');
    // Elle doit expliquer POURQUOI ce n est pas une incoherence.
    expect(note).toMatch(/combinaison/i);
  });

  it('le signe du Mz est indifferent : seule compte sa presence', () => {
    expect(noteFlexionDeviee(-3)).not.toBeNull();
    expect(noteFlexionDeviee(-3)).toMatch(/deviee/i);
  });

  it('une section rectangulaire ne fait pas obstacle a la fissuration', () => {
    expect(obstacleFissuration(rectangle())).toBeNull();
  });

  it('une section circulaire met la seule fissuration hors domaine', () => {
    // `verifyCrackWidth` LEVE sur cette geometrie ; les contraintes et la
    // courbure, elles, restent calculables et doivent s afficher.
    const motif = obstacleFissuration(pieu());

    expect(motif).not.toBeNull();
    expect(motif).toContain('rectangulaire');
  });

  it('une section polygonale aussi', () => {
    const motif = obstacleFissuration(sectionEnTe());

    expect(motif).not.toBeNull();
    expect(motif).toContain('rectangulaire');
  });
});

/** La poutre de reference : 300 x 500, 3 HA20 en nappe inferieure, enrobage 40. */
function poutre() {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: rectangularRebarLayout({
      width: 300,
      height: 500,
      cover: 40,
      steel: acier,
      rows: [{ face: 'bottom', bars: { diameter: 20, count: 3 } }],
    }).bars,
  });
}

/** Les valeurs lues dans un bloc, indexees par libelle. */
function valeurs(bloc: BlocService): Record<string, string> {
  return Object.fromEntries(bloc.lignes.map((l) => [l.libelle, l.valeur]));
}

/** Aucun bloc ne doit jamais laisser filtrer un NaN a l ecran. */
function sansNaN(bloc: BlocService): boolean {
  return bloc.lignes.every((l) => !l.valeur.includes('NaN') && !l.libelle.includes('NaN'));
}

describe('bloc des contraintes en service', () => {
  it('un resultat favorable porte ses valeurs et son verdict', () => {
    const bloc = blocContraintes({ resultat: verifyServiceUniaxial(poutre(), { N: 0, M: 120 }) });
    const v = valeurs(bloc);

    expect(bloc.verdict).not.toBeNull();
    expect(bloc.verdict!.ok).toBe(true);

    // sigma_c = 12,33 MPa contre la limite 0,6·fck = 18 MPa.
    expect(v['σc']).toBe('12,3 MPa (limite 18,0 MPa)');
    // sigma_s = 322,1 MPa contre la limite 0,8·fyk = 400 MPa.
    expect(v['σs']).toBe('322,1 MPa (limite 400,0 MPa)');
    // L axe neutre de SERVICE, qui n est pas celui de l ELU.
    expect(v['Axe neutre en service (≠ ELU)']).toBe('-85,9 mm');
    expect(sansNaN(bloc)).toBe(true);
  });

  it('un resultat defavorable met le verdict a cote du bon chiffre', () => {
    const bloc = blocContraintes({ resultat: verifyServiceUniaxial(poutre(), { N: 0, M: 400 }) });
    const v = valeurs(bloc);

    expect(bloc.verdict!.ok).toBe(false);
    // Le chiffre fautif est affiche a cote de sa limite : 41,1 > 18,0.
    expect(v['σc']).toBe('41,1 MPa (limite 18,0 MPa)');
    expect(v['σs']).toBe('1073,7 MPa (limite 400,0 MPa)');
    // Le motif du noyau, qui dit LEQUEL des deux est depasse.
    expect(bloc.note).toContain('compression du beton');
    expect(bloc.note).toContain('traction de l acier');
  });

  it('une section entierement comprimee est un RESULTAT, pas un NaN affiche', () => {
    const resultat = verifyServiceUniaxial(poutre(), { N: 4000, M: 5 });
    expect(resultat.converged).toBe(false);

    const bloc = blocContraintes({ resultat });

    expect(bloc.lignes).toEqual([]);
    expect(sansNaN(bloc)).toBe(true);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toContain('entierement comprimee');
  });

  it('un obstacle amont donne un bloc sans lignes, portant le motif', () => {
    const motif = 'Sollicitation caracteristique de service non saisie.';
    const bloc = blocContraintes({ motif });

    expect(bloc.lignes).toEqual([]);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toBe(motif);
    expect(bloc.titre).toContain('7.2');
  });

  it('un ELU devie n empeche EN RIEN le calcul de service', () => {
    // Regression : le Mz de l ELU ne gouverne pas le service. La sollicitation
    // de service est saisie separement et uniaxiale ; elle se calcule
    // normalement, la deviation de l ELU ne donnant qu une note.
    const bloc = blocContraintes({ resultat: verifyServiceUniaxial(poutre(), { N: 0, M: 120 }) });

    expect(noteFlexionDeviee(12.5)).not.toBeNull();
    expect(bloc.lignes).not.toEqual([]);
    expect(bloc.verdict!.ok).toBe(true);
  });
});

describe('bloc de la fissuration', () => {
  it('un resultat defavorable confronte w_k a w_max', () => {
    const bloc = blocFissuration({ resultat: verifyCrackWidth(poutre(), { N: 0, M: 120 }) });
    const v = valeurs(bloc);

    expect(bloc.verdict!.ok).toBe(false);
    expect(v['w_k']).toBe('0,352 mm (limite w_max 0,300 mm)');
    expect(v['s_r,max']).toBe('257,2 mm');
    expect(bloc.note).toContain('ouverture de fissure');
  });

  it('la meme section passe avec le w_max d une autre classe d exposition', () => {
    // 0,3 n est pas une valeur normative universelle : tableau 7.1N donne
    // 0,4 / 0,3 / 0,2 selon la classe. Le meme w_k change donc de verdict.
    const bloc = blocFissuration({
      resultat: verifyCrackWidth(poutre(), { N: 0, M: 120 }, { wMax: 0.4 }),
    });

    expect(bloc.verdict!.ok).toBe(true);
    expect(valeurs(bloc)['w_k']).toBe('0,352 mm (limite w_max 0,400 mm)');
    expect(bloc.note).toBeNull();
  });

  it('le recours a l eq. 7.14 est signale explicitement', () => {
    // Espacement hors du domaine de l eq. 7.11 : la norme impose 7.14, qui
    // donne un s_r,max sensiblement different. L utilisateur doit le savoir.
    const resultat: CrackResult = {
      wk: 0.21,
      wMax: 0.3,
      ok: true,
      srMax: 180,
      epsilonDifference: 0.00117,
      acEff: 30000,
      rhoEff: 0.02,
      phiEq: 20,
      wideSpacing: true,
      sigmaS: 280,
      converged: true,
    };

    const bloc = blocFissuration({ resultat });
    const texte = bloc.lignes.map((l) => `${l.libelle} ${l.valeur}`).join(' ');

    expect(texte).toContain('7.14');
    expect(texte).toContain('7.11');
  });

  it('sans recours a l eq. 7.14, aucune mention parasite', () => {
    const bloc = blocFissuration({ resultat: verifyCrackWidth(poutre(), { N: 0, M: 120 }) });
    const texte = bloc.lignes.map((l) => `${l.libelle} ${l.valeur}`).join(' ');

    expect(texte).not.toContain('7.14');
  });

  it('une geometrie refusee donne un bloc lisible, pas un vide', () => {
    const motif = obstacleFissuration(circularSection({ diameter: 600, concrete: beton, rebars: [] }))!;
    const bloc = blocFissuration({ motif });

    expect(bloc.lignes).toEqual([]);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toBe(motif);
    expect(bloc.titre).toContain('7.3');
  });
});

describe('bloc de la courbure', () => {
  it('une section fissuree rend la courbure, M_cr, zeta et EI', () => {
    const bloc = blocCourbure({ resultat: sectionCurvature(poutre(), { N: 0, M: 120 }) });
    const v = valeurs(bloc);

    // 1/r = 5,42e-6 mm^-1 : la notation scientifique est la seule lisible ici,
    // toFixed rendrait « 0,00 ».
    expect(v['1/r']).toBe('5,42·10⁻⁶ mm⁻¹');
    expect(v['M_cr']).toBe('44,7 kN·m');
    expect(v['ζ']).toBe('0,93');
    expect(v['Etat']).toBe('fissuree');
    expect(v['EI effectif']).toBe('2,22·10¹³ N·mm²');
    expect(sansNaN(bloc)).toBe(true);
  });

  it('sous le moment de fissuration, la section est annoncee non fissuree', () => {
    const bloc = blocCourbure({ resultat: sectionCurvature(poutre(), { N: 0, M: 10 }) });
    const v = valeurs(bloc);

    expect(v['Etat']).toBe('non fissuree');
    expect(v['ζ']).toBe('0,00');
    expect(v['1/r']).toBe('2,08·10⁻⁷ mm⁻¹');
    expect(v['EI effectif']).toBe('4,81·10¹³ N·mm²');
  });

  it('la courbure ne conclut jamais : aucun verdict', () => {
    // Elle ne se compare a aucune limite a l echelle de la section.
    expect(blocCourbure({ resultat: sectionCurvature(poutre(), { N: 0, M: 120 }) }).verdict).toBeNull();
    expect(blocCourbure({ resultat: sectionCurvature(poutre(), { N: 0, M: 10 }) }).verdict).toBeNull();
  });

  it('la note dit TOUJOURS que ce n est pas une fleche', () => {
    // La confusion se joue a l ecran : une fleche exige portee, appuis et
    // chargement, du niveau element, que ce module de sections ignore.
    const motif = 'Sollicitation quasi-permanente non saisie.';
    const calcule = blocCourbure({ resultat: sectionCurvature(poutre(), { N: 0, M: 120 }) });
    const empeche = blocCourbure({ motif });

    expect(calcule.note).toMatch(/fleche/i);
    expect(empeche.note).toMatch(/fleche/i);
    // Et le motif reste porte, en plus de l avertissement.
    expect(empeche.note).toContain(motif);
    expect(empeche.lignes).toEqual([]);
    expect(empeche.verdict).toBeNull();
  });

  it('un etat fissure incalculable ne montre pas les valeurs de l etat non fissure', () => {
    // `sectionCurvature` rend alors converged:false avec les grandeurs de
    // l etat I, qui ne decrivent PAS la section reelle : les afficher
    // tromperait plus surement qu un bloc vide.
    const resultat = sectionCurvature(poutre(), { N: 4000, M: 200 });
    expect(resultat.converged).toBe(false);

    const bloc = blocCourbure({ resultat });

    expect(bloc.lignes).toEqual([]);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toContain('etat fissure incalculable');
    expect(bloc.note).toMatch(/fleche/i);
  });
});
