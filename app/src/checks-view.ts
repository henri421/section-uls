import type {
  Section,
  ElementType,
  ShearResult,
  DetailingResult,
  RestraintResult,
} from '../../src/index';
import type { BlocService, Issue, LigneAffichee } from './service-view';
import { sansCalcul } from './service-view';
import { formatNumber, formatUtilization } from './format';

/**
 * Presentation des trois familles de verifications qui s ajoutent a la
 * flexion : effort tranchant (§6.2), dispositions constructives (§9) et
 * armature minimale sous deformation genee (§7.3.2).
 *
 * Fonctions PURES, sans DOM et sans mecanique, sur le modele exact de
 * `service-view.ts` : elles mettent en forme ce que le noyau a rendu, elles
 * ne recalculent rien.
 *
 * Chacune conclut POUR ELLE-MEME et ne touche pas au verdict de flexion. Une
 * section peut resister et rester irreguliere au §9 : c est une information,
 * pas une contradiction, et la fondre dans un verdict unique en perdrait la
 * nature.
 *
 * Les trois modules du noyau LEVENT hors du rectangle. L exception est
 * attrapee par l appelant et arrive ici comme un `motif` : un module qui ne
 * s applique pas est un RESULTAT, affiche comme les autres.
 */

const MOTIF_PAR_DEFAUT = 'verification non concluante, sans motif precise par le module';

/** Nom d usage du type d element, qui est une SAISIE et jamais une deduction. */
const NOM_ELEMENT: Record<ElementType, string> = {
  beam: 'poutre',
  slab: 'dalle',
  column: 'poteau',
};

// --- Gardes de domaine -------------------------------------------------------

/**
 * Les trois gardes sont interroges AVANT l appel, sur le modele exact
 * d `obstacleFissuration` — et pour deux raisons.
 *
 * D abord parce que les messages du noyau commencent par le nom de la
 * fonction qui leve (« shearGeometry : … ») : c est ce qu il faut a un
 * developpeur devant une pile d appels, ce n est pas ce qu il faut a un
 * ingenieur devant la page publiee. Ensuite parce que le garde sait dire ce
 * qui, malgre tout, reste calculable — information que l exception n a aucune
 * raison de porter.
 *
 * Le `tenter()` du cablage reste en place derriere eux : un garde couvre le
 * cas connu, il ne remplace pas le filet.
 */
export function obstacleTranchant(section: Section): string | null {
  if (section.geometry.kind === 'rectangle') return null;

  return (
    'Geometrie non rectangulaire. La largeur d ame b_w et la hauteur utile d du §6.2 n ont pas ' +
    'de definition non ambigue hors du rectangle, et l EN 1992-1-1 ne la donne pas : le calcul ' +
    'est refuse plutot qu approxime.'
  );
}

export function obstacleZwang(section: Section): string | null {
  if (section.geometry.kind === 'rectangle') return null;

  return (
    'Geometrie non rectangulaire. L aire de beton tendu A_ct du §7.3.2 suppose une largeur ' +
    'constante et n est pas transposable telle quelle.'
  );
}

/**
 * Les dispositions d un POTEAU restent calculables hors du rectangle : le
 * §9.5.2 ne demande que l aire de beton et l effort normal. Seuls le minimum
 * de poutre et de dalle reclament `b_t` et la hauteur utile, que l EN 1992-1-1
 * ne definit pas sur un contour quelconque.
 */
export function obstacleDispositions(section: Section, elementType: ElementType): string | null {
  if (section.geometry.kind === 'rectangle' || elementType === 'column') return null;

  return (
    'Geometrie non rectangulaire. La largeur moyenne de la zone tendue b_t du §9.2.1.1 n a pas ' +
    'de definition normative hors du rectangle. Le minimum de POTEAU (§9.5.2), lui, ne demande ' +
    'que l aire de beton et resterait calculable.'
  );
}

// --- Effort tranchant (§6.2) -------------------------------------------------

