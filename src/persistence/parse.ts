import {
  FORMAT_VERSION,
  type SectionModel,
  type NormModel,
  type ConcreteModel,
  type SteelModel,
  type ActionModel,
  type PointModel,
  type GeometryModel,
  type ReinforcementModel,
  type BarSpecModel,
  type RowFaceModel,
} from './model-format';

/**
 * Erreur de lecture d'un modele. Son message nomme TOUJOURS le chemin exact
 * du champ fautif : sans cela, un fichier de trois cents lignes est
 * indebogable.
 */
export class ModelParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelParseError';
  }
}

function echec(chemin: string, probleme: string): never {
  throw new ModelParseError(`${chemin} : ${probleme}`);
}

function objet(v: unknown, chemin: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    echec(chemin, `objet attendu, recu ${JSON.stringify(v)}`);
  }
  return v as Record<string, unknown>;
}

function tableau(v: unknown, chemin: string): unknown[] {
  if (!Array.isArray(v)) echec(chemin, `tableau attendu, recu ${JSON.stringify(v)}`);
  return v;
}

function nombre(v: unknown, chemin: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    echec(chemin, `nombre attendu, recu ${JSON.stringify(v)}`);
  }
  return v;
}

function positif(v: unknown, chemin: string): number {
  const n = nombre(v, chemin);
  if (n <= 0) echec(chemin, `valeur strictement positive attendue, recu ${n}`);
  return n;
}

function positifOuNul(v: unknown, chemin: string): number {
  const n = nombre(v, chemin);
  if (n < 0) echec(chemin, `valeur positive ou nulle attendue, recu ${n}`);
  return n;
}

function entierPositif(v: unknown, chemin: string): number {
  const n = nombre(v, chemin);
  if (!Number.isInteger(n) || n < 0) {
    echec(chemin, `entier positif attendu, recu ${n}`);
  }
  return n;
}

function chaine(v: unknown, chemin: string): string {
  if (typeof v !== 'string') echec(chemin, `chaine attendue, recu ${JSON.stringify(v)}`);
  return v;
}

function optionnel<T>(v: unknown, chemin: string, lire: (v: unknown, c: string) => T): T | undefined {
  return v === undefined ? undefined : lire(v, chemin);
}

function point(v: unknown, chemin: string): PointModel {
  const o = objet(v, chemin);
  return { y: nombre(o.y, `${chemin}.y`), z: nombre(o.z, `${chemin}.z`) };
}

function barSpec(v: unknown, chemin: string): BarSpecModel {
  const o = objet(v, chemin);
  const diameter = positif(o.diameter, `${chemin}.diameter`);
  if (o.count !== undefined) {
    return { count: entierPositif(o.count, `${chemin}.count`), diameter };
  }
  if (o.maxSpacing !== undefined) {
    return { diameter, maxSpacing: positif(o.maxSpacing, `${chemin}.maxSpacing`) };
  }
  echec(chemin, "`count` ou `maxSpacing` attendu, aucun des deux n'est present");
}

function geometrie(v: unknown, chemin: string): GeometryModel {
  const o = objet(v, chemin);
  const kind = chaine(o.kind, `${chemin}.kind`);

  if (kind === 'rectangle') {
    return {
      kind,
      width: positif(o.width, `${chemin}.width`),
      height: positif(o.height, `${chemin}.height`),
    };
  }
  if (kind === 'polygon') {
    const brut = tableau(o.vertices, `${chemin}.vertices`);
    if (brut.length < 3) {
      echec(`${chemin}.vertices`, `au moins trois sommets attendus, recu ${brut.length}`);
    }
    return { kind, vertices: brut.map((s, i) => point(s, `${chemin}.vertices[${i}]`)) };
  }
  if (kind === 'circle') {
    const segments = optionnel(o.segments, `${chemin}.segments`, entierPositif);
    if (segments !== undefined && segments < 3) {
      echec(`${chemin}.segments`, `au moins trois cotes attendus, recu ${segments}`);
    }
    return { kind, diameter: positif(o.diameter, `${chemin}.diameter`), ...(segments !== undefined ? { segments } : {}) };
  }
  echec(`${chemin}.kind`, `valeur inconnue ${JSON.stringify(kind)} (attendu rectangle, polygon ou circle)`);
}

const FACES: readonly RowFaceModel[] = ['top', 'bottom', 'left', 'right'];

function face(v: unknown, chemin: string): RowFaceModel {
  const s = chaine(v, chemin);
  const trouvee = FACES.find((f) => f === s);
  if (!trouvee) echec(chemin, `face inconnue ${JSON.stringify(s)} (attendu ${FACES.join(', ')})`);
  return trouvee;
}

/**
 * Lit le champ optionnel `endpoints` d'un lit d'armatures.
 *
 * Extrait en fonction nommee avec type de retour explicite : inline (via une
 * IIFE dans un ternaire), le retrecissement operee par le garde `if (s !==
 * 'include' && s !== 'exclude') echec(...)` se perd a la fusion par
 * spread (`{ ...(cond ? { endpoints } : {}) }`) et le champ redevient
 * `string` aux yeux du compilateur — bug de TypeScript, verifie isolement.
 * Une signature de retour explicite fixe le type nominalement et evite le
 * probleme, sans recourir a une assertion `as`.
 */
