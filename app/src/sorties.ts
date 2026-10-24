/**
 * Les SORTIES du calcul : modele de depart, calcul, blocs et rendu du
 * resultat.
 *
 * Module PUR, sans DOM : il recoit l'etat du formulaire, resout le modele,
 * lance les verifications et met le resultat en forme. Le cablage
 * (`main.ts`) se contente ensuite de peindre ce qu'il rend — l'ecran, les
 * dessins et les documents disent donc exactement ce que le calcul a produit.
 *
 * Toute la conversion de notation se fait ICI, au rendu : les donnees gardent
 * la notation source (`M_Ed`, `sigma_s`, `mm2`).
 */

import {
  resolveModel,
  verifySection,
  capacityAtAngle,
  verifyServiceUniaxial,
  verifyCrackWidth,
  sectionCurvature,
  verifyShear,
  verifyDetailing,
  minimumRestraintArea,
  meyerRestraintReinforcement,
  verifyServiceState,
  sectionStateAt,
  interactionDiagramNM,
  FORMAT_VERSION,
  ENGINE_VERSION,
} from '../../src/index';
import type {
  SectionModel, VerificationResult, ResolvedModel, NeutralAxisState, Section, Action,
  ServiceResult, CrackResult, CurvatureResult, ShearResult, DetailingResult,
  RestraintResult, MeyerResult, ServiceStateResult, ResolvedChecks,
} from '../../src/index';
import {
  formToModel,
  parametresDeService,
  parametresDeVerification,
  parametresDeMeyer,
} from './form';
import type {
  FormState, ParametresService, ParametresVerifications, ParametresMeyer,
} from './form';
import {
  noteFlexionDeviee,
  obstacleFissuration,
  blocContraintes,
  blocFissuration,
  blocCourbure,
} from './service-view';
import type { BlocService, Issue } from './service-view';
import {
  blocTranchant,
  blocDispositions,
  blocZwang,
  obstacleTranchant,
  obstacleDispositions,
  obstacleZwang,
} from './checks-view';
import { blocMeyer } from './meyer-view';
import { blocEtatSection, blocEtatFissuration } from './state-view';
import { blocsFlexionUls } from './uls-view';
import { outlineOf, boundingBox, neutralAxisSegment, barRadius, splitByLine, zetaOf } from './draw';
import { plotSvg } from './plot';
import { formatNumber } from './format';
import { notationHtml, notationSvg } from 'aedificium-ui';

// --- Modele de depart -------------------------------------------------------

export function modeleParDefaut(): SectionModel {
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
    // Sollicitations de service PLAUSIBLES, dans le seul modele de
    // demonstration : un panneau « Service » vide au premier chargement ne se
    // ferait jamais decouvrir. Un fichier CHARGE sans service, lui, reste vide
    // — on n'invente pas les charges de l'utilisateur.
    serviceActions: {
      characteristic: { N: 370, M: 59 },
      quasiPermanent: { N: 300, M: 45 },
    },
    // AU PREMIER CHARGEMENT, L OUTIL EST UN OUTIL D ELU, et rien d autre.
    //
    // Les verifications de service, de tranchant, du §9 et de deformation
    // genee restent a un clic, avec leurs champs deja plausibles — c est
    // pourquoi les sollicitations de service ci-dessus sont conservees. Mais
    // les afficher toutes d entree noyait la flexion sous des blocs que
    // personne n avait demandes, et faisait double emploi avec les outils
    // dedies de la suite. Ce qu on voit en ouvrant la page est ce qu on est
    // venu chercher ; le reste se coche.
    checks: {
      service: false,
      shear: false,
      detailing: false,
      restraint: false,
      sectionState: true,
      restraintReferential: 'both',
      cracking: { mode: 'auto' },
    },
  };
}

// --- Rendu du resultat ------------------------------------------------------

/** Une ligne du resultat : libelle et valeur, tous deux en notation source. */
export function ligne(libelle: string, valeur: string): string {
  return `<div class="ligne"><span>${notationHtml(libelle)}</span><strong>${notationHtml(valeur)}</strong></div>`;
}

function groupe(titre: string, lignes: string[]): string {
  const contenu = lignes.filter((l) => l !== '').join('');
  return contenu === '' ? '' : `<div class="groupe"><h3>${notationHtml(titre)}</h3>${contenu}</div>`;
}

