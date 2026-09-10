import type { Section } from '../model/section';
import { fctmDepuisFck } from '../model/concrete';

/**
 * Nature de la deformation genee (« Zwang »).
 *
 * - `central` : gene CENTREE — retrait ou refroidissement empeches par des
 *   appuis, un radier deja durci, une reprise de betonnage. Toute la section
 *   est tendue avant fissuration. C'est le cas dominant des voiles et radiers
 *   massifs.
 * - `bending` : gene de FLEXION — gradient thermique entre coeur et parement,
 *   typiquement au jeune age d'une piece epaisse. Seule une partie de la
 *   section est tendue.
 */
export type RestraintType = 'central' | 'bending';

export interface RestraintOptions {
  /**
   * Resistance moyenne a la traction A L'INSTANT DE LA FISSURATION (MPa).
   * Defaut `f_ctm` a 28 jours.
   *
   * ⚠ C'est le parametre le plus lourd de consequences du calcul, et le
   * defaut est le cas DEFAVORABLE. Le Zwang des elements massifs nait de la
   * chaleur d'hydratation : la fissuration survient a quelques jours, quand
   * le beton n'a pas atteint `f_ctm` a 28 jours. Retenir la valeur a 28 jours
   * SURESTIME donc l'acier necessaire. Le §7.3.2(2) demande explicitement
   * d'estimer `f_ct,eff` a l'age ou la fissuration est attendue.
   */
  fctEff?: number;

  /**
   * Contrainte admise dans l'acier juste apres fissuration (MPa). Defaut
   * `f_yk`.
   *
   * Le §7.3.2(2) autorise `f_yk`, mais une valeur PLUS FAIBLE est souvent
   * necessaire pour respecter une ouverture de fissure visee : les tableaux
   * 7.2N et 7.3N lient diametre maximal et espacement maximal a cette
   * contrainte. Ce module ne choisit pas a la place de l'ingenieur ; il rend
   * l'acier exige pour la contrainte qu'on lui donne.
   */
  sigmaS?: number;

  /**
   * Effort normal de service (kN, positif en compression), pour l'eq. 7.2.
   * Sans objet en gene centree, ou `k_c` vaut 1 par definition.
   */
  NEd?: number;

  /**
   * Convention nationale du facteur `k`. Defaut `ec2`.
   *
   * ⚠ CHOIX INDEPENDANT de `method` ci-dessous : `k` est un parametre
   * d'annexe nationale, la formule de `h_c,ef` est un choix de methode. Les
   * lier interdirait « branches allemandes, `k` de l'annexe belge », qui est
   * un cas parfaitement legitime au Luxembourg.
   */
  thicknessConvention?: ThicknessConvention;

  /** Famille de formules de `h_c,ef`. Defaut `din`. Voir `RestraintMethod`. */
  method?: RestraintMethod;

  /** Grandeurs imposees a la main. Voir `RestraintOverrides`. */
  overrides?: RestraintOverrides;
}

/** Convention nationale du facteur `k` du §7.3.2(2). */
export type ThicknessConvention = 'ec2' | 'de';

/**
 * Famille de formules qui gouverne `h_c,ef`.
 *
 *   ec2 : le TEXTE de l'EN 1992-1-1 §7.3.2(3), `2,5·d1` ecrete a `h/2`
 *   din : les branches selon `h/d1` de la pratique allemande
 *
 * ⚠ A NE PAS FONDRE avec `ThicknessConvention` — voir la note ci-dessus.
 */
export type RestraintMethod = 'ec2' | 'din';

/**
 * Grandeurs intermediaires qu'on peut IMPOSER a la main.
 *
 * Une valeur imposee court-circuite sa formule et alimente la suite de la
 * chaine normalement : imposer `d1` change `hcEff`, imposer `fctEff` change
 * ce qui en depend.
 *
 * ⚠ TOUTE VALEUR IMPOSEE EST MARQUEE dans `RestraintResult.sources`. C'est
 * la condition qui rend le mecanisme acceptable : une note de calcul qui
 * presenterait une valeur forcee comme calculee ne serait verifiable par
 * personne, et c'est precisement a cela qu'une note de calcul sert.
 */
export interface RestraintOverrides {
  fctEff?: number;
  d1?: number;
  hcEff?: number;
  k?: number;
  kc?: number;
  Act?: number;
  AcEff?: number;
  sigmaS?: number;
}

/** Provenance d'une grandeur : jamais implicite. */
export type ValueSource = 'calcule' | 'impose';