function endpointsOptionnel(v: unknown, chemin: string): 'include' | 'exclude' | undefined {
  if (v === undefined) return undefined;
  const s = chaine(v, chemin);
  if (s !== 'include' && s !== 'exclude') {
    echec(chemin, `attendu include ou exclude, recu ${JSON.stringify(s)}`);
  }
  return s;
}

function ferraillage(v: unknown, chemin: string): ReinforcementModel {
  const o = objet(v, chemin);
  const kind = chaine(o.kind, `${chemin}.kind`);

  if (kind === 'rectangular-layout') {
    const rows = tableau(o.rows, `${chemin}.rows`).map((r, i) => {
      const ro = objet(r, `${chemin}.rows[${i}]`);
      return {
        face: face(ro.face, `${chemin}.rows[${i}].face`),
        bars: barSpec(ro.bars, `${chemin}.rows[${i}].bars`),
      };
    });
    const stirrupDiameter = optionnel(o.stirrupDiameter, `${chemin}.stirrupDiameter`, positifOuNul);
    return {
      kind,
      cover: positifOuNul(o.cover, `${chemin}.cover`),
      ...(stirrupDiameter !== undefined ? { stirrupDiameter } : {}),
      rows,
    };
  }

  if (kind === 'circular-cage') {
    const stirrupDiameter = optionnel(o.stirrupDiameter, `${chemin}.stirrupDiameter`, positifOuNul);
    const rotationOffset = optionnel(o.rotationOffset, `${chemin}.rotationOffset`, nombre);
    return {
      kind,
      cover: positifOuNul(o.cover, `${chemin}.cover`),
      ...(stirrupDiameter !== undefined ? { stirrupDiameter } : {}),
      barDiameter: positif(o.barDiameter, `${chemin}.barDiameter`),
      count: entierPositif(o.count, `${chemin}.count`),
      ...(rotationOffset !== undefined ? { rotationOffset } : {}),
    };
  }

  if (kind === 'rows') {
    const rows = tableau(o.rows, `${chemin}.rows`).map((r, i) => {
      const ro = objet(r, `${chemin}.rows[${i}]`);
      const endpoints = endpointsOptionnel(ro.endpoints, `${chemin}.rows[${i}].endpoints`);
      return {
        from: point(ro.from, `${chemin}.rows[${i}].from`),
        to: point(ro.to, `${chemin}.rows[${i}].to`),
        bars: barSpec(ro.bars, `${chemin}.rows[${i}].bars`),
        ...(endpoints !== undefined ? { endpoints } : {}),
      };
    });
    return { kind, rows };
  }

  if (kind === 'bars') {
    const bars = tableau(o.bars, `${chemin}.bars`).map((b, i) => {
      const bo = objet(b, `${chemin}.bars[${i}]`);
      return {
        y: nombre(bo.y, `${chemin}.bars[${i}].y`),
        z: nombre(bo.z, `${chemin}.bars[${i}].z`),
        area: positif(bo.area, `${chemin}.bars[${i}].area`),
      };
    });
    return { kind, bars };
  }

  echec(
    `${chemin}.kind`,
    `valeur inconnue ${JSON.stringify(kind)} (attendu rectangular-layout, circular-cage, rows ou bars)`
  );
}

function norme(v: unknown, chemin: string): NormModel {
  const o = objet(v, chemin);
  return {
    name: chaine(o.name, `${chemin}.name`),
    gammaC: positif(o.gammaC, `${chemin}.gammaC`),
    gammaS: positif(o.gammaS, `${chemin}.gammaS`),
    alphaCc: positif(o.alphaCc, `${chemin}.alphaCc`),
    nBands: entierPositif(o.nBands, `${chemin}.nBands`),
  };
}

function beton(v: unknown, chemin: string): ConcreteModel {
  const o = objet(v, chemin);
  return { fck: positif(o.fck, `${chemin}.fck`) };
}

function acier(v: unknown, chemin: string): SteelModel {
  const o = objet(v, chemin);
  return { fyk: positif(o.fyk, `${chemin}.fyk`), Es: positif(o.Es, `${chemin}.Es`) };
}

function sollicitation(v: unknown, chemin: string): ActionModel {
  const o = objet(v, chemin);
  return {
    N: nombre(o.N, `${chemin}.N`),
    My: nombre(o.My, `${chemin}.My`),
    Mz: nombre(o.Mz, `${chemin}.Mz`),
  };
}

/**
 * Lit un modele depuis sa representation JSON, en validant tout. Un fichier
 * s'edite au bloc-notes, se tronque a la copie, se produit par un autre
 * outil : aucune confiance ne lui est accordee.
 */