/**
 * Effort tranchant a l ELU.
 *
 * `V_Ed` est passe a cote du resultat : `ShearResult` ne le porte pas — il
 * n en garde que le taux — et le reconstruire en multipliant le taux par la
 * resistance serait un calcul, dans un module qui n en fait aucun.
 *
 * Le `reason` du noyau est repris VERBATIM. Lui seul distingue les trois
 * modes d echec, et l enjeu n est pas rhetorique : « bielles ecrasees » veut
 * dire section trop petite, PAS « il manque des cadres ». Paraphraser ici
 * dupliquerait — et finirait par trahir — la decision du noyau.
 */
export function blocTranchant(entree: Issue<ShearResult>, VEd: number): BlocService {
  const titre = 'Effort tranchant (§6.2)';
  if (!('resultat' in entree)) return sansCalcul(titre, entree.motif);

  const r = entree.resultat;

  const lignes: LigneAffichee[] = [
    { libelle: 'V_Ed', valeur: `${formatNumber(VEd, 1)} kN` },
    { libelle: 'V_Rd,c (sans armature d ame)', valeur: `${formatNumber(r.VRdc, 1)} kN` },
    {
      libelle: 'Armatures d ame',
      // Le §6.2 conclut sur ce que le CALCUL exige ; le minimum
      // constructif du §9.2.2 reste du meme quand le calcul n exige rien,
      // et les deux verdicts se lisent ensemble.
      valeur: r.shearReinforcementRequired
        ? 'exigees par le calcul (V_Ed > V_Rd,c) — le minimum du §9.2.2 s y ajoute'
        : 'non exigees par le calcul (V_Ed ≤ V_Rd,c) — le minimum du §9.2.2 reste du',
    },
  ];

  if (r.VRds !== null) {
    lignes.push({ libelle: 'V_Rd,s (cadres)', valeur: `${formatNumber(r.VRds, 1)} kN` });
  }
  if (r.VRdmax !== null) {
    lignes.push({ libelle: 'V_Rd,max (bielles)', valeur: `${formatNumber(r.VRdmax, 1)} kN` });
  }

  lignes.push({ libelle: 'Resistance retenue V_Rd', valeur: `${formatNumber(r.VRd, 1)} kN` });
  lignes.push({ libelle: 'Taux V_Ed / V_Rd', valeur: formatUtilization(r.utilization) });

  return {
    titre,
    lignes,
    verdict: r.ok
      ? { ok: true, texte: 'Effort tranchant verifie' }
      : { ok: false, texte: 'Effort tranchant non verifie' },
    note: r.ok ? null : (r.reason ?? MOTIF_PAR_DEFAUT),
  };
}

// --- Dispositions constructives (§9) -----------------------------------------

/**
 * Dispositions constructives.
 *
 * Deux precautions qui decident de la lecture :
 *
 * - quand `web.applicable` est faux, le motif est AFFICHE et l absence de
 *   toute exigence d ame n est PAS un echec. L exiger partout declarerait
 *   non conformes toutes les dalles courantes ;
 * - les violations sont listees TOUTES. Une section peut etre a la fois
 *   sur-armee en longitudinal et depourvue de cadres ; n en montrer qu une
 *   en cacherait une.
 *
 * Les valeurs sont celles RECOMMANDEES par l EN 1992-1-1 : une annexe
 * nationale peut les modifier, ce que la note rappelle.
 */
