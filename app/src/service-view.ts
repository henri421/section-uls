import type { Section, ServiceResult, CrackResult, CurvatureResult } from '../../src/index';
import { formatNumber } from './format';

/**
 * Presentation des verifications de service (§7.2, §7.3, §7.4.3).
 *
 * Fonctions PURES, sans DOM et sans mecanique : elles mettent en forme ce que
 * le noyau a rendu, elles ne recalculent rien.
 *
 * Le parti pris du module : un echec de verification de service n est pas une
 * panne, c est un RESULTAT. Section entierement comprimee, geometrie non
 * rectangulaire, flexion deviee — trois cas legitimes et frequents, qui
 * doivent s afficher aussi proprement qu un succes. Traites dans le cablage,
 * ils deviendraient des `if` disperses et non testes ; ici ce sont des
 * donnees comme les autres.
 */

/**
 * Precision a afficher quand la sollicitation ELU est deviee — jamais un
 * refus de calculer, et c est tout le propos.
 *
 * Le Mz de l ELU ne gouverne PAS le service. Les verifications de service
 * portent sur des combinaisons EN 1990 differentes de celle de l ELU —
 * caracteristique pour le §7.2, quasi-permanente pour le §7.3 et le §7.4.3 —
 * saisies separement et uniaxiales `{ N, M }` par construction. Il n y a donc
 * aucun Mz de service a bloquer.
 *
 * Et l ecart est frequent plutot qu exceptionnel : la combinaison
 * quasi-permanente exclut le vent (ψ₂ = 0, EN 1990 tableau A1.1), qui apporte
 * le plus souvent le moment transversal. Un poteau franchement devie a l ELU
 * est tres couramment en flexion droite en quasi-permanent.
 *
 * La note reste prudente sur le §7.2 : la combinaison caracteristique, elle,
 * ne supprime pas le vent, et une section peut y demeurer reellement deviee.
 * Raison de plus pour informer sans decider a la place de l ingenieur.
 */
export function noteFlexionDeviee(MzElu: number): string | null {
  if (MzElu === 0) return null;

  return (
    `Sollicitation ELU deviee (Mz = ${formatNumber(MzElu, 1)} kN·m), alors que les ` +
    'verifications ci-dessous sont en flexion droite. Ce n est pas une incoherence : elles ' +
    'portent sur des combinaisons DIFFERENTES de l ELU, saisies separement et uniaxiales. ' +
    'La combinaison quasi-permanente (§7.3, §7.4.3) exclut d ailleurs le vent, qui apporte ' +
    'le plus souvent le moment transversal. Verifier que la sollicitation de service saisie ' +
    'decrit bien la flexion attendue.'
  );
}

/**
 * Ce qui empeche la seule verification de fissuration, ou `null`.
 *
 * `verifyCrackWidth` LEVE une erreur sur toute geometrie non rectangulaire —
 * garde explicite en tete de fonction. Les deux autres verifications, elles,
 * acceptent les polygones : le motif le dit, pour que l utilisateur ne croie
 * pas tout le service perdu.
 */
export function obstacleFissuration(section: Section): string | null {
  if (section.geometry.kind === 'rectangle') return null;

  return (
    'Geometrie non rectangulaire. Les formules du §7.3.4 supposent une zone tendue ' +
    'rectangulaire et ne sont pas transposables telles quelles. Les contraintes (§7.2) ' +
    'et la courbure (§7.4.3) restent calculables.'
  );
}

// --- Blocs affichables -------------------------------------------------------

export interface LigneAffichee {
  libelle: string;
  valeur: string;
}

export interface Verdict {
  ok: boolean;
  texte: string;
}

export interface BlocService {
  titre: string;
  /** Vide quand le calcul n a pas eu lieu, ou n a rien conclu. */
  lignes: LigneAffichee[];
  /** `null` quand le bloc ne conclut pas (courbure), ou quand rien n a ete calcule. */
  verdict: Verdict | null;
  /** Motif d indisponibilite, ou precision a afficher sous le bloc. */
  note: string | null;
}

/** `entree` porte soit le resultat, soit le motif qui a empeche de l obtenir. */
export type Issue<T> = { resultat: T } | { motif: string };

/**
 * Ce qui n a pas ete calcule s affiche comme le reste : un titre, un motif,
 * et rien qui ressemble a un chiffre. Surtout pas les `NaN` que les modules
 * rendent sur leur chemin d echec.
 */
function sansCalcul(titre: string, note: string): BlocService {
  return { titre, lignes: [], verdict: null, note };
}

const MOTIF_PAR_DEFAUT = 'calcul non convergent, sans motif precise par le module';

/**
 * Notation scientifique, dans l UNITE DU NOYAU — aucune conversion.
 *
 * Necessaire parce que les grandeurs de la courbure sont aux deux extremes de
 * l echelle : 1/r vaut quelques 10⁻⁶ mm⁻¹, EI quelques 10¹³ N·mm². `toFixed`
 * rendrait « 0,00 » pour la premiere et quatorze chiffres pour la seconde.
 * La mantisse passe par `formatNumber`, donc par la virgule decimale.
 */
const CHIFFRES_EXPOSANT = '⁰¹²³⁴⁵⁶⁷⁸⁹';

function exposant(puissance: number): string {
  const chiffres = String(Math.abs(puissance))
    .split('')
    .map((c) => CHIFFRES_EXPOSANT[Number(c)])
    .join('');
  return (puissance < 0 ? '⁻' : '') + chiffres;
}