export function parseModel(json: string): SectionModel {
  let brut: unknown;
  try {
    brut = JSON.parse(json);
  } catch (e) {
    throw new ModelParseError(`JSON invalide : ${(e as Error).message}`);
  }

  const o = objet(brut, 'modele');

  const formatVersion = nombre(o.formatVersion, 'formatVersion');
  if (formatVersion !== FORMAT_VERSION) {
    echec(
      'formatVersion',
      `version ${formatVersion} non supportee (ce moteur lit la version ${FORMAT_VERSION})`
    );
  }

  const geometry = geometrie(o.geometry, 'geometry');
  const reinforcement = ferraillage(o.reinforcement, 'reinforcement');

  // Coherence croisee : deux formes de ferraillage tirent leurs dimensions
  // de la geometrie et n'ont donc de sens que sur celle-ci.
  if (reinforcement.kind === 'rectangular-layout' && geometry.kind !== 'rectangle') {
    echec(
      'reinforcement',
      `un ferraillage rectangular-layout exige une geometrie rectangle, mais la geometrie est ${geometry.kind}`
    );
  }
  if (reinforcement.kind === 'circular-cage' && geometry.kind !== 'circle') {
    echec(
      'reinforcement',
      `un ferraillage circular-cage exige une geometrie circle, mais la geometrie est ${geometry.kind}`
    );
  }

  const name = optionnel(o.name, 'name', chaine);

  return {
    formatVersion,
    engineVersion: chaine(o.engineVersion, 'engineVersion'),
    ...(name !== undefined ? { name } : {}),
    norm: norme(o.norm, 'norm'),
    concrete: beton(o.concrete, 'concrete'),
    steel: acier(o.steel, 'steel'),
    geometry,
    reinforcement,
    action: sollicitation(o.action, 'action'),
  };
}

/**
 * Ecrit un modele en JSON indente, avec un ordre de cles STABLE.
 *
 * L'objet a ecrire est reconstruit explicitement : `JSON.stringify` suit
 * l'ordre d'insertion des cles de l'objet recu, donc celui de l'appelant,
 * qui n'offre aucune garantie. Sans cette reconstruction, deux modeles
 * equivalents produiraient deux fichiers differents et tout suivi de
 * version deviendrait illisible.
 */
function barsOrdonnees(b: BarSpecModel) {
  return 'count' in b
    ? { count: b.count, diameter: b.diameter }
    : { diameter: b.diameter, maxSpacing: b.maxSpacing };
}

function geometrieOrdonnee(g: GeometryModel) {
  switch (g.kind) {
    case 'rectangle':
      return { kind: g.kind, width: g.width, height: g.height };
    case 'polygon':
      return { kind: g.kind, vertices: g.vertices.map((v) => ({ y: v.y, z: v.z })) };
    case 'circle':
      return {
        kind: g.kind,
        diameter: g.diameter,
        ...(g.segments !== undefined ? { segments: g.segments } : {}),
      };
  }
}

function ferraillageOrdonne(r: ReinforcementModel) {
  switch (r.kind) {
    case 'rectangular-layout':
      return {
        kind: r.kind,
        cover: r.cover,
        ...(r.stirrupDiameter !== undefined ? { stirrupDiameter: r.stirrupDiameter } : {}),
        rows: r.rows.map((row) => ({ face: row.face, bars: barsOrdonnees(row.bars) })),
      };
    case 'circular-cage':
      return {
        kind: r.kind,
        cover: r.cover,
        ...(r.stirrupDiameter !== undefined ? { stirrupDiameter: r.stirrupDiameter } : {}),
        barDiameter: r.barDiameter,
        count: r.count,
        ...(r.rotationOffset !== undefined ? { rotationOffset: r.rotationOffset } : {}),
      };
    case 'rows':
      return {
        kind: r.kind,
        rows: r.rows.map((row) => ({
          from: { y: row.from.y, z: row.from.z },
          to: { y: row.to.y, z: row.to.z },
          bars: barsOrdonnees(row.bars),
          ...(row.endpoints !== undefined ? { endpoints: row.endpoints } : {}),
        })),
      };
    case 'bars':
      return { kind: r.kind, bars: r.bars.map((b) => ({ y: b.y, z: b.z, area: b.area })) };
  }
}

export function serializeModel(model: SectionModel): string {
  const ordonne = {
    formatVersion: model.formatVersion,
    engineVersion: model.engineVersion,
    ...(model.name !== undefined ? { name: model.name } : {}),
    norm: {
      name: model.norm.name,
      gammaC: model.norm.gammaC,
      gammaS: model.norm.gammaS,
      alphaCc: model.norm.alphaCc,
      nBands: model.norm.nBands,
    },
    concrete: { fck: model.concrete.fck },
    steel: { fyk: model.steel.fyk, Es: model.steel.Es },
    geometry: geometrieOrdonnee(model.geometry),
    reinforcement: ferraillageOrdonne(model.reinforcement),
    action: { N: model.action.N, My: model.action.My, Mz: model.action.Mz },
  };

  return `${JSON.stringify(ordonne, null, 2)}\n`;
}
