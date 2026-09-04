import type {
  SectionModel, RowFaceModel, BarSpecModel, PointModel,
  GeometryModel, ReinforcementModel,
} from '../../src/index';
import type { LoadingMode } from '../../src/index';
import { ec2Recommended, FORMAT_VERSION, ENGINE_VERSION } from '../../src/index';
import { evaluateExpression, ExpressionError } from './expression';

/** Un lit tel qu'il est saisi : nombre de barres OU espacement maximal. */
export interface RowInput {
  face: RowFaceModel;
  diameter: string;
  /** `true` : on saisit un espacement maximal ; `false` : un nombre de barres. */
  useSpacing: boolean;
  count: string;
  maxSpacing: string;
}

/** Un lit libre, le long d'un segment quelconque (geometries polygonales). */
export interface FreeRowInput {
  fromY: string; fromZ: string; toY: string; toZ: string;
  diameter: string;
  useSpacing: boolean;
  count: string;
  maxSpacing: string;
  excludeEndpoints: boolean;
}

/**
 * Etat du formulaire : les valeurs telles qu'elles sont saisies, donc en
 * CHAINES. La conversion vers le modele est le seul endroit ou elles
 * deviennent des nombres, et le seul endroit ou une saisie invalide est
 * refusee.
 */
export interface FormState {
  name: string;
  fck: string; fyk: string; Es: string;
  gammaC: string; gammaS: string; alphaCc: string; nBands: string;

  geometryKind: 'rectangle' | 'polygon' | 'circle';
  width: string; height: string;
  /** Un sommet par ligne, « y ; z ». */
  vertices: string;
  diameter: string; segments: string;

  reinforcementKind: 'rectangular-layout' | 'circular-cage' | 'rows' | 'bars';
  cover: string; stirrupDiameter: string;
  rows: RowInput[];
  cageBarDiameter: string; cageCount: string; cageRotationOffset: string;
  freeRows: FreeRowInput[];
  /** Une barre par ligne, « y ; z ; aire ». */
  bars: string;

  N: string; My: string; Mz: string;
  mode: LoadingMode;
}

export class FormError extends Error {}

// --- Conversion chaine -> nombre, seul endroit ou une saisie est refusee ---

/**
 * Nombre requis : leve `FormError` en nommant le champ si la saisie n'est pas
 * evaluable.
 *
 * La saisie n'est pas seulement lue, elle est EVALUEE : « 30+10 » vaut 40,
 * « 500/2 » vaut 250. Un ingenieur cote rarement une valeur brute — un
 * enrobage se compose d'un enrobage nominal et d'un diametre d'etrier — et
 * pouvoir taper le calcul garde la trace du raisonnement dans le champ.
 */
function nombreRequis(valeur: string, champ: string): number {
  try {
    return evaluateExpression(valeur);
  } catch (e) {
    const detail = e instanceof ExpressionError ? e.message : String(e);
    throw new FormError(`${champ} : valeur ou expression attendue, recu "${valeur}" (${detail})`);
  }
}

/** Nombre optionnel : une saisie vide devient `undefined`, jamais `0`. */
function nombreOptionnel(valeur: string, champ: string): number | undefined {
  return valeur.trim() === '' ? undefined : nombreRequis(valeur, champ);
}

/** Rendu texte d'un nombre, ou chaine vide pour un optionnel absent. */
function texteDe(valeur: number | undefined): string {
  return valeur === undefined ? '' : String(valeur);
}

// --- Points et lignes de texte (sommets, barres libres) ---

function parseLigneNombres(ligne: string, champ: string, numeroLigne: number, arite: number): number[] {
  const parties = ligne.split(';').map((p) => p.trim());
  if (parties.length !== arite) {
    throw new FormError(
      `${champ} : ligne ${numeroLigne}, ${arite} valeurs separees par « ; » attendues ("${ligne}")`
    );
  }
  // Chaque partie est EVALUEE, comme les champs simples : « 250-48 » est une
  // cote parfaitement legitime pour une position de barre.
  return parties.map((partie) => {
    try {
      return evaluateExpression(partie);
    } catch (e) {
      const detail = e instanceof ExpressionError ? e.message : String(e);
      throw new FormError(
        `${champ} : ligne ${numeroLigne}, valeur ou expression attendue ("${partie}" — ${detail})`
      );
    }
  });
}

/** Analyse une zone de texte « une entree par ligne », en ignorant les lignes vides. */
function parseLignes(texte: string, champ: string, arite: number): number[][] {
  const resultat: number[][] = [];
  texte.split('\n').forEach((ligne, index) => {
    const contenu = ligne.trim();
    if (contenu === '') return;
    resultat.push(parseLigneNombres(contenu, champ, index + 1, arite));
  });
  return resultat;
}

