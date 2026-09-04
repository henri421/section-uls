import {
  resolveModel,
  verifySection,
  capacityAtAngle,
  polygonArea,
  FORMAT_VERSION,
  ENGINE_VERSION,
} from '../../src/index';
import type { SectionModel, VerificationResult, ResolvedModel } from '../../src/index';
import { formToModel, modelToForm, FormError } from './form';
import { rectangularRebarLayout, rebarRow, formatRow } from '../../src/index';
import type { FormState, RowInput, FreeRowInput } from './form';
import { outlineOf, boundingBox, neutralAxisSegment, barRadius, splitByLine, zetaOf } from './draw';
import { formatNumber, formatAngleDegrees, formatUtilization } from './format';
import {
  chargerLocalement,
  sauvegarderLocalement,
  telechargerModele,
  lireFichier,
} from './storage';
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
  };
}

let etat: FormState = modelToForm(chargerLocalement() ?? modeleParDefaut());

/** Dernier resultat valide, conserve pour ne pas l'effacer sur une saisie fautive. */
let dernierResultat: string = '';
let dernierDessin: string = '';

// --- Fabriques de balisage --------------------------------------------------

function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
    ${recapitulatif ? `<p class="aire-lit">${echapper(recapitulatif)}</p>` : ''}
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
    ${recapitulatif ? `<p class="aire-lit">${echapper(recapitulatif)}</p>` : ''}
    <button type="button" data-action="supprimer-libre" data-libre="${index}">Supprimer ce lit</button>
  </fieldset>`;
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

  return champZone('bars', 'Barres, une par ligne : y ; z ; aire', etat.bars, 8);
}

function htmlFormulaire(): string {
  return `
  <fieldset>
    <legend>Identification</legend>
    <label><span>Nom</span><input type="text" data-champ="name" value="${echapper(etat.name)}" /></label>
  </fieldset>

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
  </fieldset>

  <fieldset>
    <legend>Sollicitation</legend>
    ${champTexte('N', 'N (kN, positif en compression)', etat.N)}
    ${champTexte('My', 'My (kN.m)', etat.My)}
    ${champTexte('Mz', 'Mz (kN.m)', etat.Mz)}
    <p class="note">Chemin de chargement : <strong>N constant</strong>, recalcule en continu.</p>
    <button type="button" data-action="calculer-proportionnel">Calculer en proportionnel (quelques secondes)</button>
  </fieldset>

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

function dessiner(resolu: ResolvedModel, resultat: VerificationResult): string {
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
    const etat = capacityAtAngle(resolu.section, axeNeutre.angle, resolu.action.N, resolu.norm);
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
  const svg = `<svg viewBox="${boite.yMin - marge} ${boite.zMin - marge} ${largeur + 2 * marge} ${hauteur + 2 * marge}" preserveAspectRatio="xMidYMid meet">
    ${zones}
    <polygon points="${chemin(contour)}" class="contour" stroke-width="${trait}" />
    ${barres}
    ${axe}
    ${resultantes}
    ${repere}
  </svg>`;

  return `${svg}<p class="legende"><span class="c">zone comprimee</span><span class="t">zone tendue</span><span class="n">axe neutre</span><span>cercles : resultantes, reliees par le bras de levier</span><span>origine du repere au centroide, y vers la droite, z vers le bas</span></p>`;
}

// --- Resultat ---------------------------------------------------------------

function ligne(libelle: string, valeur: string): string {
  return `<div class="ligne"><span>${libelle}</span><strong>${valeur}</strong></div>`;
}

function groupe(titre: string, lignes: string[]): string {
  const contenu = lignes.filter((l) => l !== '').join('');
  return contenu === '' ? '' : `<div class="groupe"><h3>${titre}</h3>${contenu}</div>`;
}

function htmlResultat(resolu: ResolvedModel, resultat: VerificationResult): string {
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

  const equilibre = groupe('Equilibre de la section', [
    resultat.neutralAxis
      ? ligne('Inclinaison de l axe neutre', `${formatAngleDegrees(resultat.neutralAxis.angle)} deg`)
      : '',
    resultat.neutralAxis
      ? ligne('Position de l axe neutre', `${formatNumber(resultat.neutralAxis.offset, 1)} mm`)
      : '',
    resultat.leverArm !== null
      ? ligne('Bras de levier interne', `${formatNumber(resultat.leverArm, 1)} mm`)
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

  const motif = resultat.reason ? `<p class="motif">${echapper(resultat.reason)}</p>` : '';

  return verdict + jauge + sollicitation + resistance + equilibre + materiaux + ferraillage + motif;
}

// --- Boucle de calcul -------------------------------------------------------

const zoneSaisie = document.querySelector<HTMLElement>('#saisie');
const zoneSection = document.querySelector<HTMLElement>('#section');
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
  try {
    modele = formToModel(etat);
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

    dernierResultat = htmlResultat(resolu, resultat);
    dernierDessin = dessiner(resolu, resultat);
    zoneResultat.innerHTML = dernierResultat;
    zoneSection.innerHTML = dernierDessin;

    const derives = document.querySelector('#derives');
    if (derives) {
      derives.textContent = `fcd = ${formatNumber(resolu.concrete.fcd, 2)} MPa — fyd = ${formatNumber(resolu.steel.fyd, 1)} MPa`;
    }

    sauvegarderLocalement(modele);
  } catch (e) {
    afficherErreur(e instanceof Error ? e.message : String(e));
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

  if (indexLit !== undefined) {
    const lit = etat.rows[Number(indexLit)];
    if (lit) Object.assign(lit, { [champ]: valeur });
  } else if (indexLibre !== undefined) {
    const lit = etat.freeRows[Number(indexLibre)];
    if (lit) Object.assign(lit, { [champ]: valeur });
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

document.addEventListener('click', (evenement) => {
  const cible = evenement.target;
  if (!(cible instanceof HTMLElement)) return;
  const action = cible.dataset.action;
  if (!action) return;

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
  }
});

rendreFormulaire();
recalculer();
