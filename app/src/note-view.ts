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
      `cercle de diametre ${formatNumber(g.diameter, 0)} mm ` +
      `(integre en polygone a ${g.segments ?? 32} cotes)`
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
  if (action === undefined) return 'non saisie — la verification correspondante n a pas eu lieu';
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

  return [
    blocSimple('Identification et profil normatif', [
      { libelle: 'Nom', valeur: modele.name ?? 'sans nom' },
      { libelle: 'Profil normatif', valeur: resolu.norm.name },
      { libelle: 'gamma_c', valeur: formatNumber(resolu.norm.gammaC, 2) },
      { libelle: 'gamma_s', valeur: formatNumber(resolu.norm.gammaS, 2) },
      { libelle: 'alpha_cc', valeur: formatNumber(resolu.norm.alphaCc, 2) },
      { libelle: 'Bandes d integration', valeur: formatNumber(resolu.norm.nBands, 0) },
      { libelle: 'Version du format', valeur: String(modele.formatVersion) },
      { libelle: 'Version du moteur', valeur: modele.engineVersion },
    ]),

    blocSimple('Geometrie', [
      { libelle: 'Forme', valeur: formeSaisie(modele) },
      { libelle: 'Aire de beton', valeur: `${formatNumber(aireBeton, 0)} mm²` },
    ]),

    blocSimple('Materiaux', [
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
        libelle: 'Taux d armature total',
        valeur: aireBeton > 0 ? `${formatNumber((100 * aireAcier) / aireBeton, 2)} %` : 'indefini',
      },
    ]),

    blocSimple('Sollicitation ELU', [
      { libelle: 'N', valeur: `${formatNumber(resolu.action.N, 1)} kN (positif en compression)` },
      { libelle: 'My', valeur: `${formatNumber(resolu.action.My, 1)} kN·m` },
      { libelle: 'Mz', valeur: `${formatNumber(resolu.action.Mz, 1)} kN·m` },
    ]),

    {
      titre: 'Sollicitations de service',
      // Une combinaison absente est ECRITE comme absente. La faire disparaitre
      // laisserait croire au lecteur qu elle a ete prise en compte.
      lignes: [
        { libelle: 'Combinaison caracteristique', valeur: combinaison(service?.characteristic) },
        { libelle: 'Combinaison quasi-permanente', valeur: combinaison(service?.quasiPermanent) },
      ],
      verdict: null,
      note:
        'Combinaisons EN 1990 DIFFERENTES de l ELU et differentes entre elles : la ' +
        'caracteristique gouverne le §7.2, la quasi-permanente le §7.3 et le §7.4.3. Flexion ' +
        'droite uniquement.',
    },

    {
      titre: 'Parametres de service assumes',
      lignes: [
        { libelle: 'n, coefficient d equivalence', valeur: formatNumber(parametres.n, 1) },
        { libelle: 'w_max', valeur: `${formatNumber(parametres.wMax, 3)} mm` },
        { libelle: 'beta', valeur: formatNumber(parametres.beta, 2) },
      ],
      verdict: null,
      note:
        'Ces trois-la sont des CHOIX de verification, pas des constantes normatives, et ils ne ' +
        'sont pas enregistres avec le modele : n = 15 est conventionnel et n est pas prescrit ' +
        'sous cette forme par l EN 1992-1-1 ; w_max depend de la classe d exposition ' +
        '(tableau 7.1N) ; beta vaut 0,5 en charge de longue duree ou repetee, 1,0 en charge ' +
        'courte.',
    },
  ];
}

/**
 * Les hypotheses et limites, telles qu une note doit les porter.
 *
 * Elles ne concluent rien : elles bornent ce que le document couvre. C est ce
 * qui separe un compte rendu honnete d une justification implicite.
 */
export function hypothesesDeLaNote(resolu: ResolvedModel): string[] {
  return [
    `Profil normatif retenu : ${resolu.norm.name}. Les coefficients k1, k2, k3, kt et les ` +
      'valeurs du §9 restent a leurs valeurs RECOMMANDEES par l EN 1992-1-1 : une annexe ' +
      'nationale (NBN, ILNAS, NF) peut les modifier, et c est alors elle qui fait foi.',

    'Verification de SECTION : la note ne traite ni le flambement (§5.8), ni l ancrage et les ' +
      'recouvrements (§8), ni la torsion, ni le poinconnement, ni la precontrainte. Aucune ' +
      'donnee de niveau ELEMENT — portee, conditions d appui, schema statique — n entre dans ce ' +
      'calcul.',

    'Effort tranchant (§6.2) et ouverture de fissures (§7.3) : sections RECTANGULAIRES ' +
      'seulement. La largeur d ame b_w, la hauteur utile d et la zone tendue n ont pas de ' +
      'definition non ambigue hors du rectangle, et le calcul est refuse plutot qu approxime.',

    'Verifications de service (§7.2, §7.3, §7.4.3) : FLEXION DROITE uniquement, sur les ' +
      'combinaisons saisies separement de l ELU. Le coefficient d equivalence n est un choix ' +
      'assume, non une prescription de l EN 1992-1-1.',

    'Courbure (§7.4.3) : ce N EST PAS UNE FLECHE. Une fleche exige la portee, les conditions ' +
      'd appui et la repartition des charges. La courbure s integre le long de la piece par qui ' +
      'dispose du schema statique.',

    'Methode de G. et R. MEYER : methode ALLEMANDE (DIN 1045), servant au pre-dimensionnement ' +
      'et au controle d ordre de grandeur. Elle ne remplace pas le §7.3.2 et n a de valeur ' +
      'reglementaire ni en Belgique ni au Luxembourg. Seule la famille traction / bridage ' +
      'exterieur a ete confrontee au diagramme de l ouvrage.',

    'Deformation genee (§7.3.2) et methode Meyer rendent une aire d acier EXIGEE : elles ne la ' +
      'comparent a aucune armature en place, et ne rendent donc aucun verdict.',
  ];
}