/**
 * Le resultat de flexion ELU a l'ecran, rendu A PARTIR DES BLOCS de
 * `uls-view.ts` : ceux-la memes qui partent dans le CSV et la note. Il n'y a
 * donc qu'une source, et la note ne peut plus omettre ce que l'ecran montre.
 *
 * Le premier bloc porte le verdict, rendu avec sa jauge ; les suivants sont
 * les groupes de grandeurs.
 */
function htmlResultat(blocs: BlocService[], taux: number): string {
  const [tete, ...groupes] = blocs;
  const ok = tete.verdict?.ok ?? false;
  const verdict = `<p class="verdict ${ok ? 'ok' : 'non-ok'}">${notationHtml(tete.verdict?.texte ?? '')}</p>`;

  // Jauge : le taux lu d'un coup d'oeil, plafonnee visuellement a 100 % pour
  // rester lisible quand la section est tres largement depassee.
  const remplissage = Number.isFinite(taux) ? Math.min(taux, 1) * 100 : 100;
  const jauge = `<div class="jauge${ok ? '' : ' depasse'}"><div style="width:${remplissage.toFixed(1)}%"></div></div>`;

  const corps = groupes
    .map(
      (g) =>
        groupe(g.titre, g.lignes.map((l) => ligne(l.libelle, l.valeur))) +
        (g.note === null ? '' : `<p class="note">${notationHtml(g.note)}</p>`)
    )
    .join('');

  const motif = tete.note === null ? '' : `<p class="motif">${notationHtml(tete.note)}</p>`;

  return verdict + jauge + corps + motif;
}

// --- Verifications de service -----------------------------------------------

const SANS_CARACTERISTIQUE =
  'Aucune sollicitation de service caracteristique saisie. La limitation des contraintes du §7.2 ' +
  'porte sur la combinaison CARACTERISTIQUE, qui n est pas celle de l ELU : la reprendre serait ' +
  'fausse d un facteur 1,35 a 1,5, elle doit donc etre renseignee separement.';

const SANS_QUASI_PERMANENTE =
  'Aucune sollicitation de service quasi-permanente saisie. L ouverture de fissures (§7.3) et la ' +
  'courbure (§7.4.3) portent sur la combinaison QUASI-PERMANENTE, qui n est pas celle de l ELU : ' +
  'elle doit etre renseignee separement.';

/**
 * Protege UN appel de verification, et lui seul.
 *
 * `verifyCrackWidth` LEVE sur toute geometrie non rectangulaire. Laisser
 * l'exception remonter jusqu'au `try` global de `recalculer()` effacerait tout
 * le resultat ELU au profit d'un message d'erreur — parce qu'un module
 * OPTIONNEL n'a pas pu s'appliquer. L'echec devient donc ici une donnee, que
 * `service-view.ts` affiche comme un resultat parmi les autres.
 */
function tenter<T>(calcul: () => T): Issue<T> {
  try {
    return { resultat: calcul() };
  } catch (e) {
    return { motif: e instanceof Error ? e.message : String(e) };
  }
}

function issueFissuration(
  section: Section,
  action: Action | undefined,
  parametres: ParametresService
): Issue<CrackResult> {
  if (action === undefined) return { motif: SANS_QUASI_PERMANENTE };

  // Le garde est interroge AVANT l'appel : le message du module ne dit pas que
  // les deux autres verifications, elles, restent valables sur un polygone.
  const obstacle = obstacleFissuration(section);
  if (obstacle !== null) return { motif: obstacle };

  return tenter(() =>
    verifyCrackWidth(section, action, {
      wMax: parametres.wMax,
      service: { n: parametres.n },
    })
  );
}

/**
 * Rendu d'un `BlocService`, quelle que soit la famille de verification :
 * service (§7.2, §7.3, §7.4.3) ou session 11 (§6.2, §9, §7.3.2). D'ou la
 * classe `bloc` et non `service` — le patron est celui du service, le
 * perimetre ne l'est plus.
 */
