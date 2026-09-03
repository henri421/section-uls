import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import { rotateSection, rotatePoint, rotateMomentBack } from '../geometry/rotate';
import { integratePolygonBiaxial } from '../integration/fiber-polygon-biaxial';
import type { Resultant } from '../integration/fiber-polygon-biaxial';
import { verifyUniaxial, concretePivotStrainField } from './uls-uniaxial';

export interface BiaxialAction {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Composantes du moment sollicitant (kN·m). SEULE LEUR DIRECTION est utilisee. */
  My: number;
  Mz: number;
}

export interface BiaxialResult {
  /**
   * Axe neutre dans le repere de la section, directement tracable :
   * droite { (y,z) : -y*sin(angle) + z*cos(angle) = offset }.
   */
  neutralAxis: { angle: number; offset: number };
  /** Profondeur perpendiculaire depuis la fibre extreme comprimee (mm). */
  neutralAxisDepth: number;
  /** Moment resistant (kN·m), colineaire et de meme sens que (My, Mz). */
  M_Rd: { y: number; z: number };
  M_Rd_magnitude: number;
  N_Rd: number;
  /** Bras de levier interne (mm), `null` si la section n'a aucune fibre tendue. */
  leverArm: number | null;
  compression: Resultant | null;
  tension: Resultant | null;
  /** Nombre de racines distinctes detectees au balayage. */
  rootCount: number;
  /** Nombre de resolutions droites consommees — diagnostic de budget. */
  innerSolves: number;
  converged: boolean;
}

interface EtatAngle {
  theta: number;
  M: { y: number; z: number };
  ecart: number;
  x: number;
  offset: number;
  compression: Resultant | null;
  tension: Resultant | null;
  leverArm: number | null;
  N_Rd: number;
}

function wrapToPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Verification ELU en flexion composee DEVIEE (EN 1992-1-1).
 *
 * Deux inconnues : l'inclinaison `theta` de l'axe neutre et sa profondeur
 * `x`. Deux equations : `N_R = N_Ed`, et moment resistant colineaire au
 * moment sollicitant.
 *
 * La resolution est imbriquee plutot que par Newton a deux parametres : a
 * `theta` fixe, on tourne une copie de travail de la section, ce qui rend
 * l'axe neutre horizontal et ramene le probleme interne EXACTEMENT a celui
 * de la session 2 — `verifyUniaxial` est appele tel quel, sans etre modifie.
 * Reste une recherche de racine SCALAIRE sur `theta`, encadree donc sans
 * divergence possible, sans jacobien ni amortissement a regler.
 *
 * Seule la DIRECTION de `(My, Mz)` est utilisee, jamais sa magnitude : la
 * fonction rend la capacite dans cette direction, pas un verdict. La
 * comparaison sollicitation/capacite releve du domaine d'interaction
 * (session 4).
 *
 * Limitation reconduite des sessions 1 et 2 : pivot beton uniquement.
 */