export interface RestraintResult {
  /** Facteur d'epaisseur (§7.3.2(2)). */
  k: number;
  /** Facteur de distribution des contraintes (§7.3.2(2), eq. 7.2). */
  kc: number;
  /** Enrobage d'axe retenu (mm) — il commande `h_c,ef`. */
  d1: number;
  /** Aire de beton tendu ENTIERE (mm²). */
  Act: number;
  /** Hauteur de la zone efficace, UNE face (mm). */
  hcEff: number;
  /** Aire efficace, UNE face (mm²). */
  AcEff: number;
  /** Resistance a la traction retenue (MPa). */
  fctEff: number;
  /** Contrainte d'acier retenue (MPa). */
  sigmaS: number;
  /** Nombre de nappes armees : 2 en gene centree, 1 en flexion. */
  nappes: number;
  /** Approche mince, zone tendue entiere (mm², TOTAL). */
  AsMince: number;
  /** Approche epaisse, zone efficace, bornee (mm², TOTAL). */
  AsEpais: number;
  /** Borne anti-plastification (mm², TOTAL). */
  Borne: number;
  /** Armature minimale RETENUE (mm², TOTAL) : le plus petit des deux. */
  AsMin: number;
  AsMinceParNappe: number;
  AsEpaisParNappe: number;
  BorneParNappe: number;
  AsMinParNappe: number;
  approach: 'mince' | 'epaisse';
  /** `true` des que l'epaisseur atteint 800 mm, ou `k` est a son plancher. */
  massive: boolean;
  method: RestraintMethod;
  thicknessConvention: ThicknessConvention;
  /** Pour CHAQUE grandeur : `calcule` ou `impose`. */
  sources: Record<keyof RestraintOverrides, ValueSource>;
  /**
   * Domaine physique franchi par une valeur IMPOSEE. Signale, jamais ecrete :
   * ecreter retirerait a l'ingenieur la decision qu'il vient explicitement de
   * prendre, ne rien dire la lui laisserait prendre a l'aveugle.
   */
  warnings: string[];
}

/**
 * Facteur `k` du §7.3.2(2) : prise en compte des contraintes d'auto-equilibre.
 *
 * PARAMETRE NATIONAL, d'ou les deux conventions — voir `ThicknessConvention`.
 *
 * Le sens physique, et c'est tout l'enjeu des ELEMENTS MASSIFS : dans une
 * piece epaisse, les contraintes d'auto-equilibre reduisent l'effort qui
 * traverse reellement la section au moment de la fissuration. Une piece
 * massive exige donc RELATIVEMENT moins d'acier qu'une piece mince de meme
 * aire — c'est un facteur reducteur, pas une penalite.
 */
export function thicknessFactor(h: number, convention: ThicknessConvention = 'ec2'): number {
  // PARAMETRE NATIONAL, d'ou les deux conventions. Ne jamais melanger la
  // pente de l'une avec les bornes de l'autre.
  //
  //   ec2 : 1,00 (h <= 300 mm) -> 0,65 (h >= 800 mm)  valeurs recommandees
  //   de  : 0,80 (h <= 300 mm) -> 0,50 (h >= 800 mm)  annexe allemande
  const haut = convention === 'de' ? 0.8 : 1.0;
  const bas = convention === 'de' ? 0.5 : 0.65;

  if (h <= 300) return haut;
  if (h >= 800) return bas;
  return haut - ((h - 300) / 500) * (haut - bas);
}

/**
 * Hauteur de la zone de beton tendu efficace (mm), UNE face.
 *
 * ⚠ ECART DOCUMENTE AU TEXTE DE L'EN 1992-1-1 en methode `din`. Le §7.3.2(3)
 * ecrit `h_c,ef = min(2,5(h−d) ; (h−x)/3 ; h/2)` ; les branches selon `h/d1`
 * viennent de la pratique allemande (Schneider Bautabellen ; Fingerloos,
 * Hegger, Zilch). Le terme `(h−x)/3` est ecarte dans les DEUX methodes : il
 * suppose un axe neutre de section FISSUREE EN FLEXION, qui n'a pas de sens
 * a l'instant de la premiere fissure sous gene.
 *
 * POURQUOI LES BRANCHES DIFFERENT DE LA FLEXION, et pourquoi les confondre
 * coutait 43 % d'armature : en traction centree, la zone efficace CROIT avec
 * l'epaisseur. Apres la premiere fissure traversante, l'acier reintroduit
 * l'effort sur une longueur d'introduction ; dans un element epais, les
 * barres sont trop espacees pour agir sur tout le coeur, et il se forme des
 * fissures secondaires pres des barres — ce qui approfondit leur zone
 * d'influence bien au-dela de la zone de rive figee de la flexion.
 */
