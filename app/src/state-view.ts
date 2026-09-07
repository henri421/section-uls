import type { SectionStateResult, ServiceStateResult, Action } from '../../src/index';
import type { BlocService, Issue, LigneAffichee } from './service-view';
import { sansCalcul } from './service-view';
import { formatNumber, formatUtilization } from './format';

/**
 * Presentation de deux etats que l outil ne montrait pas :
 *
 *  - l EQUILIBRE sous la sollicitation ELU, avec la contrainte de chaque
 *    barre — a distinguer du moment resistant, qui est un etat ULTIME ;
 *  - l ETAT DE FISSURATION en service (§7.1(2)), etat I ou etat II.
 *
 * Fonctions PURES, sans DOM et sans mecanique, sur le modele exact de
 * `service-view.ts` et `checks-view.ts`.
 */

/**
 * Deformation en pour mille : c est l unite dans laquelle un ingenieur lit
 * `eps_cu2 = 3,5 ‰`. En notation decimale brute, 0,0035 et 0,00035 se
 * distinguent mal d un coup d oeil, et l ordre de grandeur est precisement ce
 * qu on cherche a lire.
 */
function pourMille(eps: number): string {
  return `${formatNumber(eps * 1000, 2)} ‰`;
}

// --- Etat d equilibre sous la sollicitation ELU ------------------------------

/**
 * L AVERTISSEMENT QUI ACCOMPAGNE TOUJOURS CE BLOC.
 *
 * Le `sigma_s` d ici sort des lois de calcul de l ELU, sous la sollicitation
 * ELU. Ce n est PAS le `sigma_s` du §7.2 ni du §7.3, qui sortent de la
 * methode n sous combinaison de service avec `f_ck` et `f_yk`. Les deux
 * s affichent dans la meme page ; sans cette phrase, leur ecart passerait
 * pour une incoherence de l outil.
 */
const DEUX_SIGMA_S =
  'Contraintes obtenues avec les LOIS DE CALCUL de l ELU (f_cd, f_yd, parabole-rectangle, ' +
  'beton tendu neglige), sous la sollicitation ELU. A ne pas confondre avec le sigma_s des ' +
  '§7.2 et §7.3, qui sort de la methode n sous combinaison de SERVICE, avec f_ck et f_yk : ' +
  'deux nombres differents pour deux questions differentes.';

/**
 * Etat d equilibre de la section sous `(N_Ed, M_Ed)`.
 *
 * Ce bloc ne rend AUCUN verdict de resistance : c est le bloc de flexion qui
 * conclut, et le doubler ici ferait deux verdicts pour une seule question. Il
 * decrit un etat, il ne juge pas.
 *
 * Le taux affiche est celui des ACIERS — `sigma_s / f_yd` — et pas celui de
 * la section. Un acier a 60 % de `f_yd` sur une section a 80 % de `M_Rd` n a
 * rien de contradictoire : la contrainte et le moment ne croissent pas
 * ensemble une fois le beton engage.
 */
export function blocEtatSection(
  entree: Issue<SectionStateResult>,
  action: Action
): BlocService {
  const titre = 'Etat sous sollicitation (ELU)';
  if (!('resultat' in entree)) return sansCalcul(titre, entree.motif);

  const r = entree.resultat;

  const lignes: LigneAffichee[] = [
    { libelle: 'Sollicitation appliquee', valeur: `N ${formatNumber(action.N, 1)} kN, M ${formatNumber(action.M, 1)} kN·m` },
    { libelle: 'Deformation fibre superieure', valeur: pourMille(r.epsTop) },
    { libelle: 'Deformation fibre inferieure', valeur: pourMille(r.epsBottom) },
    {
      libelle: 'Axe neutre',
      valeur:
        r.neutralAxisDepth === null
          ? 'hors section : aucune fibre ne change de signe'
          : r.neutralAxisDepth === Infinity
            ? 'a l infini : deformation uniforme'
            : `${formatNumber(r.neutralAxisDepth, 1)} mm sous la fibre superieure`,
    },
  ];

  if (r.sigmaSMax > 0) {
    lignes.push({
      libelle: 'Traction maximale des aciers',
      valeur: `${formatNumber(r.sigmaSMax, 1)} MPa`,
    });
  }
  if (r.sigmaScMax > 0) {
    lignes.push({
      libelle: 'Compression maximale des aciers',
      valeur: `${formatNumber(r.sigmaScMax, 1)} MPa`,
    });
  }

  lignes.push({
    libelle: 'Taux dans les aciers sigma_s / f_yd',
    valeur: formatUtilization(r.utilization),
  });

  // Une barre par ligne, avec sa cote : c est ce qui permet de reconnaitre
  // laquelle est laquelle sur le dessin, et de voir qu un lit intermediaire
  // ne travaille presque pas.
  for (const [index, barre] of r.bars.entries()) {
    const nature = barre.sigma < 0 ? 'traction' : 'compression';
    lignes.push({
      libelle: `Barre ${index + 1} (y ${formatNumber(barre.y, 0)}, z ${formatNumber(barre.z, 0)})`,
      valeur:
        `${formatNumber(Math.abs(barre.sigma), 1)} MPa en ${nature}` +
        `, eps ${pourMille(barre.eps)}` +
        (barre.yielded ? ' — PLASTIFIEE' : ''),
    });
  }

  const ultime = r.atUltimate
    ? ' La fibre la plus comprimee est a eps_cu2 : la section est A L ULTIME, le moment ' +
      'applique egale son moment resistant.'
    : '';

  return {
    titre,
    lignes,
    verdict: null,
    note: DEUX_SIGMA_S + ultime,
  };
}

