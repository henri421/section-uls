import type { SectionModel } from './model-format';
import type { Section, RebarLayer } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { BiaxialAction } from '../solvers/uls-biaxial';
import { createConcrete } from '../model/concrete';
import { createSteel } from '../model/steel';
import { rectangularSection } from '../geometry/rectangle';
import { polygonSection } from '../geometry/polygon';
import { circularSection, circularRebarCage } from '../geometry/circle';
import { rectangularRebarLayout, rebarRow } from '../geometry/rebar-layout';

export interface ResolvedModel {
  section: Section;
  action: BiaxialAction;
  norm: NormProfile;
  /** Rendu explicitement : non deductible de `section`, et utile a l'affichage (fcd). */
  concrete: ConcreteMaterial;
  /** Idem (fyd). */
  steel: SteelMaterial;
}

/**
 * Construit les objets de calcul a partir d'un modele.
 *
 * Tout ce qui se derive est recalcule ici : materiaux, positions de barres,
 * sommets d'un cercle. Le modele ne porte que des entrees.
 *
 * Il n'existe volontairement PAS de conversion inverse `Section ->
 * SectionModel` : le modele est la source de verite, la section en est le
 * produit. L'inverse serait lossy — l'intention de saisie a disparu de la
 * section — et inviterait a un aller-retour qui degraderait le fichier a
 * chaque enregistrement.
 */
export function resolveModel(model: SectionModel): ResolvedModel {
  const norm: NormProfile = { ...model.norm };
  const concrete = createConcrete(model.concrete.fck, norm);
  const steel = createSteel(model.steel.fyk, model.steel.Es, norm);

  const geometry = model.geometry;
  const reinforcement = model.reinforcement;

  let rebars: RebarLayer[];

  switch (reinforcement.kind) {
    case 'rectangular-layout':
      // Le retrecissement de type sert aussi de garde-fou : `resolveModel`
      // peut recevoir un modele construit a la main, jamais passe par
      // `parseModel`, donc la coherence ne peut pas etre presumee acquise.
      if (geometry.kind !== 'rectangle') {
        throw new Error(
          `resolveModel : un ferraillage rectangular-layout exige une geometrie rectangle, recu ${geometry.kind}`
        );
      }
      rebars = rectangularRebarLayout({
        width: geometry.width,
        height: geometry.height,
        cover: reinforcement.cover,
        stirrupDiameter: reinforcement.stirrupDiameter,
        steel,
        rows: reinforcement.rows,
      }).bars;
      break;

    case 'circular-cage':
      if (geometry.kind !== 'circle') {
        throw new Error(
          `resolveModel : un ferraillage circular-cage exige une geometrie circle, recu ${geometry.kind}`
        );
      }
      rebars = circularRebarCage({
        diameter: geometry.diameter,
        cover: reinforcement.cover,
        stirrupDiameter: reinforcement.stirrupDiameter,
        barDiameter: reinforcement.barDiameter,
        count: reinforcement.count,
        rotationOffset: reinforcement.rotationOffset,
        steel,
      });
      break;

    case 'rows':
      rebars = reinforcement.rows.flatMap(
        (row) =>
          rebarRow({
            from: row.from,
            to: row.to,
            bars: row.bars,
            steel,
            endpoints: row.endpoints,
          }).bars
      );
      break;

    case 'bars':
      rebars = reinforcement.bars.map((b) => ({ y: b.y, z: b.z, area: b.area, steel }));
      break;
  }

  let section: Section;
  switch (geometry.kind) {
    case 'rectangle':
      section = rectangularSection({
        width: geometry.width,
        height: geometry.height,
        concrete,
        rebars,
      });
      break;
    case 'polygon':
      section = polygonSection({ vertices: geometry.vertices, concrete, rebars });
      break;
    case 'circle':
      section = circularSection({
        diameter: geometry.diameter,
        segments: geometry.segments,
        concrete,
        rebars,
      });
      break;
  }

  return {
    section,
    action: { N: model.action.N, My: model.action.My, Mz: model.action.Mz },
    norm,
    concrete,
    steel,
  };
}
