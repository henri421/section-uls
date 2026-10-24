import { resolveModel, verifySection, interactionCurveAtN } from '../../src/index';
import type { SectionModel, VerificationResult, ResolvedModel } from '../../src/index';
import { formToModel, modelToForm, FormError } from './form';
import {
  rectangularRebarLayout, rebarRow, formatRow, spacingOptions, faceSegment,
  barArea, barDiameterOf, checkBarPlacement, skinBars,
} from '../../src/index';
import type { RowOption } from '../../src/index';
import { barresEvaluees, barresGenerees } from './form';
import { evaluateExpression } from './expression';
import type { FormState, RowInput, FreeRowInput } from './form';
import { outlineOf } from './draw';
import { plotSvg } from './plot';
import { formatNumber } from './format';
import { notationHtml } from 'aedificium-ui';
import { calculerSorties, modeleParDefaut, dessinerDiagrammeNM, ligne } from './sorties';
import type { Sortie } from './sorties';
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

let etat: FormState = modelToForm(chargerLocalement() ?? modeleParDefaut());

/** Dernier resultat valide, conserve pour ne pas l'effacer sur une saisie fautive. */
let dernierResultat: string = '';
/** Dernier diagramme N-M rendu, reaffiche tel quel pendant un trace de domaine. */
let dernierDiagramme: string = '';
/** SVG du domaine My-Mz affiche, `null` des qu'un recalcul l'a efface. */
let dernierDomaine: string | null = null;

/**
 * La derniere sortie, fige au dernier calcul REUSSI.
 *
 * Les blocs et les dessins sont ceux-la memes qui sont affiches : l'export dit
 * exactement ce que l'ecran dit, parce qu'il montre la meme chose. Le
 * reconstruire creerait une seconde source de verite.
 */
