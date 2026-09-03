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

export type RowFace = 'top' | 'bottom' | 'left' | 'right';

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
    const a = cover + stirrup + row.bars.diameter / 2;
    const yGauche = -b / 2 + a;
    const yDroite = b / 2 - a;
    const zHaut = -h / 2 + a;
    const zBas = h / 2 - a;

    let from: Vertex;
    let to: Vertex;
    let endpoints: 'include' | 'exclude';

    switch (row.face) {
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
