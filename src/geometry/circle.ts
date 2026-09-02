import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section } from '../model/section';
import type { Vertex } from './polygon';
import { polygonSection } from './polygon';

/**
 * Section circulaire, approximee par un polygone regulier a `segments`
 * cotes (defaut 32 — precision suffisante pour un usage bureau d'etudes ;
 * voir tests/geometry/circle.test.ts pour le controle de convergence).
 * Utile pour la verification de pieux et poteaux circulaires.
 */
export function circularSection(params: {
  diameter: number;
  concrete: ConcreteMaterial;
  rebars: Array<{ y: number; z: number; area: number; steel: SteelMaterial }>;
  segments?: number;
}): Section {
  const segments = params.segments ?? 32;
  const radius = params.diameter / 2;

  const vertices: Vertex[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    vertices.push({ y: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }

  return polygonSection({ vertices, concrete: params.concrete, rebars: params.rebars });
}

/**
 * Cage d'armatures reparties uniformement sur un cercle — modelise le
 * ferraillage typique d'un pieu fore ou d'un poteau circulaire.
 */
export function circularRebarCage(params: {
  diameter: number;
  cover: number;
  barDiameter: number;
  count: number;
  steel: SteelMaterial;
  /**
   * Decalage angulaire (radians) applique a toute la cage avant repartition
   * reguliere. Permet de controler l'orientation des barres par rapport a
   * la direction du moment applique (p.ex. tester la sensibilite de M_Rd
   * selon qu'une barre tombe exactement sur l'axe neutre ou de part et
   * d'autre). Defaut 0 — comportement identique a avant l'ajout de ce
   * parametre (premiere barre en (y=cageRadius, z=0)).
   */
  rotationOffset?: number;
}): Array<{ y: number; z: number; area: number; steel: SteelMaterial }> {
  const cageRadius = params.diameter / 2 - params.cover - params.barDiameter / 2;
  const area = Math.PI * (params.barDiameter / 2) ** 2;

  const bars: Array<{ y: number; z: number; area: number; steel: SteelMaterial }> = [];
  for (let i = 0; i < params.count; i++) {
    const angle = (params.rotationOffset ?? 0) + (2 * Math.PI * i) / params.count;
    bars.push({
      y: cageRadius * Math.cos(angle),
      z: cageRadius * Math.sin(angle),
      area,
      steel: params.steel,
    });
  }
  return bars;
}
