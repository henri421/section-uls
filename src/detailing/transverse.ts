import type { Section } from '../model/section';

export interface WebReinforcement {
  /**
   * Aire d'un cours d'armature d'ame (mm²) : la somme des brins coupes par une
   * fissure, soit deux fois la section d'une barre pour un cadre simple.
   */
  asw: number;
  /** Espacement longitudinal des cours (mm). */
  s: number;
  /**
   * Limite elastique caracteristique des ARMATURES D'AME (MPa). Le §9.2.2(5)
   * la designe explicitement : ce n'est pas celle des armatures
   * longitudinales, qui peut differer.
   */
  fywk: number;
  /**
   * Inclinaison des armatures d'ame sur l'axe de la poutre (degres).
   * Defaut 90 : cadres droits, le seul cas verifie aujourd'hui par le calcul
   * d'effort tranchant.
   */
  alpha?: number;
}

export interface WebCheck {
  /** Taux d'armature d'ame en place (eq. 9.4). Nul en l'absence de cadres. */
  rhoW: number;
  /** Taux minimal exige (eq. 9.5N). */
  rhoWMin: number;
  /** Aire d'un cours qu'exige le minimum (mm²) ; `null` si l'espacement est inconnu. */
  aswMin: number | null;
  /** Aire manquante par cours (mm²) ; `0` si conforme, `null` si indeterminee. */
  missingArea: number | null;
  ok: boolean;
  /** Renseigne des que `ok` est faux, pour dire POURQUOI. */
  reason?: string;
}

export interface WebOptions {
  /**
   * Largeur d'ame `b_w` (mm). Par defaut la largeur du rectangle. A imposer
   * pour toute autre geometrie, ou pour reprendre la largeur minimale d'ame
   * que retient le calcul d'effort tranchant.
   */
  bw?: number;
}

/**
 * Taux d'armature d'effort tranchant, EN 1992-1-1 eq. (9.4) :
 *
 *     rho_w = A_sw / ( s · b_w · sin(alpha) )
 *
 * Avec des cadres droits (`alpha = 90°`), `sin(alpha)` vaut 1 et l'expression
 * se simplifie. Elle est neanmoins ecrite en entier : l'ajout de bielles
 * inclinees plus tard ne doit pas demander de retrouver la formule.
 */
export function webReinforcementRatio(web: WebReinforcement, bw: number): number {
  const alpha = web.alpha ?? 90;
  const sinAlpha = Math.sin((alpha * Math.PI) / 180);
  return web.asw / (web.s * bw * sinAlpha);
}

/**
 * Taux minimal d'armature d'effort tranchant, EN 1992-1-1 eq. (9.5N) :
 *
 *     rho_w,min = 0,08 · racine(f_ck) / f_yk
 *
 * `f_ck` et `f_yk` en MPa, `f_yk` etant celle des armatures d'ame. Valeur
 * RECOMMANDEE : une annexe nationale peut la modifier.
 */
export function minimumWebRatio(fck: number, fywk: number): number {
  return (0.08 * Math.sqrt(fck)) / fywk;
}

/** Largeur d'ame retenue : celle imposee, sinon celle du rectangle. */
function largeurAme(section: Section, options?: WebOptions): number {
  if (options?.bw !== undefined) return options.bw;
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      "checkWebReinforcement : geometrie non rectangulaire, la largeur d'ame b_w n'en " +
        'decoule pas. Imposer `bw` en option.'
    );
  }
  return section.geometry.width;
}

/**
 * Constat sur l'armature d'ame minimale, EN 1992-1-1 §9.2.2(5).
 *
 * PENDANT CONSTRUCTIF DU CALCUL D'EFFORT TRANCHANT : celui-ci peut conclure
 * qu'aucune armature n'est REQUISE par le calcul (`V_Ed <= V_Rd,c`), ce qui
 * n'exonere pas du minimum du §9.2.2. Les deux verdicts se lisent ensemble et
 * ne se remplacent pas.
 *
 * Passer `web` a `undefined` decrit une poutre depourvue de tout cadre. Le
 * taux est alors nul et le constat negatif, mais l'aire manquante par cours
 * n'a pas de valeur : sans espacement il n'y a pas de « cours », et on rend
 * `null` plutot qu'un nombre invente.
 *
 * CONSTATE, NE PRESCRIT PAS.
 */
export function checkWebReinforcement(
  section: Section,
  web: WebReinforcement | undefined,
  options?: WebOptions
): WebCheck {
  const bw = largeurAme(section, options);
  const fywk = web?.fywk ?? section.rebars[0]?.steel.fyk;

  if (fywk === undefined) {
    throw new Error(
      "checkWebReinforcement : limite elastique des cadres inconnue et section sans armature."
    );
  }

  const rhoWMin = minimumWebRatio(section.concrete.fck, fywk);

  if (web === undefined) {
    return {
      rhoW: 0,
      rhoWMin,
      aswMin: null,
      missingArea: null,
      ok: false,
      reason:
        `aucune armature d ame : le §9.2.2(5) en exige au minimum ` +
        `rho_w,min = ${rhoWMin.toExponential(3)}`,
    };
  }

  const rhoW = webReinforcementRatio(web, bw);
  const alpha = web.alpha ?? 90;
  const sinAlpha = Math.sin((alpha * Math.PI) / 180);
  const aswMin = rhoWMin * web.s * bw * sinAlpha;
  const ok = rhoW >= rhoWMin;

  return {
    rhoW,
    rhoWMin,
    aswMin,
    missingArea: ok ? 0 : aswMin - web.asw,
    ok,
    ...(ok
      ? {}
      : {
          reason:
            `armature d ame insuffisante au sens du §9.2.2(5) : rho_w = ` +
            `${rhoW.toExponential(3)} pour un minimum de ${rhoWMin.toExponential(3)}, ` +
            `soit ${(aswMin - web.asw).toFixed(1)} mm² manquants par cours`,
        }),
  };
}
