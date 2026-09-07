import type { RebarLayer } from '../model/section';
import type { SteelMaterial } from '../model/steel';
import type { Vertex } from './polygon';

/** Lit defini par un nombre de barres et leur diametre. */
export interface BarCount {
  count: number;
  diameter: number;
}

/** Lit defini par un diametre et un espacement MAXIMAL (style "Ø12 tous les 150"). */
export interface BarSpacing {
  diameter: number;
  maxSpacing: number;
}

export type BarSpec = BarCount | BarSpacing;

/** Recapitulatif d'un lit, destine a la relecture et a l'affichage. */
export interface RowSummary {
  count: number;
  diameter: number;
  /** Espacement reel entre points de division (mm), 0 si moins de deux barres. */
  spacing: number;
  totalArea: number;
}

export interface RebarRow {
  bars: RebarLayer[];
  summary: RowSummary;
}

function barArea(diameter: number): number {
  return (Math.PI * diameter ** 2) / 4;
}

/**
 * Un lit d'armatures le long d'un segment quelconque du plan.
 *
 * Chaque barre devient un `RebarLayer` distinct : c'est une condition de
 * JUSTESSE en flexion deviee, pas un confort de saisie. Un lit forfaitise en
 * un point unique donnerait un resultat faux des que l'axe neutre est
 * incline, puisque deux barres du meme lit a des `y` differents n'ont alors
 * pas la meme deformation.
 *
 * `endpoints: 'exclude'` pose uniquement les barres intermediaires : c'est le
 * mode des lits lateraux d'un poteau, dont les barres d'angle appartiennent
 * deja aux lits inferieur et superieur. Sans lui, un poteau "4 + 4 + 2 + 2"
 * compterait 16 barres au lieu de 12.
 */
export function rebarRow(params: {
  from: Vertex;
  to: Vertex;
  bars: BarSpec;
  steel: SteelMaterial;
  endpoints?: 'include' | 'exclude';
}): RebarRow {
  const { from, to, steel } = params;
  const endpoints = params.endpoints ?? 'include';
  const { diameter } = params.bars;
  const length = Math.hypot(to.y - from.y, to.z - from.z);

  let count: number;
  let intervals: number;

  if ('count' in params.bars) {
    count = params.bars.count;
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`rebarRow : nombre de barres invalide (${count})`);
    }
    intervals = endpoints === 'include' ? Math.max(count - 1, 0) : count + 1;
  } else {
    const { maxSpacing } = params.bars;
    if (!(maxSpacing > 0)) {
      throw new Error(`rebarRow : maxSpacing doit etre strictement positif (${maxSpacing})`);
    }
    if (length === 0) {
      intervals = 0;
      count = endpoints === 'include' ? 1 : 0;
    } else {
      intervals = Math.ceil(length / maxSpacing);
      count = endpoints === 'include' ? intervals + 1 : intervals - 1;
    }
  }

  const spacing = intervals > 0 && count > 1 ? length / intervals : 0;
  const positions: number[] = [];

  if (count === 1 && endpoints === 'include') {
    positions.push(0.5); // barre unique : milieu du segment
  } else if (endpoints === 'include') {
    // count !== 1 ici : le cas count === 1 est deja intercepte par le if precedent.
    for (let k = 0; k < count; k++) positions.push(k / (count - 1));
  } else {
    for (let k = 1; k <= count; k++) positions.push(k / (count + 1));
  }

  const area = barArea(diameter);
  const bars: RebarLayer[] = positions.map((t) => ({
    y: from.y + t * (to.y - from.y),
    z: from.z + t * (to.z - from.z),
    area,
    steel,
  }));

  return {
    bars,
    summary: { count: bars.length, diameter, spacing, totalArea: bars.length * area },
  };
}

/**
 * Un nombre de barres CANDIDAT pour un lit saisi en espacement maximal, avec
 * l'espacement reel qu'il produit.
 *
 * `strict` marque le plus petit nombre qui respecte le maximum demande —
 * exactement ce que `rebarRow` retiendrait.
 */
export interface RowOption {
  count: number;
  /** Espacement REEL entre axes (mm) que ce nombre produit. */
  spacing: number;
  /** L'espacement reel respecte-t-il le maximum demande ? */
  ok: boolean;
  /** Le choix de `rebarRow` : le plus petit nombre conforme. */
  strict: boolean;
}

