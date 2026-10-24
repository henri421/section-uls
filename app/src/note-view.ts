import type { SectionModel, ResolvedModel } from '../../src/index';
import { polygonArea } from '../../src/index';
import type { BlocService, LigneAffichee } from './service-view';
import type { ParametresService } from './form';
import { outlineOf } from './draw';
import { formatNumber } from './format';

/**
 * Les DONNEES D ENTREE de la note de calcul, et ses hypotheses.
 *
 * Fonctions PURES, sans DOM et sans mecanique, sur le modele exact de
 * `service-view.ts` et de `checks-view.ts` : elles mettent en forme le modele
 * saisi, elles ne recalculent rien.
 *
 * Elles rendent des `BlocService` comme tout le reste de la note : un seul
 * patron de bloc, donc un seul rendu a ecrire et a verifier.
 *
 * AUCUN de ces blocs ne porte de verdict. Une donnee d entree ne conclut pas :
 * elle rapporte ce qui a ete saisi, et c est tout ce qu on lui demande.
 */

const SANS_VERDICT = { verdict: null, note: null } as const;

/** La geometrie SAISIE, jamais la geometrie resolue. */
function formeSaisie(modele: SectionModel): string {
  const g = modele.geometry;
  if (g.kind === 'rectangle') {
    return `rectangle ${formatNumber(g.width, 0)} × ${formatNumber(g.height, 0)} mm`;
  }
  if (g.kind === 'circle') {
    // Un cercle est INTEGRE comme un polygone a 32 cotes par defaut. C est un
    // detail de calcul ; la donnee d entree de l ouvrage reste un cercle, et
    // la note doit dire ce qui a ete saisi.
    return (
      `cercle de diamètre ${formatNumber(g.diameter, 0)} mm ` +
      `(intégré en polygone à ${g.segments ?? 32} côtés)`
    );
  }
  return `polygone a ${g.vertices.length} sommets`;
}

const NOM_FERRAILLAGE: Record<string, string> = {
  'rectangular-layout': 'lits par faces',
  'circular-cage': 'cage circulaire',
  rows: 'lits sur segments',
  bars: 'barres libres',
};

/** Une combinaison de service, ou le fait qu elle n a pas ete saisie. */
function combinaison(action: { N: number; M: number } | undefined): string {
  if (action === undefined) return 'non saisie — la vérification correspondante n\'a pas eu lieu';
  return `N = ${formatNumber(action.N, 1)} kN, M = ${formatNumber(action.M, 1)} kN·m`;
}

function blocSimple(titre: string, lignes: LigneAffichee[]): BlocService {
  return { titre, lignes, ...SANS_VERDICT };
}

/**
 * Les donnees d entree, dans l ordre d une note d ingenieur.
 *
 * `modele` porte la SAISIE, `resolu` les grandeurs derivees (fcd, fyd, aire) :
 * les deux sont necessaires, et les confondre ferait ecrire dans la note une
 * geometrie que l utilisateur n a jamais saisie.
 */
export function blocsDEntree(
  modele: SectionModel,
  resolu: ResolvedModel,
  parametres: ParametresService
): BlocService[] {
  const aireBeton = polygonArea(outlineOf(resolu.section));
  const aireAcier = resolu.section.rebars.reduce((somme, r) => somme + r.area, 0);
  const service = modele.serviceActions;

  const blocs: BlocService[] = [
    blocSimple('Identification et profil normatif', [
      { libelle: 'Nom', valeur: modele.name ?? 'sans nom' },
      { libelle: 'Profil normatif', valeur: resolu.norm.name },
      { libelle: 'gamma_c', valeur: formatNumber(resolu.norm.gammaC, 2) },
      { libelle: 'gamma_s', valeur: formatNumber(resolu.norm.gammaS, 2) },
      { libelle: 'alpha_cc', valeur: formatNumber(resolu.norm.alphaCc, 2) },
      { libelle: 'Bandes d\'integration', valeur: formatNumber(resolu.norm.nBands, 0) },
      { libelle: 'Version du format', valeur: String(modele.formatVersion) },
      { libelle: 'Version du moteur', valeur: modele.engineVersion },
    ]),

    blocSimple('Géométrie', [
      { libelle: 'Forme', valeur: formeSaisie(modele) },
      { libelle: 'Aire de béton', valeur: `${formatNumber(aireBeton, 0)} mm²` },
    ]),

    blocSimple('Matériaux', [
      { libelle: 'fck', valeur: `${formatNumber(modele.concrete.fck, 1)} MPa` },
      { libelle: 'fcd', valeur: `${formatNumber(resolu.concrete.fcd, 2)} MPa` },
      { libelle: 'fyk', valeur: `${formatNumber(modele.steel.fyk, 1)} MPa` },
      { libelle: 'fyd', valeur: `${formatNumber(resolu.steel.fyd, 1)} MPa` },
      { libelle: 'Es', valeur: `${formatNumber(modele.steel.Es, 0)} MPa` },
    ]),

    blocSimple('Armatures', [
      {
        libelle: 'Mode de saisie',
        valeur: NOM_FERRAILLAGE[modele.reinforcement.kind] ?? modele.reinforcement.kind,
      },
      { libelle: 'Nombre de barres', valeur: String(resolu.section.rebars.length) },
      { libelle: 'Aire totale A_s', valeur: `${formatNumber(aireAcier, 0)} mm²` },
      {
        libelle: 'Taux d\'armature total',
        valeur: aireBeton > 0 ? `${formatNumber((100 * aireAcier) / aireBeton, 2)} %` : 'indefini',
      },
    ]),

    blocSimple('Sollicitation ELU', [
      { libelle: 'N', valeur: `${formatNumber(resolu.action.N, 1)} kN (positif en compression)` },
      { libelle: 'My', valeur: `${formatNumber(resolu.action.My, 1)} kN·m` },
      { libelle: 'Mz', valeur: `${formatNumber(resolu.action.Mz, 1)} kN·m` },
    ]),
  ];

  // Les donnees de service n'entrent dans la note QUE si le service est
  // verifie. Une note ELU seule qui listerait des moments ELS ferait croire
  // a une verification de service qui n'a pas eu lieu.
  if (!resolu.checks.service) return blocs;

  blocs.push(
    {
      titre: 'Sollicitations de service',
      // Une combinaison absente est ECRITE comme absente. La faire disparaitre
      // laisserait croire au lecteur qu elle a ete prise en compte.
      lignes: [
        { libelle: 'Combinaison caractéristique', valeur: combinaison(service?.characteristic) },
        { libelle: 'Combinaison quasi-permanente', valeur: combinaison(service?.quasiPermanent) },
      ],
      verdict: null,
      note:
        'Combinaisons EN 1990 DIFFÉRENTES de l\'ELU et différentes entre elles : la ' +
        'caractéristique gouverne le §7.2, la quasi-permanente le §7.3 et le §7.4.3. Flexion ' +
        'droite uniquement.',
    },

    {
      titre: 'Paramètres de service assumés',
      lignes: [
        { libelle: 'n, coefficient d\'équivalence', valeur: formatNumber(parametres.n, 1) },
        { libelle: 'w_max', valeur: `${formatNumber(parametres.wMax, 3)} mm` },
        { libelle: 'beta', valeur: formatNumber(parametres.beta, 2) },
      ],
      verdict: null,
      note:
        'Ces trois-la sont des CHOIX de vérification, pas des constantes normatives, et ils ne ' +
        'sont pas enregistres avec le modèle : n = 15 est conventionnel et n\'est pas prescrit ' +
        'sous cette forme par l\'EN 1992-1-1 ; w_max depend de la classe d\'exposition ' +
        '(tableau 7.1N) ; beta vaut 0,5 en charge de longue durée ou répétée, 1 en charge ' +
        'courte.',
    }
  );

  return blocs;
}