function htmlBlocService(bloc: BlocService, cle: string): string {
  const lignes = bloc.lignes.map((l) => ligne(l.libelle, l.valeur)).join('');

  const verdict =
    bloc.verdict === null
      ? ''
      : `<p class="verdict bloc ${bloc.verdict.ok ? 'ok' : 'non-ok'}">${notationHtml(bloc.verdict.texte)}</p>`;

  // Une note qui accompagne un verdict DEFAVORABLE est le motif de l'echec ;
  // partout ailleurs c'est une precision — l'avertissement « pas une fleche »
  // en tete. Deux styles, pour deux lectures qui n'appellent pas la meme
  // reaction.
  const classeNote = bloc.verdict !== null && !bloc.verdict.ok ? 'motif' : 'note';
  const note = bloc.note === null ? '' : `<p class="${classeNote}">${notationHtml(bloc.note)}</p>`;

  return `<div class="groupe bloc" data-bloc="${cle}"><h3>${notationHtml(bloc.titre)}</h3>${lignes}${verdict}${note}</div>`;
}

/**
 * Un bloc et la CLE qui le designe dans la page.
 *
 * Les blocs sont produits une fois, puis affiches ET exportes. Sans cette
 * paire, l export devrait reconstruire ce que l ecran montre — une seconde
 * source de verite, qui finirait par en diverger.
 */
interface BlocAffiche {
  cle: string;
  bloc: BlocService;
}

function blocsDeService(resolu: ResolvedModel, parametres: ParametresService): BlocAffiche[] {
  const section = resolu.section;
  const caracteristique = resolu.serviceActions?.characteristic;
  const quasiPermanent = resolu.serviceActions?.quasiPermanent;

  const contraintes: Issue<ServiceResult> =
    caracteristique === undefined
      ? { motif: SANS_CARACTERISTIQUE }
      : tenter(() => verifyServiceUniaxial(section, caracteristique, { n: parametres.n }));

  const courbure: Issue<CurvatureResult> =
    quasiPermanent === undefined
      ? { motif: SANS_QUASI_PERMANENTE }
      : tenter(() =>
          sectionCurvature(section, quasiPermanent, { n: parametres.n, beta: parametres.beta })
        );

  // Etat de fissuration : l'option `beton tendu` du service. Il conclut sur
  // la combinaison CARACTERISTIQUE, celle que le §7.2 limite, et rapporte a
  // cote l'etat sous quasi-permanente, qui est la combinaison du §7.3.
  const optionsFissuration = {
    n: parametres.n,
    mode: parametres.crackingMode,
    ...(parametres.crackingFctEff !== undefined ? { fctEff: parametres.crackingFctEff } : {}),
  };

  const etatCaracteristique: Issue<ServiceStateResult> =
    caracteristique === undefined
      ? { motif: SANS_CARACTERISTIQUE }
      : tenter(() => verifyServiceState(section, caracteristique, optionsFissuration));

  const etatQuasiPermanent: Issue<ServiceStateResult> | undefined =
    quasiPermanent === undefined
      ? undefined
      : tenter(() => verifyServiceState(section, quasiPermanent, optionsFissuration));

  return [
    {
      cle: 'etat-fissuration',
      bloc: blocEtatFissuration(etatCaracteristique, etatQuasiPermanent),
    },
    { cle: 'contraintes', bloc: blocContraintes(contraintes) },
    {
      cle: 'fissuration',
      bloc: blocFissuration(issueFissuration(section, quasiPermanent, parametres)),
    },
    { cle: 'courbure', bloc: blocCourbure(courbure) },
  ];
}

/**
 * Etat d'equilibre sous la sollicitation ELU, et contrainte de chaque barre.
 *
 * FLEXION DROITE SEULEMENT. `sectionStateAt` resout un champ de deformation
 * a deux inconnues dans le plan de flexion ; un `M_z` non nul le sort de son
 * domaine, et le bloc le dit plutot que de rendre une contrainte calculee
 * sur la seule composante `M_y` — qui serait un nombre juste pour une
 * sollicitation qui n'est pas celle qu'on a saisie.
 */
function blocDeLEtatSection(resolu: ResolvedModel): BlocAffiche {
  const action: Action = { N: resolu.action.N, M: resolu.action.My };

  if (resolu.action.Mz !== 0) {
    return {
      cle: 'etat-section',
      bloc: blocEtatSection(
        {
          motif:
            `Sollicitation deviee (M_z = ${formatNumber(resolu.action.Mz, 1)} kN·m). ` +
            "L'equilibre sous sollicitation donnee est resolu en flexion DROITE : il " +
            'faudrait une orientation d axe neutre supplementaire, que ce module ne cherche ' +
            'pas. Le moment resistant, lui, reste calcule en flexion deviee par le bloc de flexion.',
        },
        action
      ),
    };
  }

  return {
    cle: 'etat-section',
    bloc: blocEtatSection(
      tenter(() => sectionStateAt(resolu.section, action, resolu.norm)),
      action
    ),
  };
}

