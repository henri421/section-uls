import { describe, it, expect } from 'vitest';
import {
  blocTranchant,
  blocDispositions,
  blocZwang,
  obstacleTranchant,
  obstacleDispositions,
  obstacleZwang,
} from '../../app/src/checks-view';
import type { BlocService } from '../../app/src/service-view';
import type { ShearResult, DetailingResult, RestraintResult } from '../../src/index';
import {
  rectangularSection,
  circularSection,
  createConcrete,
  createSteel,
  ec2Recommended,
  verifyShear,
  verifyDetailing,
  minimumRestraintArea,
} from '../../src/index';

/**
 * Presentation des trois familles de verifications livrees en session 11 :
 * effort tranchant (§6.2), dispositions constructives (§9) et armature
 * minimale sous deformation genee (§7.3.2).
 *
 * Meme parti pris que `service-view.ts` : un module qui ne s applique pas
 * n est pas une panne, c est un RESULTAT. Les blocs sont donc alimentes par
 * les VRAIS modules du noyau, jamais par des litteraux reconstruits a la
 * main — un contrat d affichage teste sur des resultats fabriques ne
 * prouverait rien de ce que la page montre.
 */

const profil = ec2Recommended();
const beton = createConcrete(30, profil);
const acier = createSteel(500, 200000, profil);

/** Poutre courante : 300 x 500, un seul lit tendu. */
function poutre(aireTendue = 1000) {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: [{ depthFromTop: 450, area: aireTendue, steel: acier }],
  });
}

/** Dalle courante : 1 m de largeur, 200 mm d epaisseur. */
function dalle() {
  return rectangularSection({
    width: 1000,
    height: 200,
    concrete: beton,
    rebars: [{ depthFromTop: 170, area: 1000, steel: acier }],
  });
}

/** Voile massif : 1 m d epaisseur, deux nappes. */
function voile(hauteur: number) {
  return rectangularSection({
    width: 400,
    height: hauteur,
    concrete: beton,
    rebars: [
      { depthFromTop: 50, area: 500, steel: acier },
      { depthFromTop: hauteur - 50, area: 500, steel: acier },
    ],
  });
}

const CADRES = { Asw: 100, s: 200, fywk: 500 };

function tranchant(VEd: number, links?: { Asw: number; s: number; fywk: number }): ShearResult {
  return verifyShear(
    poutre(),
    { V_Ed: VEd, N_Ed: 0 },
    profil,
    links === undefined ? undefined : { links }
  );
}

/** Tout le texte d un bloc, libelles et valeurs confondus. */
function texte(bloc: BlocService): string {
  return [
    bloc.titre,
    ...bloc.lignes.map((l) => `${l.libelle} ${l.valeur}`),
    bloc.verdict?.texte ?? '',
    bloc.note ?? '',
  ].join(' | ');
}

// --- Effort tranchant --------------------------------------------------------

describe('bloc d effort tranchant', () => {
  it('affiche la sollicitation, les resistances et le taux quand la section passe', () => {
    // V_Ed = 80 kN depasse V_Rd,c mais reste sous V_Rd,s : cas courant d une
    // poutre qui a besoin de cadres, et qui en a.
    const r = tranchant(80, CADRES);
    expect(r.ok).toBe(true);

    const bloc = blocTranchant({ resultat: r }, 80);

    expect(bloc.titre).toMatch(/6\.2/);
    expect(bloc.lignes.length).toBeGreaterThan(0);
    expect(bloc.verdict?.ok).toBe(true);
    expect(texte(bloc)).toContain('V_Ed');
    expect(texte(bloc)).toContain('V_Rd,c');
    expect(texte(bloc)).toContain('V_Rd,s');
    expect(texte(bloc)).toContain('V_Rd,max');
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });

  it('dit que le calcul exige des armatures d ame, sans les confondre avec le minimum du §9.2.2', () => {
    const r = tranchant(80, CADRES);
    expect(r.shearReinforcementRequired).toBe(true);

    const bloc = blocTranchant({ resultat: r }, 80);
    expect(texte(bloc)).toMatch(/9\.2\.2/);
  });

  it('sans cadres et sous V_Rd,c, il n en exige aucune', () => {
    const r = tranchant(40);
    expect(r.ok).toBe(true);
    expect(r.shearReinforcementRequired).toBe(false);

    const bloc = blocTranchant({ resultat: r }, 40);
    expect(bloc.verdict?.ok).toBe(true);
    // Sans cadres declares, il n y a ni V_Rd,s ni V_Rd,max a montrer.
    expect(texte(bloc)).not.toContain('V_Rd,s');
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });

  it('les TROIS modes d echec se distinguent a l ecran', () => {
    // C est tout l enjeu : « bielles ecrasees » veut dire section trop
    // petite, PAS « il manque des cadres ». Confondre les deux conduirait a
    // ajouter des cadres qui n y changeraient rien.
    const sansCadres = blocTranchant({ resultat: tranchant(200) }, 200);
    const cadresFaibles = blocTranchant(
      { resultat: tranchant(300, { Asw: 50, s: 300, fywk: 500 }) },
      300
    );
    const bielles = blocTranchant(
      { resultat: tranchant(600, { Asw: 1000, s: 100, fywk: 500 }) },
      600
    );

    for (const bloc of [sansCadres, cadresFaibles, bielles]) {
      expect(bloc.verdict?.ok).toBe(false);
      expect(bloc.note).not.toBeNull();
    }

    expect(sansCadres.note).toMatch(/armatures d ame sont necessaires/i);
    expect(cadresFaibles.note).toMatch(/cadres declares sont insuffisants/i);
    expect(bielles.note).toMatch(/bielles.*ecrasees|section est trop petite/i);

    // Et surtout : les trois motifs different les uns des autres.
    expect(sansCadres.note).not.toBe(cadresFaibles.note);
    expect(cadresFaibles.note).not.toBe(bielles.note);
  });

  it('le motif du noyau est repris VERBATIM', () => {
    const r = tranchant(600, { Asw: 1000, s: 100, fywk: 500 });
    expect(r.reason).toBeDefined();
    expect(blocTranchant({ resultat: r }, 600).note).toBe(r.reason);
  });

  it('un motif d indisponibilite donne un bloc SANS aucune ligne', () => {
    const bloc = blocTranchant({ motif: 'geometrie non rectangulaire' }, 120);

    expect(bloc.lignes).toHaveLength(0);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toBe('geometrie non rectangulaire');
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });
});

