export interface RectangularGeometry {
  kind: 'rectangle';
  /** Largeur (mm). */
  width: number;
  /** Hauteur totale (mm). */
  height: number;
}

export { rectangularSection } from '../model/section';
