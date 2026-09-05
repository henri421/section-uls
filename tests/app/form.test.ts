import { describe, it, expect } from 'vitest';
import {
  formToModel,
  modelToForm,
  parsePoints,
  formatPoints,
  parametresDeService,
  FormError,
} from '../../app/src/form';
import {
  ELEMENT_TYPE_PAR_DEFAUT,
  V_ED_PAR_DEFAUT,
  FYWK_PAR_DEFAUT,
  COT_THETA_PAR_DEFAUT,
  RESTRAINT_TYPE_PAR_DEFAUT,
  MEYER_D1_PAR_DEFAUT,
  MEYER_DS_PAR_DEFAUT,
  MEYER_WK_PAR_DEFAUT,
  MEYER_KZT_PAR_DEFAUT,
  MEYER_CAS_PAR_DEFAUT,
  MEYER_BRIDAGE_PAR_DEFAUT,
  MEYER_KMODE_PAR_DEFAUT,
} from '../../app/src/form';
import { parseModel, serializeModel, FORMAT_VERSION, ENGINE_VERSION } from '../../src/index';
import type { SectionModel } from '../../src/index';

function base(): Omit<SectionModel, 'geometry' | 'reinforcement'> {
  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
    concrete: { fck: 25 },
    steel: { fyk: 500, Es: 200000 },
    action: { N: 500, My: 1, Mz: 1 },
  };
}

const SEPT_FORMES: SectionModel[] = [
  { ...base(), geometry: { kind: 'rectangle', width: 400, height: 600 },
    reinforcement: { kind: 'rectangular-layout', cover: 30, stirrupDiameter: 8,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } },
             { face: 'top', bars: { diameter: 12, maxSpacing: 150 } }] } },
  { ...base(), geometry: { kind: 'circle', diameter: 600, segments: 48 },
    reinforcement: { kind: 'circular-cage', cover: 50, stirrupDiameter: 12,
      barDiameter: 20, count: 8, rotationOffset: 0.2 } },
  { ...base(), geometry: { kind: 'polygon', vertices: [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 } ] },
    reinforcement: { kind: 'rows', rows: [
      { from: { y: 50, z: 450 }, to: { y: 250, z: 450 }, bars: { count: 3, diameter: 20 } },
      { from: { y: 50, z: 50 }, to: { y: 250, z: 50 },
        bars: { diameter: 12, maxSpacing: 150 }, endpoints: 'exclude' } ] } },
  { ...base(), geometry: { kind: 'polygon', vertices: [
      { y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }, { y: 0, z: 500 } ] },
    reinforcement: { kind: 'bars', bars: [{ y: 150, z: 450, area: 314 }] } },
];

