import type { ResolvedModel, VerificationResult, NeutralAxisState } from '../../src/index';
import { polygonArea } from '../../src/index';
import type { BlocService, LigneAffichee } from './service-view';
import { outlineOf, zetaOf } from './draw';
import { effectiveDepth, simplifiedLeverArm } from './lever-arm';
import { formatNumber, formatAngleDegrees, formatUtilization } from './format';

/**
 * La verification de FLEXION ELU, mise en blocs.
 *
 * Fonction PURE, sur le modele de `service-view.ts` : elle met en forme le
 * resultat deja calcule, elle ne recalcule rien.
 *
 * Avant ce module, le resultat ELU etait ecrit en HTML directement par
 * `main.ts` : il s affichait a l ecran mais n etait pas un `BlocService`, et
 * manquait donc a la note de calcul et au CSV. L ecran, le CSV et la note
 * lisent desormais ces memes blocs.
 */

/** Titre du bloc qui porte le verdict ELU. */
export const TITRE_FLEXION_ELU = 'Flexion ELU';

/**
 * Les deux bras de levier, explication jointe au bloc d equilibre.
 *
 * Texte brut : il doit pouvoir sortir dans la note et le CSV, ou le HTML
 * n a pas cours.
 */
export const NOTE_BRAS_DE_LEVIER =
  'Deux bras de levier, deux definitions. La distance entre resultantes separe les ' +
  'resultantes de compression et de traction TOTALES, toutes armatures comprises : elle se ' +
  'raccourcit des qu\'une seconde nappe se trouve du cote tendu, même faiblement sollicitée. ' +
  'Le z = d − 0,4x est celui des abaques, fonde sur le bloc rectangulaire et sur la seule ' +
  'nappe la plus eloignee. Les deux sont exacts et ne mesurent pas la même chose.';

/** Masse volumique de l acier (kg/m³), pour le ratio d acier tendu. */
const MASSE_VOLUMIQUE_ACIER = 7850;

function ligne(libelle: string, valeur: string): LigneAffichee {
  return { libelle, valeur };
}

/** Retire les lignes absentes : une grandeur non calculee ne s affiche pas en tiret. */
function presentes(lignes: Array<LigneAffichee | null>): LigneAffichee[] {
  return lignes.filter((l): l is LigneAffichee => l !== null);
}

/**
 * Les blocs de la flexion ELU, dans l ordre de l ecran.
 *
 * Le premier porte le verdict et le taux ; les suivants detaillent la
 * sollicitation, la resistance, l equilibre, les materiaux et le
 * ferraillage. Un groupe sans aucune ligne est omis, comme a l ecran.
 */