// --- Dispositions constructives ---------------------------------------------

describe('bloc des dispositions constructives', () => {
  it('affiche l acier en place et les bornes du §9 quand tout est regulier', () => {
    const r: DetailingResult = verifyDetailing(poutre(), 'beam', { web: { asw: 100, s: 200, fywk: 500 } });
    expect(r.ok).toBe(true);

    const bloc = blocDispositions({ resultat: r });

    expect(bloc.lignes.length).toBeGreaterThan(0);
    expect(bloc.verdict?.ok).toBe(true);
    expect(bloc.note).toBeNull();
    expect(texte(bloc)).toContain('A_s');
    expect(texte(bloc)).toMatch(/A_s,min/);
    expect(texte(bloc)).toMatch(/A_s,max/);
    expect(texte(bloc)).toMatch(/rho_w/);
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });

  it('liste TOUTES les violations, pas seulement la premiere', () => {
    // Poutre sous-armee ET depourvue de cadres : deux regles enfreintes.
    const r = verifyDetailing(poutre(100), 'beam');
    expect(r.violations.length).toBe(2);

    const bloc = blocDispositions({ resultat: r });
    expect(bloc.verdict?.ok).toBe(false);
    for (const violation of r.violations) {
      expect(bloc.note).toContain(violation);
    }
  });

  it('une dalle n a pas d exigence d armature d ame, et ce n est PAS un echec', () => {
    // Le §6.2.1(4) dispense les dalles du minimum d ame. L exiger declarerait
    // non conformes toutes les dalles courantes.
    const r = verifyDetailing(dalle(), 'slab');
    expect(r.web.applicable).toBe(false);
    expect(r.violations).toHaveLength(0);

    const bloc = blocDispositions({ resultat: r });

    expect(bloc.verdict?.ok).toBe(true);
    expect(bloc.note).toBeNull();
    // Le motif de non-application est ecrit, faute de quoi l absence de
    // toute ligne d ame se lirait comme un oubli.
    expect(texte(bloc)).toMatch(/6\.2\.1|redistribution transversale/i);
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });

  it('un poteau affiche le renvoi au §9.5.3 plutot qu une regle de poutre', () => {
    const r = verifyDetailing(poutre(), 'column', { longitudinal: { NEd: 500 } });
    expect(r.web.applicable).toBe(false);

    const bloc = blocDispositions({ resultat: r });
    expect(texte(bloc)).toMatch(/9\.5\.3/);
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });

  it('nomme le type d element, qui est une SAISIE et non une deduction', () => {
    expect(texte(blocDispositions({ resultat: verifyDetailing(poutre(), 'beam') }))).toMatch(/poutre/i);
    expect(texte(blocDispositions({ resultat: verifyDetailing(dalle(), 'slab') }))).toMatch(/dalle/i);
    expect(
      texte(
        blocDispositions({
          resultat: verifyDetailing(poutre(), 'column', { longitudinal: { NEd: 500 } }),
        })
      )
    ).toMatch(/poteau/i);
  });

  it('un motif d indisponibilite donne un bloc SANS aucune ligne', () => {
    const bloc = blocDispositions({ motif: 'geometrie non rectangulaire' });

    expect(bloc.lignes).toHaveLength(0);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toBe('geometrie non rectangulaire');
  });
});