export function blocDispositions(entree: Issue<DetailingResult>): BlocService {
  const titre = 'Dispositions constructives (§9)';
  if (!('resultat' in entree)) return sansCalcul(titre, entree.motif);

  const r = entree.resultat;
  const l = r.longitudinal;

  const lignes: LigneAffichee[] = [
    { libelle: 'Type d element (declare)', valeur: NOM_ELEMENT[r.elementType] },
    { libelle: 'A_s en place', valeur: `${formatNumber(l.asProvided, 0)} mm²` },
    { libelle: 'A_s,min', valeur: `${formatNumber(l.asMin, 0)} mm²` },
    { libelle: 'A_s,max', valeur: `${formatNumber(l.asMax, 0)} mm²` },
  ];

  if (r.web.applicable) {
    // Taux d armature en POURCENT : c est ainsi qu un ferrailleur les lit, et
    // `rho_w` vaut quelques 10⁻³, ou une notation decimale brute serait
    // illisible.
    lignes.push({
      libelle: 'Taux d armature d ame rho_w',
      valeur:
        `${formatNumber(100 * r.web.rhoW, 3)} % ` +
        `(minimum ${formatNumber(100 * r.web.rhoWMin, 3)} %)`,
    });
    if (r.web.aswMin !== null) {
      lignes.push({
        libelle: 'A_sw,min par cours',
        valeur: `${formatNumber(r.web.aswMin, 0)} mm²`,
      });
    }
  } else {
    // Les taux ne sont PAS repris ici : sur un element que la regle ne regit
    // pas, le noyau peut les rendre indefinis, et un chiffre illisible se
    // lirait plus mal qu une phrase.
    lignes.push({
      libelle: 'Armature d ame (§9.2.2)',
      valeur: `sans objet — ${r.web.notApplicableReason ?? 'regle non applicable a cet element'}`,
    });
  }

  return {
    titre,
    lignes,
    verdict: r.ok
      ? { ok: true, texte: 'Dispositions constructives respectees' }
      : { ok: false, texte: 'Dispositions constructives non respectees' },
    note: r.violations.length === 0 ? null : r.violations.join(' ; '),
  };
}

// --- Deformation genee, « Zwang » (§7.3.2) -----------------------------------

/**
 * L avertissement qui accompagne TOUJOURS l armature de deformation genee.
 *
 * Le module rend une AIRE EXIGEE ; il ne la confronte a aucune armature en
 * place, et un bloc sans verdict passerait sinon pour un oubli. Le defaut de
 * `f_ct,eff` est en outre le cas defavorable, ce qu il vaut mieux lire ici
 * qu apres avoir commande l acier.
 */
const AUCUN_VERDICT =
  'Ce bloc ne rend AUCUN verdict : il donne l aire d acier exigee par le §7.3.2, il ne la ' +
  'compare a aucune armature en place. A ne pas confondre avec le minimum de RESISTANCE du ' +
  '§9.2.1.1, qui repond a une autre question. Par defaut f_ct,eff est prise a 28 jours, ce qui ' +
  'est le cas DEFAVORABLE : la fissuration des pieces massives survient a quelques jours, et le ' +
  '§7.3.2(2) demande d estimer f_ct,eff a l age ou elle est attendue.';