/**
 * Les nombres de barres envisageables pour un lit saisi « Ø12 tous les 150 ».
 *
 * POURQUOI CETTE FONCTION EXISTE. `rebarRow` en mode espacement rend UN
 * nombre, le plus petit qui respecte le maximum. C'est juste, et c'est
 * trompeur : sur une largeur de 1000 avec un enrobage d'axe de 45, la
 * longueur utile vaut 910, et « tous les 150 » donne 8 barres a 130 mm —
 * alors que 1000/150 se lit spontanement « 6 ou 7 ». Les deux lectures
 * different exactement de l'enrobage, aucune n'est fausse, mais l'ecart
 * passe inapercu tant qu'un seul nombre est affiche.
 *
 * Sur une dalle au metre, le nombre non entier se moyenne sans dommage. Sur
 * une POUTRE, il n'existe pas de demi-barre : c'est l'ingenieur qui tranche
 * entre 6 et 7, et pour trancher il lui faut voir l'espacement reel de
 * chacun — y compris ceux qui depassent le maximum de deux millimetres,
 * qu'aucune regle ne dit d'exclure et que lui seul peut accepter.
 *
 * Cette fonction NE CHOISIT PAS : elle enumere. Le nombre `strict` reste
 * marque, il reste le defaut de l'appelant, et rien ne devient
 * silencieusement moins sur.
 *
 * `below` et `above` bornent l'enumeration autour du nombre strict.
 */
export function spacingOptions(params: {
  /** Longueur du segment portant le lit (mm). */
  length: number;
  /** Espacement maximal demande (mm). */
  maxSpacing: number;
  endpoints?: 'include' | 'exclude';
  /** Nombres a enumerer sous le strict. Defaut 2. */
  below?: number;
  /** Nombres a enumerer au-dessus du strict. Defaut 1. */
  above?: number;
}): RowOption[] {
  const { length, maxSpacing } = params;
  const endpoints = params.endpoints ?? 'include';
  const below = params.below ?? 2;
  const above = params.above ?? 1;

  if (!(maxSpacing > 0)) {
    throw new Error(`spacingOptions : maxSpacing doit etre strictement positif (${maxSpacing})`);
  }
  if (!(length > 0)) {
    throw new Error(`spacingOptions : longueur nulle ou negative (${length}), aucun lit a proposer`);
  }

  // Meme arithmetique que `rebarRow`, et c'est une condition de coherence :
  // le nombre marque `strict` doit etre celui que `rebarRow` poserait.
  const intervallesStricts = Math.ceil(length / maxSpacing);
  const nombreDeBarres = (intervalles: number): number =>
    endpoints === 'include' ? intervalles + 1 : intervalles - 1;

  const countStrict = nombreDeBarres(intervallesStricts);
  const minimum = endpoints === 'include' ? 2 : 1;

  const options: RowOption[] = [];

  for (let count = countStrict - below; count <= countStrict + above; count++) {
    if (count < minimum) continue;
    const intervalles = endpoints === 'include' ? count - 1 : count + 1;
    const spacing = length / intervalles;
    options.push({
      count,
      spacing,
      // Tolerance relative : un espacement calcule a 150,0000000001 mm par
      // l'arithmetique flottante respecte « tous les 150 ».
      ok: spacing <= maxSpacing * (1 + 1e-9),
      strict: count === countStrict,
    });
  }

  return options;
}

export type RowFace = 'top' | 'bottom' | 'left' | 'right';

/**
 * Le segment qui porte un lit sur une face d'un rectangle, avec le mode
 * d'extremites qui lui convient.
 *
 * SOURCE UNIQUE, extraite de `rectangularRebarLayout` : la longueur utile
 * `b − 2a` sert aussi a `spacingOptions`, et deux versions de cette
 * arithmetique finiraient par diverger — l'app proposerait alors des
 * nombres de barres que la pose ne produirait pas.
 *
 * Repere barycentrique, z vers le bas.
 */
