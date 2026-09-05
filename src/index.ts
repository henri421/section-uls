export type { NormProfile } from './model/norm-profile';
export { ec2Recommended } from './norms/ec2-recommended';

export type { ConcreteMaterial, ConcreteLaw } from './model/concrete';
export { createConcrete } from './model/concrete';
export { concreteStress } from './constitutive/concrete-law';

export type { SteelMaterial } from './model/steel';
export { createSteel } from './model/steel';
export { steelStress } from './constitutive/steel-law';

export type { RectangularGeometry } from './geometry/rectangle';
export type { Section, RebarLayer, Action } from './model/section';
export { rectangularSection } from './geometry/rectangle';

export type { StressResultant } from './integration/fiber-rectangle';
export { integrateRectangle } from './integration/fiber-rectangle';

export type { UniaxialResult } from './solvers/uls-uniaxial';
export { verifyUniaxial } from './solvers/uls-uniaxial';

export type { PolygonGeometry, Vertex } from './geometry/polygon';
export { polygonSection, polygonArea, polygonCentroid } from './geometry/polygon';
export { rectangleToPolygon } from './geometry/rectangle';
export { circularSection, circularRebarCage } from './geometry/circle';

export type { BarSpec, BarCount, BarSpacing, RowSummary, RebarRow, RowFace } from './geometry/rebar-layout';
export { rebarRow, rectangularRebarLayout, formatRow } from './geometry/rebar-layout';

export type { Resultant, BiaxialResultant } from './integration/fiber-polygon-biaxial';
export { integratePolygonBiaxial } from './integration/fiber-polygon-biaxial';

export type { BiaxialAction, BiaxialResult } from './solvers/uls-biaxial';
export { verifyBiaxial } from './solvers/uls-biaxial';

export type {
  SectionModel, NormModel, ConcreteModel, SteelModel, ActionModel, PointModel,
  GeometryModel, ReinforcementModel, BarSpecModel, RowFaceModel,
  ServiceActionModel, ServiceActionsModel,
} from './persistence/model-format';
export {
  FORMAT_VERSION, ENGINE_VERSION, SUPPORTED_FORMAT_VERSIONS,
} from './persistence/model-format';

export { parseModel, serializeModel, ModelParseError } from './persistence/parse';

export type { ResolvedModel, ResolvedServiceActions } from './persistence/resolve';
export { resolveModel } from './persistence/resolve';

export type { MomentPoint, AxialMomentPoint, DiagramPointNM } from './domains/interaction';
export { interactionCurveAtN, interactionCurveNM, interactionDiagramNM } from './domains/interaction';

export type { LoadingMode, UtilizationResult } from './domains/utilization';
export { utilizationRatio } from './domains/utilization';

export type { VerificationResult } from './domains/verify-section';
export { verifySection } from './domains/verify-section';

export type { NeutralAxisState } from './solvers/uls-biaxial';
export { capacityAtAngle } from './solvers/uls-biaxial';

export type { HomogenisedProperties } from './service/cracked-section';
export { crackedProperties } from './service/cracked-section';

export type { ServiceLimits, ServiceOptions, ServiceResult } from './service/verify-service';
export { verifyServiceUniaxial } from './service/verify-service';

export type { EffectiveTensionArea } from './service/effective-area';
export { effectiveTensionArea, equivalentBarDiameter, barDiameterOf } from './service/effective-area';

export type { CrackOptions, CrackResult } from './service/crack-width';
export { verifyCrackWidth } from './service/crack-width';

export { uncrackedProperties } from './service/uncracked-section';
export type { CurvatureOptions, CurvatureResult } from './service/curvature';
export { sectionCurvature } from './service/curvature';

// --- Effort tranchant (§6.2) — ELU, donc NormProfile et valeurs de calcul ---
export type { ShearGeometry } from './shear/shear-geometry';
export { shearGeometry } from './shear/shear-geometry';

export type {
  ShearWithoutLinksOptions,
  ShearWithoutLinksResult,
} from './shear/shear-without-links';
export { shearWithoutLinks } from './shear/shear-without-links';

export type {
  ShearReinforcement,
  ShearWithLinksOptions,
  ShearWithLinksResult,
} from './shear/shear-with-links';
export { shearWithLinks } from './shear/shear-with-links';

export type { ShearAction, ShearResult, ShearFailureMode } from './shear/verify-shear';
export { verifyShear } from './shear/verify-shear';

// --- Dispositions constructives (§9) ---
export type {
  ElementType,
  LongitudinalOptions,
  LongitudinalCheck,
} from './detailing/longitudinal';
export {
  concreteArea,
  providedLongitudinalArea,
  minimumLongitudinalArea,
  maximumLongitudinalArea,
  checkLongitudinal,
} from './detailing/longitudinal';

export type { WebReinforcement, WebOptions, WebCheck } from './detailing/transverse';
export {
  webReinforcementRatio,
  minimumWebRatio,
  checkWebReinforcement,
} from './detailing/transverse';

export type { DetailingResult, WebCheckApplicable } from './detailing/verify-detailing';
export { verifyDetailing } from './detailing/verify-detailing';

// --- Fissuration sous deformation genee (Zwang), §7.3.2 ---
export type { RestraintType, RestraintOptions, RestraintResult } from './detailing/restraint';
export { minimumRestraintArea, thicknessFactor } from './detailing/restraint';

// --- Zwang, methode Meyer / DIN 1045 (distincte du §7.3.2 ci-dessus) ---
export type {
  ClasseDeBeton, MeyerCas, MeyerBridage, MeyerModeK, MeyerRegime,
  MeyerParams, MeyerResult, ChoixDeBarres,
} from './detailing/meyer-restraint';
export {
  FCTM_PAR_CLASSE,
  facteurContraintesPropres,
  meyerRestraintReinforcement,
  choixDeBarres,
} from './detailing/meyer-restraint';