/** Armature minimale de maitrise de la fissuration sous deformation genee. */
export function blocZwang(entree: Issue<RestraintResult>): BlocService {
  const titre = 'Deformation genee, armature minimale (§7.3.2)';
  if (!('resultat' in entree)) return sansCalcul(titre, `${entree.motif} ${AUCUN_VERDICT}`);

  const r = entree.resultat;

  const parNappe = r.nappes === 2 ? ' par nappe' : '';
  const aire = (mm2: number): string => `${formatNumber(mm2 / 100, 2)} cm²/m${parNappe}`;

  // Le suffixe « IMPOSE » n est pas decoratif : c est ce qui distingue une
  // valeur que la chaine a calculee d une valeur que l ingenieur a forcee.
  // Sans lui, la note de calcul presenterait les deux de la meme facon et ne
  // serait verifiable par personne.
  const marque = (nom: keyof typeof r.sources): string =>
    r.sources[nom] === 'impose' ? ' — IMPOSE' : '';

  return {
    titre,
    lignes: [
      // LE RESULTAT D ABORD, et nomme : total et nappe different d un facteur
      // 2, et leur confusion est la cause classique d un ecart avec une
      // feuille de calcul.
      { libelle: 'A_s,min retenu', valeur: aire(r.AsMinParNappe) },
      {
        libelle: 'A_s,min total',
        valeur: `${formatNumber(r.AsMin / 100, 2)} cm²/m sur ${r.nappes} nappe(s)`,
      },
      {
        libelle: 'Approche retenue',
        valeur:
          r.approach === 'epaisse'
            ? 'EPAISSE — zone de beton tendu efficace'
            : 'MINCE — zone tendue entiere',
      },
      { libelle: 'A_s,min approche mince', valeur: aire(r.AsMinceParNappe) },
      { libelle: 'A_s,min approche epaisse', valeur: aire(r.AsEpaisParNappe) },
      { libelle: 'Borne anti-plastification', valeur: aire(r.BorneParNappe) },
      {
        libelle: 'Methode de h_c,ef',
        valeur:
          r.method === 'ec2'
            ? 'texte EN 1992-1-1 §7.3.2(3) — 2,5·d1'
            : 'pratique allemande — branches selon h/d1',
      },
      {
        libelle: 'Convention du facteur k',
        valeur:
          r.thicknessConvention === 'de'
            ? 'annexe allemande — 0,80 vers 0,50'
            : 'EC2 recommande — 1,00 vers 0,65',
      },
      { libelle: 'k (facteur d epaisseur)', valeur: formatNumber(r.k, 3) + marque('k') },
      { libelle: 'k_c (distribution)', valeur: formatNumber(r.kc, 2) + marque('kc') },
      { libelle: 'd1 (enrobage d axe)', valeur: `${formatNumber(r.d1, 0)} mm${marque('d1')}` },
      { libelle: 'h_c,ef (une face)', valeur: `${formatNumber(r.hcEff, 0)} mm${marque('hcEff')}` },
      { libelle: 'A_c,ef (une face)', valeur: `${formatNumber(r.AcEff, 0)} mm²${marque('AcEff')}` },
      { libelle: 'A_ct (zone tendue entiere)', valeur: `${formatNumber(r.Act, 0)} mm²${marque('Act')}` },
      { libelle: 'f_ct,eff', valeur: `${formatNumber(r.fctEff, 2)} MPa${marque('fctEff')}` },
      { libelle: 'sigma_s', valeur: `${formatNumber(r.sigmaS, 0)} MPa${marque('sigmaS')}` },
      {
        libelle: 'Element massif',
        // Le sens physique est un facteur REDUCTEUR, pas une penalite : les
        // contraintes d auto-equilibre reduisent l effort qui traverse la
        // section a l instant de la fissuration.
        valeur: r.massive
          ? 'oui (h ≥ 800 mm) : k est a son plancher, l acier exige est reduit d autant'
          : 'non (h < 800 mm)',
      },
    ],
    verdict: null,
    // Les avertissements de domaine passent AVANT les reserves generales :
    // ils portent sur CE calcul-ci, pas sur la methode en general.
    note: [...r.warnings, AUCUN_VERDICT, ECART_AU_TEXTE].join(' '),
  };
}

/**
 * L ecart au texte de l EN 1992-1-1, AFFICHE et non seulement commente dans
 * le code : c est a l ingenieur de savoir sur quoi repose le nombre qu il
 * lit, pas au relecteur du depot.
 */
const ECART_AU_TEXTE =
  'ECART DOCUMENTE AU TEXTE en methode « pratique allemande » : les branches de h_c,ef selon ' +
  'h/d1 ne figurent pas dans l EN 1992-1-1, dont le §7.3.2(3) ecrit ' +
  'h_c,ef = min(2,5(h−d) ; (h−x)/3 ; h/2). Le facteur k est un PARAMETRE NATIONAL. En Belgique ' +
  'et au Luxembourg, la justification reglementaire reste l EN 1992-1-1 et ses annexes ' +
  'NBN / ILNAS.';