export function faceSegment(params: {
  width: number;
  height: number;
  cover: number;
  stirrupDiameter?: number;
  /** Diametre du lit concerne : la distance d'axe en depend. */
  diameter: number;
  face: RowFace;
}): { from: Vertex; to: Vertex; length: number; endpoints: 'include' | 'exclude' } {
  const { width: b, height: h, cover, diameter, face } = params;
  const a = cover + (params.stirrupDiameter ?? 0) + diameter / 2;

  const yGauche = -b / 2 + a;
  const yDroite = b / 2 - a;
  const zHaut = -h / 2 + a;
  const zBas = h / 2 - a;

  let from: Vertex;
  let to: Vertex;
  let endpoints: 'include' | 'exclude';

  switch (face) {
    case 'bottom':
      from = { y: yGauche, z: zBas };
      to = { y: yDroite, z: zBas };
      endpoints = 'include';
      break;
    case 'top':
      from = { y: yGauche, z: zHaut };
      to = { y: yDroite, z: zHaut };
      endpoints = 'include';
      break;
    // Les lits lateraux excluent leurs extremites : ce seraient les barres
    // d'angle, deja posees par les lits inferieur et superieur.
    case 'left':
      from = { y: yGauche, z: zHaut };
      to = { y: yGauche, z: zBas };
      endpoints = 'exclude';
      break;
    case 'right':
      from = { y: yDroite, z: zHaut };
      to = { y: yDroite, z: zBas };
      endpoints = 'exclude';
      break;
  }

  return { from, to, length: Math.hypot(to.y - from.y, to.z - from.z), endpoints };
}

/**
 * Ferraillage d'une section rectangulaire dans l'idiome de saisie usuel :
 * enrobage, diametre d'etrier, puis un lit par face defini soit par un
 * nombre de barres, soit par un espacement maximal.
 *
 * Distance d'axe = enrobage + Ø etrier + Ø barre / 2, avec le diametre du
 * lit concerne, appliquee en profondeur comme lateralement.
 *
 * Les lits lateraux ('left'/'right') sont poses en mode 'exclude' : leurs
 * barres d'extremite seraient les barres d'angle, deja posees par les lits
 * 'bottom' et 'top'. Un poteau "4 + 4 + 2 + 2" donne donc 12 barres.
 *
 * Limite connue et assumee : pour un lit lateral, l'etendue verticale du
 * segment est calculee avec le diametre DE CE LIT LATERAL, alors que ses
 * extremites theoriques sont les barres d'angle, dont le diametre est celui
 * des lits inferieur et superieur. Quand les diametres different, le
 * segment est donc tres legerement decale (de l'ordre du demi-ecart de
 * diametre) — negligeable devant les tolerances de pose. Choix documente,
 * pas un defaut : un lit ne doit pas dependre d'un autre.
 *
 * Repere de sortie : barycentrique (origine au centre du rectangle), z vers
 * le bas — directement consommable par `rectangularSection`.
 */
export function rectangularRebarLayout(params: {
  width: number;
  height: number;
  cover: number;
  stirrupDiameter?: number;
  steel: SteelMaterial;
  rows: Array<{ face: RowFace; bars: BarSpec }>;
}): { bars: RebarLayer[]; rows: RowSummary[] } {
  const { width: b, height: h, cover, steel } = params;
  const stirrup = params.stirrupDiameter ?? 0;

  const bars: RebarLayer[] = [];
  const summaries: RowSummary[] = [];

  for (const row of params.rows) {
    const { from, to, endpoints } = faceSegment({
      width: b,
      height: h,
      cover,
      stirrupDiameter: stirrup,
      diameter: row.bars.diameter,
      face: row.face,
    });

    const built = rebarRow({ from, to, bars: row.bars, steel, endpoints });
    bars.push(...built.bars);
    summaries.push(built.summary);
  }

  return { bars, rows: summaries };
}

/** Rendu lisible d'un lit, par exemple "4 HA12 @ 133 mm = 452 mm²". */
export function formatRow(summary: RowSummary): string {
  const aire = `${Math.round(summary.totalArea)} mm²`;
  if (summary.count < 2) return `${summary.count} HA${summary.diameter} = ${aire}`;
  return `${summary.count} HA${summary.diameter} @ ${Math.round(summary.spacing)} mm = ${aire}`;
}