describe('conversion formulaire <-> modele', () => {
  /**
   * Le modele reconstruit CONSERVE tout ce que portait l'original.
   *
   * `toMatchObject` et non `toEqual` depuis la version 3 du format : le
   * formulaire affiche en permanence un type d'element, une nature de gene et
   * les parametres de Meyer, tous saisis, donc tous enregistres. Un modele
   * anterieur qui ne les portait pas ressort donc avec ces blocs, remplis des
   * valeurs que l'ecran montrait. Ce qui compte ici est qu'il ne PERDE rien —
   * l'identite stricte est verifiee plus bas, sur un modele de version 3
   * complet, ou elle a un sens.
   */
  it('aller-retour sur toutes les formes de geometrie et de ferraillage', () => {
    for (const modele of SEPT_FORMES) {
      expect(formToModel(modelToForm(modele))).toMatchObject(modele);
    }
  });

  it('un modele anterieur a la version 3 ressort avec ce que le formulaire affiche', () => {
    // La contrepartie explicite du `toMatchObject` ci-dessus : ce qui
    // s'ajoute, et rien d'autre. Sans ce test, la souplesse du matcher
    // couvrirait n'importe quel bloc parasite.
    const reconstruit = formToModel(modelToForm(SEPT_FORMES[0]));

    expect(reconstruit.elementType).toBe(ELEMENT_TYPE_PAR_DEFAUT);
    expect(reconstruit.restraint).toEqual({ type: RESTRAINT_TYPE_PAR_DEFAUT });
    expect(reconstruit.meyer?.h).toBe(600); // la hauteur de la section, pre-remplie
    expect(reconstruit.meyer?.kzt).toBe(0.5);
    // `V_Ed` part de « 0 » A L'ECRAN depuis la session 11, pour que V_Rd,c
    // s'affiche des le chargement. Mais ce zero-la n'est PAS une saisie : rien
    // n'a ete declare sur le tranchant, et le bloc reste donc absent du
    // modele. L'ecrire ferait dire au fichier « l'ingenieur a verifie le
    // tranchant sous effort nul », une affirmation la ou il n'y a qu'une
    // absence. Des cadres declares, eux, sont une decision et se sauvegardent
    // meme sous effort nul — c'est teste plus bas.
    expect(reconstruit.shear).toBeUndefined();
  });

  it('le modele reconstruit passe la validation du noyau', () => {
    // Controle croise : la couche de saisie ne doit pas pouvoir produire un
    // modele que le format lui-meme rejetterait.
    for (const modele of SEPT_FORMES) {
      const reconstruit = formToModel(modelToForm(modele));
      expect(() => parseModel(serializeModel(reconstruit))).not.toThrow();
    }
  });

  it('un nom vide est omis, jamais rendu comme chaine vide', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.name = '';
    expect(formToModel(form).name).toBeUndefined();
  });

  it('un optionnel laisse vide est omis, jamais rendu comme zero', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.stirrupDiameter = '';
    const modele = formToModel(form);
    expect(modele.reinforcement.kind).toBe('rectangular-layout');
    if (modele.reinforcement.kind === 'rectangular-layout') {
      expect(modele.reinforcement.stirrupDiameter).toBeUndefined();
    }
  });

  it('refuse une valeur non numerique en nommant le champ', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.fck = 'vingt-cinq';
    expect(() => formToModel(form)).toThrow(FormError);
    expect(() => formToModel(form)).toThrow(/fck/);
  });

  it('refuse un sommet mal forme en nommant la ligne', () => {
    expect(() => parsePoints('0;0\n100;abc\n100;100', 'sommets')).toThrow(/ligne 2/);
  });

  it('analyse et reconstitue une liste de points', () => {
    const texte = '0 ; 0\n300 ; 0\n300 ; 500';
    const points = parsePoints(texte, 'sommets');
    expect(points).toEqual([{ y: 0, z: 0 }, { y: 300, z: 0 }, { y: 300, z: 500 }]);
    expect(parsePoints(formatPoints(points), 'sommets')).toEqual(points);
  });

  it('ignore les lignes vides et les espaces surnumeraires', () => {
    expect(parsePoints('\n  0;0  \n\n  100 ; 200 \n', 'sommets'))
      .toEqual([{ y: 0, z: 0 }, { y: 100, z: 200 }]);
  });
});

/**
 * Sollicitations de SERVICE : des combinaisons EN 1990 differentes de l'ELU,
 * saisies separement. Reutiliser le moment de l'ELU serait faux d'un facteur
 * ~1,35 a 1,5 — le premier chiffre affiche serait un mensonge.
 */