function htmlService(MzElu: number, blocs: BlocAffiche[]): string {
  // Le Mz de l'ELU informe, il ne BLOQUE jamais : les verifications ci-dessous
  // portent sur d'autres combinaisons, saisies separement et uniaxiales par
  // construction. Refuser de calculer sur ce motif refuserait le cas normal.
  const note = noteFlexionDeviee(MzElu);
  const deviee = note === null ? '' : `<p class="note note-deviee">${notationHtml(note)}</p>`;

  return (
    `<div id="service"><h2>Verifications de service (ELS)</h2>${deviee}` +
    blocs.map((b) => htmlBlocService(b.bloc, b.cle)).join('') +
    '</div>'
  );
}

function htmlEtatSection(blocs: BlocAffiche[]): string {
  if (blocs.length === 0) return '';
  return (
    '<div id="etat-section"><h2>Etat sous sollicitation</h2>' +
    blocs.map((b) => htmlBlocService(b.bloc, b.cle)).join('') +
    '</div>'
  );
}

// --- Tranchant, dispositions et deformation genee ---------------------------

/**
 * Les trois familles de verifications livrees en session 11.
 *
 * TOUTES LES EXCEPTIONS SONT ATTRAPEES ICI, une par une. `verifyShear`,
 * `verifyDetailing` et `minimumRestraintArea` LEVENT hors du rectangle, et
 * `verifyDetailing` leve aussi sur un poteau prive de `N_Ed`. En laisser une
 * seule remonter au `try` global de `recalculer()` effacerait tout le resultat
 * de flexion parce qu'un module OPTIONNEL n'a pas pu s'appliquer — la
 * regression que la session 10 avait deja evitee pour la fissuration.
 *
 * Aucun calcul ici : les modules sont appeles, `checks-view.ts` met en forme.
 */