export function verifyBiaxial(
  section: Section,
  action: BiaxialAction,
  norm: NormProfile
): BiaxialResult {
  const magnitudeSollicitante = Math.hypot(action.My, action.Mz);
  if (magnitudeSollicitante === 0) {
    throw new Error(
      "verifyBiaxial : (My, Mz) nul, la direction de flexion est indefinie. " +
        "Utiliser verifyUniaxial pour la flexion droite, ou le domaine d'interaction (session 4)."
    );
  }

  const angleSollicitant = Math.atan2(action.Mz, action.My);
  const { epsCu2 } = section.concrete;
  let innerSolves = 0;

  const evaluer = (theta: number): EtatAngle | null => {
    innerSolves += 1;
    const tournee = rotateSection(section, theta);
    const droit = verifyUniaxial(tournee, { N: action.N, M: 0 }, norm);
    if (!droit.converged) return null;

    const zTop = Math.min(...tournee.geometry.vertices.map((v) => v.z));
    const champ = concretePivotStrainField(zTop, droit.neutralAxisDepth, epsCu2);
    const r = integratePolygonBiaxial(tournee, champ, norm.nBands);

    const M = rotateMomentBack({ y: r.My, z: r.Mz }, theta);

    // Le bras de levier se mesure perpendiculairement a l'axe neutre : dans
    // le repere tourne, c'est simplement l'ecart des coordonnees z.
    const leverArm =
      r.compression && r.tension ? Math.abs(r.compression.z - r.tension.z) : null;

    const versSection = (p: Resultant | null): Resultant | null => {
      if (!p) return null;
      const q = rotatePoint({ y: p.y, z: p.z }, -theta);
      return { force: p.force, y: q.y, z: q.z };
    };

    return {
      theta,
      M,
      ecart: wrapToPi(Math.atan2(M.z, M.y) - angleSollicitant),
      x: droit.neutralAxisDepth,
      offset: zTop + droit.neutralAxisDepth,
      compression: versSection(r.compression),
      tension: versSection(r.tension),
      leverArm,
      N_Rd: r.N,
    };
  };

  const echec = (): BiaxialResult => ({
    neutralAxis: { angle: NaN, offset: NaN },
    neutralAxisDepth: NaN,
    M_Rd: { y: NaN, z: NaN },
    M_Rd_magnitude: NaN,
    N_Rd: NaN,
    leverArm: null,
    compression: null,
    tension: null,
    rootCount: 0,
    innerSolves,
    converged: false,
  });

  const TOL_ANGLE = 1e-6;

  // Balayage grossier, puis replis de plus en plus fins. La racine n'est
  // jamais devinee : on exige un encadrement franc, les deux extremites
  // verifiant |ecart| < pi/2 — ce qui ecarte la discontinuite de repliement
  // a +/-pi, qui n'est pas une racine.
  for (const pas of [Math.PI / 12, Math.PI / 36, Math.PI / 180]) {
    const n = Math.round((2 * Math.PI) / pas);
    const etats: Array<EtatAngle | null> = [];
    for (let i = 0; i < n; i++) etats.push(evaluer(i * pas));

    const racines: EtatAngle[] = [];

    for (let i = 0; i < n; i++) {
      const a = etats[i];
      const b = etats[(i + 1) % n];
      if (!a) continue;

      if (Math.abs(a.ecart) < TOL_ANGLE) {
        racines.push(a);
        continue;
      }
      if (!b) continue;
      if (Math.abs(a.ecart) >= Math.PI / 2 || Math.abs(b.ecart) >= Math.PI / 2) continue;
      if (a.ecart * b.ecart > 0) continue;

      const affine = illinois(evaluer, a, b, pas, TOL_ANGLE);
      if (affine) racines.push(affine);
    }

    // Deduplication AVANT comptage : une racine tombant exactement sur un
    // point de balayage est detectee deux fois — une fois comme echantillon,
    // une fois comme encadrement de l'intervalle precedent, dont le produit
    // des ecarts est alors nul. C'est le cas de toute sollicitation alignee
    // sur un axe (theta = 0), donc du controle de non-regression lui-meme :
    // sans cette etape, rootCount vaudrait 2 sur un cas parfaitement sain.
    const distinctes: EtatAngle[] = [];
    for (const r of racines) {
      const dejaVue = distinctes.some(
        (d) => Math.abs(wrapToPi(d.theta - r.theta)) < 1e-3
      );
      if (!dejaVue) distinctes.push(r);
    }

    if (distinctes.length === 0) continue;

    // Choix conservatif si plusieurs racines DISTINCTES subsistent : la plus
    // faible capacite. Un rootCount > 1 sur un cas de validation doit etre
    // investigue, pas absorbe.
    const retenue = distinctes.reduce((meilleure, r) =>
      Math.hypot(r.M.y, r.M.z) < Math.hypot(meilleure.M.y, meilleure.M.z) ? r : meilleure
    );

    return {
      neutralAxis: { angle: wrapToPi(retenue.theta), offset: retenue.offset },
      neutralAxisDepth: retenue.x,
      M_Rd: retenue.M,
      M_Rd_magnitude: Math.hypot(retenue.M.y, retenue.M.z),
      N_Rd: retenue.N_Rd,
      leverArm: retenue.leverArm,
      compression: retenue.compression,
      tension: retenue.tension,
      rootCount: distinctes.length,
      innerSolves,
      converged: true,
    };
  }

  return echec();
}

/**
 * Methode d'Illinois (regula falsi amortie) sur l'ecart angulaire, dans un
 * intervalle deja encadre. Convergence garantie par l'encadrement, sans
 * jacobien ni amortissement a regler.
 */
function illinois(
  evaluer: (theta: number) => EtatAngle | null,
  bas: EtatAngle,
  haut: EtatAngle,
  pas: number,
  tol: number,
  maxIter = 40
): EtatAngle | null {
  let tBas = bas.theta;
  let tHaut = bas.theta + pas;
  let fBas = bas.ecart;
  let fHaut = haut.ecart;
  let dernier: EtatAngle | null = null;

  for (let i = 0; i < maxIter; i++) {
    const t = tHaut - (fHaut * (tHaut - tBas)) / (fHaut - fBas);
    const etat = evaluer(t);
    if (!etat) return dernier;
    dernier = etat;

    if (Math.abs(etat.ecart) < tol || Math.abs(tHaut - tBas) < tol) return etat;

    if (etat.ecart * fHaut < 0) {
      tBas = tHaut;
      fBas = fHaut;
    } else {
      fBas *= 0.5; // amortissement Illinois : evite la stagnation d'une extremite
    }
    tHaut = t;
    fHaut = etat.ecart;
  }

  return dernier;
}