describe('sollicitations de service dans le formulaire', () => {
  const AVEC_SERVICE: SectionModel = {
    ...SEPT_FORMES[0],
    serviceActions: {
      characteristic: { N: 370, M: 59 },
      quasiPermanent: { N: 300, M: 45 },
    },
  };

  // `toMatchObject` pour la meme raison que plus haut : ces modeles sont
  // anterieurs a la version 3 et ressortent avec les blocs que le formulaire
  // affiche. Les sollicitations de service, elles, doivent revenir exactes.
  it('aller-retour avec les deux combinaisons', () => {
    expect(formToModel(modelToForm(AVEC_SERVICE))).toMatchObject(AVEC_SERVICE);
  });

  it('aller-retour avec la seule combinaison quasi-permanente', () => {
    const modele: SectionModel = {
      ...SEPT_FORMES[0],
      serviceActions: { quasiPermanent: { N: 300, M: 45 } },
    };
    const reconstruit = formToModel(modelToForm(modele));
    expect(reconstruit).toMatchObject(modele);
    expect(reconstruit.serviceActions).toEqual({ quasiPermanent: { N: 300, M: 45 } });
  });

  it('un modele sans service laisse les champs VIDES, jamais a zero', () => {
    // Un fichier de format v1 ne porte pas de service. Y afficher « 0 »
    // ressemblerait a une saisie, et produirait un resultat de service
    // parfaitement calcule pour une sollicitation que personne n'a donnee.
    const form = modelToForm(SEPT_FORMES[0]);
    expect(form.serviceCarN).toBe('');
    expect(form.serviceCarM).toBe('');
    expect(form.serviceQpN).toBe('');
    expect(form.serviceQpM).toBe('');
    expect(formToModel(form).serviceActions).toBeUndefined();
  });

  it('une combinaison a demi remplie est refusee en nommant le champ', () => {
    const form = modelToForm(AVEC_SERVICE);
    form.serviceCarM = '';
    expect(() => formToModel(form)).toThrow(FormError);
    expect(() => formToModel(form)).toThrow(/caracteristique/i);
    expect(() => formToModel(form)).toThrow(/M/);
  });

  it('une combinaison quasi-permanente a demi remplie est refusee de meme', () => {
    const form = modelToForm(AVEC_SERVICE);
    form.serviceQpN = '';
    expect(() => formToModel(form)).toThrow(/quasi-permanent/i);
  });

  it('les combinaisons sont independantes : vider l une garde l autre', () => {
    const form = modelToForm(AVEC_SERVICE);
    form.serviceCarN = '';
    form.serviceCarM = '';
    const modele = formToModel(form);
    expect(modele.serviceActions).toEqual({ quasiPermanent: { N: 300, M: 45 } });
  });

  it('les champs de service sont des expressions comme les autres', () => {
    const form = modelToForm(AVEC_SERVICE);
    form.serviceQpM = '30+15';
    expect(formToModel(form).serviceActions?.quasiPermanent).toEqual({ N: 300, M: 45 });
  });

  it('le modele reconstruit avec service passe la validation du noyau', () => {
    const reconstruit = formToModel(modelToForm(AVEC_SERVICE));
    expect(() => parseModel(serializeModel(reconstruit))).not.toThrow();
  });
});

/**
 * Les trois parametres que l'ingenieur ASSUME plutot qu'il ne les subit :
 * chacun porte deja un avertissement explicite dans son module — signe qu'il
 * s'agit d'un choix, pas d'une constante normative.
 */
describe('parametres de service', () => {
  it('reprend les valeurs par defaut du formulaire', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    expect(parametresDeService(form)).toEqual({ n: 15, wMax: 0.3, beta: 0.5 });
  });

  it('evalue les expressions saisies', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.serviceN = '30/2';
    form.crackWMax = '0.2';
    form.curvatureBeta = '1';
    expect(parametresDeService(form)).toEqual({ n: 15, wMax: 0.2, beta: 1 });
  });

  it('refuse une valeur non numerique en nommant le parametre', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    form.crackWMax = 'faible';
    expect(() => parametresDeService(form)).toThrow(FormError);
    expect(() => parametresDeService(form)).toThrow(/w_max/);
  });
});

/**
 * Les quatre blocs de la version 3 du format : type d element, effort
 * tranchant, deformation genee et methode Meyer.
 *
 * Ils decrivent l OUVRAGE et son CHARGEMENT, pas une hypothese de
 * verification : ils entrent donc dans le modele, du meme mouvement que les
 * sollicitations de service en session 10. La frontiere n a pas bouge, c est
 * la liste des champs saisis qui s est allongee.
 */
