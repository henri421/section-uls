import {
  resolveModel,
  verifySection,
  capacityAtAngle,
  polygonArea,
  verifyServiceUniaxial,
  verifyCrackWidth,
  sectionCurvature,
  verifyShear,
  verifyDetailing,
  minimumRestraintArea,
  meyerRestraintReinforcement,
  verifyServiceState,
  sectionStateAt,
  FORMAT_VERSION,
  ENGINE_VERSION,
} from '../../src/index';
import type {
  SectionModel, VerificationResult, ResolvedModel, NeutralAxisState,
  Section, Action, ServiceResult, CrackResult, CurvatureResult,
  ShearResult, DetailingResult, RestraintResult, MeyerResult,
  ServiceStateResult, ResolvedChecks,
} from '../../src/index';
import {
  formToModel,
  modelToForm,
  parametresDeService,
  parametresDeVerification,
  parametresDeMeyer,
  FormError,
} from './form';
import {
  rectangularRebarLayout, rebarRow, formatRow, spacingOptions, faceSegment,
  barArea, barDiameterOf, checkBarPlacement, skinBars,
} from '../../src/index';
import type { RowOption } from '../../src/index';
import { barresEvaluees, barresGenerees } from './form';
import { evaluateExpression } from './expression';
import type {
  FormState, RowInput, FreeRowInput, ParametresService, ParametresVerifications,
  ParametresMeyer,
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
import { interactionDiagramNM, interactionCurveAtN } from '../../src/index';
import { outlineOf, boundingBox, neutralAxisSegment, barRadius, splitByLine, zetaOf } from './draw';
import { plotSvg } from './plot';
import { effectiveDepth, simplifiedLeverArm } from './lever-arm';
import { formatNumber, formatAngleDegrees, formatUtilization } from './format';
import {
  chargerLocalement,
  sauvegarderLocalement,
  telecharger,
  telechargerModele,
  lireFichier,
} from './storage';
import {
  svgAutonome,
  resultatsEnCsv,
  noteDeCalculHtml,
  STYLES_TRACE,
  STYLES_NOTE,
} from './export';
import { blocsDEntree, hypothesesDeLaNote } from './note-view';
import './style.css';

/**
 * Cablage de l'interface. Volontairement MINCE : il lit les champs, appelle
 * les fonctions pures et le noyau, puis ecrit dans le document. Tout ce qui
 * calcule ou transforme vit dans `form.ts`, `draw.ts` et `format.ts`, qui
 * sont testes. Si du calcul apparait ici, c'est qu'une fonction pure manque.
 *
 * Le modele est la SOURCE DE VERITE : chaque modification reconstruit un
 * `SectionModel`, dont tout le reste est derive. Aucun etat parallele n'est
 * maintenu — ni positions de barres, ni geometrie reconstruite pour le
 * dessin — de sorte que ce qui est enregistre est exactement ce qui est
 * calcule, et que l'ecran ne peut pas montrer autre chose.
 */

// --- Modele de depart -------------------------------------------------------

function modeleParDefaut(): SectionModel {
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

let etat: FormState = modelToForm(chargerLocalement() ?? modeleParDefaut());

/** Dernier resultat valide, conserve pour ne pas l'effacer sur une saisie fautive. */
let dernierResultat: string = '';
/** Dernier diagramme N-M rendu, reaffiche tel quel pendant un trace de domaine. */
let dernierDiagramme: string = '';

/**
 * Tout ce qu'il faut pour composer une sortie, fige au dernier calcul REUSSI.
 *
 * Les blocs et les dessins sont ceux-la memes qui sont affiches : l'export dit
 * exactement ce que l'ecran dit, parce qu'il montre la meme chose. Le
 * reconstruire creerait une seconde source de verite.
 */
interface EtatExportable {
  modele: SectionModel;
  resolu: ResolvedModel;
  parametres: ParametresService;
  blocs: BlocService[];
  dessins: Array<{ suffixe: string; svg: string }>;
}

let derniereSortie: EtatExportable | null = null;

// --- Fabriques de balisage --------------------------------------------------

function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Un « i » qui ouvre une note.
 *
 * Les hypotheses, les arbitrages et les limites de validite doivent rester
 * ACCESSIBLES : ce sont eux qui disent ce que le resultat vaut. Affiches en
 * permanence, ils noyaient la saisie sous le texte. Ils passent donc derriere
 * un appel : survol pour lire, clic pour epingler.
 *
 * Le balisage se GREFFE sur un libelle — `champTexte(c, 'cot theta' +
 * info('…'), v)` — parce que les libelles sont deja inseres tels quels dans
 * le gabarit. Aucune fabrique de champ n'a donc a connaitre les notes.
 *
 * `classes` porte les variantes : `decisif` pour un parametre qui gouverne le
 * resultat, `gauche` pour une bulle qui s'ouvrirait hors de l'ecran.
 */
let compteurInfo = 0;

function info(contenu: string, classes = ''): string {
  const id = `aide-${++compteurInfo}`;
  const decisif = classes.split(' ').includes('decisif') ? ' decisif' : '';
  return (
    `<span class="info">` +
    `<button type="button" class="info-bouton${decisif}" data-action="info"` +
    ` aria-label="Informations" aria-expanded="false" aria-controls="${id}">i</button>` +
    `<span class="info-bulle${classes ? ` ${classes}` : ''}" id="${id}" role="note">${contenu}</span>` +
    `</span>`
  );
}

function champTexte(champ: keyof FormState, libelle: string, valeur: string): string {
  return `<label><span>${libelle}</span><input type="text" inputmode="decimal" data-champ="${champ}" value="${echapper(valeur)}" /></label>`;
}


function champZone(champ: keyof FormState, libelle: string, valeur: string, lignes: number): string {
  return `<label class="zone"><span>${libelle}</span><textarea rows="${lignes}" data-champ="${champ}">${echapper(valeur)}</textarea></label>`;
}

function champChoix(
  champ: keyof FormState,
  libelle: string,
  valeur: string,
  options: Array<[string, string]>
): string {
  const items = options
    .map(([v, l]) => `<option value="${v}"${v === valeur ? ' selected' : ''}>${l}</option>`)
    .join('');
  return `<label class="large"><span>${libelle}</span><select data-champ="${champ}" data-structure="1">${items}</select></label>`;
}

/**
 * LES NOMBRES DE BARRES PROPOSES pour un lit saisi en espacement maximal.
 *
 * Pourquoi ces boutons existent. « Ø14 tous les 150 » sur une largeur de
 * 1000 donne 8 barres a 130 mm, parce que la longueur utile vaut 910 et non
 * 1000 : l'ecart, c'est l'enrobage. La lecture spontanee « 1000/150 » suggere
 * 6 ou 7, et le desaccord est invisible tant qu'un seul nombre s'affiche.
 *
 * Sur une dalle au metre, un nombre non entier se moyenne sans dommage. Sur
 * une POUTRE il n'existe pas de demi-barre, et c'est l'ingenieur qui tranche
 * entre 6 et 7 — y compris pour accepter un depassement de deux millimetres,
 * qu'aucune regle n'oblige a refuser et que lui seul peut assumer.
 *
 * Le nombre CONFORME reste marque et reste celui qui est pose tant qu'on ne
 * choisit rien : rien ne devient silencieusement moins sur. Cliquer bascule
 * le lit en saisie par nombre — l'espacement cesse alors d'etre une consigne
 * pour devenir une consequence, ce qui est exactement ce qu'on voulait voir.
 */
function boutonsDeNombre(options: RowOption[], attribut: string, index: number): string {
  return options
    .map((o) => {
      // Plus de couleur d'alerte sur un espacement superieur au pas : depuis
      // que le nombre se compte sur l'etendue de la face, un ecart de
      // quelques millimetres (910/6 = 151,7 pour « 150 ») est le cas NORMAL,
      // et le peindre en alerte crierait au loup a chaque saisie.
      const classes = `option-barres${o.strict ? ' strict' : ''}`;
      return (
        `<button type="button" class="${classes}" data-action="choisir-nombre"` +
        ` data-${attribut}="${index}" data-count="${o.count}">` +
        `${o.count} barres — ${formatNumber(o.spacing, 0)} mm</button>`
      );
    })
    .join('');
}

/**
 * Le CONTENANT des propositions, vide a la construction du formulaire.
 *
 * Il est rempli par `rafraichirOptionsDeLits()` APRES chaque recalcul, et
 * jamais par une reconstruction du formulaire. La raison est le focus : un
 * espacement se tape chiffre par chiffre, et reconstruire le formulaire a
 * chaque frappe arracherait le curseur du champ. Le titre et sa note restent
 * en revanche dans le balisage statique — les regenerer ferait croitre sans
 * fin le compteur d'identifiants des bulles.
 */
function contenantDesOptions(attribut: string, index: number): string {
  return `<div class="options-barres">
    <p class="sous-titre">Nombres possibles ${info(
      `L espacement se mesure entre les <strong>axes des barres extremes</strong>, sur
       <em>b &minus; 2a</em> et non sur la largeur brute : l ecart, c est l enrobage. Le
       nombre en gras est le plus petit qui respecte le maximum demande, et c est celui qui
       est pose. Les autres sont la parce que sur une <strong>poutre</strong> il n existe pas
       de demi-barre, et qu un depassement de deux millimetres se refuse ou s assume — pas
       en silence.`
    )}</p>
    <span data-options="${attribut}-${index}"></span>
  </div>`;
}

/**
 * Remplit les propositions de tous les lits, sans toucher au reste du
 * formulaire.
 *
 * Silencieuse par construction : un lit dont la saisie n'est pas encore
 * exploitable se vide, il ne produit pas de message. C'est la meme discipline
 * que le recapitulatif des lits — une frappe en cours n'est pas une erreur.
 */
function rafraichirOptionsDeLits(): void {
  document.querySelectorAll<HTMLElement>('[data-options]').forEach((contenant) => {
    const cle = contenant.dataset.options ?? '';
    const [attribut, brut] = cle.split('-');
    const index = Number(brut);

    const options =
      attribut === 'lit' && etat.rows[index] !== undefined
        ? optionsDuLitRectangulaire(etat.rows[index])
        : null;

    contenant.innerHTML = options === null ? '' : boutonsDeNombre(options, attribut, index);
  });

  // Le recapitulatif suit le meme chemin, et pour la meme raison : « 7 HA14
  // @ 152 mm » doit se lire PENDANT qu'on tape le diametre, pas au prochain
  // changement de structure.
  const recapitulatifs = recapitulatifDesLits();
  document.querySelectorAll<HTMLElement>('[data-recap]').forEach((element) => {
    const index = Number(element.dataset.recap);
    element.textContent = recapitulatifs?.[index] ?? '';
  });

  // Meme raison pour le total du tableau de barres : il doit suivre la frappe
  // d'un diametre, sans reconstruire le tableau sous le curseur.
  const total = document.querySelector<HTMLElement>('[data-total-barres]');
  if (total !== null) {
    const aire = aireDesBarresSaisies();
    total.textContent =
      aire === null
        ? ''
        : `${etat.barList.length} barres — ${formatNumber(aire, 0)} mm² au total`;
  }
}

/**
 * Les nombres candidats d'un lit rectangulaire, ou `null` quand la saisie
 * n'est pas encore exploitable.
 *
 * Meme discipline que `recapitulatifDesLits` : une saisie en cours de frappe
 * ne produit rien plutot qu'un message d'erreur.
 */
function optionsDuLitRectangulaire(lit: RowInput): RowOption[] | null {
  if (!lit.useSpacing) return null;

  try {
    const modele = formToModel(etat);
    if (modele.geometry.kind !== 'rectangle') return null;
    if (modele.reinforcement.kind !== 'rectangular-layout') return null;

    const diametre = nombreDeChamp(lit.diameter);
    const espacement = nombreDeChamp(lit.maxSpacing);
    if (diametre === null || espacement === null) return null;

    const segment = faceSegment({
      width: modele.geometry.width,
      height: modele.geometry.height,
      cover: modele.reinforcement.cover,
      ...(modele.reinforcement.stirrupDiameter !== undefined
        ? { stirrupDiameter: modele.reinforcement.stirrupDiameter }
        : {}),
      diameter: diametre,
      face: lit.face,
    });

    return spacingOptions({
      extent: segment.extent,
      length: segment.length,
      maxSpacing: espacement,
      endpoints: segment.endpoints,
    });
  } catch {
    return null;
  }
}

/*
  PAS DE PROPOSITION SUR UN LIT LIBRE, et c'est un choix.

  La regle du pas — « Ø14 tous les 150 sur 1000 de large fait 6,67 barres » —
  se compte sur l'ETENDUE D'UNE FACE. Un lit libre, lui, est trace d'AXE A
  AXE : ses deux extremites sont des barres reelles, le segment est deja la
  fenetre, et « tous les 150 » y garde sa lecture de maximum entre axes.
  Aucune ambiguite a lever, donc rien a proposer.
*/

/** Un champ evalue, ou `null` s'il n'est pas encore exploitable. */
function nombreDeChamp(valeur: string): number | null {
  try {
    const n = evaluateExpression(valeur);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function litRectangulaire(lit: RowInput, index: number, recapitulatif?: string): string {
  const faces: Array<[string, string]> = [
    ['bottom', 'inferieure'],
    ['top', 'superieure'],
    ['left', 'gauche'],
    ['right', 'droite'],
  ];
  const options = faces
    .map(([v, l]) => `<option value="${v}"${v === lit.face ? ' selected' : ''}>${l}</option>`)
    .join('');

  return `<fieldset class="lit">
    <legend>Lit ${index + 1}</legend>
    <label class="large"><span>Face</span><select data-lit="${index}" data-champ="face" data-structure="1">${options}</select></label>
    <label><span>Diametre (mm)</span><input type="text" inputmode="decimal" data-lit="${index}" data-champ="diameter" value="${echapper(lit.diameter)}" /></label>
    <label class="case"><input type="checkbox" data-lit="${index}" data-champ="useSpacing" data-structure="1"${lit.useSpacing ? ' checked' : ''} /><span>Definir par espacement maximal</span></label>
    ${
      lit.useSpacing
        ? `<label><span>Espacement max (mm)</span><input type="text" inputmode="decimal" data-lit="${index}" data-champ="maxSpacing" value="${echapper(lit.maxSpacing)}" /></label>`
        : `<label><span>Nombre de barres</span><input type="text" inputmode="numeric" data-lit="${index}" data-champ="count" value="${echapper(lit.count)}" /></label>`
    }
    ${lit.useSpacing ? contenantDesOptions('lit', index) : ''}
    <p class="aire-lit" data-recap="${index}">${echapper(recapitulatif ?? '')}</p>
    <button type="button" data-action="supprimer-lit" data-lit="${index}">Supprimer ce lit</button>
  </fieldset>`;
}

function litLibre(lit: FreeRowInput, index: number, recapitulatif?: string): string {
  return `<fieldset class="lit">
    <legend>Lit ${index + 1}</legend>
    <div class="paire">
      ${['fromY', 'fromZ', 'toY', 'toZ']
        .map(
          (c) =>
            `<label><span>${c}</span><input type="text" inputmode="decimal" data-libre="${index}" data-champ="${c}" value="${echapper(String(lit[c as 'fromY']))}" /></label>`
        )
        .join('')}
    </div>
    <label><span>Diametre (mm)</span><input type="text" inputmode="decimal" data-libre="${index}" data-champ="diameter" value="${echapper(lit.diameter)}" /></label>
    <label class="case"><input type="checkbox" data-libre="${index}" data-champ="useSpacing" data-structure="1"${lit.useSpacing ? ' checked' : ''} /><span>Definir par espacement maximal</span></label>
    ${
      lit.useSpacing
        ? `<label><span>Espacement max (mm)</span><input type="text" inputmode="decimal" data-libre="${index}" data-champ="maxSpacing" value="${echapper(lit.maxSpacing)}" /></label>`
        : `<label><span>Nombre de barres</span><input type="text" inputmode="numeric" data-libre="${index}" data-champ="count" value="${echapper(lit.count)}" /></label>`
    }
    <label class="case"><input type="checkbox" data-libre="${index}" data-champ="excludeEndpoints"${lit.excludeEndpoints ? ' checked' : ''} /><span>Exclure les extremites (barres intermediaires seules)</span></label>
    <p class="aire-lit" data-recap="${index}">${echapper(recapitulatif ?? '')}</p>
    <button type="button" data-action="supprimer-libre" data-libre="${index}">Supprimer ce lit</button>
  </fieldset>`;
}

/**
 * LE TABLEAU DES BARRES POSEES UNE A UNE.
 *
 * C'est le mode de reference de la disposition parametrique : des
 * COORDONNEES, pas un lit par face. Il remplace la zone de texte
 * « y ; z ; aire » qui tenait ce role, pour deux raisons.
 *
 * D'abord parce qu'une cellule se modifie sans retaper la ligne, ce qui est
 * tout l'interet quand on cherche l'effet d'un deplacement de dix
 * millimetres. Ensuite parce qu'on y saisit un DIAMETRE : on pose des HA20,
 * on ne pose pas des 314 mm². Le modele continue de stocker l'aire, que le
 * noyau integre ; la conversion est exacte dans les deux sens.
 *
 * Chaque cellule porte `data-barre` et son nom de champ, et passe donc par
 * le meme chemin de saisie que tous les autres champs de la page.
 */
function tableauDeBarres(): string {
  const lignes = etat.barList
    .map(
      (barre, index) => `<tr>
      <th scope="row">${index + 1}</th>
      ${(['y', 'z', 'diameter'] as const)
        .map(
          (champ) =>
            `<td><input type="text" inputmode="decimal" data-barre="${index}" data-champ="${champ}" value="${echapper(barre[champ])}" aria-label="barre ${index + 1}, ${champ}" /></td>`
        )
        .join('')}
      <td><button type="button" class="retirer" data-action="supprimer-barre" data-barre="${index}" aria-label="supprimer la barre ${index + 1}">×</button></td>
    </tr>`
    )
    .join('');

  const vide =
    etat.barList.length === 0
      ? '<tr><td colspan="5" class="vide">Aucune barre. La section est calculee sans armature.</td></tr>'
      : '';

  return `<table class="barres">
    <thead><tr><th>#</th><th>y (mm)</th><th>z (mm)</th><th>Ø (mm)</th><th></th></tr></thead>
    <tbody>${lignes}${vide}</tbody>
  </table>
  <p class="aire-lit" data-total-barres></p>
  <button type="button" data-action="ajouter-barre">Ajouter une barre</button>`;
}

function blocGeometrie(): string {
  if (etat.geometryKind === 'rectangle') {
    return champTexte('width', 'Largeur (mm)', etat.width) + champTexte('height', 'Hauteur (mm)', etat.height);
  }
  if (etat.geometryKind === 'circle') {
    return (
      champTexte('diameter', 'Diametre (mm)', etat.diameter) +
      champTexte('segments', 'Cotes du polygone (vide = 32)', etat.segments)
    );
  }
  return champZone('vertices', 'Sommets, un par ligne : y ; z', etat.vertices, 8);
}

function blocFerraillage(): string {
  const kind = etat.reinforcementKind;

  if (kind === 'rectangular-layout') {
    const recap = recapitulatifDesLits();
    return (
      champTexte('cover', 'Enrobage (mm)', etat.cover) +
      champTexte('stirrupDiameter', 'Diametre etrier (mm, vide = 0)', etat.stirrupDiameter) +
      etat.rows.map((lit, i) => litRectangulaire(lit, i, recap?.[i])).join('') +
      `<button type="button" data-action="ajouter-lit">Ajouter un lit</button>`
    );
  }

  if (kind === 'circular-cage') {
    return (
      champTexte('cover', 'Enrobage (mm)', etat.cover) +
      champTexte('stirrupDiameter', 'Diametre spirale (mm, vide = 0)', etat.stirrupDiameter) +
      champTexte('cageBarDiameter', 'Diametre des barres (mm)', etat.cageBarDiameter) +
      champTexte('cageCount', 'Nombre de barres', etat.cageCount) +
      champTexte('cageRotationOffset', 'Decalage angulaire (rad, vide = 0)', etat.cageRotationOffset)
    );
  }

  if (kind === 'rows') {
    const recap = recapitulatifDesLits();
    return (
      etat.freeRows.map((lit, i) => litLibre(lit, i, recap?.[i])).join('') +
      `<button type="button" data-action="ajouter-libre">Ajouter un lit</button>`
    );
  }

  return tableauDeBarres();
}

/**
 * Une case a cocher qui CHANGE LA STRUCTURE du formulaire.
 *
 * `data-structure="1"` : cocher ou decocher fait apparaitre ou disparaitre
 * des cadres entiers, il faut donc reconstruire le formulaire — a la
 * difference d'une case ordinaire, ou reconstruire ferait perdre le focus.
 */
function champCaseStructurante(champ: keyof FormState, libelle: string, coche: boolean): string {
  return (
    `<label class="case"><input type="checkbox" data-champ="${champ}" data-structure="1"` +
    `${coche ? ' checked' : ''} /><span>${libelle}</span></label>`
  );
}

/**
 * LE CADRE QUI COMMANDE TOUS LES AUTRES.
 *
 * Decocher retire A LA FOIS les champs de saisie et le bloc de resultat, et
 * retire aussi la verification de la note de calcul et du CSV. C'est ce qui
 * donne un sens a la case : une verification cachee mais toujours calculee
 * reapparaitrait dans la note et ferait mentir l'ecran.
 *
 * La flexion a l'ELU n'a pas de case — c'est l'objet meme de l'outil, et une
 * case qu'on ne peut pas decocher n'est pas une case.
 */
function blocVerifications(): string {
  const referentiel = etat.checkRestraint
    ? champChoix('restraintReferential', 'Referentiel retenu', etat.restraintReferential, [
        ['both', 'Comparatif : les deux cote a cote'],
        ['ec2', 'EN 1992-1-1 §7.3.2'],
        ['meyer', 'DIN 1045, methode Meyer'],
      ])
    : '';

  return `
  <fieldset class="verifications">
    <legend>Verifications ${info(
      `La <strong>flexion composee a l ELU</strong> est toujours calculee : c est l objet de
       l outil. Tout le reste se coche. Une verification decochee disparait de la saisie,
       du resultat, du CSV <strong>et de la note de calcul</strong> — elle n est pas
       seulement cachee, elle n est pas faite.`
    )}</legend>
    ${champCaseStructurante(
      'checkSectionState',
      `Etat sous sollicitation, contrainte des aciers ${info(
        `Sous un <em>M_Ed</em> inferieur a <em>M_Rd</em>, la section n est pas a l ultime et
         ses armatures ne travaillent pas a <em>f_yd</em>. Ce bloc donne la contrainte
         <strong>reelle</strong> de chaque barre a la sollicitation appliquee.`
      )}`,
      etat.checkSectionState
    )}
    ${champCaseStructurante(
      'checkService',
      `Service : contraintes §7.2, fissuration §7.3, courbure §7.4.3`,
      etat.checkService
    )}
    ${champCaseStructurante('checkShear', 'Effort tranchant §6.2', etat.checkShear)}
    ${champCaseStructurante(
      'checkDetailing',
      `Dispositions constructives §9 (dont A_s,min de non-fragilite)`,
      etat.checkDetailing
    )}
    ${champCaseStructurante(
      'checkRestraint',
      `Armature minimale sous deformation genee (Zwang) ${info(
        `Deux methodes repondent a cette question et ne se remplacent pas : le
         <strong>§7.3.2</strong> de l EN 1992-1-1 et la methode <strong>Meyer / DIN 1045</strong>.
         Le comparatif montre laquelle surarme ; la note de calcul <strong>nomme</strong> celle
         qui a servi, parce qu en Belgique et au Luxembourg la justification reglementaire
         reste l EN 1992-1-1.`,
        'decisif'
      )}`,
      etat.checkRestraint
    )}
    ${referentiel}
  </fieldset>`;
}

// --- Panneau de disposition -------------------------------------------------

/**
 * LA DISPOSITION DE REFERENCE, figee a l'ouverture du panneau.
 *
 * C'est elle qui fait de ce panneau un outil d'OPTIMISATION plutot qu'un
 * simple editeur : chaque modification s'affiche en ECART — ΔM_Rd, ΔA_s —
 * contre la disposition d'ou l'on est parti. « Est-ce que j'ai le meme
 * moment resistant en posant autrement » est une question de difference,
 * pas de valeur absolue.
 *
 * Volontairement HORS du modele et hors de `FormState` : ce n'est pas une
 * donnee de l'ouvrage, c'est un point de comparaison de la session en cours.
 * Fermer puis rouvrir le panneau refige la reference sur ce qu'on a alors —
 * ce qui est le comportement attendu, et qui se dit en une phrase.
 */
interface DispositionDeReference {
  MRd: number;
  As: number;
  nombreDeBarres: number;
}

let panneauDisposition = false;
let referenceDisposition: DispositionDeReference | null = null;

/** Magnitude du moment resistant, ou `null` si la section ne resout pas. */
function momentResistantCourant(): number | null {
  try {
    const resolu = resolveModel(formToModel(etat));
    const resultat = verifySection(resolu.section, resolu.action, resolu.norm, {
      mode: 'constant-N',
    });
    return resultat.M_Rd === null ? null : Math.hypot(resultat.M_Rd.y, resultat.M_Rd.z);
  } catch {
    return null;
  }
}

/**
 * Ouvre le panneau, en MATERIALISANT le ferraillage en barres explicites.
 *
 * CONVERSION SANS RETOUR, et annoncee comme telle. La saisie par lits retient
 * une INTENTION — « 4 HA20 en face inferieure » — que le fichier relit telle
 * quelle. Une liste de coordonnees ne la porte plus : elle porte le resultat.
 * Les deux ne peuvent pas coexister sans qu'on ait a decider laquelle gagne
 * quand elles se contredisent, et c'est la liberte de placement qui a ete
 * choisie ici — c'est ce que le panneau sert.
 */
function ouvrirDisposition(): void {
  const MRd = momentResistantCourant();

  try {
    const resolu = resolveModel(formToModel(etat));
    // `barresGenerees` et non `barresEnSaisie` : ces coordonnees viennent
    // d'etre calculees par le generateur de lits, pas lues dans un fichier.
    etat.barList = barresGenerees(
      resolu.section.rebars.map((r) => ({
        y: r.y,
        z: r.z,
        diameter: barDiameterOf(r.area),
      }))
    );
    etat.reinforcementKind = 'bars';
  } catch (e) {
    afficherErreur(
      'Le ferraillage actuel n est pas exploitable, il ne peut pas etre converti en barres : ' +
        (e instanceof Error ? e.message : String(e))
    );
    return;
  }

  const As = etat.barList.length === 0 ? 0 : (aireDesBarresSaisies() ?? 0);

  referenceDisposition = MRd === null ? null : { MRd, As, nombreDeBarres: etat.barList.length };
  panneauDisposition = true;

  // Les cotes du generateur sont pre-remplies sur la hauteur reelle de la
  // section, moins un enrobage d'axe : c'est l'intervalle ou des armatures de
  // peau ont un sens, et il n'a de valeur qu'ici — la ou la section est connue.
  prerremplirArmaturesDePeau();

  rendreFormulaire();
  recalculer();
}

/**
 * La distance d'axe laterale, deduite de l'enrobage deja saisi.
 *
 * `enrobage + Ø etrier + Ø/2`, exactement comme `faceSegment` : deux regles
 * differentes pour la meme distance produiraient des armatures de peau
 * decalees des lits d'angle, sur un dessin ou l'ecart se verrait.
 *
 * L'enrobage reste dans `FormState` apres le passage en barres libres, meme
 * si son champ n'est plus affiche : c'est ce qui permet de le retrouver ici.
 * A defaut, 30 mm — une valeur courante, et le panneau montre aussitot ou les
 * barres sont tombees.
 */
function distanceDAxeLaterale(diametre: number): number {
  const enrobage = nombreDeChamp(etat.cover) ?? 30;
  const etrier = nombreDeChamp(etat.stirrupDiameter) ?? 0;
  return enrobage + etrier + diametre / 2;
}

/** Cotes de depart et d'arrivee plausibles pour les armatures de peau. */
function prerremplirArmaturesDePeau(): void {
  const contour = contourCourant();
  if (contour === null) return;

  const zValues = contour.map((p) => p.z);
  const marge = distanceDAxeLaterale(nombreDeChamp(etat.peauDiameter) ?? 12);

  etat.peauZFrom = formatNumber(Math.min(...zValues) + marge, 0);
  etat.peauZTo = formatNumber(Math.max(...zValues) - marge, 0);
}

/**
 * Pose les armatures de peau demandees, en les AJOUTANT aux barres en place.
 *
 * Elles s'ajoutent et ne remplacent rien : c'est le geste — voir ce que des
 * armatures de peau changent, ou ne changent pas, au moment resistant. Les
 * chevauchements eventuels avec les barres d'angle sont signales par les
 * gardes plutot qu'evites en silence : l'intervalle est un choix, et le
 * corriger a la place de l'ingenieur lui cacherait qu'il l'a mal pose.
 */
function ajouterArmaturesDePeau(): void {
  const contour = contourCourant();
  const modele = (() => {
    try {
      return formToModel(etat);
    } catch {
      return null;
    }
  })();

  if (contour === null || modele === null || modele.geometry.kind !== 'rectangle') {
    afficherErreur(
      'Les armatures de peau ne sont posees que sur une section RECTANGULAIRE : sur un contour ' +
        'quelconque, « les deux faces laterales » n a pas de definition unique. Poser les barres ' +
        'une a une dans le tableau reste possible.'
    );
    return;
  }

  const nombre = nombreDeChamp(etat.peauCount);
  const diametre = nombreDeChamp(etat.peauDiameter);
  const zFrom = nombreDeChamp(etat.peauZFrom);
  const zTo = nombreDeChamp(etat.peauZTo);

  if (nombre === null || diametre === null || zFrom === null || zTo === null) {
    afficherErreur(
      'Armatures de peau : le nombre par face, le diametre et les deux cotes doivent tous etre ' +
        'renseignes.'
    );
    return;
  }

  try {
    const nouvelles = skinBars({
      width: modele.geometry.width,
      axisDistance: distanceDAxeLaterale(diametre),
      zFrom,
      zTo,
      countPerFace: nombre,
      diameter: diametre,
    });

    etat.barList = [...etat.barList, ...barresGenerees(nouvelles)];
    rendreFormulaire();
    recalculer();
  } catch (e) {
    afficherErreur(e instanceof Error ? e.message : String(e));
  }
}

/** Aire totale des barres saisies (mm²), ou `null` si la saisie n'est pas prete. */
function aireDesBarresSaisies(): number | null {
  const barres = barresEvaluees(etat.barList);
  if (barres === null) return null;
  return barres.reduce((somme, b) => somme + barArea(b.diameter), 0);
}

/** Le contour de la section courante, pour les gardes de placement. */
function contourCourant(): Array<{ y: number; z: number }> | null {
  try {
    return outlineOf(resolveModel(formToModel(etat)).section);
  } catch {
    return null;
  }
}

/**
 * Les defauts de placement, mis en forme.
 *
 * Ils ne BLOQUENT pas le calcul : une barre hors du contour donne un resultat
 * parfaitement calculable et parfaitement faux, et c'est justement pour cela
 * qu'il faut le dire fort. Refuser de calculer priverait en plus l'ingenieur
 * du reste de la page pendant qu'il corrige.
 */
function htmlDefautsDePlacement(): string {
  const barres = barresEvaluees(etat.barList);
  const contour = contourCourant();
  if (barres === null || contour === null) return '';

  const defauts = checkBarPlacement(contour, barres);
  if (defauts.length === 0) return '';

  return (
    '<ul class="defauts">' +
    defauts.map((d) => `<li>${echapper(d.message)}</li>`).join('') +
    '</ul>'
  );
}

/**
 * L'ecart a la disposition de reference — le coeur du panneau.
 *
 * `MRd` est PASSE et non recalcule : `recalculer()` vient de le determiner,
 * et une seconde verification complete couterait ici une centaine de
 * millisecondes a chaque frappe, pour rendre exactement le meme nombre.
 */
function htmlComparaison(MRd: number | null): string {
  if (referenceDisposition === null) {
    return `<p class="note">Aucune disposition de reference : le moment resistant n etait pas
      calculable a l ouverture du panneau. Les modifications s affichent alors en valeur
      absolue, sans ecart.</p>`;
  }

  const reference = referenceDisposition;
  const As = aireDesBarresSaisies();

  const ecart = (courant: number | null, initial: number, unite: string): string => {
    if (courant === null) return 'non calculable';
    const delta = courant - initial;
    const signe = delta > 0 ? '+' : '';
    const relatif = initial === 0 ? '' : ` (${signe}${formatNumber((100 * delta) / initial, 1)} %)`;
    return `${formatNumber(courant, 1)} ${unite} — ${signe}${formatNumber(delta, 1)}${relatif}`;
  };

  return `<div class="comparaison">
    ${ligne('Reference M_Rd', `${formatNumber(reference.MRd, 1)} kN.m`)}
    ${ligne('Actuel M_Rd', ecart(MRd, reference.MRd, 'kN.m'))}
    ${ligne('Reference A_s', `${formatNumber(reference.As, 0)} mm² — ${reference.nombreDeBarres} barres`)}
    ${ligne('Actuel A_s', `${ecart(As, reference.As, 'mm²')} — ${etat.barList.length} barres`)}
  </div>`;
}

/**
 * Le panneau de disposition.
 *
 * Il s'ajoute au cadre de ferraillage, qui porte deja le tableau des barres :
 * le panneau n'est donc pas un second editeur, c'est l'OUTILLAGE de celui qui
 * existe — le generateur d'armatures de peau, la comparaison a la reference,
 * et les gardes de placement.
 */
function blocDisposition(): string {
  if (!panneauDisposition) {
    return `<button type="button" data-action="ouvrir-disposition">Optimisation de la disposition</button>`;
  }

  return `<fieldset class="disposition">
    <legend>Optimisation de la disposition ${info(
      `Les armatures sont desormais des <strong>coordonnees</strong> : l intention de saisie
       (« 4 HA20 en face inferieure ») a ete materialisee et n est pas restituable. Chaque
       modification est comparee a la disposition figee a l <strong>ouverture</strong> du
       panneau. Fermer puis rouvrir refige la reference sur l etat courant.<br /><br />
       Les gardes sont <strong>geometriques</strong> : barre hors du contour, barres qui se
       chevauchent. Les distances libres du §8.2 et l enrobage du §4.4.1 ne sont
       <strong>pas</strong> verifies.`,
      'decisif'
    )}</legend>

    <p class="sous-titre">Armatures de peau</p>
    <div class="paire">
      ${champTexte('peauCount', 'Nombre par face', etat.peauCount)}
      ${champTexte('peauDiameter', 'Diametre (mm)', etat.peauDiameter)}
      ${champTexte('peauZFrom', 'z de (mm)', etat.peauZFrom)}
      ${champTexte('peauZTo', 'z a (mm)', etat.peauZTo)}
    </div>
    <button type="button" data-action="ajouter-peau">Ajouter les armatures de peau</button>

    <p class="sous-titre">Ecart a la disposition de reference</p>
    <div data-panneau-vivant></div>

    <button type="button" data-action="fermer-disposition">Fermer le panneau</button>
  </fieldset>`;
}

/**
 * Remplit la partie VIVANTE du panneau : l'ecart a la reference et les
 * defauts de placement.
 *
 * Hors de la construction du formulaire, et pour la meme raison que les
 * propositions de nombres de barres : une coordonnee se tape chiffre par
 * chiffre, et reconstruire le tableau arracherait le curseur de la cellule.
 * C'est justement pendant cette frappe que l'ecart doit se lire.
 */
function rafraichirPanneauDisposition(MRd: number | null): void {
  const contenant = document.querySelector<HTMLElement>('[data-panneau-vivant]');
  if (contenant === null) return;
  contenant.innerHTML = htmlComparaison(MRd) + htmlDefautsDePlacement();
}

/**
 * Un cadre de saisie qui n'existe que si sa verification est cochee.
 *
 * Rend la CHAINE VIDE quand elle ne l'est pas — le cadre n'est pas masque en
 * CSS, il n'est pas construit. Un champ masque reste dans le document, garde
 * sa valeur et continue d'alimenter le modele : la case n'aurait alors change
 * que l'apparence.
 */
function cadreSiCoche(coche: boolean, html: string): string {
  return coche ? html : '';
}

function htmlFormulaire(): string {
  // Les identifiants des bulles sont uniques DANS un rendu : le compteur
  // repart a chaque reconstruction du formulaire, sinon il croitrait sans fin
  // au fil des frappes qui changent la structure.
  compteurInfo = 0;

  return `
  <fieldset>
    <legend>Identification</legend>
    <label><span>Nom</span><input type="text" data-champ="name" value="${echapper(etat.name)}" /></label>
  </fieldset>

  ${blocVerifications()}

  <fieldset>
    <legend>Materiaux</legend>
    ${champTexte('fck', 'fck (MPa)', etat.fck)}
    ${champTexte('fyk', 'fyk (MPa)', etat.fyk)}
    ${champTexte('Es', 'Es (MPa)', etat.Es)}
    <p class="derive" id="derives"></p>
  </fieldset>

  <fieldset>
    <legend>Geometrie</legend>
    ${champChoix('geometryKind', 'Forme', etat.geometryKind, [
      ['rectangle', 'Rectangle'],
      ['polygon', 'Polygone'],
      ['circle', 'Cercle'],
    ])}
    ${blocGeometrie()}
  </fieldset>

  <fieldset>
    <legend>Ferraillage</legend>
    ${champChoix('reinforcementKind', 'Mode de saisie', etat.reinforcementKind, [
      ['rectangular-layout', 'Lits par faces'],
      ['circular-cage', 'Cage circulaire'],
      ['rows', 'Lits sur segments'],
      ['bars', 'Barres libres'],
    ])}
    ${blocFerraillage()}
    ${blocDisposition()}
  </fieldset>

  <fieldset>
    <legend>Sollicitation ${info(
      `Chemin de chargement : <strong>N constant</strong>, recalcule en continu.
       Le mode proportionnel et le trace du domaine My-Mz ne partent que sur
       demande — ils coutent de quelques dixiemes de seconde a quelques secondes.`
    )}</legend>
    ${champTexte('N', 'N (kN, positif en compression)', etat.N)}
    ${champTexte('My', 'My (kN.m)', etat.My)}
    ${champTexte('Mz', 'Mz (kN.m)', etat.Mz)}
    <button type="button" data-action="calculer-proportionnel">Calculer en proportionnel (quelques secondes)</button>
    <button type="button" data-action="tracer-domaine">Tracer le domaine My-Mz (une fraction de seconde)</button>
  </fieldset>

  ${cadreSiCoche(
    etat.checkShear || etat.checkDetailing,
    `<fieldset>
    <legend>Effort tranchant et dispositions (§6.2, §9) ${info(
      `Sections <strong>rectangulaires</strong> seulement ; ni precontrainte, ni torsion,
       ni bielles inclinees, ni verification au droit de l appui. Les valeurs du §9 sont
       celles <strong>recommandees</strong> par l EN 1992-1-1 : une annexe nationale peut
       les modifier.`
    )}</legend>
    ${champChoix(
      'elementType',
      `Type d element ${info(
        `Le type d element est <strong>declare</strong>, jamais devine : un 300&times;500
         est une poutre ou un poteau selon son role, et les regles du §9 different.`
      )}`,
      etat.elementType,
      [
        ['beam', 'Poutre'],
        ['slab', 'Dalle'],
        ['column', 'Poteau'],
      ]
    )}
    ${champTexte('V_Ed', 'V_Ed (kN)', etat.V_Ed)}
    <p class="sous-titre">Armatures d ame (vides = aucun cadre declare)</p>
    ${champTexte('Asw', 'A_sw, aire d un cours (mm²)', etat.Asw)}
    ${champTexte('sCadres', 'Espacement des cours s (mm)', etat.sCadres)}
    ${champTexte('fywk', 'f_ywk des cadres (MPa)', etat.fywk)}
    ${champTexte(
      'cotTheta',
      `cot theta (1 a 2,5) ${info(
        `<em>cot theta</em> est un <strong>arbitrage</strong>, pas une constante :
         2,5 minimise les cadres et sollicite le plus les bielles, 1 fait l inverse.`
      )}`,
      etat.cotTheta
    )}
  </fieldset>`
  )}

  ${cadreSiCoche(
    etat.checkService,
    `<fieldset>
    <legend>Sollicitations de service (ELS) ${info(
      `Combinaisons EN 1990 <strong>differentes de l ELU</strong> et differentes entre
       elles : reprendre le moment de l ELU serait faux d un facteur 1,35 a 1,5. Flexion
       droite uniquement — un seul moment M par combinaison. Laisser les deux champs d une
       combinaison vides la desactive.<br /><br />
       La combinaison <strong>caracteristique</strong> gouverne la limitation des contraintes
       (§7.2) ; la <strong>quasi-permanente</strong> gouverne l ouverture de fissures (§7.3)
       et la courbure (§7.4.3).`
    )}</legend>
    ${champTexte('serviceCarN', 'N caracteristique (kN)', etat.serviceCarN)}
    ${champTexte('serviceCarM', 'M caracteristique (kN.m)', etat.serviceCarM)}
    ${champTexte('serviceQpN', 'N quasi-permanent (kN)', etat.serviceQpN)}
    ${champTexte('serviceQpM', 'M quasi-permanent (kN.m)', etat.serviceQpM)}
  </fieldset>

  <fieldset>
    <legend>Parametres de service assumes ${info(
      `Ces trois-la sont des <strong>choix</strong>, pas des constantes normatives.
       Les autres coefficients (k1, k2, k3, kt…) restent a leurs valeurs recommandees.`
    )}</legend>
    ${champTexte(
      'serviceN',
      `n, coefficient d equivalence ${info(
        `<em>n</em> = 15 est conventionnel et n est <strong>pas prescrit sous cette forme</strong>
         par l EN 1992-1-1.`
      )}`,
      etat.serviceN
    )}
    ${champTexte(
      'crackWMax',
      `w_max (mm) ${info(
        `Depend de la <strong>classe d exposition</strong> — tableau 7.1N : 0,4 / 0,3 / 0,2 mm.`
      )}`,
      etat.crackWMax
    )}
    ${champTexte(
      'curvatureBeta',
      `beta, duree de chargement ${info(
        `<strong>0,5</strong> en charge de longue duree ou repetee, <strong>1,0</strong> en
         charge courte.`
      )}`,
      etat.curvatureBeta
    )}
    ${champChoix(
      'crackingMode',
      `Etat de fissuration ${info(
        `Le <strong>§7.1(2)</strong> tranche : la section est non fissuree tant que la traction
         du beton reste sous <em>f_ct,eff</em>. En <strong>etat I</strong> le beton tendu
         travaille et soulage les armatures ; en <strong>etat II</strong> il est integralement
         neglige et toute la traction passe dans l acier. Forcer un etat sert a l EXAMINER —
         ce n est alors plus le choix de la norme, et la note le dira.`,
        'decisif'
      )}`,
      etat.crackingMode,
      [
        ['auto', 'Automatique : critere du §7.1(2)'],
        ['uncracked', 'Forcer l etat I : beton tendu actif'],
        ['cracked', 'Forcer l etat II : beton tendu neglige'],
      ]
    )}
    ${champTexte(
      'crackingFctEff',
      `f_ct,eff du critere (MPa, vide = f_ctm a 28 jours) ${info(
        `⚠ A ne pas confondre avec le <em>f_ct,eff</em> du §7.3.2 plus bas, qui porte le meme nom
         et joue le role <strong>inverse</strong> : ici une valeur elevee <strong>retarde</strong>
         la fissuration, la-bas elle <strong>augmente</strong> l armature exigee.`
      )}`,
      etat.crackingFctEff
    )}
  </fieldset>`
  )}

  ${cadreSiCoche(
    etat.checkRestraint && etat.restraintReferential !== 'meyer',
    `<fieldset>
    <legend>Deformation genee — Zwang (§7.3.2)</legend>
    ${champChoix('restraintType', 'Nature de la gene', etat.restraintType, [
      ['central', 'Centree (retrait ou refroidissement empeches)'],
      ['bending', 'De flexion (gradient thermique au jeune age)'],
    ])}
    ${champTexte(
      'fctEff',
      `f_ct,eff (MPa, vide = f_ctm a 28 jours) ${info(
        `Le defaut est le cas <strong>defavorable</strong> : la fissuration des pieces massives
         survient a quelques jours, quand le beton n a pas atteint sa resistance a 28 jours.`
      )}`,
      etat.fctEff
    )}
    ${champTexte('sigmaSZwang', 'sigma_s (MPa, vide = f_yk)', etat.sigmaSZwang)}
    ${champChoix(
      'restraintMethod',
      `Methode de calcul de h_c,ef ${info(
        `Deux familles de formules. Le <strong>texte</strong> de l EN 1992-1-1 §7.3.2(3) donne
         <em>2,5·d1</em> ; la <strong>pratique allemande</strong> donne des branches selon
         <em>h/d1</em>, qui croissent avec l epaisseur. Sur un radier de 1,30 m, l ecart entre
         les deux vaut environ 43 % d armature.<br /><br />
         Ce choix est <strong>independant</strong> de la convention de <em>k</em> ci-dessous :
         <em>k</em> est un parametre d annexe nationale, <em>h_c,ef</em> est un choix de
         methode. « Branches allemandes, <em>k</em> de l annexe belge » est un cas
         parfaitement legitime.`,
        'decisif'
      )}`,
      etat.restraintMethod,
      [
        ['din', 'Pratique allemande — branches selon h/d1'],
        ['ec2', 'Texte EN 1992-1-1 §7.3.2(3) — 2,5·d1'],
      ]
    )}
    ${champChoix(
      'thicknessConvention',
      `Convention du facteur k ${info(
        `<em>k</em> est un <strong>parametre national</strong> : 1,00 &rarr; 0,65 en valeurs
         recommandees de l EC2, 0,80 &rarr; 0,50 en annexe allemande. En Belgique et au
         Luxembourg, la justification reglementaire reste l EN 1992-1-1 et ses annexes
         NBN / ILNAS.`,
        'decisif'
      )}`,
      etat.thicknessConvention,
      [
        ['ec2', 'EC2 recommande — 1,00 vers 0,65'],
        ['de', 'Annexe allemande — 0,80 vers 0,50'],
      ]
    )}
    <p class="sous-titre">Forcer des valeurs intermediaires ${info(
      `Un champ <strong>vide</strong> veut dire « calcule ». Une valeur saisie
       <strong>court-circuite sa formule</strong> et alimente la suite de la chaine : imposer
       <em>d1</em> change <em>h_c,ef</em>, imposer <em>f_ct,eff</em> change ce qui en depend.
       Toute valeur imposee est <strong>marquee</strong> dans les resultats et dans la note de
       calcul — une note qui presenterait une valeur forcee comme calculee ne serait
       verifiable par personne.<br /><br />
       Une valeur hors du domaine physique produit un <strong>avertissement</strong>, jamais un
       ecretage silencieux : ecreter vous retirerait la decision que vous venez de prendre.`
    )}</p>
    ${champTexte('impFctEff', 'f_ct,eff impose (MPa)', etat.impFctEff)}
    ${champTexte('impD1', 'd1 impose (mm)', etat.impD1)}
    ${champTexte('impHcEff', 'h_c,ef impose (mm)', etat.impHcEff)}
    ${champTexte('impK', 'k impose', etat.impK)}
    ${champTexte('impKc', 'k_c impose', etat.impKc)}
    ${champTexte('impAct', 'A_ct impose (mm²)', etat.impAct)}
    ${champTexte('impAcEff', 'A_c,ef impose, une face (mm²)', etat.impAcEff)}
    ${champTexte('impSigmaS', 'sigma_s impose (MPa)', etat.impSigmaS)}
  </fieldset>`
  )}

  ${cadreSiCoche(
    etat.checkRestraint && etat.restraintReferential !== 'ec2',
    `<fieldset>
    <legend>Elements massifs, methode Meyer (DIN 1045) ${info(
      `Methode <strong>allemande</strong>, distincte du §7.3.2 ci-dessus et qui ne le
       remplace pas : elle sert au <strong>pre-dimensionnement</strong> et au controle d ordre
       de grandeur, la justification reglementaire restant l EN 1992-1-1 et ses annexes
       nationales. Elle ne lit ni la geometrie ni le ferraillage — ses parametres sont les
       siens, et <em>h</em> comme <em>f_ctm</em> sont seulement <strong>pre-remplis</strong> a
       partir de la section au chargement.`
    )}</legend>
    ${champTexte('meyerH', 'h, epaisseur de l element (mm)', etat.meyerH)}
    ${champTexte('meyerD1', 'd1, enrobage a l AXE des barres (mm)', etat.meyerD1)}
    ${champTexte('meyerDs', 'ds, diametre des barres (mm)', etat.meyerDs)}
    ${champTexte('meyerWk', 'w_k visee (mm)', etat.meyerWk)}
    ${champTexte('meyerFctm', 'f_ctm a 28 jours (MPa)', etat.meyerFctm)}
    ${champTexte(
      'meyerKzt',
      `k_zt = f_ct,eff / f_ctm ${info(
        `<em>k_zt</em> est le parametre <strong>decisif</strong> de la methode. Le Zwang des
         pieces massives nait de la chaleur d <strong>hydratation</strong> et fissure a quelques
         jours, quand le beton est loin de son f_ctm a 28 jours : <em>k_zt</em> = 1,0 correspond
         a 28 jours, donne l armature la plus forte, et <strong>n est pas le cas courant</strong>.
         Valeurs usuelles : 0,4 / 0,5 / 0,6.`,
        'decisif'
      )}`,
      etat.meyerKzt
    )}
    ${champChoix(
      'meyerCas',
      `Sollicitation ${info(
        `Seule la famille <strong>traction / bridage exterieur</strong> a ete confrontee au
         diagramme de l ouvrage (a environ 3 % pres). La flexion et le bridage interieur sont
         derives de la meme formulation et n ont ete confrontes a rien.`
      )}`,
      etat.meyerCas,
      [
        ['traction', 'Traction : gene centree, deux faces armees'],
        ['flexion', 'Flexion : gene de flexion, une seule face tendue'],
      ]
    )}
    ${champChoix('meyerBridage', 'Origine du bridage', etat.meyerBridage, [
      ['exterieur', 'Exterieur : appuis, radier durci, reprise de betonnage'],
      ['interieur', 'Interieur : contraintes propres, gradient de peau'],
    ])}
    ${champChoix('meyerKmode', 'Interpolation du facteur k', etat.meyerKmode, [
      ['lineaire', 'Lineaire (0,80 a 0,50 entre 300 et 800 mm)'],
      ['parabolique', 'Parabolique (proposition de Meyer)'],
    ])}
  </fieldset>`
  )}

  <fieldset>
    <legend>Coefficients normatifs</legend>
    ${champTexte('gammaC', 'gamma_c', etat.gammaC)}
    ${champTexte('gammaS', 'gamma_s', etat.gammaS)}
    ${champTexte('alphaCc', 'alpha_cc', etat.alphaCc)}
    ${champTexte('nBands', 'Bandes d integration', etat.nBands)}
  </fieldset>

  <fieldset>
    <legend>Modele</legend>
    <button type="button" data-action="enregistrer">Enregistrer</button>
    <label class="large fichier"><span>Charger un modele</span><input type="file" accept="application/json,.json" data-action="charger" /></label>
  </fieldset>

  <fieldset class="sorties">
    <legend>Sorties ${info(
      `Les sorties decrivent le dernier calcul <strong>reussi</strong>. La note s ouvre dans un
       nouvel onglet, d ou le navigateur l imprime en PDF ; si l ouverture est bloquee, elle est
       telechargee. C est un <strong>compte rendu</strong> de calcul, pas une justification
       reglementaire signee.`
    )}</legend>
    <button type="button" data-action="exporter-dessins">Dessins (SVG)</button>
    <button type="button" data-action="exporter-resultats">Resultats (CSV)</button>
    <button type="button" data-action="exporter-note">Note de calcul (HTML imprimable)</button>
  </fieldset>`;
}


/**
 * Recapitulatif des lits tel que le produirait le generateur d'armatures,
 * pour l'afficher a cote de la saisie.
 *
 * Rend `null` des que la saisie n'est pas encore exploitable — un champ en
 * cours de frappe, une dimension manquante. On prefere n'afficher aucune
 * aire plutot qu'une aire fausse, et surtout ne pas transformer une saisie
 * intermediaire en message d'erreur.
 */
function recapitulatifDesLits(): string[] | null {
  try {
    if (etat.reinforcementKind === 'rectangular-layout') {
      const modele = formToModel(etat);
      if (modele.geometry.kind !== 'rectangle') return null;
      if (modele.reinforcement.kind !== 'rectangular-layout') return null;
      const layout = rectangularRebarLayout({
        width: modele.geometry.width,
        height: modele.geometry.height,
        cover: modele.reinforcement.cover,
        stirrupDiameter: modele.reinforcement.stirrupDiameter,
        steel: resoudreAcier(modele),
        rows: modele.reinforcement.rows,
      });
      return layout.rows.map(formatRow);
    }

    if (etat.reinforcementKind === 'rows') {
      const modele = formToModel(etat);
      if (modele.reinforcement.kind !== 'rows') return null;
      const acier = resoudreAcier(modele);
      return modele.reinforcement.rows.map((row) =>
        formatRow(
          rebarRow({
            from: row.from,
            to: row.to,
            bars: row.bars,
            steel: acier,
            endpoints: row.endpoints,
          }).summary
        )
      );
    }

    return null;
  } catch {
    return null;
  }
}

function resoudreAcier(modele: SectionModel) {
  return resolveModel(modele).steel;
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
    `<text x="${fleche + police * 0.3}" y="${police * 0.35}" class="repere-texte" font-size="${police}">y</text>` +
    `<line x1="0" y1="0" x2="0" y2="${fleche}" class="repere" stroke-width="${trait}" />` +
    `<line x1="0" y1="${fleche}" x2="${-fleche * 0.11}" y2="${fleche - fleche * 0.22}" class="repere" stroke-width="${trait}" />` +
    `<line x1="0" y1="${fleche}" x2="${fleche * 0.11}" y2="${fleche - fleche * 0.22}" class="repere" stroke-width="${trait}" />` +
    `<text x="${police * 0.3}" y="${fleche + police}" class="repere-texte" font-size="${police}">z</text>` +
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
 * La legende du trace, SEPAREE du SVG.
 *
 * `dessiner()` rend desormais le SVG seul : c est ce SVG-la, et lui seul, qui
 * part a l export. La legende est du HTML, elle accompagne le dessin dans la
 * page et n a rien a faire dans un fichier `.svg`.
 */
const LEGENDE_SECTION =
  '<p class="legende"><span class="c">zone comprimee</span><span class="t">zone tendue</span>' +
  '<span class="n">axe neutre</span><span>cercles : resultantes, reliees par le bras de levier</span>' +
  '<span>origine du repere au centroide, y vers la droite, z vers le bas</span></p>';

// --- Diagrammes d'interaction ----------------------------------------------

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
function dessinerDiagrammeNM(resolu: ResolvedModel): { svg: string; html: string } {
  const points = interactionDiagramNM(resolu.section, resolu.norm, { steps: 120 });
  const N = resolu.action.N;
  const My = resolu.action.My;
  const Mz = resolu.action.Mz;

  const svg = plotSvg([{ points: points.map((p) => ({ x: p.N, y: p.M })), classe: 'plot-domaine' }], {
    xLabel: 'N (kN, positif en compression)',
    yLabel: 'My (kN.m)',
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
      ? `<p class="note"><strong>Flexion deviee</strong> (Mz = ${formatNumber(Mz, 1)} kN.m) :
         le point sollicitant ne se trouve pas dans le plan de ce graphe, qui ne peut donc
         pas rendre le verdict. C'est le domaine My-Mz ci-dessous qui fait foi.</p>`
      : '';

  // Le SVG est rendu A COTE du balisage : c est lui qu on exporte, sans le
  // titre ni les legendes, qui sont du HTML.
  return { svg, html: `<h2>Diagramme d'interaction N-My</h2>${svg}${limites}${avertissement}` };
}

/**
 * Domaine resistant dans le plan des moments, a effort normal FIXE.
 *
 * Ne part JAMAIS au recalcul automatique. `interactionCurveAtN` enchaine une
 * resolution droite par point : 77 a 380 ms pour 24 a 72 points (mesure du
 * 2026-09-04), l'ordre de grandeur d'une verification complete. Le declencher
 * a chaque frappe figerait la page — c'est exactement la regression du mode
 * proportionnel du 2026-09-04. Bouton, et rien d'autre.
 */
function dessinerDomaineMyMz(resolu: ResolvedModel, resultat: VerificationResult): string {
  const N = resolu.action.N;
  const PAS = 72;
  const points = interactionCurveAtN(resolu.section, N, resolu.norm, { steps: PAS });

  const titre = `<h2>Domaine My-Mz a N = ${formatNumber(N, 1)} kN</h2>`;

  // Un domaine vide est un RESULTAT, pas une panne : l'effort normal sort de
  // la plage resistante quelle que soit l'orientation de l'axe neutre.
  if (points.length === 0) {
    return (
      `<div id="domaine-mymz">${titre}` +
      `<p class="motif">Aucun point du domaine n'existe a cet effort normal :
       la section est depassee en compression ou en traction avant toute flexion.</p></div>`
    );
  }

  // Cette courbe-ci EST fermee — le noyau balaye l'inclinaison de l'axe neutre
  // sur un tour complet et ne repete pas le premier point, a charge pour
  // l'appelant de refermer. On ne referme donc que si le tour est COMPLET :
  // s'il manque des points, c'est qu'une orientation n'a pas de solution, et
  // le trou doit rester visible plutot que d'etre enjambe par un raccord.
  const tourComplet = points.length === PAS;
  const trace = points.map((p) => ({ x: p.My, y: p.Mz }));
  if (tourComplet) trace.push(trace[0]);

  // Lecture geometrique du taux d'exploitation : `M_Rd` est la capacite
  // COLINEAIRE a la sollicitation, donc le rayon du domaine dans sa direction.
  // Le rapport des deux longueurs est le taux affiche a cote — la meme
  // grandeur lue deux fois. Si elles divergent a l'ecran, c'est un bug.
  const rayon =
    resultat.M_Rd !== null
      ? [{ a: { x: 0, y: 0 }, b: { x: resultat.M_Rd.y, y: resultat.M_Rd.z }, classe: 'plot-rayon' }]
      : [];

  const svg = plotSvg([{ points: trace, classe: 'plot-domaine' }], {
    xLabel: 'My (kN.m)',
    yLabel: 'Mz (kN.m)',
    markers: [
      {
        point: { x: resolu.action.My, y: resolu.action.Mz },
        classe: 'plot-sollicitation',
        libelle: 'sollicitation',
      },
    ],
    segments: rayon,
  });

  const legende =
    '<p class="legende">' +
    `<span>trace a N = ${formatNumber(N, 1)} kN constant</span>` +
    '<span>le rayon en tirets va de l origine a la capacite : le rapport des deux longueurs est le taux</span>' +
    (tourComplet ? '' : '<span>contour incomplet : certaines orientations n ont pas de solution</span>') +
    '</p>';

  return `<div id="domaine-mymz">${titre}${svg}${legende}</div>`;
}

// --- Resultat ---------------------------------------------------------------

function ligne(libelle: string, valeur: string): string {
  return `<div class="ligne"><span>${libelle}</span><strong>${valeur}</strong></div>`;
}

function groupe(titre: string, lignes: string[]): string {
  const contenu = lignes.filter((l) => l !== '').join('');
  return contenu === '' ? '' : `<div class="groupe"><h3>${titre}</h3>${contenu}</div>`;
}

function htmlResultat(
  resolu: ResolvedModel,
  resultat: VerificationResult,
  etatAxe: NeutralAxisState | null
): string {
  const taux = resultat.utilization;
  const verdict = resultat.ok
    ? `<p class="verdict ok">Verifie — taux ${formatUtilization(taux)}</p>`
    : `<p class="verdict non-ok">Non verifie — taux ${formatUtilization(taux)}</p>`;

  // Jauge : le taux lu d'un coup d'oeil, plafonnee visuellement a 100 % pour
  // rester lisible quand la section est tres largement depassee.
  const remplissage = Number.isFinite(taux) ? Math.min(taux, 1) * 100 : 100;
  const jauge = `<div class="jauge${resultat.ok ? '' : ' depasse'}"><div style="width:${remplissage.toFixed(1)}%"></div></div>`;

  const magnitudeSollicitante = Math.hypot(resolu.action.My, resolu.action.Mz);
  const magnitudeResistante = resultat.M_Rd
    ? Math.hypot(resultat.M_Rd.y, resultat.M_Rd.z)
    : null;

  const aireBeton = polygonArea(outlineOf(resolu.section));
  const aireAcier = resolu.section.rebars.reduce((somme, r) => somme + r.area, 0);

  const sollicitation = groupe('Sollicitation', [
    ligne('Effort normal N', `${formatNumber(resolu.action.N, 1)} kN`),
    ligne(
      'Moment sollicitant',
      `${formatNumber(magnitudeSollicitante, 1)} kN.m — My ${formatNumber(resolu.action.My, 1)}, Mz ${formatNumber(resolu.action.Mz, 1)}`
    ),
    ligne('Chemin de chargement', resultat.mode === 'constant-N' ? 'N constant' : 'proportionnel'),
  ]);

  const resistance = groupe('Resistance', [
    magnitudeResistante !== null
      ? ligne('Moment resistant', `${formatNumber(magnitudeResistante, 1)} kN.m`)
      : '',
    resultat.M_Rd
      ? ligne(
          'Composantes M_Rd',
          `My ${formatNumber(resultat.M_Rd.y, 1)}, Mz ${formatNumber(resultat.M_Rd.z, 1)} kN.m`
        )
      : '',
    magnitudeResistante !== null && magnitudeResistante > 0
      ? ligne(
          'Marge disponible',
          `${formatNumber(magnitudeResistante - magnitudeSollicitante, 1)} kN.m`
        )
      : '',
  ]);

  // Hauteur utile mesuree perpendiculairement a l'axe neutre, d'ou le bras
  // de levier simplifie des abaques.
  const hauteurUtile =
    resultat.neutralAxis === null
      ? null
      : effectiveDepth(resolu.section, resultat.neutralAxis.angle, resultat.neutralAxis.offset);

  const equilibre = groupe('Equilibre de la section', [
    resultat.neutralAxis
      ? ligne('Inclinaison de l axe neutre', `${formatAngleDegrees(resultat.neutralAxis.angle)} deg`)
      : '',
    resultat.neutralAxis
      ? ligne('Position de l axe neutre', `${formatNumber(resultat.neutralAxis.offset, 1)} mm`)
      : '',
    etatAxe?.compression
      ? ligne(
          'Resultante de compression',
          `${formatNumber(etatAxe.compression.force, 0)} kN a z = ${formatNumber(etatAxe.compression.z, 1)} mm`
        )
      : '',
    etatAxe?.tension
      ? ligne(
          'Resultante de traction',
          `${formatNumber(etatAxe.tension.force, 0)} kN a z = ${formatNumber(etatAxe.tension.z, 1)} mm`
        )
      : '',
    resultat.leverArm !== null
      ? ligne('Distance entre resultantes', `${formatNumber(resultat.leverArm, 1)} mm`)
      : '',
    hauteurUtile !== null
      ? ligne('Hauteur utile d', `${formatNumber(hauteurUtile, 1)} mm`)
      : '',
    hauteurUtile !== null && etatAxe !== null
      ? ligne(
          'Bras de levier z = d − 0,4x',
          `${formatNumber(simplifiedLeverArm(hauteurUtile, etatAxe.x), 1)} mm`
        )
      : '',
  ]);

  const materiaux = groupe('Materiaux', [
    ligne('fcd', `${formatNumber(resolu.concrete.fcd, 2)} MPa`),
    ligne('fyd', `${formatNumber(resolu.steel.fyd, 1)} MPa`),
    ligne('Aire de beton', `${formatNumber(aireBeton, 0)} mm²`),
  ]);

  // Separation inferieures / superieures par rapport au centroide, et non
  // par rapport a l'axe neutre : c'est la lecture du plan de ferraillage,
  // celle qu'attend l'utilisateur quand il verifie sa saisie.
  const inferieures = resolu.section.rebars.filter((r) => r.z > 0);
  const superieures = resolu.section.rebars.filter((r) => r.z <= 0);
  const aire = (barres: typeof inferieures): number =>
    barres.reduce((somme, r) => somme + r.area, 0);

  // Armatures TENDUES : celles du cote tendu de l'axe neutre. C'est sur
  // elles seules que porte le ratio d'acier demande.
  const axeNeutre = resultat.neutralAxis;
  const tendues =
    axeNeutre === null
      ? []
      : resolu.section.rebars.filter(
          (r) => zetaOf({ y: r.y, z: r.z }, axeNeutre.angle) > axeNeutre.offset
        );
  const aireTendue = aire(tendues);

  // Ratio pondere : par metre courant, le volume d'acier vaut As x 1 m et le
  // volume de beton Ac x 1 m, donc le rapport des aires suffit — multiplie
  // par la masse volumique de l'acier.
  const MASSE_VOLUMIQUE_ACIER = 7850; // kg/m³
  const ratioTendu = aireBeton > 0 ? (aireTendue / aireBeton) * MASSE_VOLUMIQUE_ACIER : 0;

  const ferraillage = groupe('Ferraillage', [
    ligne(
      'Armatures inferieures',
      `${inferieures.length} barres, ${formatNumber(aire(inferieures), 0)} mm²`
    ),
    ligne(
      'Armatures superieures',
      `${superieures.length} barres, ${formatNumber(aire(superieures), 0)} mm²`
    ),
    ligne('Total', `${resolu.section.rebars.length} barres, ${formatNumber(aireAcier, 0)} mm²`),
    aireBeton > 0
      ? ligne('Taux d armature total', `${formatNumber((100 * aireAcier) / aireBeton, 2)} %`)
      : '',
    axeNeutre !== null
      ? ligne(
          'Armatures tendues',
          `${tendues.length} barres, ${formatNumber(aireTendue, 0)} mm²`
        )
      : '',
    axeNeutre !== null && aireBeton > 0
      ? ligne('Ratio acier tendu', `${formatNumber(ratioTendu, 1)} kg/m³ de beton`)
      : '',
  ]);

  const note =
    resultat.leverArm !== null
      ? `<p class="note"><strong>Deux bras de levier, deux definitions.</strong>
         La <em>distance entre resultantes</em> separe les resultantes de compression et de traction
         TOTALES, toutes armatures comprises : elle se raccourcit des qu'une seconde nappe se trouve
         du cote tendu, meme faiblement sollicitee. Le <em>z = d &minus; 0,4x</em> est celui des abaques,
         fonde sur le bloc rectangulaire et sur la seule nappe la plus eloignee. Les deux sont exacts
         et ne mesurent pas la meme chose.</p>`
      : '';

  const motif = resultat.reason ? `<p class="motif">${echapper(resultat.reason)}</p>` : '';

  return verdict + jauge + sollicitation + resistance + equilibre + materiaux + ferraillage + note + motif;
}

// --- Verifications de service -----------------------------------------------

/**
 * Les trois verifications de service (§7.2, §7.3, §7.4.3) partent AVEC le
 * reste, sans bouton : 9 a 24 ms chacune (mesure du 2026-09-05), negligeable
 * devant les 25 a 120 ms du recalcul ELU. Rien ici ne ressemble au piege du
 * mode proportionnel, qui coute des secondes.
 *
 * Aucun calcul dans ce bloc : il lit les sollicitations resolues, appelle les
 * modules et confie la mise en forme a `service-view.ts`.
 */

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
  const lignes = bloc.lignes.map((l) => ligne(echapper(l.libelle), echapper(l.valeur))).join('');

  const verdict =
    bloc.verdict === null
      ? ''
      : `<p class="verdict bloc ${bloc.verdict.ok ? 'ok' : 'non-ok'}">${echapper(bloc.verdict.texte)}</p>`;

  // Une note qui accompagne un verdict DEFAVORABLE est le motif de l'echec ;
  // partout ailleurs c'est une precision — l'avertissement « pas une fleche »
  // en tete. Deux styles, pour deux lectures qui n'appellent pas la meme
  // reaction.
  const classeNote = bloc.verdict !== null && !bloc.verdict.ok ? 'motif' : 'note';
  const note = bloc.note === null ? '' : `<p class="${classeNote}">${echapper(bloc.note)}</p>`;

  return `<div class="groupe bloc" data-bloc="${cle}"><h3>${echapper(bloc.titre)}</h3>${lignes}${verdict}${note}</div>`;
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
            `Sollicitation deviee (Mz = ${formatNumber(resolu.action.Mz, 1)} kN·m). ` +
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
  const deviee = note === null ? '' : `<p class="note note-deviee">${echapper(note)}</p>`;

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
    `<div id="verifications"><h2>${titre}</h2>${referentiel}` +
    blocs.map((b) => htmlBlocService(b.bloc, b.cle)).join('') +
    '</div>'
  );
}

// --- Boucle de calcul -------------------------------------------------------

const zoneSaisie = document.querySelector<HTMLElement>('#saisie');
const zoneSection = document.querySelector<HTMLElement>('#section');
const zoneDiagramme = document.querySelector<HTMLElement>('#diagramme');
const zoneResultat = document.querySelector<HTMLElement>('#resultat');

function afficherErreur(message: string): void {
  if (!zoneResultat) return;
  // L'erreur s'ajoute au dernier resultat valide, elle ne l'efface pas : on
  // doit voir a la fois ce qui bloque et ce qu'on avait.
  zoneResultat.innerHTML = `<p class="erreur">${echapper(message)}</p>${dernierResultat}`;
}

function recalculer(mode?: 'proportional'): void {
  if (!zoneResultat || !zoneSection) return;

  let modele: SectionModel;
  let parametres: ParametresService;
  try {
    modele = formToModel(etat);
    parametres = parametresDeService(etat);
  } catch (e) {
    afficherErreur(e instanceof FormError ? e.message : String(e));
    return;
  }

  try {
    const resolu = resolveModel(modele);
    // Le recalcul automatique est TOUJOURS en « N constant ». Le mode
    // proportionnel coute plusieurs secondes — 3,3 s sur une dalle courante
    // contre 0,27 s — et il est synchrone : le declencher a chaque frappe
    // fige la page, ce qui se lit a l'ecran comme des valeurs qui ne se
    // mettent plus a jour. Il ne part donc que sur action explicite.
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

    const blocsEtat = checks.sectionState ? [blocDeLEtatSection(resolu)] : [];
    const blocsService = checks.service ? blocsDeService(resolu, parametres) : [];
    const blocsVerifications = blocsDeVerifications(
      resolu,
      parametresVerifications,
      parametresMeyer,
      checks
    );

    dernierResultat =
      htmlResultat(resolu, resultat, etatAxe) +
      htmlEtatSection(blocsEtat) +
      (checks.service ? htmlService(resolu.action.Mz, blocsService) : '') +
      htmlVerifications(blocsVerifications, checks);
    const svgSection = dessiner(resolu, resultat, etatAxe);
    zoneResultat.innerHTML = dernierResultat;
    zoneSection.innerHTML = svgSection + LEGENDE_SECTION;

    // Le domaine My-Mz eventuellement trace n'est PAS reconduit : il vaut pour
    // un effort normal fixe, que la saisie vient peut-etre de changer.
    const diagramme = dessinerDiagrammeNM(resolu);
    dernierDiagramme = diagramme.html;
    if (zoneDiagramme) zoneDiagramme.innerHTML = dernierDiagramme;

    // L'etat exportable est fige ICI, sur un calcul REUSSI. Les sorties ne
    // peuvent donc jamais decrire une saisie fautive, et restent disponibles
    // pendant qu'un champ est en cours de frappe.
    derniereSortie = {
      modele,
      resolu,
      parametres,
      blocs: [...blocsEtat, ...blocsService, ...blocsVerifications].map((b) => b.bloc),
      dessins: [
        { suffixe: 'section', svg: svgSection },
        { suffixe: 'diagramme-n-my', svg: diagramme.svg },
      ],
    };

    const derives = document.querySelector('#derives');
    if (derives) {
      derives.textContent = `fcd = ${formatNumber(resolu.concrete.fcd, 2)} MPa — fyd = ${formatNumber(resolu.steel.fyd, 1)} MPa`;
    }

    // Les propositions de nombres de barres et les recapitulatifs de lits
    // sont remplis ICI, hors de la construction du formulaire : ils doivent
    // suivre la frappe, et reconstruire le formulaire arracherait le curseur.
    rafraichirOptionsDeLits();

    // Le moment resistant est celui qui vient d'etre calcule, jamais un
    // second calcul : le panneau lit ce que la page vient d'etablir.
    rafraichirPanneauDisposition(
      resultat.M_Rd === null ? null : Math.hypot(resultat.M_Rd.y, resultat.M_Rd.z)
    );

    sauvegarderLocalement(modele);
  } catch (e) {
    afficherErreur(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Trace le domaine My-Mz par-dessus le diagramme N-M deja affiche.
 *
 * Le domaine n'est PAS memorise : le prochain recalcul automatique le fera
 * disparaitre, et c'est voulu. Il est trace a un effort normal fixe ; le
 * garder a l'ecran apres un changement de sollicitation montrerait un domaine
 * qui n'est plus celui du calcul affiche a cote.
 */
function tracerDomaine(): void {
  if (!zoneDiagramme) return;

  try {
    const resolu = resolveModel(formToModel(etat));
    const resultat = verifySection(resolu.section, resolu.action, resolu.norm, {
      mode: 'constant-N',
    });

    dernierDiagramme = dessinerDiagrammeNM(resolu).html;
    zoneDiagramme.innerHTML = dernierDiagramme + dessinerDomaineMyMz(resolu, resultat);
  } catch (e) {
    afficherErreur(e instanceof FormError ? e.message : String(e));
    zoneDiagramme.innerHTML = dernierDiagramme;
  }
}

let minuterie: number | undefined;
function recalculerBientot(): void {
  // Delai d'apaisement : une verification coute de 25 a 120 ms selon la
  // section, confortable au clavier mais inutile a relancer a chaque frappe.
  window.clearTimeout(minuterie);
  minuterie = window.setTimeout(() => recalculer(), 200);
}

function rendreFormulaire(): void {
  if (!zoneSaisie) return;
  zoneSaisie.innerHTML = htmlFormulaire();
  // Le formulaire sort avec ses contenants de propositions VIDES : on les
  // remplit tout de suite, sans attendre le prochain recalcul.
  rafraichirOptionsDeLits();
}

// --- Sorties ----------------------------------------------------------------

/**
 * Ce qui fait sortir de la page ce qu'elle calcule.
 *
 * Rien ne se COMPOSE ici : les documents sont assembles par `export.ts`, qui
 * est pur, et le telechargement vit dans `storage.ts`. Ce bloc ne fait que
 * nommer les fichiers et choisir le canal.
 */

/** Base de nom de fichier, tiree du nom du modele. */
function baseDeNom(modele: SectionModel): string {
  const brut = (modele.name ?? 'section').replace(/[^\w-]+/g, '-').toLowerCase();
  return brut.replace(/^-+|-+$/g, '') || 'section';
}

/** La date en ISO : la seule graphie qui se lise sans ambiguite. */
function dateDuJour(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Un fichier par dessin.
 *
 * Un document SVG porte UN dessin : la section et le diagramme sortent donc
 * separement, chacun autonome. Qui veut les deux dans un seul document a la
 * note de calcul, qui les porte tous.
 */
function exporterDessins(sortie: EtatExportable): void {
  for (const dessin of sortie.dessins) {
    telecharger(
      `${baseDeNom(sortie.modele)}-${dessin.suffixe}.svg`,
      svgAutonome(dessin.svg, STYLES_TRACE),
      'image/svg+xml;charset=utf-8'
    );
  }
}

/** Les donnees d'entree ET les verifications : un tableau qui se lit seul. */
function exporterResultats(sortie: EtatExportable): void {
  const entrees = blocsDEntree(sortie.modele, sortie.resolu, sortie.parametres);
  telecharger(
    `${baseDeNom(sortie.modele)}-resultats.csv`,
    resultatsEnCsv([...entrees, ...sortie.blocs]),
    'text/csv;charset=utf-8'
  );
}

function exporterNote(sortie: EtatExportable): void {
  const html = noteDeCalculHtml(
    {
      titre: sortie.modele.name ?? 'Section',
      date: dateDuJour(),
      entrees: blocsDEntree(sortie.modele, sortie.resolu, sortie.parametres),
      // Les dessins DEJA produits, jamais redessines.
      dessins: sortie.dessins.map((d) => d.svg),
      verifications: sortie.blocs,
      hypotheses: hypothesesDeLaNote(sortie.resolu),
    },
    STYLES_NOTE
  );
  const nom = `${baseDeNom(sortie.modele)}-note.html`;

  let onglet: Window | null = null;
  try {
    onglet = window.open('', '_blank') ?? null;
  } catch {
    onglet = null;
  }

  // L'ouverture d'onglet est bloquee par defaut chez beaucoup d'utilisateurs.
  // Un bouton qui ne fait rien SANS RIEN DIRE est pire qu'un telechargement
  // inattendu : on retombe alors sur le fichier.
  if (onglet === null) {
    telecharger(nom, html, 'text/html;charset=utf-8');
    return;
  }

  try {
    onglet.document.write(html);
    onglet.document.close();
  } catch {
    telecharger(nom, html, 'text/html;charset=utf-8');
  }
}

const SANS_CALCUL_A_EXPORTER =
  'Aucun calcul valide a exporter. Les sorties decrivent le dernier calcul reussi : corriger ' +
  'la saisie, puis reessayer.';

function exporter(action: string): void {
  if (derniereSortie === null) {
    afficherErreur(SANS_CALCUL_A_EXPORTER);
    return;
  }

  if (action === 'exporter-dessins') exporterDessins(derniereSortie);
  else if (action === 'exporter-resultats') exporterResultats(derniereSortie);
  else if (action === 'exporter-note') exporterNote(derniereSortie);
}

// --- Cablage des evenements -------------------------------------------------

/**
 * Aligne le mode de ferraillage et ses champs sur la geometrie choisie.
 *
 * Sans cela, passer d'un rectangle a un cercle laisserait un ferraillage
 * « par faces », que le format refuse a juste titre : l'utilisateur verrait
 * une erreur au moment ou il change de forme, alors qu'il n'a rien fait de
 * fautif. Les champs de la nouvelle forme sont remplis de valeurs usuelles
 * s'ils sont vides — jamais ecrases s'ils portent deja une saisie.
 */
function accorderFerraillageAGeometrie(): void {
  if (etat.geometryKind === 'rectangle' && etat.reinforcementKind !== 'rectangular-layout') {
    etat.reinforcementKind = 'rectangular-layout';
    if (etat.rows.length === 0) {
      etat.rows = [
        { face: 'bottom', diameter: '20', useSpacing: false, count: '3', maxSpacing: '' },
        { face: 'top', diameter: '20', useSpacing: false, count: '3', maxSpacing: '' },
      ];
    }
  }

  if (etat.geometryKind === 'circle' && etat.reinforcementKind !== 'circular-cage') {
    etat.reinforcementKind = 'circular-cage';
    if (etat.cageBarDiameter.trim() === '') etat.cageBarDiameter = '20';
    if (etat.cageCount.trim() === '') etat.cageCount = '8';
  }

  if (
    etat.geometryKind === 'polygon' &&
    etat.reinforcementKind !== 'rows' &&
    etat.reinforcementKind !== 'bars'
  ) {
    etat.reinforcementKind = 'rows';
  }
}

/** Remplit les champs de la geometrie choisie s'ils sont vides. */
function completerGeometrie(): void {
  if (etat.geometryKind === 'rectangle') {
    if (etat.width.trim() === '') etat.width = '400';
    if (etat.height.trim() === '') etat.height = '400';
  } else if (etat.geometryKind === 'circle') {
    if (etat.diameter.trim() === '') etat.diameter = '600';
    if (etat.cover.trim() === '') etat.cover = '50';
  } else if (etat.vertices.trim() === '') {
    etat.vertices = '0 ; 0\n400 ; 0\n400 ; 400\n0 ; 400';
  }
}

function appliquerSaisie(cible: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): void {
  const champ = cible.dataset.champ;
  if (!champ) return;

  const valeur =
    cible instanceof HTMLInputElement && cible.type === 'checkbox' ? cible.checked : cible.value;

  const indexLit = cible.dataset.lit;
  const indexLibre = cible.dataset.libre;
  const indexBarre = cible.dataset.barre;

  if (indexLit !== undefined) {
    const lit = etat.rows[Number(indexLit)];
    if (lit) Object.assign(lit, { [champ]: valeur });
  } else if (indexLibre !== undefined) {
    const lit = etat.freeRows[Number(indexLibre)];
    if (lit) Object.assign(lit, { [champ]: valeur });
  } else if (indexBarre !== undefined) {
    // Une CELLULE du tableau de barres. La valeur reste une chaine : un champ
    // momentanement vide, ou reduit au signe moins qu'on vient de taper, est
    // un etat normal de la frappe et ne doit pas effacer la barre.
    const barre = etat.barList[Number(indexBarre)];
    if (barre) Object.assign(barre, { [champ]: valeur });
  } else {
    Object.assign(etat, { [champ]: valeur });
  }

  // Un changement de structure (forme, mode de saisie, case a cocher qui
  // change les champs affiches) impose de reconstruire le formulaire ; une
  // simple frappe ne doit pas le faire, sous peine de perdre le focus.
  if (champ === 'geometryKind') {
    completerGeometrie();
    accorderFerraillageAGeometrie();
  }

  if (cible.dataset.structure === '1') {
    rendreFormulaire();
    recalculer();
  } else {
    recalculerBientot();
  }
}

document.addEventListener('input', (evenement) => {
  const cible = evenement.target;
  if (
    cible instanceof HTMLInputElement ||
    cible instanceof HTMLSelectElement ||
    cible instanceof HTMLTextAreaElement
  ) {
    if (cible.dataset.champ) appliquerSaisie(cible);
  }
});

document.addEventListener('change', (evenement) => {
  const cible = evenement.target;
  if (cible instanceof HTMLInputElement && cible.dataset.action === 'charger') {
    const fichier = cible.files?.[0];
    if (!fichier) return;
    lireFichier(fichier)
      .then((modele) => {
        etat = modelToForm(modele);
        rendreFormulaire();
        recalculer();
      })
      .catch((e: unknown) => {
        // Le message du noyau nomme le champ fautif : on l'affiche tel quel.
        afficherErreur(e instanceof Error ? e.message : String(e));
      });
  }
});

/** Libere la note epinglee, s'il y en a une. Une seule l'est a la fois. */
function fermerInfos(): void {
  document.querySelectorAll('.info-bouton[aria-expanded="true"]').forEach((bouton) => {
    bouton.setAttribute('aria-expanded', 'false');
  });
}

document.addEventListener('keydown', (evenement) => {
  if (evenement.key === 'Escape') fermerInfos();
});

document.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement)) return;

  // Un clic hors d'une note la libere : sans cela, une note epinglee resterait
  // en travers de la saisie qu'elle explique.
  if (!cible.closest('.info')) fermerInfos();

  const action = cible.dataset.action;
  if (!action) return;

  if (action === 'info') {
    // Le survol suffit a lire une note ; le clic la MAINTIENT ouverte — c'est
    // le seul geste possible sur un ecran tactile, et le seul confortable
    // quand on la relit en saisissant.
    const ouvert = cible.getAttribute('aria-expanded') === 'true';
    fermerInfos();
    if (!ouvert) cible.setAttribute('aria-expanded', 'true');
    return;
  }

  if (action === 'ajouter-lit') {
    etat.rows.push({ face: 'bottom', diameter: '20', useSpacing: false, count: '2', maxSpacing: '' });
    rendreFormulaire();
    recalculer();
  } else if (action === 'supprimer-lit') {
    etat.rows.splice(Number(cible.dataset.lit), 1);
    rendreFormulaire();
    recalculer();
  } else if (action === 'ajouter-libre') {
    etat.freeRows.push({
      fromY: '0', fromZ: '0', toY: '100', toZ: '0',
      diameter: '20', useSpacing: false, count: '2', maxSpacing: '',
      excludeEndpoints: false,
    });
    rendreFormulaire();
    recalculer();
  } else if (action === 'ouvrir-disposition') {
    ouvrirDisposition();
  } else if (action === 'fermer-disposition') {
    // Les barres restent : la conversion etait sans retour, et fermer le
    // panneau ne rend pas les lits par face. Seul l'outillage se retire.
    panneauDisposition = false;
    rendreFormulaire();
    recalculer();
  } else if (action === 'ajouter-peau') {
    ajouterArmaturesDePeau();
  } else if (action === 'ajouter-barre') {
    // La nouvelle barre nait au centroide, avec le diametre du generateur de
    // peau : deux valeurs visibles et manifestement a corriger, plutot qu'une
    // position plausible qu'on oublierait de revoir.
    etat.barList.push({ y: '0', z: '0', diameter: etat.peauDiameter || '12' });
    rendreFormulaire();
    recalculer();
  } else if (action === 'supprimer-barre') {
    etat.barList.splice(Number(cible.dataset.barre), 1);
    rendreFormulaire();
    recalculer();
  } else if (action === 'choisir-nombre') {
    // Choisir un nombre bascule le lit en saisie PAR NOMBRE : l'espacement
    // cesse d'etre une consigne pour devenir une consequence, et il s'affiche
    // aussitot dans le recapitulatif du lit. Rester en mode espacement aurait
    // fait revenir le nombre conforme au premier recalcul.
    const nombre = cible.dataset.count ?? '';
    const indexLit = cible.dataset.lit;
    const indexLibre = cible.dataset.libre;

    if (indexLit !== undefined) {
      const lit = etat.rows[Number(indexLit)];
      if (lit) {
        lit.useSpacing = false;
        lit.count = nombre;
      }
    } else if (indexLibre !== undefined) {
      const lit = etat.freeRows[Number(indexLibre)];
      if (lit) {
        lit.useSpacing = false;
        lit.count = nombre;
      }
    }

    rendreFormulaire();
    recalculer();
  } else if (action === 'supprimer-libre') {
    etat.freeRows.splice(Number(cible.dataset.libre), 1);
    rendreFormulaire();
    recalculer();
  } else if (action === 'enregistrer') {
    try {
      const modele = formToModel(etat);
      const nom = (modele.name ?? 'section').replace(/[^\w-]+/g, '-').toLowerCase();
      telechargerModele(modele, `${nom}.json`);
    } catch (e) {
      afficherErreur(e instanceof Error ? e.message : String(e));
    }
  } else if (action === 'calculer-proportionnel') {
    // Le mode proportionnel coute de 3,6 s a 7,7 s : il ne part JAMAIS tout
    // seul, et l'attente doit etre visible.
    if (zoneResultat) zoneResultat.innerHTML = `<p class="attente">Calcul en cours…</p>${dernierResultat}`;
    window.setTimeout(() => recalculer('proportional'), 0);
  } else if (action === 'tracer-domaine') {
    // Meme patron que ci-dessus, pour la meme raison : le trace coute de 77 a
    // 380 ms, synchrones. Le differer d'un tour de boucle laisse le navigateur
    // peindre l'attente au lieu de figer sans rien dire.
    if (zoneDiagramme) {
      zoneDiagramme.innerHTML = `<p class="attente">Trace du domaine en cours…</p>${dernierDiagramme}`;
    }
    window.setTimeout(tracerDomaine, 0);
  } else if (action.startsWith('exporter-')) {
    exporter(action);
  }
});

rendreFormulaire();
recalculer();
