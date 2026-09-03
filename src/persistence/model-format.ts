/**
 * Format de modele : la description SERIALISABLE d'un cas de calcul complet.
 *
 * Principe directeur : le fichier ne porte que des donnees d'ENTREE. Tout ce
 * qui se derive (fcd, epsCu2, positions de barres, sommets d'un cercle) est
 * recalcule au chargement. Le format retient donc l'INTENTION de saisie —
 * un pieu Ø600, « 3 HA20 en face inferieure » — et non ses consequences,
 * parce que seule l'intention se relit et se modifie.
 *
 * CONVENTION DE REPERE, piege principal du format : les coordonnees sont
 * transmises telles quelles aux constructeurs, dont les conventions
 * d'entree different.
 *   - `rectangle` et `circle` : la geometrie produite est deja centree sur
 *     son centroide, donc les coordonnees de `bars` et de `rows` sont
 *     BARYCENTRIQUES.
 *   - `polygon` : `polygonSection` recentre sommets ET armatures ensemble,
 *     donc le modele peut utiliser n'importe quelle origine commode — le
 *     coin superieur gauche d'une table de section en T, par exemple.
 *     C'est l'origine du modele qui fait foi, pas le centroide.
 *
 * LIMITE ASSUMEE : un modele ne porte qu'UN SEUL acier, applique a toutes
 * les barres. Le type `RebarLayer` en autorise un par barre, ce qui servira
 * aux sections existantes (melange d'un acier ancien et de renforts). Cette
 * limite est purement expressive : il n'existe pas de conversion
 * `Section -> SectionModel`, donc aucun chemin ne peut produire
 * silencieusement un fichier faux a ce titre.
 */

export const FORMAT_VERSION = 1;

/**
 * Version du moteur ayant produit le fichier. Trace de provenance, JAMAIS
 * relue pour calculer : elle sert a expliquer un ecart si la derivation des
 * materiaux evolue un jour. Tenue a jour a la main avec la version du
 * paquet — pas lue depuis package.json, dont l'import en ESM impose des
 * contorsions sans commune mesure avec l'enjeu.
 */
export const ENGINE_VERSION = '0.1.0';

export interface PointModel {
  y: number;
  z: number;
}

export interface NormModel {
  /** Purement documentaire : le profil est ecrit en entier, jamais retrouve par son nom. */
  name: string;
  gammaC: number;
  gammaS: number;
  alphaCc: number;
  nBands: number;
}

export interface ConcreteModel {
  fck: number;
}

export interface SteelModel {
  fyk: number;
  Es: number;
}

export interface ActionModel {
  N: number;
  My: number;
  Mz: number;
}

export type GeometryModel =
  | { kind: 'rectangle'; width: number; height: number }
  | { kind: 'polygon'; vertices: PointModel[] }
  | { kind: 'circle'; diameter: number; segments?: number };

export type BarSpecModel =
  | { count: number; diameter: number }
  | { diameter: number; maxSpacing: number };

export type RowFaceModel = 'top' | 'bottom' | 'left' | 'right';

export type ReinforcementModel =
  | {
      kind: 'rectangular-layout';
      cover: number;
      stirrupDiameter?: number;
      rows: Array<{ face: RowFaceModel; bars: BarSpecModel }>;
    }
  | {
      kind: 'circular-cage';
      cover: number;
      stirrupDiameter?: number;
      barDiameter: number;
      count: number;
      rotationOffset?: number;
    }
  | {
      kind: 'rows';
      rows: Array<{
        from: PointModel;
        to: PointModel;
        bars: BarSpecModel;
        endpoints?: 'include' | 'exclude';
      }>;
    }
  | { kind: 'bars'; bars: Array<{ y: number; z: number; area: number }> };

export interface SectionModel {
  formatVersion: number;
  engineVersion: string;
  name?: string;
  norm: NormModel;
  concrete: ConcreteModel;
  steel: SteelModel;
  geometry: GeometryModel;
  reinforcement: ReinforcementModel;
  action: ActionModel;
}