describe('champs de verification vers le modele', () => {
  /** Un formulaire ou chacun des quatre blocs porte une valeur distinctive. */
  function formulaireRempli() {
    const form = modelToForm(SEPT_FORMES[0]);
    form.elementType = 'beam';
    form.V_Ed = '260';
    form.Asw = '100';
    form.sCadres = '200';
    form.fywk = '500';
    form.cotTheta = '2';
    form.restraintType = 'bending';
    form.fctEff = '1,8';
    form.sigmaSZwang = '320';
    form.zoneEfficace = true;
    form.meyerH = '800';
    form.meyerD1 = '50';
    form.meyerDs = '20';
    form.meyerWk = '0,2';
    form.meyerFctm = '2,9';
    form.meyerKzt = '0,6';
    form.meyerCas = 'flexion';
    form.meyerBridage = 'interieur';
    form.meyerKmode = 'parabolique';
    return form;
  }

  it('un formulaire complet produit les quatre blocs', () => {
    const modele = formToModel(formulaireRempli());

    expect(modele.elementType).toBe('beam');
    expect(modele.shear).toEqual({
      V_Ed: 260,
      links: { Asw: 100, s: 200, fywk: 500 },
      cotTheta: 2,
    });
    expect(modele.restraint).toEqual({
      type: 'bending',
      fctEff: 1.8,
      sigmaS: 320,
      effectiveZoneOnly: true,
    });
    expect(modele.meyer).toEqual({
      h: 800, d1: 50, ds: 20, wk: 0.2, fctm: 2.9, kzt: 0.6,
      cas: 'flexion', bridage: 'interieur', kmode: 'parabolique',
    });
  });

  it('un effort tranchant vide laisse le bloc ABSENT, jamais un V_Ed nul', () => {
    // « V_Ed = 0 » se relirait comme « l ingenieur a verifie le tranchant sous
    // effort nul » : une affirmation, la ou il n y a qu une absence.
    const form = formulaireRempli();
    form.V_Ed = '';
    expect(formToModel(form).shear).toBeUndefined();
  });

  it('une saisie partielle des cadres laisse links absent sans faire echouer le reste', () => {
    // `formToModel` est appele a CHAQUE frappe par le recalcul : y lever
    // remplacerait tout le resultat affiche par un message d erreur.
    const form = formulaireRempli();
    form.sCadres = '';

    expect(() => formToModel(form)).not.toThrow();
    const modele = formToModel(form);
    expect(modele.shear?.V_Ed).toBe(260);
    expect(modele.shear?.links).toBeUndefined();
  });

  it('un cot theta vide reste absent : son defaut vit dans shearWithLinks', () => {
    const form = formulaireRempli();
    form.cotTheta = '';
    expect(formToModel(form).shear?.V_Ed).toBe(260);
    expect(formToModel(form).shear?.cotTheta).toBeUndefined();
  });

  it('les optionnels de la gene laisses vides sont omis, jamais rendus a zero', () => {
    const form = modelToForm(SEPT_FORMES[0]);
    // `f_ct,eff` a zero annulerait l armature exigee ; « absent » veut dire
    // « f_ctm a 28 jours », ce qui est le cas defavorable et non le cas nul.
    expect(formToModel(form).restraint).toEqual({ type: RESTRAINT_TYPE_PAR_DEFAUT });
  });

  it('un parametre de Meyer vide laisse le bloc absent', () => {
    const form = formulaireRempli();
    form.meyerKzt = '';
    expect(formToModel(form).meyer).toBeUndefined();
  });

  it('une section non rectangulaire ne pre-remplit pas h : le bloc Meyer reste absent', () => {
    // SEPT_FORMES[1] est un cercle : aucune dimension ne s impose comme
    // epaisseur, le champ reste vide, et rien n est invente dans le fichier.
    expect(formToModel(modelToForm(SEPT_FORMES[1])).meyer).toBeUndefined();
  });

  it('les expressions arithmetiques valent dans ces champs comme dans les autres', () => {
    const form = formulaireRempli();
    form.V_Ed = '120+140';
    form.Asw = '2*50';
    form.meyerH = '400*2';

    const modele = formToModel(form);
    expect(modele.shear?.V_Ed).toBe(260);
    expect(modele.shear?.links?.Asw).toBe(100);
    expect(modele.meyer?.h).toBe(800);
  });
});

/**
 * Le chemin inverse : un fichier de version 3 rouvert doit rendre a l'ecran
 * exactement ce qui y etait, et un fichier anterieur doit rendre les valeurs
 * de depart — jamais des zeros, qui ressembleraient a une saisie.
 */
