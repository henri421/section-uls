import type { SectionModel } from './model-format';
import type { Section, RebarLayer, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { BiaxialAction } from '../solvers/uls-biaxial';
import type { ShearAction } from '../shear/verify-shear';
import type { ShearReinforcement } from '../shear/shear-with-links';
import type { ElementType } from '../detailing/longitudinal';
import type { RestraintType, RestraintOptions } from '../detailing/restraint';
import type { MeyerParams } from '../detailing/meyer-restraint';
import { createConcrete } from '../model/concrete';
import { createSteel } from '../model/steel';
import { rectangularSection } from '../geometry/rectangle';
import { polygonSection } from '../geometry/polygon';
import { circularSection, circularRebarCage } from '../geometry/circle';
import { rectangularRebarLayout, rebarRow } from '../geometry/rebar-layout';

/**
 * Sollicitations de service resolues, sous la forme `Action` (`{N, M}`) du
 * noyau : elles se passent telles quelles a `verifyServiceUniaxial`,
 * `verifyCrackWidth` et `sectionCurvature`, sans conversion a la charge de
 * l'appelant. Chacune est optionnelle, et l'absence n'est pas remplacee par
 * un zero : `{N: 0, M: 0}` donnerait des contraintes et une courbure nulles,
 * affichables et fausses.
 */
export interface ResolvedServiceActions {
  /** Combinaison caracteristique — limitation des contraintes (§7.2). */
  characteristic?: Action;
  /** Combinaison quasi-permanente — fissuration (§7.3) et courbure (§7.4.3). */
  quasiPermanent?: Action;
}

/**
 * Effort tranchant resolu, decoupe selon la signature de `verifyShear` :
 *
 *     verifyShear(r.section, r.shear.action, r.norm, r.shear.options)
 *
 * `action.N_Ed` vient de l'effort normal de l'ELU, `model.action.N` : la
 * verification du §6.2 est une verification a l'ELU, et le modele ne porte
 * volontairement pas un second effort normal qui pourrait le contredire.
 */
export interface ResolvedShear {
  action: ShearAction;
  options: {
    /** Cadres declares ; absents, la verification se limite au §6.2.2. */
    links?: ShearReinforcement;
    /** Absent : le defaut du §6.2.3(2) applique par `shearWithLinks`, soit 2,5. */
    cotTheta?: number;
  };
}

/**
 * Deformation genee resolue, decoupee selon la signature de
 * `minimumRestraintArea(section, type, options)`.
 *
 * `options.NEd` n'est JAMAIS renseigne, deliberement : le §7.3.2 se verifie
 * sous la seule deformation genee, et y injecter l'effort normal de l'ELU
 * reduirait `k_c` — donc l'armature exigee — au titre d'une compression qui
 * n'est pas concomitante de la fissuration au jeune age.
 */
export interface ResolvedRestraint {
  type: RestraintType;
  options: RestraintOptions;
}

export interface ResolvedModel {
  section: Section;
  action: BiaxialAction;
  norm: NormProfile;
  /** Rendu explicitement : non deductible de `section`, et utile a l'affichage (fcd). */
  concrete: ConcreteMaterial;
  /** Idem (fyd). */
  steel: SteelMaterial;
  /** Absentes du modele, absentes ici : `resolveModel` ne les invente pas. */
  serviceActions?: ResolvedServiceActions;
  /** Type d'element du §9, tel quel : `verifyDetailing` le prend ainsi. */
  elementType?: ElementType;
  /** Voir `ResolvedShear`. */
  shear?: ResolvedShear;
  /** Voir `ResolvedRestraint`. */
  restraint?: ResolvedRestraint;
  /** Parametres de la methode Meyer, prets pour `meyerRestraintReinforcement`. */
  meyer?: MeyerParams;
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

  const service = model.serviceActions;
  const serviceActions: ResolvedServiceActions | undefined =
    service === undefined
      ? undefined
      : {
          ...(service.characteristic !== undefined
            ? { characteristic: { N: service.characteristic.N, M: service.characteristic.M } }
            : {}),
          ...(service.quasiPermanent !== undefined
            ? { quasiPermanent: { N: service.quasiPermanent.N, M: service.quasiPermanent.M } }
            : {}),
        };

  // Blocs de la version 3. Chacun est rendu dans le type qu'attend son module
  // de calcul, pour qu'aucune conversion ne reste a la charge de l'appelant —
  // c'est la meme regle que pour les sollicitations de service. Absent du
  // modele, absent ici : rien n'est complete par un defaut.
  const shear: ResolvedShear | undefined =
    model.shear === undefined
      ? undefined
      : {
          action: { V_Ed: model.shear.V_Ed, N_Ed: model.action.N },
          options: {
            ...(model.shear.links !== undefined
              ? {
                  links: {
                    Asw: model.shear.links.Asw,
                    s: model.shear.links.s,
                    fywk: model.shear.links.fywk,
                  },
                }
              : {}),
            ...(model.shear.cotTheta !== undefined ? { cotTheta: model.shear.cotTheta } : {}),
          },
        };

  const restraint: ResolvedRestraint | undefined =
    model.restraint === undefined
      ? undefined
      : {
          type: model.restraint.type,
          options: {
            ...(model.restraint.fctEff !== undefined ? { fctEff: model.restraint.fctEff } : {}),
            ...(model.restraint.sigmaS !== undefined ? { sigmaS: model.restraint.sigmaS } : {}),
            ...(model.restraint.effectiveZoneOnly !== undefined
              ? { effectiveZoneOnly: model.restraint.effectiveZoneOnly }
              : {}),
          },
        };

  const meyer: MeyerParams | undefined =
    model.meyer === undefined
      ? undefined
      : {
          h: model.meyer.h,
          d1: model.meyer.d1,
          ds: model.meyer.ds,
          wk: model.meyer.wk,
          fctm: model.meyer.fctm,
          kzt: model.meyer.kzt,
          cas: model.meyer.cas,
          bridage: model.meyer.bridage,
          ...(model.meyer.kmode !== undefined ? { kmode: model.meyer.kmode } : {}),
        };

  return {
    section,
    action: { N: model.action.N, My: model.action.My, Mz: model.action.Mz },
    norm,
    concrete,
    steel,
    ...(serviceActions !== undefined ? { serviceActions } : {}),
    ...(model.elementType !== undefined ? { elementType: model.elementType } : {}),
    ...(shear !== undefined ? { shear } : {}),
    ...(restraint !== undefined ? { restraint } : {}),
    ...(meyer !== undefined ? { meyer } : {}),
  };
}