export function parsePoints(texte: string, champ: string): PointModel[] {
  return parseLignes(texte, champ, 2).map(([y, z]) => ({ y, z }));
}

export function formatPoints(points: PointModel[]): string {
  return points.map((p) => `${p.y} ; ${p.z}`).join('\n');
}

function parseBarsText(texte: string, champ: string): Array<{ y: number; z: number; area: number }> {
  return parseLignes(texte, champ, 3).map(([y, z, area]) => ({ y, z, area }));
}

function formatBarsText(bars: Array<{ y: number; z: number; area: number }>): string {
  return bars.map((b) => `${b.y} ; ${b.z} ; ${b.area}`).join('\n');
}

// --- Lits d'armatures : nombre de barres OU espacement maximal ---

interface SaisieBarSpec {
  useSpacing: boolean;
  diameter: string;
  count: string;
  maxSpacing: string;
}

function parseBarSpec(saisie: SaisieBarSpec, champ: string): BarSpecModel {
  const diameter = nombreRequis(saisie.diameter, `${champ} : diametre`);
  if (saisie.useSpacing) {
    return { diameter, maxSpacing: nombreRequis(saisie.maxSpacing, `${champ} : espacement maximal`) };
  }
  return { count: nombreRequis(saisie.count, `${champ} : nombre de barres`), diameter };
}

function barSpecEnSaisie(bars: BarSpecModel): SaisieBarSpec {
  if ('maxSpacing' in bars) {
    return { useSpacing: true, diameter: texteDe(bars.diameter), count: '', maxSpacing: texteDe(bars.maxSpacing) };
  }
  return { useSpacing: false, diameter: texteDe(bars.diameter), count: texteDe(bars.count), maxSpacing: '' };
}

// --- Modele par defaut, seule reference pour les coefficients recommandes ---

const RECOMMANDE = ec2Recommended();

/**
 * Convertit l'etat du formulaire en `SectionModel`. Seuls les champs de la
 * forme de geometrie et de ferraillage retenues sont lus ; les autres,
 * saisis pour une autre forme, sont ignores.
 *
 * Refuse toute valeur non numerique avec un `FormError` nommant le champ
 * (et, pour les zones de texte, le numero de ligne).
 */
export function formToModel(form: FormState): SectionModel {
  const nom = form.name.trim();

  const gammaC = nombreRequis(form.gammaC, 'gammaC');
  const gammaS = nombreRequis(form.gammaS, 'gammaS');
  const alphaCc = nombreRequis(form.alphaCc, 'alphaCc');
  const nBands = nombreRequis(form.nBands, 'nBands');
  const normPersonnalise =
    gammaC !== RECOMMANDE.gammaC ||
    gammaS !== RECOMMANDE.gammaS ||
    alphaCc !== RECOMMANDE.alphaCc ||
    nBands !== RECOMMANDE.nBands;

  let geometry: GeometryModel;
  switch (form.geometryKind) {
    case 'rectangle':
      geometry = {
        kind: 'rectangle',
        width: nombreRequis(form.width, 'largeur'),
        height: nombreRequis(form.height, 'hauteur'),
      };
      break;
    case 'polygon':
      geometry = { kind: 'polygon', vertices: parsePoints(form.vertices, 'sommets') };
      break;
    case 'circle': {
      const segments = nombreOptionnel(form.segments, 'segments');
      geometry = {
        kind: 'circle',
        diameter: nombreRequis(form.diameter, 'diametre'),
        ...(segments !== undefined ? { segments } : {}),
      };
      break;
    }
  }

  let reinforcement: ReinforcementModel;
  switch (form.reinforcementKind) {
    case 'rectangular-layout': {
      const stirrupDiameter = nombreOptionnel(form.stirrupDiameter, 'diametre etrier');
      reinforcement = {
        kind: 'rectangular-layout',
        cover: nombreRequis(form.cover, 'enrobage'),
        ...(stirrupDiameter !== undefined ? { stirrupDiameter } : {}),
        rows: form.rows.map((row) => ({
          face: row.face,
          bars: parseBarSpec(row, `lit ${row.face}`),
        })),
      };
      break;
    }
    case 'circular-cage': {
      const stirrupDiameter = nombreOptionnel(form.stirrupDiameter, 'diametre etrier');
      const rotationOffset = nombreOptionnel(form.cageRotationOffset, 'decalage angulaire');
      reinforcement = {
        kind: 'circular-cage',
        cover: nombreRequis(form.cover, 'enrobage'),
        ...(stirrupDiameter !== undefined ? { stirrupDiameter } : {}),
        barDiameter: nombreRequis(form.cageBarDiameter, 'diametre des barres'),
        count: nombreRequis(form.cageCount, 'nombre de barres'),
        ...(rotationOffset !== undefined ? { rotationOffset } : {}),
      };
      break;
    }
    case 'rows':
      reinforcement = {
        kind: 'rows',
        rows: form.freeRows.map((row) => ({
          from: { y: nombreRequis(row.fromY, 'lit libre : y de depart'), z: nombreRequis(row.fromZ, 'lit libre : z de depart') },
          to: { y: nombreRequis(row.toY, "lit libre : y d'arrivee"), z: nombreRequis(row.toZ, "lit libre : z d'arrivee") },
          bars: parseBarSpec(row, 'lit libre'),
          // `as const` : narrowe le litteral en 'exclude', pas un contournement
          // de type — sans lui l'objet serait infere avec `endpoints: string`.
          ...(row.excludeEndpoints ? { endpoints: 'exclude' as const } : {}),
        })),
      };
      break;
    case 'bars':
      reinforcement = { kind: 'bars', bars: parseBarsText(form.bars, 'bars') };
      break;
  }

  return {
    formatVersion: FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    ...(nom !== '' ? { name: nom } : {}),
    norm: {
      name: normPersonnalise ? 'EC2_personnalise' : 'EC2_recommended',
      gammaC, gammaS, alphaCc, nBands,
    },
    concrete: { fck: nombreRequis(form.fck, 'fck') },
    steel: { fyk: nombreRequis(form.fyk, 'fyk'), Es: nombreRequis(form.Es, 'Es') },
    geometry,
    reinforcement,
    action: {
      N: nombreRequis(form.N, 'N'),
      My: nombreRequis(form.My, 'My'),
      Mz: nombreRequis(form.Mz, 'Mz'),
    },
  };
}

