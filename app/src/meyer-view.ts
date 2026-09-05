import type { MeyerRegime, MeyerResult } from '../../src/index';
import { choixDeBarres } from '../../src/index';
import type { BlocService, Issue, LigneAffichee } from './service-view';
import { sansCalcul } from './service-view';
import { formatNumber } from './format';

/**
 * Presentation de la methode de G. et R. MEYER (DIN 1045) pour la maitrise de
 * la fissuration des elements massifs sous deformation genee.
 *
 * Fonction PURE, sans DOM et sans mecanique, sur le modele exact de
 * `service-view.ts` et de `checks-view.ts` : elle met en forme ce que le noyau
 * a rendu, elle ne recalcule rien.
 *
 * `meyerRestraintReinforcement` LEVE des qu un de ses parametres n est pas
 * strictement positif — un champ vide en cours de frappe suffit. L exception
 * est attrapee par l appelant et arrive ici comme un `motif` : un module qui
 * n a pas pu s appliquer est un RESULTAT, affiche comme les autres.
 */

/**
 * L avertissement qui accompagne TOUJOURS le bloc, calcul reussi ou non.
 *
 * Quatre choses, dont aucune ne peut se deduire des chiffres affiches :
 *
 * 1. le module rend une aire EXIGEE, il ne la compare a rien — un bloc sans
 *    verdict passerait sinon pour un oubli ;
 * 2. la methode est allemande, et la justification reglementaire en Belgique
 *    et au Luxembourg reste l EN 1992-1-1 ;
 * 3. elle ne REMPLACE PAS le §7.3.2 affiche juste au-dessus. C est le point le
 *    plus important de tout ce bloc : les deux methodes coexistent, portent un
 *    facteur `k` du meme nom, et en donnent deux valeurs differentes a dix
 *    lignes d ecart. Sans cette phrase, un lecteur attentif conclut a un bug —
 *    et un lecteur distrait remplace l un par l autre, ce qui est pire ;
 * 4. une seule des quatre familles de la methode a ete confrontee a l ouvrage.
 */
const AVERTISSEMENT =
  'Ce bloc ne rend AUCUN verdict : il donne l aire d acier exigee par la methode, il ne la ' +
  'compare a aucune armature en place. ' +
  'La methode est allemande (DIN 1045) : en Belgique et au Luxembourg la justification ' +
  'reglementaire reste l EN 1992-1-1 et ses annexes nationales (NBN, ILNAS). Elle sert ici au ' +
  'PRE-DIMENSIONNEMENT et au controle d ordre de grandeur. ' +
  'Elle NE REMPLACE PAS le §7.3.2 affiche juste au-dessus : les deux coexistent et repondent ' +
  'autrement a la meme question. Le §7.3.2 est LINEAIRE en A_s, son k va de 1,00 a 0,65 et ' +
  'l ouverture de fissure n entre pas dans sa formule ; Meyer tire A_s d une RACINE, son k va ' +
  'de 0,80 a 0,50 et w_k y figure explicitement. Les deux k portent le meme nom sans recouvrir ' +
  'la meme grandeur : deux valeurs differentes a dix lignes d ecart ne sont pas une incoherence, ' +
  'et il ne faut ni les comparer ni les echanger. ' +
  'Enfin, seule la famille traction / bridage exterieur est VALIDEE — confrontee au diagramme ' +
  'de l ouvrage a environ 3 % pres. La flexion et le bridage interieur sont derives de la meme ' +
  'formulation, et n ont ete confrontes a rien.';

/**
 * Le regime EN CLAIR, jamais son identifiant.
 *
 * Les trois regimes ne decrivent pas la meme physique et ne se choisissent pas
 * a la marge : savoir lequel a servi est la moitie de la lecture du bloc.
 * « fissuration-achevee » a l ecran ne serait qu un nom de variable echappe
 * dans la page.
 */
const REGIME_EN_CLAIR: Record<MeyerRegime, string> = {
  'fissure-unique':
    'fissure unique (h < h_grenz) — la piece est assez mince pour qu une seule fissure se forme',
  'fissuration-achevee':
    'fissuration achevee (h ≥ h_grenz) — le cas des elements massifs courants',
  interieur:
    'contraintes propres, bridage interieur — seule la peau engendre l effort, et A_s ne depend ' +
    'de l epaisseur que par le plafond de A_cr',
};

/**
 * Armature de maitrise de la fissuration, methode Meyer.
 *
 * `ds` est passe A COTE du resultat : `MeyerResult` ne le porte pas, et sans
 * lui aucune repartition de barres n est possible. Meme motif que le `V_Ed` de
 * `blocTranchant`.
 *
 * `choixDeBarres` leve elle aussi sur un `ds` nul, mais elle n est appelee que
 * sur la branche « resultat » — et un resultat n existe que si le module a
 * deja valide `ds` comme strictement positif.
 */
export function blocMeyer(entree: Issue<MeyerResult>, ds: number): BlocService {
  const titre = 'Elements massifs, methode Meyer (DIN 1045)';
  if (!('resultat' in entree)) return sansCalcul(titre, `${entree.motif} ${AVERTISSEMENT}`);

  const r = entree.resultat;
  const barres = choixDeBarres(r.AsFace, ds);

  const lignes: LigneAffichee[] = [
    { libelle: 'A_s par face', valeur: `${formatNumber(r.AsFace, 0)} mm²/m` },
    { libelle: 'A_s total', valeur: `${formatNumber(r.AsTotal, 0)} mm²/m` },
    { libelle: 'Regime', valeur: REGIME_EN_CLAIR[r.regime] },
    {
      // Le libelle porte les bornes : c est a l endroit meme ou le chiffre se
      // lit que la confusion avec le k du §7.3.2 se joue, pas dix lignes plus
      // bas dans la note.
      libelle: 'k (contraintes propres, 0,80 a 0,50 — pas le k du §7.3.2)',
      valeur: formatNumber(r.k, 3),
    },
    { libelle: 'k_c (distribution)', valeur: formatNumber(r.kc, 2) },
    { libelle: 'A_cr (zone d action de l armature)', valeur: `${formatNumber(r.Acr, 0)} mm²` },
    { libelle: 'A_c,face (aire tendue mobilisee)', valeur: `${formatNumber(r.AcFace, 0)} mm²` },
    {
      libelle: 'h_grenz (bascule des deux regimes exterieurs)',
      valeur: `${formatNumber(r.hGrenz, 0)} mm`,
    },
    { libelle: 'f_ct,eff', valeur: `${formatNumber(r.fctEff, 2)} MPa` },
    {
      libelle: 'Repartition proposee, par face',
      // L espacement est rendu EXACT, non arrondi : l arrondir vers le haut
      // reduirait l aire sous celle qu on vient d exiger. C est au projeteur
      // de descendre a la valeur ronde inferieure.
      valeur:
        `${barres.nParMetre} barres HA${formatNumber(ds, 0)} par metre, ` +
        `espacement ${formatNumber(barres.espacement, 1)} mm a arrondir vers le BAS ` +
        `(A_s fournie ${formatNumber(barres.AsFournie, 0)} mm²/m)`,
    },
  ];

  return { titre, lignes, verdict: null, note: AVERTISSEMENT };
}
