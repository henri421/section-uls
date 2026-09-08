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
 * NOMBRE DE BARRES A UN PAS DONNE, SUR UNE ETENDUE DONNEE.
 *
 * C'est la regle « Ø14 tous les 150 sur 1000 de large » : `1000/150 = 6,67`,
 * donc 6 ou 7 barres, et JAMAIS 8. Le nombre retenu est le plus proche —
 * c'est celui qui represente le mieux la quantite d'acier reelle — et le
 * plafond est `ceil(E/s)`, qu'aucune lecture ne depasse.
 *
 * POURQUOI CE N'EST PAS `ceil(L/s) + 1`, la formule qui servait ici. Celle-ci
 * compte les INTERVALLES sur la longueur de POSE `L = b − 2a`, puis ajoute
 * une barre pour les deux extremites. Des que `2a < s` — le cas courant, 90
 * contre 150 — elle depasse le plafond d'une unite : 8 barres au lieu de 7.
 *
 * L'enjeu n'est pas la lisibilite mais la JUSTESSE DU MODELE. Sur une bande
 * de dalle d'un metre, 8 barres au lieu de 6,67 mettent 20 % d'acier de trop
 * dans la section, et surestiment donc le moment resistant : l'erreur est du
 * mauvais cote. La bande d'un metre n'est pas une piece bornee par deux
 * enrobages, c'est une decoupe arbitraire d'une nappe continue — il n'y a pas
 * de barre extreme a 45 mm d'un bord qui n'existe pas.
 *
 * L'etendue `extent` est donc la dimension de la FACE, pas la longueur de
 * pose : les barres restent posees entre les axes extremes, mais leur NOMBRE
 * se compte sur la largeur. Consequence assumee : l'espacement reel qui en
 * resulte peut depasser `s` de quelques millimetres (910/6 = 151,7 pour
 * « 150 »). C'est un arbitrage d'ingenieur, il s'affiche, et le nombre
 * voisin reste a un clic.
 *
 * En mode `exclude` — les lits lateraux, dont les extremites sont les barres
 * d'angle deja posees — les deux barres d'extremite sont retranchees.
 */
export function barsAtPitch(
  extent: number,
  pitch: number,
  endpoints: 'include' | 'exclude' = 'include'
): number {
  if (!(pitch > 0)) {
    throw new Error(`barsAtPitch : pas invalide (${pitch})`);
  }
  if (!(extent > 0)) return endpoints === 'include' ? 1 : 0;

  const plafond = Math.ceil(extent / pitch);
  const proche = Math.min(Math.round(extent / pitch), plafond);

  // Une face porte au moins une barre : `round` tomberait a zero des que le
  // pas depasse le double de l'etendue, et un lit demande ne doit pas
  // disparaitre en silence.
  if (endpoints === 'include') return Math.max(proche, 1);

  // Mode `exclude` : la face porte toujours `proche` barres au total, mais
  // DEUX d'entre elles sont les barres d'angle, deja posees par les lits
  // inferieur et superieur. Ce lit-ci n'en pose que les intermediaires.
  // Retrancher une seule ferait franchir le plafond a la face entiere.
  return Math.max(proche - 2, 0);
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
  /**
   * ETENDUE sur laquelle le pas est compte (mm), quand elle differe du
   * segment de pose. Voir `barsAtPitch` : c'est la largeur de la FACE pour
   * un lit de section rectangulaire, alors que le segment ne va que d'axe a
   * axe. Absente, le pas est compte sur le segment lui-meme.
   */
  pitchExtent?: number;
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
    } else if (params.pitchExtent !== undefined) {
      count = barsAtPitch(params.pitchExtent, maxSpacing, endpoints);
      intervals = endpoints === 'include' ? Math.max(count - 1, 0) : count + 1;
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
  /**
   * ETENDUE sur laquelle le pas est compte (mm) : la largeur de la face.
   * C'est elle qui borne le nombre de barres a `ceil(extent / maxSpacing)`.
   */
  extent: number;
  /** Longueur de POSE, entre les axes des barres extremes (mm). */
  length: number;
  /** Pas demande (mm). */
  maxSpacing: number;
  endpoints?: 'include' | 'exclude';
}): RowOption[] {
  const { extent, length, maxSpacing } = params;
  const endpoints = params.endpoints ?? 'include';

  if (!(maxSpacing > 0)) {
    throw new Error(`spacingOptions : maxSpacing doit etre strictement positif (${maxSpacing})`);
  }
  if (!(length > 0)) {
    throw new Error(`spacingOptions : longueur nulle ou negative (${length}), aucun lit a proposer`);
  }
  if (!(extent > 0)) {
    throw new Error(`spacingOptions : etendue nulle ou negative (${extent})`);
  }

  // Le PLAFOND et le PLANCHER de la regle du pas : sur 1000 de large a 150,
  // on pose 6 ou 7 barres, jamais 8. Enumerer au-dela proposerait le nombre
  // meme que la regle vient d'ecarter.
  const plancher = Math.floor(extent / maxSpacing);
  const plafond = Math.ceil(extent / maxSpacing);

  // Le nombre pose par `rebarRow` : c'est une condition de coherence, l'app
  // proposerait sinon un ferraillage different de celui qu'elle dessine.
  const countStrict = barsAtPitch(extent, maxSpacing, endpoints);

  const candidats = new Set<number>();
  for (const nombre of [plancher, plafond]) {
    candidats.add(endpoints === 'include' ? nombre : nombre - 1);
  }
  candidats.add(countStrict);

  const minimum = endpoints === 'include' ? 1 : 0;

  return [...candidats]
    .filter((count) => count >= minimum)
    .sort((a, b) => a - b)
    .map((count) => {
      const intervalles = endpoints === 'include' ? count - 1 : count + 1;
      const spacing = intervalles > 0 ? length / intervalles : 0;
      return {
        count,
        spacing,
        // Tolerance relative : un espacement calcule a 150,0000000001 mm par
        // l'arithmetique flottante respecte « tous les 150 ».
        ok: spacing <= maxSpacing * (1 + 1e-9),
        strict: count === countStrict,
      };
    });
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
}): {
  from: Vertex;
  to: Vertex;
  /** Longueur de POSE, entre les axes des barres extremes (mm). */
  length: number;
  /**
   * ETENDUE de la face (mm) : la largeur pour un lit haut ou bas, la hauteur
   * pour un lit lateral.
   *
   * C'est sur elle, et non sur `length`, que se compte un nombre de barres a
   * un pas donne — voir `barsAtPitch`. Les deux different de `2a`, et la
   * confusion coutait une barre de trop.
   */
  extent: number;
  endpoints: 'include' | 'exclude';
} {
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

  const extent = face === 'top' || face === 'bottom' ? b : h;

  return { from, to, length: Math.hypot(to.y - from.y, to.z - from.z), extent, endpoints };
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
    const { from, to, extent, endpoints } = faceSegment({
      width: b,
      height: h,
      cover,
      stirrupDiameter: stirrup,
      diameter: row.bars.diameter,
      face: row.face,
    });

    // `pitchExtent` est l'ETENDUE DE LA FACE, pas la longueur de pose : « Ø14
    // tous les 150 » sur 1000 de large fait 6,67 barres, donc 7 au plus.
    // Compter sur `b − 2a` puis ajouter une barre en donnait 8, soit 20 %
    // d'acier de trop sur une bande de dalle.
    const built = rebarRow({ from, to, bars: row.bars, steel, endpoints, pitchExtent: extent });
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