// --- Deformation genee (Zwang) -----------------------------------------------

describe('bloc de l armature minimale sous deformation genee', () => {
  it('affiche l aire exigee et les cinq grandeurs qui la fondent', () => {
    const r: RestraintResult = minimumRestraintArea(voile(400), 'central');

    const bloc = blocZwang({ resultat: r });

    expect(bloc.titre).toMatch(/7\.3\.2/);
    expect(bloc.lignes.length).toBeGreaterThan(0);
    const t = texte(bloc);
    expect(t).toMatch(/A_s,min/);
    expect(t).toMatch(/k_c/);
    expect(t).toMatch(/A_ct/);
    expect(t).toMatch(/f_ct,eff/);
    expect(t).toMatch(/sigma_s/);
    expect(JSON.stringify(bloc)).not.toContain('NaN');
  });

  it('ne rend AUCUN verdict : il exige une aire, il ne la compare a rien', () => {
    const bloc = blocZwang({ resultat: minimumRestraintArea(voile(400), 'central') });
    expect(bloc.verdict).toBeNull();
    // Et il le DIT, pour qu un bloc sans verdict ne passe pas pour un oubli.
    expect(bloc.note).toMatch(/compare|verdict|exig/i);
  });

  it('signale l element massif, ou k est a son plancher', () => {
    const mince = blocZwang({ resultat: minimumRestraintArea(voile(400), 'central') });
    const massif = blocZwang({ resultat: minimumRestraintArea(voile(1000), 'central') });

    expect(minimumRestraintArea(voile(1000), 'central').massive).toBe(true);
    expect(texte(massif)).toMatch(/massi/i);
    expect(texte(massif)).not.toBe(texte(mince));
  });

  it('distingue la zone tendue entiere du texte EN 1992-1-1 et la zone efficace', () => {
    const norme = minimumRestraintArea(voile(1000), 'central');
    const efficace = minimumRestraintArea(voile(1000), 'central', { effectiveZoneOnly: true });

    // La variante des pieces epaisses reduit reellement l acier exige : c est
    // pourquoi elle doit etre annoncee comme un ecart au texte, pas subie.
    expect(efficace.AsMin).toBeLessThan(norme.AsMin);

    expect(texte(blocZwang({ resultat: norme }))).toMatch(/zone tendue entiere|EN 1992-1-1/i);
    expect(texte(blocZwang({ resultat: efficace }))).toMatch(/efficace/i);
  });

  it('un motif d indisponibilite donne un bloc SANS aucune ligne', () => {
    const bloc = blocZwang({ motif: 'geometrie non rectangulaire' });

    expect(bloc.lignes).toHaveLength(0);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toMatch(/geometrie non rectangulaire/);
  });
});

// --- Gardes de domaine -------------------------------------------------------

/**
 * Les gardes sont interroges AVANT l appel, comme `obstacleFissuration` pour
 * le service.
 *
 * Deux raisons, et la seconde est la plus importante : les messages du noyau
 * commencent par le nom de la fonction qui leve (« shearGeometry : … »), ce
 * qui n a aucun sens pour l utilisateur de la page publiee ; et le garde sait
 * dire ce qui, malgre tout, reste calculable.
 */
describe('gardes de domaine', () => {
  function pieu() {
    return circularSection({
      diameter: 600,
      concrete: beton,
      rebars: [{ y: 0, z: 200, area: 500, steel: acier }],
    });
  }

  it('le rectangle ne rencontre aucun obstacle', () => {
    expect(obstacleTranchant(poutre())).toBeNull();
    expect(obstacleZwang(poutre())).toBeNull();
    expect(obstacleDispositions(poutre(), 'beam')).toBeNull();
    expect(obstacleDispositions(dalle(), 'slab')).toBeNull();
  });

  it('hors du rectangle, le motif est ecrit SANS le nom de la fonction du noyau', () => {
    const motifs = [
      obstacleTranchant(pieu()),
      obstacleZwang(pieu()),
      obstacleDispositions(pieu(), 'beam'),
    ];

    for (const motif of motifs) {
      expect(motif).not.toBeNull();
      expect(motif).toMatch(/rectangulaire/i);
      expect(motif).not.toMatch(/shearGeometry|minimumLongitudinalArea|minimumRestraintArea/);
    }
  });

  it('les dispositions d un POTEAU restent calculables hors du rectangle', () => {
    // Le §9.5.2 ne demande que l aire de beton et l effort normal : ni b_t ni
    // hauteur utile. Refuser le calcul la aussi priverait d un resultat qui
    // existe.
    expect(obstacleDispositions(pieu(), 'column')).toBeNull();
  });
});