describe('rechargement des champs de verification', () => {
  const COMPLET: SectionModel = {
    ...SEPT_FORMES[0],
    elementType: 'beam',
    shear: { V_Ed: 260, links: { Asw: 100, s: 200, fywk: 500 }, cotTheta: 2 },
    restraint: { type: 'bending', fctEff: 1.8, sigmaS: 320, effectiveZoneOnly: true },
    meyer: {
      h: 800, d1: 50, ds: 20, wk: 0.2, fctm: 2.9, kzt: 0.6,
      cas: 'flexion', bridage: 'interieur', kmode: 'parabolique',
    },
  };

  it('aller-retour A L IDENTIQUE sur un modele de version 3 complet', () => {
    // C'est ici, et seulement ici, que l'identite stricte a un sens : le
    // modele porte tous les blocs que le formulaire sait afficher.
    expect(formToModel(modelToForm(COMPLET))).toEqual(COMPLET);
  });

  it('chaque champ affiche ce que le modele portait', () => {
    const form = modelToForm(COMPLET);

    expect(form.elementType).toBe('beam');
    expect(form.V_Ed).toBe('260');
    expect(form.Asw).toBe('100');
    expect(form.sCadres).toBe('200');
    expect(form.fywk).toBe('500');
    expect(form.cotTheta).toBe('2');

    expect(form.restraintType).toBe('bending');
    expect(form.fctEff).toBe('1.8');
    expect(form.sigmaSZwang).toBe('320');
    expect(form.zoneEfficace).toBe(true);

    expect(form.meyerH).toBe('800');
    expect(form.meyerD1).toBe('50');
    expect(form.meyerDs).toBe('20');
    expect(form.meyerWk).toBe('0.2');
    expect(form.meyerFctm).toBe('2.9');
    expect(form.meyerKzt).toBe('0.6');
    expect(form.meyerCas).toBe('flexion');
    expect(form.meyerBridage).toBe('interieur');
    expect(form.meyerKmode).toBe('parabolique');
  });

  it('un modele anterieur a la version 3 rend les valeurs de depart, jamais des zeros', () => {
    const form = modelToForm(SEPT_FORMES[0]);

    expect(form.elementType).toBe(ELEMENT_TYPE_PAR_DEFAUT);
    expect(form.V_Ed).toBe(V_ED_PAR_DEFAUT);
    // Les cadres partent VIDES : c'est un ferraillage, la page n'en invente
    // aucun. Un « 0 » afficherait un cours de cadres d'aire nulle.
    expect(form.Asw).toBe('');
    expect(form.sCadres).toBe('');
    expect(form.fywk).toBe(FYWK_PAR_DEFAUT);
    expect(form.cotTheta).toBe(COT_THETA_PAR_DEFAUT);

    expect(form.restraintType).toBe(RESTRAINT_TYPE_PAR_DEFAUT);
    expect(form.fctEff).toBe('');
    expect(form.sigmaSZwang).toBe('');
    expect(form.zoneEfficace).toBe(false);

    expect(form.meyerH).toBe('600'); // pre-rempli avec la hauteur de la section
    expect(form.meyerD1).toBe(MEYER_D1_PAR_DEFAUT);
    expect(form.meyerDs).toBe(MEYER_DS_PAR_DEFAUT);
    expect(form.meyerWk).toBe(MEYER_WK_PAR_DEFAUT);
    expect(form.meyerKzt).toBe(MEYER_KZT_PAR_DEFAUT);
    expect(form.meyerCas).toBe(MEYER_CAS_PAR_DEFAUT);
    expect(form.meyerBridage).toBe(MEYER_BRIDAGE_PAR_DEFAUT);
    expect(form.meyerKmode).toBe(MEYER_KMODE_PAR_DEFAUT);
  });

  it('un modele partiel ne perd rien de ce qu il porte', () => {
    const partiel: SectionModel = {
      ...SEPT_FORMES[0],
      elementType: 'slab',
      shear: { V_Ed: 90 },
      restraint: { type: 'bending', sigmaS: 280 },
    };
    const form = modelToForm(partiel);

    expect(form.elementType).toBe('slab');
    expect(form.V_Ed).toBe('90');
    expect(form.Asw).toBe(''); // aucun cadre au fichier, aucun a l'ecran
    expect(form.sCadres).toBe('');
    expect(form.restraintType).toBe('bending');
    expect(form.sigmaSZwang).toBe('280');
    expect(form.fctEff).toBe('');

    const reconstruit = formToModel(form);
    expect(reconstruit).toMatchObject(partiel);
    expect(reconstruit.shear?.links).toBeUndefined();
    expect(reconstruit.restraint).toEqual({ type: 'bending', sigmaS: 280 });
  });

  it('un modele sans bloc de tranchant rend le champ a sa valeur de depart', () => {
    // Et surtout PAS a vide : le champ a « 0 » depuis la session 11, pour que
    // V_Rd,c s'affiche des le chargement sans qu'on ait rien a saisir.
    const form = modelToForm({ ...SEPT_FORMES[0], elementType: 'beam' });
    expect(form.V_Ed).toBe(V_ED_PAR_DEFAUT);
    expect(form.cotTheta).toBe(COT_THETA_PAR_DEFAUT);
  });

  it('le modele reconstruit avec les quatre blocs passe la validation du noyau', () => {
    const reconstruit = formToModel(modelToForm(COMPLET));
    expect(() => parseModel(serializeModel(reconstruit))).not.toThrow();
  });
});