export function effectiveRestraintHeight(
  h: number,
  d1: number,
  restraint: RestraintType,
  method: RestraintMethod = 'din'
): number {
  let hcEff: number;

  if (method === 'ec2') {
    hcEff = 2.5 * d1;
  } else {
    const ratio = h / d1;
    if (restraint === 'central') {
      if (ratio < 5) hcEff = 2.5 * d1;
      else if (ratio < 30) hcEff = 0.1 * h + 2 * d1;
      else hcEff = 5 * d1;
    } else {
      if (ratio < 10) hcEff = 2.5 * d1;
      else if (ratio < 60) hcEff = 0.05 * h + 2 * d1;
      else hcEff = 5 * d1;
    }
  }

  // La zone efficace d'une face ne peut pas depasser la demi-section : les
  // deux faces couvriraient sinon plus que le beton disponible. Ce garde ne
  // vaut que sur le chemin CALCULE — une valeur imposee est signalee, pas
  // ecretee.
  return Math.min(hcEff, h / 2);
}

/**
 * Armature minimale de maitrise de la fissuration sous deformation genee
 * (« Zwang »), EN 1992-1-1:2004 §7.3.2, eq. (7.1) :
 *
 *     A_s,min · sigma_s = k_c · k · f_ct,eff · A_ct
 *
 * A NE PAS CONFONDRE avec le minimum de RESISTANCE du §9.2.1.1, qui repond a
 * une autre question. Celui-ci garantit que l'acier ne plastifie pas a
 * l'instant ou le beton fissure, donc que la fissuration se repartit en
 * plusieurs fissures fines au lieu d'une seule large. Sur un voile ou un
 * radier massif, c'est LUI qui gouverne, et de loin — la resistance n'y est
 * jamais le probleme.
 *
 * Sections RECTANGULAIRES uniquement : `A_ct` et la zone efficace supposent
 * une largeur constante, comme pour l'ouverture de fissures de la session 7.
 *
 * CONSTATE, NE PRESCRIT PAS : rend l'aire exigee, jamais un ferraillage.
 */
export function minimumRestraintArea(
  section: Section,
  restraint: RestraintType,
  options?: RestraintOptions
): RestraintResult {
  if (section.geometry.kind !== 'rectangle') {
    throw new Error(
      'minimumRestraintArea : geometrie non rectangulaire. L aire de beton tendu du ' +
        '§7.3.2 suppose une largeur constante et n est pas transposable telle quelle.'
    );
  }

  const b = section.geometry.width;
  const h = section.geometry.height;

  // `f_yk` sert DEUX fois : comme contrainte d'acier par defaut, et comme
  // denominateur de la borne anti-plastification. Le lire une seule fois
  // evite qu'une section sans armature leve a un endroit et pas a l'autre.
  const fyk = acierDeReference(section);

  const method = options?.method ?? 'din';
  const convention = options?.thicknessConvention ?? 'ec2';
  const overrides = options?.overrides ?? {};
  const sources = {} as Record<keyof RestraintOverrides, ValueSource>;
  const warnings: string[] = [];

  /**
   * LE MECANISME DE FORCAGE. Une valeur imposee court-circuite sa formule et
   * alimente la suite de la chaine ; sa provenance est enregistree, sans quoi
   * la note de calcul ne serait pas relisable.
   */
  const retenu = (nom: keyof RestraintOverrides, calcule: number): number => {
    const force = overrides[nom];
    if (force !== undefined && Number.isFinite(force)) {
      sources[nom] = 'impose';
      return force;
    }
    sources[nom] = 'calcule';
    return calcule;
  };

  const fctEff = retenu('fctEff', options?.fctEff ?? fctmDepuisFck(section.concrete.fck));
  const sigmaS = retenu('sigmaS', options?.sigmaS ?? fyk);
  const k = retenu('k', thicknessFactor(h, convention));
  const kc = retenu('kc', facteurDeDistribution(restraint, b, h, fctEff, options?.NEd));

  const d1 = retenu('d1', enrobageDAxe(section, h));
  if (d1 >= h / 2) {
    warnings.push(
      `L enrobage d axe d1 = ${d1.toFixed(0)} mm atteint la demi-epaisseur ` +
        `(h/2 = ${(h / 2).toFixed(0)} mm) : la geometrie est incoherente, et h_c,ef en depend.`
    );
  }

  const hcEff = retenu('hcEff', effectiveRestraintHeight(h, d1, restraint, method));

  const nappes = restraint === 'central' ? 2 : 1;
  const Act = retenu('Act', restraint === 'central' ? b * h : (b * h) / 2);
  const AcEff = retenu('AcEff', hcEff * b); // UNE face

  // Domaine physique CONTROLE, jamais ecrete quand la valeur est imposee.
  if (nappes * AcEff > b * h) {
    warnings.push(
      `La zone efficace des ${nappes} faces (${Math.round(nappes * AcEff)} mm²) depasse la ` +
        `section de beton (${Math.round(b * h)} mm²) : h_c,ef impose au-dela de h/2. ` +
        'Le calcul est mene tel quel.'
    );
  }
  if (!(sigmaS > 0)) {
    throw new Error('minimumRestraintArea : contrainte d acier nulle ou negative');
  }

  const AsMince = (kc * k * fctEff * Act) / sigmaS;

  // ⚠ NI `k` NI `kc` ici, et ce n'est pas un oubli. `k` traduit la reduction
  // de l'effort par les contraintes d'auto-equilibre a l'echelle de la
  // SECTION ENTIERE ; l'approche par zone efficace ne raisonne plus sur la
  // section entiere mais sur la peau qui travaille reellement, ou cette
  // reduction n'a pas lieu d'etre appliquee une seconde fois. L'appliquer
  // quand meme retirait 35 % d'acier sur le cas de validation.
  const AsEpaisBrut = (nappes * fctEff * AcEff) / sigmaS;

  // Borne inferieure anti-plastification : en deca, l'acier plastifie a
  // l'instant de la fissuration et la fissure devient unique et large au lieu
  // de rester fine et repartie — ce que cette armature existe precisement
  // pour empecher.
  const Borne = (k * fctEff * Act) / fyk;
  const AsEpais = Math.max(AsEpaisBrut, Borne);

  // La norme ne fixe pas de frontiere nette entre element mince et epais : on
  // calcule les deux et on retient la plus petite.
  const AsMin = Math.min(AsMince, AsEpais);
  const parNappe = (total: number): number => total / nappes;

  return {
    k,
    kc,
    d1,
    Act,
    hcEff,
    AcEff,
    fctEff,
    sigmaS,
    nappes,
    AsMince,
    AsEpais,
    Borne,
    AsMin,
    AsMinceParNappe: parNappe(AsMince),
    AsEpaisParNappe: parNappe(AsEpais),
    BorneParNappe: parNappe(Borne),
    AsMinParNappe: parNappe(AsMin),
    approach: AsMin === AsMince ? 'mince' : 'epaisse',
    massive: h >= 800,
    method,
    thicknessConvention: convention,
    sources,
    warnings,
  };
}