/**
 * Convertit un `SectionModel` en etat de formulaire. Ne remplit que les
 * champs pertinents pour la geometrie et le ferraillage du modele ; les
 * autres restent a leur valeur par defaut (chaine vide, tableau vide).
 */
export function modelToForm(model: SectionModel): FormState {
  const form: FormState = {
    name: model.name ?? '',
    fck: texteDe(model.concrete.fck),
    fyk: texteDe(model.steel.fyk),
    Es: texteDe(model.steel.Es),
    gammaC: texteDe(model.norm.gammaC),
    gammaS: texteDe(model.norm.gammaS),
    alphaCc: texteDe(model.norm.alphaCc),
    nBands: texteDe(model.norm.nBands),

    geometryKind: model.geometry.kind,
    width: '', height: '', vertices: '', diameter: '', segments: '',

    reinforcementKind: model.reinforcement.kind,
    cover: '', stirrupDiameter: '',
    rows: [],
    cageBarDiameter: '', cageCount: '', cageRotationOffset: '',
    freeRows: [],
    bars: '',

    N: texteDe(model.action.N),
    My: texteDe(model.action.My),
    Mz: texteDe(model.action.Mz),
    mode: 'constant-N',
  };

  switch (model.geometry.kind) {
    case 'rectangle':
      form.width = texteDe(model.geometry.width);
      form.height = texteDe(model.geometry.height);
      break;
    case 'polygon':
      form.vertices = formatPoints(model.geometry.vertices);
      break;
    case 'circle':
      form.diameter = texteDe(model.geometry.diameter);
      form.segments = texteDe(model.geometry.segments);
      break;
  }

  switch (model.reinforcement.kind) {
    case 'rectangular-layout':
      form.cover = texteDe(model.reinforcement.cover);
      form.stirrupDiameter = texteDe(model.reinforcement.stirrupDiameter);
      form.rows = model.reinforcement.rows.map((row) => ({
        face: row.face,
        ...barSpecEnSaisie(row.bars),
      }));
      break;
    case 'circular-cage':
      form.cover = texteDe(model.reinforcement.cover);
      form.stirrupDiameter = texteDe(model.reinforcement.stirrupDiameter);
      form.cageBarDiameter = texteDe(model.reinforcement.barDiameter);
      form.cageCount = texteDe(model.reinforcement.count);
      form.cageRotationOffset = texteDe(model.reinforcement.rotationOffset);
      break;
    case 'rows':
      form.freeRows = model.reinforcement.rows.map((row) => ({
        fromY: texteDe(row.from.y), fromZ: texteDe(row.from.z),
        toY: texteDe(row.to.y), toZ: texteDe(row.to.z),
        excludeEndpoints: row.endpoints === 'exclude',
        ...barSpecEnSaisie(row.bars),
      }));
      break;
    case 'bars':
      form.bars = formatBarsText(model.reinforcement.bars);
      break;
  }

  return form;
}

