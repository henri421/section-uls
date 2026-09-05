import type { ElementType, ShearResult, DetailingResult, RestraintResult } from '../../src/index';
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

  return {
    titre,
    lignes: [
      { libelle: 'A_s,min', valeur: `${formatNumber(r.AsMin, 0)} mm²` },
      { libelle: 'k (facteur d epaisseur)', valeur: formatNumber(r.k, 3) },
      { libelle: 'k_c (distribution)', valeur: formatNumber(r.kc, 2) },
      { libelle: 'A_ct (beton tendu)', valeur: `${formatNumber(r.Act, 0)} mm²` },
      { libelle: 'f_ct,eff', valeur: `${formatNumber(r.fctEff, 2)} MPa` },
      { libelle: 'sigma_s', valeur: `${formatNumber(r.sigmaS, 0)} MPa` },
      {
        libelle: 'Element massif',
        // Le sens physique est un facteur REDUCTEUR, pas une penalite : les
        // contraintes d auto-equilibre reduisent l effort qui traverse la
        // section a l instant de la fissuration.
        valeur: r.massive
          ? 'oui (h ≥ 800 mm) : k est a son plancher 0,65, l acier exige est reduit d autant'
          : 'non (h < 800 mm)',
      },
      {
        libelle: 'Base de calcul de A_ct',
        valeur:
          r.basis === 'zone-efficace'
            ? 'zone de beton tendu EFFICACE — pratique des pieces epaisses, ECART assume au texte de l EN 1992-1-1'
            : 'zone tendue entiere — texte de l EN 1992-1-1, cas enveloppe',
      },
    ],
    verdict: null,
    note: AUCUN_VERDICT,
  };
}