export function blocsFlexionUls(
  resolu: ResolvedModel,
  resultat: VerificationResult,
  etatAxe: NeutralAxisState | null
): BlocService[] {
  const taux = resultat.utilization;

  const magnitudeSollicitante = Math.hypot(resolu.action.My, resolu.action.Mz);
  const magnitudeResistante = resultat.M_Rd
    ? Math.hypot(resultat.M_Rd.y, resultat.M_Rd.z)
    : null;

  const aireBeton = polygonArea(outlineOf(resolu.section));
  const aireAcier = resolu.section.rebars.reduce((somme, r) => somme + r.area, 0);

  const verdict: BlocService = {
    titre: TITRE_FLEXION_ELU,
    lignes: [ligne('Taux d\'exploitation', formatUtilization(taux))],
    verdict: {
      ok: resultat.ok,
      texte: `${resultat.ok ? 'Vérifié' : 'Non vérifié'} — taux ${formatUtilization(taux)}`,
    },
    note: resultat.reason ?? null,
  };

  const sollicitation = presentes([
    ligne('Effort normal N', `${formatNumber(resolu.action.N, 1)} kN`),
    ligne(
      'Moment sollicitant',
      `${formatNumber(magnitudeSollicitante, 1)} kN.m — My ${formatNumber(resolu.action.My, 1)}, Mz ${formatNumber(resolu.action.Mz, 1)}`
    ),
    ligne('Chemin de chargement', resultat.mode === 'constant-N' ? 'N constant' : 'proportionnel'),
  ]);

  const resistance = presentes([
    magnitudeResistante !== null
      ? ligne('Moment résistant', `${formatNumber(magnitudeResistante, 1)} kN.m`)
      : null,
    resultat.M_Rd
      ? ligne(
          'Composantes M_Rd',
          `My ${formatNumber(resultat.M_Rd.y, 1)}, Mz ${formatNumber(resultat.M_Rd.z, 1)} kN.m`
        )
      : null,
    magnitudeResistante !== null && magnitudeResistante > 0
      ? ligne(
          'Marge disponible',
          `${formatNumber(magnitudeResistante - magnitudeSollicitante, 1)} kN.m`
        )
      : null,
  ]);

  // Hauteur utile mesuree perpendiculairement a l'axe neutre, d'ou le bras
  // de levier simplifie des abaques.
  const hauteurUtile =
    resultat.neutralAxis === null
      ? null
      : effectiveDepth(resolu.section, resultat.neutralAxis.angle, resultat.neutralAxis.offset);

  const equilibre = presentes([
    resultat.neutralAxis
      ? ligne('Inclinaison de l\'axe neutre', `${formatAngleDegrees(resultat.neutralAxis.angle)} deg`)
      : null,
    resultat.neutralAxis
      ? ligne('Position de l\'axe neutre', `${formatNumber(resultat.neutralAxis.offset, 1)} mm`)
      : null,
    etatAxe?.compression
      ? ligne(
          'Résultante de compression',
          `${formatNumber(etatAxe.compression.force, 0)} kN a z = ${formatNumber(etatAxe.compression.z, 1)} mm`
        )
      : null,
    etatAxe?.tension
      ? ligne(
          'Résultante de traction',
          `${formatNumber(etatAxe.tension.force, 0)} kN a z = ${formatNumber(etatAxe.tension.z, 1)} mm`
        )
      : null,
    resultat.leverArm !== null
      ? ligne('Distance entre resultantes', `${formatNumber(resultat.leverArm, 1)} mm`)
      : null,
    hauteurUtile !== null ? ligne('Hauteur utile d', `${formatNumber(hauteurUtile, 1)} mm`) : null,
    hauteurUtile !== null && etatAxe !== null
      ? ligne(
          'Bras de levier z = d − 0,4x',
          `${formatNumber(simplifiedLeverArm(hauteurUtile, etatAxe.x), 1)} mm`
        )
      : null,
  ]);

  const materiaux = [
    ligne('fcd', `${formatNumber(resolu.concrete.fcd, 2)} MPa`),
    ligne('fyd', `${formatNumber(resolu.steel.fyd, 1)} MPa`),
    ligne('Aire de béton', `${formatNumber(aireBeton, 0)} mm²`),
  ];

  // Separation inferieures / superieures par rapport au centroide, et non
  // par rapport a l'axe neutre : c'est la lecture du plan de ferraillage,
  // celle qu'attend l'utilisateur quand il verifie sa saisie.
  const inferieures = resolu.section.rebars.filter((r) => r.z > 0);
  const superieures = resolu.section.rebars.filter((r) => r.z <= 0);
  const aire = (barres: typeof inferieures): number =>
    barres.reduce((somme, r) => somme + r.area, 0);

  // Armatures TENDUES : celles du cote tendu de l'axe neutre. C'est sur
  // elles seules que porte le ratio d'acier demande.
  const axeNeutre = resultat.neutralAxis;
  const tendues =
    axeNeutre === null
      ? []
      : resolu.section.rebars.filter(
          (r) => zetaOf({ y: r.y, z: r.z }, axeNeutre.angle) > axeNeutre.offset
        );
  const aireTendue = aire(tendues);

  // Ratio pondere : par metre courant, le volume d'acier vaut As x 1 m et le
  // volume de beton Ac x 1 m, donc le rapport des aires suffit — multiplie
  // par la masse volumique de l'acier.
  const ratioTendu = aireBeton > 0 ? (aireTendue / aireBeton) * MASSE_VOLUMIQUE_ACIER : 0;

  const ferraillage = presentes([
    ligne(
      'Armatures inférieures',
      `${inferieures.length} barres, ${formatNumber(aire(inferieures), 0)} mm²`
    ),
    ligne(
      'Armatures supérieures',
      `${superieures.length} barres, ${formatNumber(aire(superieures), 0)} mm²`
    ),
    ligne('Total', `${resolu.section.rebars.length} barres, ${formatNumber(aireAcier, 0)} mm²`),
    aireBeton > 0
      ? ligne('Taux d\'armature total', `${formatNumber((100 * aireAcier) / aireBeton, 2)} %`)
      : null,
    axeNeutre !== null
      ? ligne('Armatures tendues', `${tendues.length} barres, ${formatNumber(aireTendue, 0)} mm²`)
      : null,
    axeNeutre !== null && aireBeton > 0
      ? ligne('Ratio acier tendu', `${formatNumber(ratioTendu, 1)} kg/m³ de béton`)
      : null,
  ]);

  const groupes: BlocService[] = [
    { titre: 'Sollicitation', lignes: sollicitation, verdict: null, note: null },
    { titre: 'Résistance', lignes: resistance, verdict: null, note: null },
    {
      titre: 'Équilibre de la section',
      lignes: equilibre,
      verdict: null,
      note: resultat.leverArm !== null ? NOTE_BRAS_DE_LEVIER : null,
    },
    { titre: 'Matériaux', lignes: materiaux, verdict: null, note: null },
    { titre: 'Ferraillage', lignes: ferraillage, verdict: null, note: null },
  ];

  return [verdict, ...groupes.filter((g) => g.lignes.length > 0)];
}
