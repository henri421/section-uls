import { describe, it, expect } from 'vitest';
import { blocMeyer } from '../../app/src/meyer-view';
import type { BlocService } from '../../app/src/service-view';
import type { MeyerParams, MeyerResult } from '../../src/index';
import { meyerRestraintReinforcement } from '../../src/index';

/**
 * Presentation de la methode Meyer / DIN 1045 pour les elements massifs
 * sous deformation genee.
 *
 * Meme parti pris que `service-view.ts` et `checks-view.ts` : le bloc est
 * alimente par le VRAI module du noyau, jamais par un `MeyerResult`
 * reconstruit a la main. Un contrat d affichage teste sur des resultats
 * fabriques ne prouverait rien de ce que la page montre.
 *
 * Le module LEVE des que l un de ses parametres n est pas strictement
 * positif : l exception est attrapee par l appelant et arrive ici comme un
 * `motif`, exactement comme une geometrie hors domaine.
 */

/** Voile massif d un metre, C30/37, fissuration au jeune age. */
const VOILE: MeyerParams = {
  h: 1000,
  d1: 40,
  ds: 16,
  wk: 0.3,
  fctm: 2.9,
  kzt: 0.5,
  cas: 'traction',
  bridage: 'exterieur',
};

function calcul(surcharge: Partial<MeyerParams> = {}): MeyerResult {
  return meyerRestraintReinforcement({ ...VOILE, ...surcharge });
}

/** Valeur affichee en face d un libelle, telle qu elle sera lue a l ecran. */
function valeur(bloc: BlocService, fragmentDuLibelle: string): string {
  const ligne = bloc.lignes.find((l) => l.libelle.includes(fragmentDuLibelle));
  if (ligne === undefined) {
    throw new Error(
      `aucune ligne dont le libelle contienne "${fragmentDuLibelle}" ` +
        `(libelles presents : ${bloc.lignes.map((l) => l.libelle).join(' | ')})`
    );
  }
  return ligne.valeur;
}

function texteComplet(bloc: BlocService): string {
  return [
    bloc.titre,
    ...bloc.lignes.map((l) => `${l.libelle} ${l.valeur}`),
    bloc.verdict?.texte ?? '',
    bloc.note ?? '',
  ].join(' ');
}

