import type { Section } from '../model/section';
import type { ElementType, LongitudinalCheck, LongitudinalOptions } from './longitudinal';
import type { WebCheck, WebOptions, WebReinforcement } from './transverse';
import { checkLongitudinal } from './longitudinal';
import { checkWebReinforcement } from './transverse';

/**
 * Constat sur l'armature d'ame, augmente de son APPLICABILITE.
 *
 * Le minimum du §9.2.2(5) ne concerne pas tous les elements, et le declarer
 * partout rendrait non conformes des ouvrages parfaitement reguliers.
 */
export interface WebCheckApplicable extends WebCheck {
  /** `false` quand le §9.2.2(5) ne regit pas cet element (voir `notApplicableReason`). */
  applicable: boolean;
  /** Pourquoi la regle ne s'applique pas ; `null` quand elle s'applique. */
  notApplicableReason: string | null;
}

export interface DetailingResult {
  ok: boolean;
  elementType: ElementType;
  longitudinal: LongitudinalCheck;
  web: WebCheckApplicable;
  /**
   * Regles du §9 non satisfaites, chacune nommee par son article.
   *
   * Une LISTE et non un motif unique : une section peut etre a la fois
   * sur-armee en longitudinal et depourvue d'armature d'ame, et n'en signaler
   * qu'une seule en cacherait une.
   */
  violations: string[];
}

/**
 * Le §9.2.2(5) regit-il l'armature d'ame de cet element ?
 *
 * - **Poutre** : oui.
 * - **Dalle** : non. Le §6.2.1(4) dispense du minimum d'armature d'ame les
 *   elements ou une redistribution transversale des efforts est possible,
 *   ce qui vise les dalles. L'exiger declarerait non conformes toutes les
 *   dalles courantes, qui n'en portent aucune — un verdict massivement faux.
 * - **Poteau** : non. Ses armatures transversales relevent du §9.5.3, dont
 *   les regles portent sur des diametres et des espacements, pas sur un taux
 *   `rho_w`. Ce module ne les couvre pas, et le dit plutot que d'appliquer
 *   une regle de poutre.
 */
function applicabiliteDuMinimumDAme(elementType: ElementType): string | null {
  switch (elementType) {
    case 'beam':
      return null;
    case 'slab':
      return (
        'dalle : le §6.2.1(4) dispense du minimum d armature d ame les elements ou ' +
        'une redistribution transversale des efforts est possible'
      );
    case 'column':
      return (
        'poteau : les armatures transversales relevent du §9.5.3 (diametres et ' +
        'espacements), hors du perimetre de ce module'
      );
  }
}

/**
 * Verdict des dispositions constructives (EN 1992-1-1:2004 §9).
 *
 * Rassemble le constat longitudinal (§9.2.1.1, §9.3.1.1, §9.5.2) et celui de
 * l'armature d'ame (§9.2.2), et rend la liste des regles enfreintes.
 *
 * CONSTATE, NE PRESCRIT PAS : il dit qu'une section est sous-armee ou
 * sur-armee au sens du §9, jamais quel ferraillage poser. C'est la regle de la
 * session 4, et elle vaut ici aussi.
 *
 * NE MODIFIE PAS LE VERDICT DE FLEXION. Une section peut resister et rester
 * irreguliere au §9 : c'est une information, pas une contradiction, et fondre
 * les deux en un verdict unique en perdrait la nature.
 *
 * Les valeurs sont celles RECOMMANDEES par l'EN 1992-1-1 ; une annexe
 * nationale peut les modifier.
 */
export function verifyDetailing(
  section: Section,
  elementType: ElementType,
  options?: {
    longitudinal?: LongitudinalOptions;
    web?: WebReinforcement;
    webOptions?: WebOptions;
  }
): DetailingResult {
  const longitudinal = checkLongitudinal(section, elementType, options?.longitudinal);

  const motifNonApplicable = applicabiliteDuMinimumDAme(elementType);
  const applicable = motifNonApplicable === null;

  const brut = applicable
    ? checkWebReinforcement(section, options?.web, options?.webOptions)
    : webNonApplicable(section, options);

  const web: WebCheckApplicable = {
    ...brut,
    applicable,
    notApplicableReason: motifNonApplicable,
  };

  const violations: string[] = [];

  if (longitudinal.underReinforced) {
    violations.push(
      `§9.2.1.1 : armature longitudinale insuffisante — ${arrondi(longitudinal.asProvided)} mm² ` +
        `en place pour ${arrondi(longitudinal.asMin)} mm² exiges`
    );
  }
  if (longitudinal.overReinforced) {
    violations.push(
      `§9.2.1.1 : armature longitudinale au-dela du maximum — ${arrondi(longitudinal.asProvided)} mm² ` +
        `en place pour ${arrondi(longitudinal.asMax)} mm² admis`
    );
  }
  if (applicable && !brut.ok) {
    violations.push(`§9.2.2 : ${brut.reason ?? 'armature d ame insuffisante'}`);
  }

  return {
    ok: violations.length === 0,
    elementType,
    longitudinal,
    web,
    violations,
  };
}

/**
 * Constat d'ame quand la regle ne s'applique pas : les taux restent calcules
 * et affichables — ils informent — mais `ok` vaut `true`, puisque aucune regle
 * n'est enfreinte.
 */
function webNonApplicable(
  section: Section,
  options?: { web?: WebReinforcement; webOptions?: WebOptions }
): WebCheck {
  try {
    const constat = checkWebReinforcement(section, options?.web, options?.webOptions);
    const { reason: _motifSansObjet, ...reste } = constat;
    return { ...reste, ok: true };
  } catch {
    // `checkWebReinforcement` leve quand la limite elastique des cadres est
    // inconnue. Sur un element que la regle ne regit pas, ce n'est pas une
    // erreur : il n'y a simplement rien a verifier.
    return { rhoW: 0, rhoWMin: NaN, aswMin: null, missingArea: null, ok: true };
  }
}

function arrondi(valeur: number): string {
  return valeur.toFixed(0);
}
