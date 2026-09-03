import type { Section } from '../model/section';
import type { PolygonGeometry, Vertex } from './polygon';
import { rectangleToPolygon } from './rectangle';

/**
 * Rotation d'un point du plan par R(theta) = [[cos, sin], [-sin, cos]].
 *
 * Le repere tourne est celui dans lequel l'axe neutre d'angle `theta`
 * devient horizontal : la coordonnee `z` du repere tourne vaut
 * `zeta = -y*sin(theta) + z*cos(theta)`, exactement la coordonnee
 * perpendiculaire a l'axe neutre. En theta = 0 on retrouve l'identite, donc
 * la convention de la session 2.
 */
export function rotatePoint(p: Vertex, theta: number): Vertex {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { y: p.y * c + p.z * s, z: -p.y * s + p.z * c };
}

/**
 * Copie de travail de la section dans le repere tourne. La section d'origine
 * n'est jamais modifiee : l'API et le trace restent dans le repere de la
 * section, la rotation est un detail interne du solveur.
 *
 * La rotation est une isometrie autour de l'origine, et la geometrie stockee
 * est deja centree sur le centroide : le centroide reste donc en place.
 */
export function rotateSection(section: Section, theta: number): Section & { geometry: PolygonGeometry } {
  const base =
    section.geometry.kind === 'rectangle' ? rectangleToPolygon(section.geometry) : section.geometry;

  return {
    geometry: { kind: 'polygon', vertices: base.vertices.map((v) => rotatePoint(v, theta)) },
    concrete: section.concrete,
    rebars: section.rebars.map((r) => {
      const p = rotatePoint(r, theta);
      return { y: p.y, z: p.z, area: r.area, steel: r.steel };
    }),
  };
}

export interface MomentVector {
  y: number;
  z: number;
}

/**
 * Ramene un vecteur moment du repere tourne vers le repere de la section.
 *
 * Le couple (M_y, M_z) = (-∫σz dA, +∫σy dA) se transforme comme un point du
 * plan sous R(theta) — c'est la propriete qui rend la rotation interne exacte
 * et reversible, et qui rend structurelle (et non approchee) la
 * non-regression en theta = 0. L'inverse est donc R(theta) transposee.
 */
export function rotateMomentBack(m: MomentVector, theta: number): MomentVector {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { y: m.y * c - m.z * s, z: m.y * s + m.z * c };
}