function blocsDeVerifications(
  resolu: ResolvedModel,
  parametres: Issue<ParametresVerifications>,
  parametresMeyer: Issue<ParametresMeyer>,
  checks: ResolvedChecks
): BlocAffiche[] {
  const section = resolu.section;

  let tranchant: Issue<ShearResult>;
  let dispositions: Issue<DetailingResult>;
  let zwang: Issue<RestraintResult>;
  let VEd = 0;

  if (!('resultat' in parametres)) {
    // Une saisie fautive dans ce cadre-la n'invalide que ce cadre-la.
    tranchant = { motif: parametres.motif };
    dispositions = { motif: parametres.motif };
    zwang = { motif: parametres.motif };
  } else {
    const p = parametres.resultat;
    VEd = p.VEd;

    // Les gardes sont interroges AVANT l'appel : le message du noyau nomme la
    // fonction qui leve, ce qui n'a aucun sens a l'ecran, et il ne dit pas ce
    // qui reste calculable par ailleurs.
    const horsTranchant = obstacleTranchant(section);
    const horsDispositions = obstacleDispositions(section, p.elementType);
    const horsZwang = obstacleZwang(section);

    // L'effort normal du §6.2 et celui du §9.5.2 sont celui de l'ELU deja
    // saisi : il n'y en a pas d'autre a cet etat-limite, et le redemander
    // ouvrirait la porte a deux valeurs contradictoires.
    tranchant =
      horsTranchant !== null
        ? { motif: horsTranchant }
        : tenter(() =>
            verifyShear(section, { V_Ed: p.VEd, N_Ed: resolu.action.N }, resolu.norm, {
              ...(p.cadres !== undefined ? { links: p.cadres } : {}),
              cotTheta: p.cotTheta,
            })
          );

    dispositions =
      horsDispositions !== null
        ? { motif: horsDispositions }
        : tenter(() =>
            verifyDetailing(section, p.elementType, {
              longitudinal: { NEd: resolu.action.N },
              // Les deux modules decrivent les memes cadres sous deux noms de
              // champ : `Asw` pour le §6.2, `asw` pour le §9.2.2. La saisie
              // est unique, la traduction se fait ici et nulle part ailleurs.
              ...(p.cadres !== undefined
                ? { web: { asw: p.cadres.Asw, s: p.cadres.s, fywk: p.cadres.fywk } }
                : {}),
            })
          );

    // Aucun `NEd` transmis au §7.3.2, DELIBEREMENT : c'est une verification de
    // service, et y injecter l'effort normal de l'ELU serait faux d'un facteur
    // 1,35 a 1,5 — la meme erreur que reprendre le moment de l'ELU pour le
    // §7.2. En gene centree `k_c` vaut 1 par definition ; en gene de flexion,
    // l'eq. 7.2 redonne 0,4 en l'absence d'effort normal.
    zwang =
      horsZwang !== null
        ? { motif: horsZwang }
        : tenter(() =>
            minimumRestraintArea(section, p.restraintType, {
              ...(p.fctEff !== undefined ? { fctEff: p.fctEff } : {}),
              ...(p.sigmaS !== undefined ? { sigmaS: p.sigmaS } : {}),
              thicknessConvention: p.thicknessConvention,
              method: p.restraintMethod,
              overrides: p.restraintOverrides,
            })
          );
  }

  // La methode Meyer a sa PROPRE saisie, evaluee separement : elle ne partage
  // aucun parametre avec les trois modules ci-dessus, et un champ vide dans
  // son cadre n'a aucune raison d'effacer leurs blocs.
  //
  // Elle ne recoit rien de `resolu` non plus — ni geometrie, ni ferraillage,
  // ni sollicitation. Elle reste donc calculable sur un cercle, la ou le
  // §6.2 et le §7.3.2 sont hors domaine.
  let meyer: Issue<MeyerResult>;
  let dsMeyer = 0;

  if (!('resultat' in parametresMeyer)) {
    meyer = { motif: parametresMeyer.motif };
  } else {
    const m = parametresMeyer.resultat;
    // `ds` est transmis a cote du resultat : `MeyerResult` ne le porte pas,
    // et le bloc en tire la repartition de barres.
    dsMeyer = m.ds;
    // `meyerRestraintReinforcement` LEVE sur tout parametre non strictement
    // positif — un champ vide en cours de frappe suffit — et aussi sur une
    // configuration hors domaine, quand A_cr absorbe toute la section tendue.
    meyer = tenter(() => meyerRestraintReinforcement(m));
  }

  // Seuls les blocs COCHES sont produits. Ne pas les produire, plutot que ne
  // pas les afficher : c'est le meme objet `blocs` qui alimente l'ecran, le
  // CSV et la note de calcul, et un bloc construit finirait dans la note.
  const blocs: BlocAffiche[] = [];

  if (checks.shear) blocs.push({ cle: 'tranchant', bloc: blocTranchant(tranchant, VEd) });
  if (checks.detailing) blocs.push({ cle: 'dispositions', bloc: blocDispositions(dispositions) });
  if (checks.restraint && checks.restraintReferential !== 'meyer') {
    blocs.push({ cle: 'zwang', bloc: blocZwang(zwang) });
  }
  if (checks.restraint && checks.restraintReferential !== 'ec2') {
    blocs.push({ cle: 'meyer', bloc: blocMeyer(meyer, dsMeyer) });
  }

  return blocs;
}

/**
 * Le titre suit ce qui est REELLEMENT verifie.
 *
 * « Effort tranchant, dispositions et deformation genee » au-dessus du seul
 * bloc de tranchant annoncerait deux verifications absentes — exactement ce
 * qu'une case decochee est censee supprimer.
 */
function htmlVerifications(blocs: BlocAffiche[], checks: ResolvedChecks): string {
  if (blocs.length === 0) return '';

  const familles: string[] = [];
  if (checks.shear) familles.push('effort tranchant');
  if (checks.detailing) familles.push('dispositions constructives');
  if (checks.restraint) familles.push('deformation genee');

  const titre = familles.join(', ').replace(/^./, (c) => c.toUpperCase());

  // Le referentiel de la gene est NOMME au-dessus des blocs, et pas seulement
  // dans la note : Meyer est une methode DIN, alors qu'en Belgique et au
  // Luxembourg la justification reglementaire reste l'EN 1992-1-1. Qui lit
  // l'ecran doit savoir laquelle il regarde.
  const referentiel = checks.restraint
    ? `<p class="legende"><span>deformation genee — referentiel : ${
        checks.restraintReferential === 'ec2'
          ? 'EN 1992-1-1 §7.3.2'
          : checks.restraintReferential === 'meyer'
            ? 'DIN 1045, methode Meyer'
            : 'comparatif §7.3.2 / Meyer'
      }</span></p>`
    : '';

  return (
    `<div id="verifications"><h2>${notationHtml(titre)}</h2>${referentiel}` +
    blocs.map((b) => htmlBlocService(b.bloc, b.cle)).join('') +
    '</div>'
  );
}

