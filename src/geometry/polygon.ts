import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section } from '../model/section';

export interface Vertex {
  y: number;
  z: number;
}

export interface PolygonGeometry {
  kind: 'polygon';
  /** Sommets ordonnes, contour simple unique, deja centres sur le centroide. */
  vertices: Vertex[];
}

/** Aire signee (formule du lacet). Positive ou negative selon le sens de parcours. */
function signedArea(vertices: Vertex[]): number {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    sum += a.y * b.z - b.y * a.z;
  }
  return sum / 2;
}

export function polygonArea(vertices: Vertex[]): number {
  return Math.abs(signedArea(vertices));
}

export function polygonCentroid(vertices: Vertex[]): Vertex {
  const A = signedArea(vertices);
  const n = vertices.length;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const cross = a.y * b.z - b.y * a.z;
    cy += (a.y + b.y) * cross;
    cz += (a.z + b.z) * cross;
  }
  const factor = 1 / (6 * A);
  return { y: cy * factor, z: cz * factor };
}

export function polygonSection(params: {
  vertices: Vertex[];
  concrete: ConcreteMaterial;
  rebars: Array<{ y: number; z: number; area: number; steel: SteelMaterial }>;
}): Section {
  const centroid = polygonCentroid(params.vertices);

  const vertices = params.vertices.map((v) => ({ y: v.y - centroid.y, z: v.z - centroid.z }));
  const rebars = params.rebars.map((r) => ({
    y: r.y - centroid.y,
    z: r.z - centroid.z,
    area: r.area,
    steel: r.steel,
  }));

  return {
    geometry: { kind: 'polygon', vertices },
    concrete: params.concrete,
    rebars,
  };
}
