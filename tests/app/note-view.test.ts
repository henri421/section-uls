import { describe, it, expect } from 'vitest';
import { resolveModel, FORMAT_VERSION, ENGINE_VERSION } from '../../src/index';
import type { SectionModel } from '../../src/index';

import { blocsDEntree, hypothesesDeLaNote } from '../../app/src/note-view';
import type { ParametresService } from '../../app/src/form';

/**
 * Les DONNEES D ENTREE de la note et ses hypotheses.
 *
 * Fonctions PURES, sur le modele exact de `service-view.ts` : elles mettent en
 * forme le modele saisi, elles ne recalculent rien. Elles vivent hors de
 * `main.ts` pour la raison qui vaut partout ici — ce qui peut se tromper se
 * teste sans navigateur.
 */

const PARAMETRES: ParametresService = {
  n: 15,
  wMax: 0.3,
  beta: 0.5,
  crackingMode: 'auto',
  crackingFctEff: undefined,
};

function modele(): SectionModel {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    name: 'Poteau P1',
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    geometry: { kind: 'rectangle', width: 400, height: 400 },
    reinforcement: {
      kind: 'rectangular-layout',
      cover: 30,
      stirrupDiameter: 8,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
      ],
    },
    action: { N: 500, My: 80, Mz: 40 },
    serviceActions: {
      characteristic: { N: 370, M: 59 },
      quasiPermanent: { N: 300, M: 45 },
    },
  };
}

function entrees(m: SectionModel = modele()) {
  return blocsDEntree(m, resolveModel(m), PARAMETRES);
}

function bloc(titre: string, m?: SectionModel) {
  const trouve = entrees(m).find((b) => b.titre === titre);
  if (trouve === undefined) throw new Error(`bloc "${titre}" absent des données d'entrée`);
  return trouve;
}

function valeur(titre: string, libelle: string, m?: SectionModel): string {
  const ligne = bloc(titre, m).lignes.find((l) => l.libelle === libelle);
  if (ligne === undefined) throw new Error(`ligne "${libelle}" absente du bloc "${titre}"`);
  return ligne.valeur;
}

describe('blocsDEntree', () => {
  it('couvre l identification, la géométrie, les matériaux, les armatures et les sollicitations', () => {
    const titres = entrees().map((b) => b.titre);

    expect(titres).toContain('Identification et profil normatif');
    expect(titres).toContain('Géométrie');
    expect(titres).toContain('Matériaux');
    expect(titres).toContain('Armatures');
    expect(titres).toContain('Sollicitation ELU');
    expect(titres).toContain('Sollicitations de service');
    expect(titres).toContain('Paramètres de service assumés');
  });

  it('rend la géométrie SAISIE, et non la géométrie resolue', () => {
    // Un cercle est integre comme un polygone a 32 cotes : c est un detail de
    // calcul, ce n est pas la donnee d entree de l ouvrage.
    const cercle = modele();
    cercle.geometry = { kind: 'circle', diameter: 600 };
    cercle.reinforcement = {
      kind: 'circular-cage',
      cover: 50,
      barDiameter: 20,
      count: 8,
    };

    expect(valeur('Géométrie', 'Forme', cercle)).toMatch(/cercle/i);
    expect(valeur('Géométrie', 'Forme', cercle)).toContain('600');
  });

  it('rend les dimensions du rectangle', () => {
    expect(valeur('Géométrie', 'Forme')).toContain('400');
  });

  it('rend les résistances de calcul a cote des résistances caractéristiques', () => {
    // fcd et fyd sont ce sur quoi la verification porte reellement : les taire
    // obligerait le lecteur a refaire la division par gamma pour verifier.
    expect(valeur('Matériaux', 'fck')).toContain('25');
    expect(valeur('Matériaux', 'fcd')).toContain('16,67');
    expect(valeur('Matériaux', 'fyd')).toContain('434,8');
  });

  it('rend le profil normatif et ses coefficients partiels', () => {
    expect(valeur('Identification et profil normatif', 'Profil normatif')).toContain(
      'EC2_recommended'
    );
    expect(valeur('Identification et profil normatif', 'gamma_c')).toContain('1,5');
    expect(valeur('Identification et profil normatif', 'gamma_s')).toContain('1,15');
  });

  it('rend les trois composantes de la sollicitation ELU', () => {
    expect(valeur('Sollicitation ELU', 'N')).toContain('500');
    expect(valeur('Sollicitation ELU', 'My')).toContain('80');
    expect(valeur('Sollicitation ELU', 'Mz')).toContain('40');
  });

  it('DIT qu\'une combinaison de service n\'est pas saisie, au lieu de la taire', () => {
    // Une combinaison absente qui disparait de la note ferait croire au
    // lecteur qu elle a ete prise en compte.
    // Service COCHE, combinaisons absentes : c'est le cas ou la note doit
    // le dire.
    const sansService = modele();
    delete sansService.serviceActions;
    sansService.checks = { service: true };

    expect(valeur('Sollicitations de service', 'Combinaison caractéristique', sansService)).toMatch(
      /non saisie/i
    );
    expect(valeur('Sollicitations de service', 'Combinaison quasi-permanente', sansService)).toMatch(
      /non saisie/i
    );
  });

  it('rend les paramètres de service, en disant que ce sont des CHOIX', () => {
    expect(valeur('Paramètres de service assumés', 'n, coefficient d\'équivalence')).toContain('15');
    expect(valeur('Paramètres de service assumés', 'w_max')).toContain('0,3');
    expect(valeur('Paramètres de service assumés', 'beta')).toContain('0,5');
    expect(bloc('Paramètres de service assumés').note).toMatch(/choix/i);
  });

  it('n affiche AUCUN NaN, et ne rend AUCUN verdict', () => {
    for (const b of entrees()) {
      expect(b.verdict, `${b.titre} conclut, alors qu'il ne fait que rapporter la saisie`).toBeNull();
      for (const l of b.lignes) expect(l.valeur).not.toContain('NaN');
    }
  });
});