function formatScientifique(valeur: number, decimales: number): string {
  if (!Number.isFinite(valeur)) return 'hors domaine';
  if (valeur === 0) return '0';

  let puissance = Math.floor(Math.log10(Math.abs(valeur)));
  // L arrondi de la mantisse peut la faire franchir 10 (9,999 a deux
  // decimales). On remonte alors d une puissance plutot que d afficher
  // « 10,00·10⁻⁶ ».
  if (Math.abs(Number((valeur / 10 ** puissance).toFixed(decimales))) >= 10) puissance += 1;

  return `${formatNumber(valeur / 10 ** puissance, decimales)}·10${exposant(puissance)}`;
}

/**
 * Contraintes en service (§7.2).
 *
 * Le motif d echec du noyau est repris VERBATIM en note plutot que
 * paraphrase : lui seul sait laquelle des deux limites est depassee, et le
 * reformuler ici dupliquerait sa decision.
 */
export function blocContraintes(entree: Issue<ServiceResult>): BlocService {
  const titre = 'Contraintes en service (§7.2)';
  if (!('resultat' in entree)) return sansCalcul(titre, entree.motif);

  const r = entree.resultat;

  // Section entierement comprimee : l hypothese de section fissuree tombe.
  // C est un RESULTAT, et le motif du module est explicite — mais les
  // contraintes valent `NaN`, et on ne pretend pas les montrer.
  if (!r.converged) return sansCalcul(titre, r.reason ?? MOTIF_PAR_DEFAUT);

  return {
    titre,
    lignes: [
      {
        libelle: 'σc',
        valeur: `${formatNumber(r.sigmaC, 1)} MPa (limite ${formatNumber(r.sigmaCLimit, 1)} MPa)`,
      },
      {
        libelle: 'σs',
        valeur: `${formatNumber(r.sigmaS, 1)} MPa (limite ${formatNumber(r.sigmaSLimit, 1)} MPa)`,
      },
      // Position de SERVICE, calculee en elastique sur section fissuree :
      // elle ne coincide pas avec celle de l ELU, et l ecart est instructif.
      { libelle: 'Axe neutre en service (≠ ELU)', valeur: `${formatNumber(r.neutralAxisZ, 1)} mm` },
    ],
    verdict: r.ok
      ? { ok: true, texte: 'Contraintes de service verifiees' }
      : { ok: false, texte: 'Contraintes de service non verifiees' },
    note: r.ok ? null : (r.reason ?? MOTIF_PAR_DEFAUT),
  };
}

/** Ouverture de fissures (§7.3). */
export function blocFissuration(entree: Issue<CrackResult>): BlocService {
  const titre = 'Ouverture de fissures (§7.3)';
  if (!('resultat' in entree)) return sansCalcul(titre, entree.motif);

  const r = entree.resultat;
  if (!r.converged) return sansCalcul(titre, r.reason ?? MOTIF_PAR_DEFAUT);

  const lignes: LigneAffichee[] = [
    {
      libelle: 'w_k',
      valeur: `${formatNumber(r.wk, 3)} mm (limite w_max ${formatNumber(r.wMax, 3)} mm)`,
    },
    { libelle: 's_r,max', valeur: `${formatNumber(r.srMax, 1)} mm` },
  ];

  // L eq. 7.11 a un domaine ; au-dela, la norme impose l eq. 7.14, qui donne
  // un espacement de fissures sensiblement different. Le taire laisserait
  // croire a une formule unique.
  if (r.wideSpacing) {
    lignes.push({
      libelle: 'Espacement des barres',
      valeur: 'hors du domaine de l eq. 7.11 : s_r,max donne par l eq. 7.14',
    });
  }

  return {
    titre,
    lignes,
    verdict: r.ok
      ? { ok: true, texte: 'Ouverture de fissure verifiee' }
      : { ok: false, texte: 'Ouverture de fissure non verifiee' },
    note: r.ok ? null : (r.reason ?? MOTIF_PAR_DEFAUT),
  };
}

/**
 * L avertissement qui accompagne TOUJOURS la courbure.
 *
 * La distinction est deja ecrite dans le noyau ; c est a l ecran que
 * l utilisateur risque de la manquer.
 */
const PAS_UNE_FLECHE =
  'Ce n est PAS une fleche. Une fleche exige la portee, les conditions d appui et la ' +
  'repartition des charges — des donnees de niveau ELEMENT, que ce module de sections ' +
  'ne connait pas. La courbure s integre le long de la piece par qui dispose du schema statique.';

/** Courbure en service (§7.4.3). Sans verdict : elle ne se compare a rien ici. */
export function blocCourbure(entree: Issue<CurvatureResult>): BlocService {
  const titre = 'Courbure en service (§7.4.3)';
  if (!('resultat' in entree)) return sansCalcul(titre, `${entree.motif} ${PAS_UNE_FLECHE}`);

  const r = entree.resultat;

  // Etat fissure incalculable : le module rend alors les grandeurs de l etat
  // NON fissure, qui ne decrivent pas la section reelle. Les afficher
  // tromperait plus surement qu un bloc vide.
  if (!r.converged) {
    return sansCalcul(titre, `${r.reason ?? MOTIF_PAR_DEFAUT} ${PAS_UNE_FLECHE}`);
  }

  return {
    titre,
    lignes: [
      { libelle: '1/r', valeur: `${formatScientifique(r.curvature, 2)} mm⁻¹` },
      { libelle: 'M_cr', valeur: `${formatNumber(r.crackingMoment, 1)} kN·m` },
      { libelle: 'ζ', valeur: formatNumber(r.zeta, 2) },
      { libelle: 'Etat', valeur: r.cracked ? 'fissuree' : 'non fissuree' },
      { libelle: 'EI effectif', valeur: `${formatScientifique(r.effectiveStiffness, 2)} N·mm²` },
    ],
    verdict: null,
    note: PAS_UNE_FLECHE,
  };
}