describe('blocMeyer', () => {
  it('rend les grandeurs de la methode sur un calcul reussi', () => {
    const bloc = blocMeyer({ resultat: calcul() }, VOILE.ds);

    expect(bloc.titre).toMatch(/meyer/i);
    expect(bloc.lignes.length).toBeGreaterThan(0);

    // Les neuf grandeurs du `MeyerResult`, plus la repartition.
    for (const attendu of ['A_s', 'A_s total', 'Regime', 'k', 'k_c', 'A_cr', 'h_grenz', 'f_ct,eff']) {
      expect(() => valeur(bloc, attendu)).not.toThrow();
    }
  });

  it('n affiche jamais NaN', () => {
    for (const surcharge of [
      {},
      { bridage: 'interieur' as const },
      { cas: 'flexion' as const },
      { h: 250 },
      { kmode: 'parabolique' as const },
    ]) {
      expect(texteComplet(blocMeyer({ resultat: calcul(surcharge) }, VOILE.ds))).not.toContain('NaN');
    }
  });

  it('ecrit le regime EN CLAIR, jamais son identifiant', () => {
    // Trois regimes, et le lecteur doit savoir lequel a servi : ils ne
    // repondent pas a la meme physique. « fissuration-achevee » a l ecran
    // serait un nom de variable echappe dans la page.
    const achevee = valeur(blocMeyer({ resultat: calcul() }, VOILE.ds), 'Regime');
    expect(achevee).toMatch(/fissuration achevee/i);
    expect(achevee).not.toContain('fissuration-achevee');

    // h = 250 mm : k vaut 0,80, h_grenz = 250 mm, la piece est mince.
    const unique = valeur(blocMeyer({ resultat: calcul({ h: 240 }) }, VOILE.ds), 'Regime');
    expect(unique).toMatch(/fissure unique/i);
    expect(unique).not.toContain('fissure-unique');

    const interieur = valeur(
      blocMeyer({ resultat: calcul({ bridage: 'interieur' }) }, VOILE.ds),
      'Regime'
    );
    expect(interieur).toMatch(/interieur|propres/i);
  });

  it('affiche la repartition de barres deduite du diametre', () => {
    // `MeyerResult` ne porte PAS `ds` : il est passe a cote, comme `V_Ed`
    // l est a `blocTranchant`. Sans lui, aucune repartition n est possible.
    const bloc = blocMeyer({ resultat: calcul() }, VOILE.ds);
    const repartition = valeur(bloc, 'Repartition');

    expect(repartition).toMatch(/HA ?16/i);
    expect(repartition).toMatch(/\d+\s*barres/i);
    expect(repartition).toMatch(/mm/);
    expect(texteComplet(bloc)).toMatch(/fournie/i);
  });

  it('la repartition couvre l aire exigee PAR FACE', () => {
    // Arrondi TOUJOURS vers le haut : `A_s,fournie >= A_s,requise`. Une
    // repartition qui couvrirait l aire totale placerait deux fois trop peu
    // de barres sur chaque face.
    const resultat = calcul();
    const bloc = blocMeyer({ resultat }, VOILE.ds);

    const fournie = Number(
      /(\d+(?:,\d+)?)/.exec(valeur(bloc, 'Repartition').split('fournie')[1] ?? '')?.[1]?.replace(
        ',',
        '.'
      ) ?? NaN
    );
    expect(fournie).toBeGreaterThanOrEqual(resultat.AsFace);
    expect(fournie).toBeLessThan(resultat.AsTotal);
  });

  it('porte le motif quand le calcul n a pas eu lieu, sans aucun chiffre', () => {
    // `meyerRestraintReinforcement` LEVE sur un parametre nul ou negatif.
    const bloc = blocMeyer({ motif: 'h doit etre strictement positif (0)' }, 16);

    expect(bloc.lignes).toHaveLength(0);
    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toContain('h doit etre strictement positif');
  });

  it('ne rend JAMAIS de verdict', () => {
    // Le module donne une aire EXIGEE ; il ne la compare a aucune armature
    // en place. Un verdict laisserait croire a une verification.
    const bloc = blocMeyer({ resultat: calcul() }, VOILE.ds);

    expect(bloc.verdict).toBeNull();
    expect(bloc.note).toMatch(/aucun verdict|pas de verdict/i);
  });

  it('annonce le cadre reglementaire : DIN 1045, pas l EN 1992-1-1', () => {
    // La methode est allemande. En Belgique et au Luxembourg la
    // justification reste l EC2 et ses annexes nationales : Meyer sert au
    // pre-dimensionnement et au controle d ordre de grandeur.
    const bloc = blocMeyer({ resultat: calcul() }, VOILE.ds);

    expect(texteComplet(bloc)).toMatch(/DIN 1045/);
    expect(bloc.note).toMatch(/pre-dimensionnement|ordre de grandeur/i);
  });

  it('dit qu elle NE REMPLACE PAS le §7.3.2 affiche au-dessus', () => {
    // Les deux coexistent. Le lecteur qui verrait deux « k » differents a
    // dix lignes d ecart conclurait a un bug : le bloc doit le prevenir.
    const bloc = blocMeyer({ resultat: calcul() }, VOILE.ds);
    const texte = texteComplet(bloc);

    expect(texte).toMatch(/7\.3\.2/);
    expect(texte).toMatch(/remplace/i);
    // Les bornes de chaque facteur, ecrites cote a cote : c est ce qui rend
    // l ecart lisible plutot qu affirme.
    expect(texte).toMatch(/0,80/);
    expect(texte).toMatch(/0,50/);
    expect(texte).toMatch(/1,00/);
    expect(texte).toMatch(/0,65/);
  });

  it('signale que seule la famille traction / bridage exterieur est validee', () => {
    const bloc = blocMeyer({ resultat: calcul() }, VOILE.ds);
    expect(bloc.note).toMatch(/valid/i);
    expect(bloc.note).toMatch(/flexion/i);
  });

  it('avertit meme quand le calcul a echoue', () => {
    // Un bloc reduit a son motif perdrait tout ce qui distingue Meyer de
    // l EC2 — et c est justement quand rien ne s affiche que le lecteur
    // cherche a comprendre ce que ce bloc fait la.
    const bloc = blocMeyer({ motif: 'ds doit etre strictement positif (0)' }, 0);

    expect(bloc.note).toMatch(/DIN 1045/);
    expect(bloc.note).toMatch(/7\.3\.2/);
  });
});