let derniereSortie: Sortie | null = null;

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
      ...(lit.face === 'depth' ? { d: nombreDeChamp(lit.d ?? '') ?? Number.NaN } : {}),
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
    ['depth', 'libre, a la profondeur d'],
  ];
  const options = faces
    .map(([v, l]) => `<option value="${v}"${v === lit.face ? ' selected' : ''}>${l}</option>`)
    .join('');

  return `<fieldset class="lit">
    <legend>Lit ${index + 1}</legend>
    <label class="large"><span>Face</span><select data-lit="${index}" data-champ="face" data-structure="1">${options}</select></label>
    ${
      lit.face === 'depth'
        ? `<label><span>d, axe des barres depuis la fibre superieure (mm)</span><input type="text" inputmode="decimal" data-lit="${index}" data-champ="d" value="${echapper(lit.d ?? '')}" /></label>`
        : ''
    }
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
      `<button type="button" data-action="ajouter-lit">Ajouter un lit</button>` +
      `<button type="button" data-action="ajouter-lit-libre">Ajouter un lit libre (par d)</button>`
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
        `Sous un <em>M<sub>Ed</sub></em> inferieur a <em>M<sub>Rd</sub></em>, la section n est pas a l ultime et
         ses armatures ne travaillent pas a <em>f<sub>yd</sub></em>. Ce bloc donne la contrainte
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
      `Dispositions constructives §9 (dont A<sub>s,min</sub> de non-fragilite)`,
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
    ${ligne('Reference M_Rd', `${formatNumber(reference.MRd, 1)} kN·m`)}
    ${ligne('Actuel M_Rd', ecart(MRd, reference.MRd, 'kN·m'))}
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
    ${champTexte('My', 'M<sub>y</sub> (kN·m)', etat.My)}
    ${champTexte('Mz', 'M<sub>z</sub> (kN·m)', etat.Mz)}
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
    ${champTexte('V_Ed', 'V<sub>Ed</sub> (kN)', etat.V_Ed)}
    <p class="sous-titre">Armatures d ame (vides = aucun cadre declare)</p>
    ${champTexte('Asw', 'A<sub>sw</sub>, aire d un cours (mm²)', etat.Asw)}
    ${champTexte('sCadres', 'Espacement des cours s (mm)', etat.sCadres)}
    ${champTexte('fywk', 'f<sub>ywk</sub> des cadres (MPa)', etat.fywk)}
    ${champTexte(
      'cotTheta',
      `cot θ (1 a 2,5) ${info(
        `<em>cot θ</em> est un <strong>arbitrage</strong>, pas une constante :
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
    ${champTexte('serviceCarM', 'M caracteristique (kN·m)', etat.serviceCarM)}
    ${champTexte('serviceQpN', 'N quasi-permanent (kN)', etat.serviceQpN)}
    ${champTexte('serviceQpM', 'M quasi-permanent (kN·m)', etat.serviceQpM)}
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
      `w<sub>max</sub> (mm) ${info(
        `Depend de la <strong>classe d exposition</strong> — tableau 7.1N : 0,4 / 0,3 / 0,2 mm.`
      )}`,
      etat.crackWMax
    )}
    ${champTexte(
      'curvatureBeta',
      `β, duree de chargement ${info(
        `<strong>0,5</strong> en charge de longue duree ou repetee, <strong>1,0</strong> en
         charge courte.`
      )}`,
      etat.curvatureBeta
    )}
    ${champChoix(
      'crackingMode',
      `Etat de fissuration ${info(
        `Le <strong>§7.1(2)</strong> tranche : la section est non fissuree tant que la traction
         du beton reste sous <em>f<sub>ct,eff</sub></em>. En <strong>etat I</strong> le beton tendu
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
      `f<sub>ct,eff</sub> du critere (MPa, vide = f<sub>ctm</sub> a 28 jours) ${info(
        `⚠ A ne pas confondre avec le <em>f<sub>ct,eff</sub></em> du §7.3.2 plus bas, qui porte le meme nom
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
      `f<sub>ct,eff</sub> (MPa, vide = f<sub>ctm</sub> a 28 jours) ${info(
        `Le defaut est le cas <strong>defavorable</strong> : la fissuration des pieces massives
         survient a quelques jours, quand le beton n a pas atteint sa resistance a 28 jours.`
      )}`,
      etat.fctEff
    )}
    ${champTexte('sigmaSZwang', 'σ<sub>s</sub> (MPa, vide = f<sub>yk</sub>)', etat.sigmaSZwang)}
    ${champChoix(
      'restraintMethod',
      `Methode de calcul de h<sub>c,ef</sub> ${info(
        `Deux familles de formules. Le <strong>texte</strong> de l EN 1992-1-1 §7.3.2(3) donne
         <em>2,5·d1</em> ; la <strong>pratique allemande</strong> donne des branches selon
         <em>h/d1</em>, qui croissent avec l epaisseur. Sur un radier de 1,30 m, l ecart entre
         les deux vaut environ 43 % d armature.<br /><br />
         Ce choix est <strong>independant</strong> de la convention de <em>k</em> ci-dessous :
         <em>k</em> est un parametre d annexe nationale, <em>h<sub>c,ef</sub></em> est un choix de
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
       <em>d1</em> change <em>h<sub>c,ef</sub></em>, imposer <em>f<sub>ct,eff</sub></em> change ce qui en depend.
       Toute valeur imposee est <strong>marquee</strong> dans les resultats et dans la note de
       calcul — une note qui presenterait une valeur forcee comme calculee ne serait
       verifiable par personne.<br /><br />
       Une valeur hors du domaine physique produit un <strong>avertissement</strong>, jamais un
       ecretage silencieux : ecreter vous retirerait la decision que vous venez de prendre.`
    )}</p>
    ${champTexte('impFctEff', 'f<sub>ct,eff</sub> impose (MPa)', etat.impFctEff)}
    ${champTexte('impD1', 'd1 impose (mm)', etat.impD1)}
    ${champTexte('impHcEff', 'h<sub>c,ef</sub> impose (mm)', etat.impHcEff)}
    ${champTexte('impK', 'k impose', etat.impK)}
    ${champTexte('impKc', 'k<sub>c</sub> impose', etat.impKc)}
    ${champTexte('impAct', 'A<sub>ct</sub> impose (mm²)', etat.impAct)}
    ${champTexte('impAcEff', 'A<sub>c,ef</sub> impose, une face (mm²)', etat.impAcEff)}
    ${champTexte('impSigmaS', 'σ<sub>s</sub> impose (MPa)', etat.impSigmaS)}
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
       siens, et <em>h</em> comme <em>f<sub>ctm</sub></em> sont seulement <strong>pre-remplis</strong> a
       partir de la section au chargement.`
    )}</legend>
    ${champTexte('meyerH', 'h, epaisseur de l element (mm)', etat.meyerH)}
    ${champTexte('meyerD1', 'd1, enrobage a l AXE des barres (mm)', etat.meyerD1)}
    ${champTexte('meyerDs', 'ds, diametre des barres (mm)', etat.meyerDs)}
    ${champTexte('meyerWk', 'w<sub>k</sub> visee (mm)', etat.meyerWk)}
    ${champTexte('meyerFctm', 'f<sub>ctm</sub> a 28 jours (MPa)', etat.meyerFctm)}
    ${champTexte(
      'meyerKzt',
      `k<sub>zt</sub> = f<sub>ct,eff</sub> / f<sub>ctm</sub> ${info(
        `<em>k<sub>zt</sub></em> est le parametre <strong>decisif</strong> de la methode. Le Zwang des
         pieces massives nait de la chaleur d <strong>hydratation</strong> et fissure a quelques
         jours, quand le beton est loin de son f<sub>ctm</sub> a 28 jours : <em>k<sub>zt</sub></em> = 1,0 correspond
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
    ${champTexte('gammaC', 'γ<sub>c</sub>', etat.gammaC)}
    ${champTexte('gammaS', 'γ<sub>s</sub>', etat.gammaS)}
    ${champTexte('alphaCc', 'α<sub>cc</sub>', etat.alphaCc)}
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
    <button type="button" data-action="exporter-section">Section (SVG)</button>
    <button type="button" data-action="exporter-diagramme">Diagramme N-M (SVG)</button>
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
 * Domaine resistant dans le plan des moments, a effort normal FIXE.
 *
 * Ne part JAMAIS au recalcul automatique. `interactionCurveAtN` enchaine une
 * resolution droite par point : 77 a 380 ms pour 24 a 72 points (mesure du
 * 2026-09-04), l'ordre de grandeur d'une verification complete. Le declencher
 * a chaque frappe figerait la page — c'est exactement la regression du mode
 * proportionnel du 2026-09-04. Bouton, et rien d'autre.
 */
function dessinerDomaineMyMz(
  resolu: ResolvedModel,
  resultat: VerificationResult
): { svg: string; html: string } {
  const N = resolu.action.N;
  const PAS = 72;
  const points = interactionCurveAtN(resolu.section, N, resolu.norm, { steps: PAS });

  const titre = `<h2>${notationHtml(`Domaine M_y-M_z a N = ${formatNumber(N, 1)} kN`)}</h2>`;

  // Un domaine vide est un RESULTAT, pas une panne : l'effort normal sort de
  // la plage resistante quelle que soit l'orientation de l'axe neutre.
  if (points.length === 0) {
    return {
      svg: '',
      html:
        `<div id="domaine-mymz">${titre}` +
        `<p class="motif">Aucun point du domaine n'existe a cet effort normal :
       la section est depassee en compression ou en traction avant toute flexion.</p></div>`,
    };
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
    xLabel: 'M_y (kN·m)',
    yLabel: 'M_z (kN·m)',
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
    `<span>${notationHtml(`trace a N = ${formatNumber(N, 1)} kN constant`)}</span>` +
    '<span>le rayon en tirets va de l origine a la capacite : le rapport des deux longueurs est le taux</span>' +
    (tourComplet ? '' : '<span>contour incomplet : certaines orientations n ont pas de solution</span>') +
    '</p>';

  // Le bouton vit DANS le cadre du domaine : il n'a de sens que tant que le
  // domaine est affiche, et disparait avec lui au prochain recalcul.
  const exporter =
    '<button type="button" data-action="exporter-domaine">Domaine My-Mz (SVG)</button>';

  return { svg, html: `<div id="domaine-mymz">${titre}${svg}${legende}${exporter}</div>` };
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
  zoneResultat.innerHTML = `<p class="erreur">${notationHtml(message)}</p>${dernierResultat}`;
}

function recalculer(mode?: 'proportional'): void {
  if (!zoneResultat || !zoneSection) return;

  try {
    // Le calcul vit dans `sorties.ts`, sans DOM : ici on ne fait que peindre.
    //
    // Le recalcul automatique est TOUJOURS en « N constant ». Le mode
    // proportionnel coute plusieurs secondes — 3,3 s sur une dalle courante
    // contre 0,27 s — et il est synchrone : le declencher a chaque frappe
    // fige la page, ce qui se lit a l'ecran comme des valeurs qui ne se
    // mettent plus a jour. Il ne part donc que sur action explicite.
    const sortie = calculerSorties(etat, mode);
    const { resolu, resultat } = sortie;

    dernierResultat = sortie.resultatHtml;
    zoneResultat.innerHTML = dernierResultat;

    const svgSection = sortie.dessins.find((d) => d.suffixe === 'section')?.svg ?? '';
    zoneSection.innerHTML = svgSection + LEGENDE_SECTION;

    // Le domaine My-Mz eventuellement trace n'est PAS reconduit : il vaut pour
    // un effort normal fixe, que la saisie vient peut-etre de changer.
    dernierDiagramme = sortie.diagrammeHtml;
    dernierDomaine = null;
    if (zoneDiagramme) zoneDiagramme.innerHTML = dernierDiagramme;

    // L'etat exportable est fige ICI, sur un calcul REUSSI. Les sorties ne
    // peuvent donc jamais decrire une saisie fautive, et restent disponibles
    // pendant qu'un champ est en cours de frappe.
    derniereSortie = sortie;

    const derives = document.querySelector('#derives');
    if (derives) {
      derives.innerHTML = notationHtml(
        `f_cd = ${formatNumber(resolu.concrete.fcd, 2)} MPa — f_yd = ${formatNumber(resolu.steel.fyd, 1)} MPa`
      );
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

    sauvegarderLocalement(sortie.modele);
  } catch (e) {
    afficherErreur(e instanceof FormError ? e.message : String(e));
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
    const domaine = dessinerDomaineMyMz(resolu, resultat);
    dernierDomaine = domaine.svg === '' ? null : domaine.svg;
    zoneDiagramme.innerHTML = dernierDiagramme + domaine.html;
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
 * Un fichier, un dessin, un bouton.
 *
 * Un document SVG porte UN dessin. Les sortir tous d'un seul clic lancait
 * plusieurs telechargements d'affilee, et les navigateurs bloquent le second
 * sans prevenir : le diagramme N-M ne sortait jamais. Chaque dessin a donc son
 * bouton. Qui veut tous les dessins dans un seul document a la note de calcul.
 */
function exporterDessin(modele: SectionModel, suffixe: string, svg: string): void {
  telecharger(
    `${baseDeNom(modele)}-${suffixe}.svg`,
    svgAutonome(svg, STYLES_TRACE),
    'image/svg+xml;charset=utf-8'
  );
}

/** Les donnees d'entree ET les verifications : un tableau qui se lit seul. */
function exporterResultats(sortie: Sortie): void {
  const entrees = blocsDEntree(sortie.modele, sortie.resolu, sortie.parametres);
  telecharger(
    `${baseDeNom(sortie.modele)}-resultats.csv`,
    resultatsEnCsv([...entrees, ...sortie.blocs]),
    'text/csv;charset=utf-8'
  );
}

function exporterNote(sortie: Sortie): void {
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

/** Bouton -> suffixe du dessin dans `Sortie.dessins`. */
const DESSIN_PAR_ACTION: Record<string, string> = {
  'exporter-section': 'section',
  'exporter-diagramme': 'diagramme-n-my',
};

function exporter(action: string): void {
  if (derniereSortie === null) {
    afficherErreur(SANS_CALCUL_A_EXPORTER);
    return;
  }

  const dessin = DESSIN_PAR_ACTION[action];
  if (dessin !== undefined) {
    const trouve = derniereSortie.dessins.find((d) => d.suffixe === dessin);
    if (trouve !== undefined) exporterDessin(derniereSortie.modele, trouve.suffixe, trouve.svg);
  } else if (action === 'exporter-domaine') {
    // Le domaine n'est pas dans l'etat exportable : il n'existe que tant
    // qu'il est affiche.
    if (dernierDomaine !== null) exporterDessin(derniereSortie.modele, 'domaine-my-mz', dernierDomaine);
  } else if (action === 'exporter-resultats') exporterResultats(derniereSortie);
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
  } else if (action === 'ajouter-lit-libre') {
    // d vide : c'est a l'utilisateur de placer le lit, et le recalcul
    // signale le champ manquant au lieu d'inventer une profondeur.
    etat.rows.push({ face: 'depth', d: '', diameter: '20', useSpacing: false, count: '2', maxSpacing: '' });
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

// Hors navigateur (tests), pas de service worker.
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  void import('./pwa').then((m) => m.enregistrerServiceWorker());
}
