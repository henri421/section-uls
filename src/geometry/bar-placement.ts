import type { Vertex } from './polygon';
import { polygonSpansAtZ } from './scanline';
import { barDiameterOf } from '../service/effective-area';

/**
 * PLACEMENT LIBRE DES ARMATURES : poser, deplacer, verifier.
 *
 * Ce module sert la disposition parametrique — celle ou l'ingenieur donne des
 * COORDONNEES plutot qu'un lit par face. Il repond a deux questions que la
 * saisie par lits ne posait jamais, parce qu'elle rendait la reponse
 * impossible par construction : une barre est-elle dans le beton, et deux
 * barres se chevauchent-elles ?
 *
 * CONSTATE, NE PRESCRIT PAS, comme partout ailleurs dans ce projet : il dit
 * qu'une barre est hors du contour, il ne la deplace pas, et il ne propose
 * aucune disposition. L'optimisation est un geste de l'ingenieur ; l'outil
 * recalcule et compare.
 *
 * Ce qu'il NE verifie PAS, et qu'il ne faut pas lui prêter : les distances
 * libres minimales entre barres du §8.2, ni l'enrobage minimal du §4.4.1.
 * Le chevauchement teste ici est GEOMETRIQUE — deux barres qui occupent le
 * meme volume — et rien de plus. Une disposition sans chevauchement peut
 * parfaitement enfreindre le §8.2.
 */

/** Une barre posee par ses coordonnees et son diametre. */
export interface BarPlacement {
  y: number;
  z: number;
  diameter: number;
}

export type PlacementIssueKind = 'outside' | 'overlap';

/** Un defaut de placement, avec les barres qu'il concerne (index, base 0). */
export interface PlacementIssue {
  kind: PlacementIssueKind;
  /** Index des barres concernees : une pour `outside`, deux pour `overlap`. */
  bars: number[];
  message: string;
}

/** Aire d'une barre de diametre donne (mm²). */
export function barArea(diameter: number): number {
  return (Math.PI * diameter ** 2) / 4;
}

/** Diametre d'une barre d'aire donnee (mm) — inverse exact de `barArea`. */
export { barDiameterOf };

/**
 * Le CENTRE de la barre est-il dans le contour ?
 *
 * Le centre, et non la barre entiere : une barre d'angle affleure toujours
 * l'enrobage, et exiger que tout son disque tienne dans le beton refuserait
 * des dispositions parfaitement normales. C'est un garde contre la faute de
 * frappe — un `z` de 2000 sur une section de 500 — pas un controle
 * d'enrobage, que le §4.4.1 gouverne et que ce module ne fait pas.
 *
 * Le test passe par les intervalles pleins a la cote `z`, donc il vaut sur un
 * contour quelconque : concave, troue par une reservation, en T.
 */
export function isInsideOutline(vertices: Vertex[], point: { y: number; z: number }): boolean {
  const zValues = vertices.map((v) => v.z);
  const zMin = Math.min(...zValues);
  const zMax = Math.max(...zValues);

  if (point.z < zMin || point.z > zMax) return false;

  // `polygonSpansAtZ` compte les aretes en [zMin, zMax) pour ne jamais
  // compter un sommet deux fois, et son en-tete previent que la largeur peut
  // tomber a zero au zMax GLOBAL de la geometrie. Une barre calee sur la
  // fibre extreme y serait declaree hors du beton, ce qui est faux. On
  // echantillonne donc strictement a l'interieur, comme le module le demande
  // a ses appelants.
  const marge = (zMax - zMin) * 1e-9;
  const zEchantillon = Math.min(point.z, zMax - marge);

  const TOLERANCE = 1e-9;
  return polygonSpansAtZ(vertices, zEchantillon).some(
    (span) => point.y >= span.yStart - TOLERANCE && point.y <= span.yEnd + TOLERANCE
  );
}