/**
 * Les hypotheses et limites, telles qu une note doit les porter.
 *
 * Elles ne concluent rien : elles bornent ce que le document couvre. C est ce
 * qui separe un compte rendu honnete d une justification implicite.
 */
export function hypothesesDeLaNote(resolu: ResolvedModel): string[] {
  // Chaque hypothese ne sort qu'avec la verification qu'elle borne : la note
  // ne parle pas d'un module decoche.
  const c = resolu.checks;
  const meyer = c.restraint && c.restraintReferential !== 'ec2';
  const restraintEc2 = c.restraint && c.restraintReferential !== 'meyer';

  const hypotheses: Array<string | false> = [
    `Profil normatif retenu : ${resolu.norm.name}. Les coefficients k1, k2, k3, kt et les ` +
      'valeurs du §9 restent a leurs valeurs RECOMMANDÉES par l\'EN 1992-1-1 : une annexe ' +
      'nationale (NBN, ILNAS, NF) peut les modifier, et c\'est alors elle qui fait foi.',

    'Vérification de SECTION : la note ne traite ni le flambement (§5.8), ni l\'ancrage et les ' +
      'recouvrements (§8), ni la torsion, ni le poinçonnement, ni la précontrainte. Aucune ' +
      'donnée de niveau ÉLÉMENT — portée, conditions d\'appui, schéma statique — n\'entre dans ce ' +
      'calcul.',

    (c.shear || c.service) &&
      'Effort tranchant (§6.2) et ouverture de fissures (§7.3) : sections RECTANGULAIRES ' +
      'seulement. La largeur d\'âme b_w, la hauteur utile d, ainsi que la zone tendue n\'ont pas de ' +
      'définition non ambiguë hors du rectangle, et le calcul est refuse plutôt qu\'approxime.',

    c.service &&
      'Vérifications de service (§7.2, §7.3, §7.4.3) : FLEXION DROITE uniquement, sur les ' +
      'combinaisons saisies séparément de l\'ELU. Le coefficient d\'équivalence n\'est un choix ' +
      'assume, non une prescription de l\'EN 1992-1-1.',

    c.service &&
      'Courbure (§7.4.3) : ce N\'EST PAS UNE FLÈCHE. Une flèche exige la portée, les conditions ' +
      'd\'appui et la répartition des charges. La courbure s\'intègre le long de la pièce par qui ' +
      'dispose du schéma statique.',

    meyer &&
      'Méthode de G. et R. MEYER : méthode ALLEMANDE (DIN 1045), servant au pre-dimensionnement ' +
      'et au contrôle d\'ordre de grandeur. Elle ne remplace pas le §7.3.2 et n\'a de valeur ' +
      'réglementaire ni en Belgique ni au Luxembourg. Seule la famille traction / bridage ' +
      'extérieur a ete confrontee au diagramme de l\'ouvrage.',

    c.restraint &&
      `${restraintEc2 && meyer ? 'Déformation gênée (§7.3.2) et méthode Meyer' : restraintEc2 ? 'Déformation gênée (§7.3.2)' : 'Méthode Meyer'} : ` +
      'une aire d\'acier EXIGÉE est rendue, sans comparaison à aucune armature en place, et donc ' +
      'sans verdict.',
  ];

  return hypotheses.filter((h): h is string => h !== false);
}