// --- Dessin -----------------------------------------------------------------

function chemin(points: Array<{ y: number; z: number }>): string {
  return points.map((p) => `${p.y},${p.z}`).join(' ');
}

function dessiner(
  resolu: ResolvedModel,
  resultat: VerificationResult,
  etatAxe: NeutralAxisState | null
): string {
  const contour = outlineOf(resolu.section);
  const boite = boundingBox(contour);
  const largeur = boite.yMax - boite.yMin;
  const hauteur = boite.zMax - boite.zMin;
  const marge = Math.max(largeur, hauteur) * 0.1;
  const trait = Math.max(largeur, hauteur) / 300;

  const axeNeutre = resultat.neutralAxis;

  // Zones comprimee et tendue : une simple ligne d'axe neutre ne donne pas a
  // VOIR ce qui travaille en compression et ce qui travaille en traction.
  let zones = '';
  if (axeNeutre !== null) {
    const parts = splitByLine(contour, axeNeutre.angle, axeNeutre.offset);
    if (parts.compressed.length >= 3) {
      zones += `<polygon points="${chemin(parts.compressed)}" class="zone-comprimee" />`;
    }
    if (parts.tensioned.length >= 3) {
      zones += `<polygon points="${chemin(parts.tensioned)}" class="zone-tendue" />`;
    }
  }

  // Les barres viennent de la section RESOLUE : le dessin montre exactement
  // ce que le moteur integre, jamais une reconstruction parallele. Chacune
  // est coloree selon le cote de l'axe neutre ou elle se trouve.
  const barres = resolu.section.rebars
    .map((r) => {
      const comprimee =
        axeNeutre !== null && zetaOf({ y: r.y, z: r.z }, axeNeutre.angle) < axeNeutre.offset;
      const classe = comprimee ? 'barre-comprimee' : 'barre-tendue';
      return `<circle cx="${r.y}" cy="${r.z}" r="${barRadius(r.area)}" class="${classe}" />`;
    })
    .join('');

  let axe = '';
  if (axeNeutre !== null) {
    const segment = neutralAxisSegment(boite, axeNeutre.angle, axeNeutre.offset);
    if (segment !== null) {
      axe = `<line x1="${segment.a.y}" y1="${segment.a.z}" x2="${segment.b.y}" y2="${segment.b.z}" class="axe-neutre" stroke-width="${trait * 1.6}" />`;
    }
  }

  // Points d'application des resultantes et bras de levier qui les separe.
  // `capacityAtAngle` ne coute qu'une seule resolution droite : negligeable
  // devant la verification elle-meme, qui en enchaine une vingtaine.
  let resultantes = '';
  if (axeNeutre !== null) {
    const etat = etatAxe;
    if (etat && etat.compression && etat.tension) {
      const r = trait * 5;
      const c = etat.compression;
      const t = etat.tension;
      resultantes =
        `<line x1="${c.y}" y1="${c.z}" x2="${t.y}" y2="${t.z}" class="bras-levier" stroke-width="${trait}" />` +
        `<circle cx="${c.y}" cy="${c.z}" r="${r}" class="resultante" stroke-width="${trait * 1.2}" />` +
        `<circle cx="${t.y}" cy="${t.z}" r="${r}" class="resultante" stroke-width="${trait * 1.2}" />`;
    }
  }

  // Repere : l'axe neutre est repere par une position SIGNEE, donc le lecteur
  // doit voir dans quel sens comptent y et z. Le zero est le centroide de la
  // section, ce que materialise la petite croix a l'origine.
  const fleche = Math.max(largeur, hauteur) * 0.13;
  const police = Math.max(largeur, hauteur) * 0.055;
  const repere =
    `<line x1="0" y1="0" x2="${fleche}" y2="0" class="repere" stroke-width="${trait}" />` +
    `<line x1="${fleche}" y1="0" x2="${fleche - fleche * 0.22}" y2="${-fleche * 0.11}" class="repere" stroke-width="${trait}" />` +
    `<line x1="${fleche}" y1="0" x2="${fleche - fleche * 0.22}" y2="${fleche * 0.11}" class="repere" stroke-width="${trait}" />` +
    `<text x="${fleche + police * 0.3}" y="${police * 0.35}" class="repere-texte" font-size="${police}">${notationSvg('y')}</text>` +
    `<line x1="0" y1="0" x2="0" y2="${fleche}" class="repere" stroke-width="${trait}" />` +
    `<line x1="0" y1="${fleche}" x2="${-fleche * 0.11}" y2="${fleche - fleche * 0.22}" class="repere" stroke-width="${trait}" />` +
    `<line x1="0" y1="${fleche}" x2="${fleche * 0.11}" y2="${fleche - fleche * 0.22}" class="repere" stroke-width="${trait}" />` +
    `<text x="${police * 0.3}" y="${fleche + police}" class="repere-texte" font-size="${police}">${notationSvg('z')}</text>` +
    `<line x1="${-police * 0.25}" y1="0" x2="${police * 0.25}" y2="0" class="repere" stroke-width="${trait}" />` +
    `<line x1="0" y1="${-police * 0.25}" x2="0" y2="${police * 0.25}" class="repere" stroke-width="${trait}" />`;

  // L'axe vertical du SVG va vers le bas, comme le repere du module : aucune
  // inversion, donc aucune occasion de se tromper de signe a l'affichage.
  return `<svg viewBox="${boite.yMin - marge} ${boite.zMin - marge} ${largeur + 2 * marge} ${hauteur + 2 * marge}" preserveAspectRatio="xMidYMid meet">
    ${zones}
    <polygon points="${chemin(contour)}" class="contour" stroke-width="${trait}" />
    ${barres}
    ${axe}
    ${resultantes}
    ${repere}
  </svg>`;
}