// --- Etat de fissuration en service ------------------------------------------

const NOM_ETAT = {
  uncracked: 'etat I — section NON fissuree, le beton tendu travaille',
  cracked: 'etat II — section FISSUREE, le beton tendu est neglige',
} as const;

/**
 * Etat de fissuration sous la combinaison de service, et contraintes de
 * l etat retenu.
 *
 * Le verdict porte sur les limites du §7.2 appliquees a l ETAT RETENU. C est
 * le changement de fond : elles etaient jusqu ici appliquees a l etat II
 * quoi qu il arrive, ce qui surestimait `sigma_s` sur une section qui ne
 * fissure pas.
 */
export function blocEtatFissuration(
  entree: Issue<ServiceStateResult>,
  /**
   * Etat sous la combinaison QUASI-PERMANENTE, quand elle est saisie.
   *
   * Le bloc conclut sur la combinaison CARACTERISTIQUE, parce que c'est elle
   * que le §7.2 limite. Mais la fissuration se regarde couramment sous la
   * quasi-permanente — c'est la combinaison du §7.3 — et les deux ne donnent
   * pas toujours le meme etat. Une seule ligne evite d'avoir a refaire le
   * calcul de tete.
   */
  quasiPermanente?: Issue<ServiceStateResult>
): BlocService {
  const titre = 'Etat de fissuration (§7.1(2))';
  if (!('resultat' in entree)) return sansCalcul(titre, entree.motif);

  const r = entree.resultat;
  const c = r.cracking;

  const lignes: LigneAffichee[] = [
    { libelle: 'Combinaison', valeur: 'caracteristique — celle que le §7.2 limite' },
    { libelle: 'Etat retenu', valeur: NOM_ETAT[c.state] },
    {
      libelle: 'Traction extreme du beton (etat I)',
      valeur: `${formatNumber(c.uncracked.sigmaCt, 2)} MPa`,
    },
    { libelle: 'f_ct,eff du critere', valeur: `${formatNumber(c.fctEff, 2)} MPa` },
    {
      libelle: 'Moment de fissuration M_cr',
      valeur:
        c.Mcr === null
          ? `sans objet — ${c.McrReason ?? 'non gouverne par le moment'}`
          : `${formatNumber(c.Mcr, 1)} kN·m`,
    },
    { libelle: 'Compression du beton sigma_c', valeur: `${formatNumber(r.sigmaC, 1)} MPa` },
    {
      libelle: 'Limite k1·f_ck',
      valeur: `${formatNumber(r.sigmaCLimit, 1)} MPa`,
    },
    { libelle: 'Traction des aciers sigma_s', valeur: `${formatNumber(r.sigmaS, 1)} MPa` },
    { libelle: 'Limite k3·f_yk', valeur: `${formatNumber(r.sigmaSLimit, 1)} MPa` },
  ];

  if (quasiPermanente !== undefined && 'resultat' in quasiPermanente) {
    lignes.push({
      libelle: 'Etat sous quasi-permanente (§7.3)',
      valeur: NOM_ETAT[quasiPermanente.resultat.cracking.state],
    });
  }

  // Le mode force est signale SEULEMENT quand il contredit le critere : le
  // repeter quand les deux concordent brouillerait le seul cas ou l
  // information compte.
  const forcage = c.forced
    ? `Etat IMPOSE par l utilisateur. Le critere du §7.1(2) designe l autre : ` +
      `${NOM_ETAT[c.criterionState]}. Les contraintes ci-dessus sont donc celles d une ` +
      "hypothese que la norme n aurait pas retenue ici — c est un examen, pas une justification."
    : '';

  const lecture =
    c.state === 'uncracked'
      ? 'Le beton tendu participe, ce qui soulage les armatures : le sigma_s ci-dessus est ' +
        'plus faible que celui d un calcul en section fissuree, et c est legitime tant que la ' +
        'traction reste sous f_ct,eff.'
      : "La traction du beton atteint f_ct,eff : le beton tendu est integralement neglige, et " +
        'toute la traction passe dans les armatures.';

  const note = [forcage, lecture].filter((t) => t !== '').join(' ');

  return {
    titre,
    lignes,
    verdict: r.ok
      ? { ok: true, texte: 'Contraintes de service verifiees sur l etat retenu' }
      : { ok: false, texte: 'Contraintes de service non verifiees' },
    note: r.ok ? note : `${r.reason ?? ''} ${note}`.trim(),
  };
}
