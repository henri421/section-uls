import type { Vertex } from './polygon';

export interface Span {
  yStart: number;
  yEnd: number;
}

/**
 * Portions horizontales du contour a la hauteur z (repere du polygone, deja
 * centre sur le centroide). Fonctionne pour un contour simple, convexe ou
 * non, sans trou. Convention demi-ouverte [zMin, zMax) par arete pour ne
 * jamais compter un sommet deux fois (les aretes horizontales ne
 * contribuent jamais, ce qui est le comportement correct). Consequence de
 * cette convention : au zMin ou au zMax global exact de la geometrie, si ce
 * niveau correspond a une face plate (et pas seulement a un sommet
 * ponctuel), la largeur rapportee peut etre sous-estimee (jusqu'a 0) ; les
 * appelants doivent echantillonner strictement a l'interieur de l'enveloppe
 * z de la geometrie (ce que fera naturellement l'integration par fibres de
 * la tache suivante, qui echantillonne au centre des bandes).
 */
export function polygonSpansAtZ(vertices: Vertex[], z: number): Span[] {
  const crossings: number[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];

    const zMin = Math.min(a.z, b.z);
    const zMax = Math.max(a.z, b.z);

    if (z >= zMin && z < zMax) {
      const t = (z - a.z) / (b.z - a.z);
      const y = a.y + t * (b.y - a.y);
      crossings.push(y);
    }
  }

  crossings.sort((p, q) => p - q);

  const spans: Span[] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    spans.push({ yStart: crossings[i], yEnd: crossings[i + 1] });
  }
  return spans;
}

export function polygonWidthAtZ(vertices: Vertex[], z: number): number {
  return polygonSpansAtZ(vertices, z).reduce((sum, span) => sum + (span.yEnd - span.yStart), 0);
}