/**
 * Diagramme N-M, trace avec le reste a chaque recalcul.
 *
 * Il peut l'etre parce qu'il ne coute rien : `interactionDiagramNM` ne resout
 * RIEN — chaque profondeur d'axe neutre donne son couple (N, M) par une simple
 * integration. Mesure le 2026-09-04 : 3 a 9 ms pour 72 a 200 points, contre 25
 * a 120 ms pour le recalcul complet. On retient 120 points, ou la courbe est
 * lisse pour moins de 10 ms.
 *
 * A ne pas confondre avec le domaine My-Mz ci-dessous, qui coute deux ordres
 * de grandeur de plus et ne part JAMAIS tout seul.
 */
export function dessinerDiagrammeNM(resolu: ResolvedModel): { svg: string; html: string } {
  const points = interactionDiagramNM(resolu.section, resolu.norm, { steps: 120 });
  const N = resolu.action.N;
  const My = resolu.action.My;
  const Mz = resolu.action.Mz;

  const svg = plotSvg([{ points: points.map((p) => ({ x: p.N, y: p.M })), classe: 'plot-domaine' }], {
    xLabel: 'N (kN, positif en compression)',
    yLabel: 'M_y (kN·m)',
    markers: [{ point: { x: N, y: My }, classe: 'plot-sollicitation', libelle: 'sollicitation' }],
  });

  // Le contour n'est pas ferme du cote traction, et ce n'est pas un oubli :
  // le noyau ne parcourt que la branche du pivot beton, il n'atteint jamais la
  // traction pure. Le dire, plutot que de dessiner un domaine non calcule.
  const limites =
    '<p class="legende">' +
    '<span>contour OUVERT du cote traction : seule la branche du pivot beton est parcourue</span>' +
    '<span>graphe de la flexion droite autour de y</span>' +
    '</p>';

  // Flexion deviee : le point sollicitant n'appartient plus au plan de ce
  // graphe. Le trace reste exact mais ne dit plus rien du verdict. L'ecrire,
  // plutot que d'afficher un point trompeusement rassurant — ou l'inverse.
  const avertissement =
    Mz !== 0
      ? `<p class="note"><strong>Flexion deviee</strong> (${notationHtml(
          `M_z = ${formatNumber(Mz, 1)} kN·m`
        )}) : le point sollicitant ne se trouve pas dans le plan de ce graphe, qui ne peut donc
         pas rendre le verdict. C'est le domaine My-Mz ci-dessous qui fait foi.</p>`
      : '';

  // Le SVG est rendu A COTE du balisage : c est lui qu on exporte, sans le
  // titre ni les legendes, qui sont du HTML.
  return { svg, html: `<h2>Diagramme d'interaction N-My</h2>${svg}${limites}${avertissement}` };
}