describe('hypothesesDeLaNote', () => {
  const hypotheses = () => hypothesesDeLaNote(resolveModel(modele())).join('\n');

  it('nomme le profil normatif retenu et rappelle l\'annexe nationale', () => {
    expect(hypotheses()).toContain('EC2_recommended');
    expect(hypotheses()).toMatch(/annexe nationale/i);
  });

  it('enonce les restrictions de domaine de chaque module coche', () => {
    const tout = modele();
    tout.checks = { service: true, shear: true, restraint: true, restraintReferential: 'both' };
    const texte = hypothesesDeLaNote(resolveModel(tout)).join('\n');

    expect(texte).toMatch(/rectangulaire/i); // tranchant et fissuration
    expect(texte).toMatch(/flexion droite/i); // service
    expect(texte).toMatch(/Meyer/); // methode allemande, pre-dimensionnement
    expect(texte).toMatch(/n'est pas une flèche/i); // courbure
  });

  it('ne conclut rien', () => {
    expect(hypotheses()).not.toMatch(/section verifiee|section non verifiee/i);
  });

  it('ne parle d aucun module decoche', () => {
    // Cas signale par l'utilisateur : ELU seul. La note ne doit evoquer ni le
    // service, ni le tranchant, ni la deformation genee.
    const eluSeul = modele();
    eluSeul.checks = { service: false, shear: false, restraint: false, detailing: false };
    const texte = hypothesesDeLaNote(resolveModel(eluSeul)).join('\n');

    expect(texte).not.toMatch(/service|§7\.2|§7\.3|fleche|Meyer|tranchant/i);
    expect(texte).toMatch(/annexe nationale/i);
  });
});

describe('données d\'entrée selon les vérifications cochees', () => {
  it('ELU seul : aucune sollicitation ni paramètre de service', () => {
    const eluSeul = modele();
    eluSeul.checks = { service: false };
    const titres = entrees(eluSeul).map((b) => b.titre);

    expect(titres).toContain('Sollicitation ELU');
    expect(titres).not.toContain('Sollicitations de service');
    expect(titres).not.toContain('Paramètres de service assumés');
  });

  it('service coche : les deux blocs de service sont presents', () => {
    const avecService = modele();
    avecService.checks = { service: true };
    const titres = entrees(avecService).map((b) => b.titre);

    expect(titres).toContain('Sollicitations de service');
    expect(titres).toContain('Paramètres de service assumés');
  });
});