/**
 * Les defauts de placement d'un ferraillage libre.
 *
 * Rend une LISTE et non un premier defaut : corriger une barre a la fois,
 * en redecouvrant la suivante a chaque recalcul, serait une facon lente de
 * lire ce que l'outil sait deja.
 */
export function checkBarPlacement(
  vertices: Vertex[],
  bars: readonly BarPlacement[]
): PlacementIssue[] {
  const defauts: PlacementIssue[] = [];

  for (const [index, barre] of bars.entries()) {
    if (!isInsideOutline(vertices, barre)) {
      defauts.push({
        kind: 'outside',
        bars: [index],
        message:
          `Barre ${index + 1} (y ${arrondi(barre.y)}, z ${arrondi(barre.z)}) hors du contour ` +
          'de la section : elle ne serait entouree d aucun beton, et le calcul la compterait ' +
          'quand meme.',
      });
    }
  }

  for (let i = 0; i < bars.length; i++) {
    for (let j = i + 1; j < bars.length; j++) {
      const a = bars[i];
      const b = bars[j];
      const distance = Math.hypot(b.y - a.y, b.z - a.z);
      const contact = (a.diameter + b.diameter) / 2;
      // Strictement inferieur : deux barres exactement tangentes ne se
      // chevauchent pas. Le cas se produit sur une saisie ronde et n'a rien
      // d'une faute.
      if (distance < contact * (1 - 1e-9)) {
        defauts.push({
          kind: 'overlap',
          bars: [i, j],
          message:
            `Barres ${i + 1} et ${j + 1} en chevauchement : leurs axes sont a ` +
            `${arrondi(distance)} mm alors que le contact se fait a ${arrondi(contact)} mm. ` +
            'Chevauchement GEOMETRIQUE seulement — les distances libres du §8.2 ne sont pas ' +
            'verifiees ici.',
        });
      }
    }
  }

  return defauts;
}

/**
 * ARMATURES DE PEAU sur les deux faces laterales d'un rectangle.
 *
 * Elles se posent par paires symetriques entre deux cotes, ce qui est leur
 * usage : limiter l'ouverture des fissures sur la hauteur d'une ame, sans
 * rien changer d'appreciable au moment resistant — l'interet etant justement
 * de le VERIFIER, ce que le panneau permet en comparant a la disposition de
 * reference.
 *
 * `countPerFace` barres par face, reparties uniformement entre `zFrom` et
 * `zTo`, extremites COMPRISES. Les barres d'angle ne sont pas evitees : ce
 * sont des cotes explicites, et c'est a l'appelant de choisir un intervalle
 * qui ne les recouvre pas — le controle de chevauchement le lui dira.
 */
export function skinBars(params: {
  /** Largeur du rectangle (mm). */
  width: number;
  /** Distance d'axe depuis le parement lateral (mm) : enrobage + etrier + Ø/2. */
  axisDistance: number;
  zFrom: number;
  zTo: number;
  countPerFace: number;
  diameter: number;
}): BarPlacement[] {
  const { width, axisDistance, zFrom, zTo, countPerFace, diameter } = params;

  if (!Number.isInteger(countPerFace) || countPerFace < 1) {
    throw new Error(`skinBars : nombre de barres par face invalide (${countPerFace})`);
  }
  if (!(diameter > 0)) {
    throw new Error(`skinBars : diametre invalide (${diameter})`);
  }

  const yGauche = -width / 2 + axisDistance;
  const yDroite = width / 2 - axisDistance;

  const cotes: number[] = [];
  if (countPerFace === 1) {
    cotes.push((zFrom + zTo) / 2);
  } else {
    for (let k = 0; k < countPerFace; k++) {
      cotes.push(zFrom + ((zTo - zFrom) * k) / (countPerFace - 1));
    }
  }

  return cotes.flatMap((z) => [
    { y: yGauche, z, diameter },
    { y: yDroite, z, diameter },
  ]);
}

function arrondi(valeur: number): string {
  return valeur.toFixed(0);
}