describe('le tranchant non saisi ne devient pas une affirmation', () => {
  it("n'ecrit PAS de bloc `shear` quand V_Ed vaut zero sans cadres declares", () => {
    // Le champ V_Ed est pre-rempli a zero pour que V_Rd,c s'affiche des le
    // chargement. Ecrire `shear` dans ce cas ferait dire au fichier que
    // l'ingenieur a verifie le tranchant sous effort nul — une affirmation la
    // ou il n'y a qu'une absence de saisie.
    const etat = modelToForm(SEPT_FORMES[0]);
    etat.V_Ed = '0';
    etat.Asw = '';
    etat.sCadres = '';

    expect(formToModel(etat).shear).toBeUndefined();
  });

  it('ecrit le bloc des que des cadres sont declares, meme sous effort nul', () => {
    // Des cadres sont un ferraillage, donc une decision : ils se sauvegardent.
    const etat = modelToForm(SEPT_FORMES[0]);
    etat.V_Ed = '0';
    etat.Asw = '101';
    etat.sCadres = '150';
    etat.fywk = '500';

    const shear = formToModel(etat).shear;
    expect(shear).toBeDefined();
    expect(shear?.links).toEqual({ Asw: 101, s: 150, fywk: 500 });
  });

  it('ecrit le bloc des que l effort est non nul', () => {
    const etat = modelToForm(SEPT_FORMES[0]);
    etat.V_Ed = '260';

    expect(formToModel(etat).shear?.V_Ed).toBe(260);
  });
});

describe('une sauvegarde locale illisible n est jamais perdue', () => {
  it('met de cote le texte refuse par le format au lieu de le laisser ecraser', async () => {
    // Le scenario reel : une seule valeur refusee par le format — un `h` de
    // Meyer a zero suffit — rendait toute la sauvegarde illisible. La page
    // repartait alors du modele par defaut, et le premier recalcul ECRASAIT
    // le travail de l'utilisateur. Sans un mot.
    const { JSDOM } = await import('jsdom');
    const dom = new JSDOM('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    });
    const g = globalThis as unknown as Record<string, unknown>;
    const precedent = g.localStorage;
    g.localStorage = dom.window.localStorage;

    try {
      const { chargerLocalement, sauvegardeIllisible } = await import('../../app/src/storage');

      const travail = '{"formatVersion":3,"geometry":{"kind":"rectangle","width":0}}';
      dom.window.localStorage.setItem('section-uls:modele-courant', travail);

      expect(chargerLocalement()).toBeNull();
      // Le texte n'a pas disparu : il est recuperable.
      expect(sauvegardeIllisible()).toBe(travail);
      // Et il ne reste pas sous la cle courante, ou il serait ecrase.
      expect(dom.window.localStorage.getItem('section-uls:modele-courant')).toBeNull();
    } finally {
      g.localStorage = precedent;
    }
  });
});