// --- Calcul -----------------------------------------------------------------

/** Tout ce qu'il faut pour peindre l'ecran et composer les documents. */
export interface Sortie {
  modele: SectionModel;
  resolu: ResolvedModel;
  parametres: ParametresService;
  resultat: VerificationResult;
  blocs: BlocService[];
  dessins: Array<{ suffixe: string; svg: string }>;
  resultatHtml: string;
  diagrammeHtml: string;
}

/**
 * Le calcul complet, du formulaire au resultat mis en forme.
 *
 * C'est un DEPLACEMENT du calcul qui vivait dans `recalculer()` : ni les
 * valeurs, ni les formules, ni les sources normatives ne changent. Les erreurs
 * de saisie (`FormError`) et de calcul remontent telles quelles ; c'est au
 * cablage de les afficher.
 */
export function calculerSorties(etat: FormState, mode?: 'proportional'): Sortie {
  const modele = formToModel(etat);
  const parametres = parametresDeService(etat);

  const resolu = resolveModel(modele);
  // Le recalcul automatique est TOUJOURS en « N constant ». Le mode
  // proportionnel coute plusieurs secondes — 3,3 s sur une dalle courante
  // contre 0,27 s — et il est synchrone : le declencher a chaque frappe fige
  // la page, ce qui se lit a l'ecran comme des valeurs qui ne se mettent plus
  // a jour. Il ne part donc que sur action explicite.
  const resultat = verifySection(resolu.section, resolu.action, resolu.norm, {
    mode: mode ?? 'constant-N',
  });

  // Une seule resolution a angle fixe, partagee par le resultat et le
  // dessin : elle ne coute qu'une resolution droite, mais la calculer deux
  // fois serait deux fois trop.
  const etatAxe =
    resultat.neutralAxis === null
      ? null
      : capacityAtAngle(resolu.section, resultat.neutralAxis.angle, resolu.action.N, resolu.norm);

  // Les parametres de la session 11 sont evalues DANS le `tenter` : une
  // saisie en cours de frappe dans ce cadre ne doit pas priver l'ecran du
  // resultat de flexion, deja calcule.
  const parametresVerifications = tenter(() => parametresDeVerification(etat));
  // Evalues SEPAREMENT : les deux cadres de saisie sont independants, et une
  // frappe en cours dans l'un ne doit pas priver l'autre de son bloc.
  const parametresMeyer = tenter(() => parametresDeMeyer(etat));

  // Une verification decochee n'est PAS calculee. C'est ce qui donne son
  // sens a la case : elle disparait de l'ecran, du CSV et de la note, et le
  // temps de calcul suit.
  const checks = resolu.checks;

  // La flexion ELU est TOUJOURS calculee : elle est l'objet de l'outil.
  const blocsUls = blocsFlexionUls(resolu, resultat, etatAxe);
  const blocsEtat = checks.sectionState ? [blocDeLEtatSection(resolu)] : [];
  const blocsService = checks.service ? blocsDeService(resolu, parametres) : [];
  const blocsVerifications = blocsDeVerifications(
    resolu,
    parametresVerifications,
    parametresMeyer,
    checks
  );

  const resultatHtml =
    htmlResultat(blocsUls, resultat.utilization) +
    htmlEtatSection(blocsEtat) +
    (checks.service ? htmlService(resolu.action.Mz, blocsService) : '') +
    htmlVerifications(blocsVerifications, checks);

  const svgSection = dessiner(resolu, resultat, etatAxe);
  const diagramme = dessinerDiagrammeNM(resolu);

  return {
    modele,
    resolu,
    parametres,
    resultat,
    blocs: [
      ...blocsUls,
      ...[...blocsEtat, ...blocsService, ...blocsVerifications].map((b) => b.bloc),
    ],
    dessins: [
      { suffixe: 'section', svg: svgSection },
      { suffixe: 'diagramme-n-my', svg: diagramme.svg },
    ],
    resultatHtml,
    diagrammeHtml: diagramme.html,
  };
}