/**
 * Enrobage d'axe `d1` (mm) : du parement au centre de la nappe qui en est la
 * plus proche. C'est lui qui commande la hauteur efficace.
 */
function enrobageDAxe(section: Section, h: number): number {
  if (section.rebars.length === 0) {
    throw new Error(
      'minimumRestraintArea : section sans armature, l enrobage d axe est indefini ' +
        'et la hauteur efficace avec lui.'
    );
  }

  const zTop = -h / 2;
  const zBottom = h / 2;
  return Math.min(...section.rebars.map((r) => Math.min(r.z - zTop, zBottom - r.z)));
}



/**
 * Facteur `k_c` du §7.3.2(2).
 *
 * Gene centree : `k_c = 1` par definition, toute la section etant tendue.
 *
 * Gene de flexion, eq. (7.2) :
 *
 *     k_c = 0,4 · [ 1 − sigma_c / ( k_1 · (h/h*) · f_ct,eff ) ]  <= 1
 *
 * avec `sigma_c = N_Ed / (b·h)` (positive en compression),
 * `h_etoile = min(h, 1000)`, et `k_1 = 1,5` sous compression ou
 * `2·h_etoile / (3·h)` sous traction. En flexion pure (`N_Ed = 0`),
 * l'expression redonne exactement 0,4.
 */
function facteurDeDistribution(
  restraint: RestraintType,
  b: number,
  h: number,
  fctEff: number,
  NEd?: number
): number {
  if (restraint === 'central') return 1.0;

  const N = NEd ?? 0;
  if (N === 0) return 0.4;

  const sigmaC = (N * 1000) / (b * h); // kN -> N
  const hEtoile = Math.min(h, 1000);
  const k1 = N > 0 ? 1.5 : (2 * hEtoile) / (3 * h);

  const kc = 0.4 * (1 - sigmaC / (k1 * (h / hEtoile) * fctEff));

  // Borne haute de la norme, et borne basse physique : une section entierement
  // comprimee ne fissure pas, mais rendre un k_c negatif produirait une aire
  // d'acier negative, ce qui n'a aucun sens a afficher.
  return Math.min(Math.max(kc, 0), 1);
}

function acierDeReference(section: Section): number {
  const premiere = section.rebars[0];
  if (premiere === undefined) {
    throw new Error(
      'minimumRestraintArea : section sans armature, contrainte d acier de reference inconnue. ' +
        'Passer `sigmaS` explicitement.'
    );
  }
  return premiere.steel.fyk;
}
