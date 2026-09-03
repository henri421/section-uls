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

/** Rendu lisible d'un lit, par exemple "4 HA12 @ 133 mm = 452 mm²". */
export function formatRow(summary: RowSummary): string {
  const aire = `${Math.round(summary.totalArea)} mm²`;
  if (summary.count < 2) return `${summary.count} HA${summary.diameter} = ${aire}`;
  return `${summary.count} HA${summary.diameter} @ ${Math.round(summary.spacing)} mm = ${aire}`;
}
