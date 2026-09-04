import type { Section } from '../model/section';
import type { Vertex } from '../geometry/polygon';
import { rectangleToPolygon } from '../geometry/rectangle';
import { polygonSpansAtZ } from '../geometry/scanline';

/** Caracteristiques de la section homogeneisee fissuree, autour du centroide. */
export interface HomogenisedProperties {
  /** Aire homogeneisee (mm²). */
  A: number;
  /** Moment statique autour du centroide (mm³). */
  S: number;
  /** Moment quadratique autour du centroide (mm⁴). */
  I: number;
}

function verticesDe(section: Section): Vertex[] {
  return section.geometry.kind === 'rectangle'
    ? rectangleToPolygon(section.geometry).vertices
    : section.geometry.vertices;
}

/**
 * Caracteristiques de la section homogeneisee FISSUREE pour une position
 * d'axe neutre donnee.
 *
 * Hypotheses de la methode n, differentes de celles de l'ELU et a ne jamais
 * confondre avec elles :
 * - comportement elastique lineaire, aucune plastification ;
 * - beton tendu integralement neglige — seule la zone `z < zNa` compte ;
 * - armatures homogeneisees : `n·A` pour une barre tendue, `(n-1)·A` pour une
 *   barre comprimee, le `-1` traduisant le beton qu'elle DEPLACE — meme
 *   raisonnement que la contribution nette des armatures a l'ELU.
 *
 * L'integration du beton utilise les moments EXACTS de chaque bande
 * (`(z2^k - z1^k)/k`) plutot que la valeur au milieu : pour une largeur
 * constante par bande — le cas d'un rectangle — le resultat est exact, ce qui
 * permet de confronter le solveur a un recalcul manuel ferme sans que
 * l'erreur d'integration ne vienne brouiller la comparaison.
 */
export function crackedProperties(
  section: Section,
  zNa: number,
  n: number,
  nBands: number
): HomogenisedProperties {
  const vertices = verticesDe(section);
  const zValues = vertices.map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);

  let A = 0;
  let S = 0;
  let I = 0;

  const zFin = Math.min(zNa, zBottom);
  if (zFin > zTop) {
    const dz = (zFin - zTop) / nBands;
    for (let i = 0; i < nBands; i++) {
      const z1 = zTop + i * dz;
      const z2 = z1 + dz;
      const largeur = polygonSpansAtZ(vertices, (z1 + z2) / 2).reduce(
        (somme, span) => somme + (span.yEnd - span.yStart),
        0
      );
      if (largeur <= 0) continue;
      A += largeur * (z2 - z1);
      S += (largeur * (z2 ** 2 - z1 ** 2)) / 2;
      I += (largeur * (z2 ** 3 - z1 ** 3)) / 3;
    }
  }

  for (const rebar of section.rebars) {
    const coefficient = rebar.z < zNa ? n - 1 : n;
    const aire = coefficient * rebar.area;
    A += aire;
    S += aire * rebar.z;
    I += aire * rebar.z ** 2;
  }

  return { A, S, I };
}
