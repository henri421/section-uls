/**
 * Maitrise de la fissuration des elements massifs sous deformation genee
 * (« Zwang »), METHODE DE G. ET R. MEYER — DIN 1045.
 *
 * ⚠ CE N'EST PAS L'EN 1992-1-1 §7.3.2, qui vit dans `restraint.ts` et doit
 * y rester. Les deux repondent a la meme question et ne se confondent pas :
 *
 *   - §7.3.2 : `A_s,min · sigma_s = k_c · k · f_ct,eff · A_ct`, LINEAIRE en
 *     aire d'acier, avec `k` de 1,00 a 0,65 et une contrainte d'acier donnee ;
 *     l'ouverture de fissure n'y figure pas, elle est gouvernee ailleurs
 *     (tableaux 7.2N/7.3N).
 *   - Meyer : `A_s` sort d'une RACINE, `k` va de 0,80 a 0,50, et l'ouverture
 *     visee `w_k` entre explicitement dans la formule.
 *
 * Les deux coexistent. Ne jamais remplacer l'un par l'autre, ne jamais
 * comparer leurs `k` : ils ne recouvrent pas la meme grandeur.
 *
 * CADRE REGLEMENTAIRE, a ne pas taire : la methode est allemande (DIN 1045).
 * En Belgique et au Luxembourg, la justification reglementaire reste
 * l'EN 1992-1-1 et ses annexes nationales (NBN / ILNAS). Cette methode sert au
 * PRE-DIMENSIONNEMENT et au controle d'ordre de grandeur.
 *
 * Unites : mm, MPa (N/mm²), mm². Les aires sont rendues PAR METRE de largeur
 * (`b = 1000 mm`).
 */

/** Resistance moyenne en traction a 28 jours, tableau 1.2 de l'ouvrage (MPa). */
export const FCTM_PAR_CLASSE = {
  'C20/25': 2.2,
  'C25/30': 2.6,
  'C30/37': 2.9,
  'C35/45': 3.2,
  'C40/50': 3.5,
  'C45/55': 3.8,
  'C50/60': 4.1,
  'C55/67': 4.2,
  'C60/75': 4.4,
  'C70/85': 4.6,
} as const;

export type ClasseDeBeton = keyof typeof FCTM_PAR_CLASSE;

/**
 * Nature de la sollicitation.
 *
 * `traction` : gene centree, toute la section est tendue — deux faces armees.
 * `flexion`  : gene de flexion, une seule face tendue.
 */
export type MeyerCas = 'traction' | 'flexion';

/**
 * Origine du bridage.
 *
 * `exterieur` : la deformation est empechee par l'exterieur (appuis, radier
 *   deja durci, reprise de betonnage). L'effort mobilise depend de la section.
 * `interieur` : contraintes propres d'auto-equilibre (gradient de peau). Seule
 *   la peau engendre l'effort, `F_cr = f_ct,eff · A_cr`, ce qui rend le
 *   resultat quasi independant de l'epaisseur.
 */
export type MeyerBridage = 'exterieur' | 'interieur';

/** Interpolation du facteur de contraintes propres entre ses deux bornes. */
export type MeyerModeK = 'lineaire' | 'parabolique';

export type MeyerRegime = 'fissure-unique' | 'fissuration-achevee' | 'interieur';

export interface MeyerParams {
  /** Epaisseur de l'element (mm). */
  h: number;
  /** Enrobage A L'AXE des barres, soit `h − d` (mm). */
  d1: number;
  /** Diametre des barres (mm). */
  ds: number;
  /** Ouverture de fissure visee (mm). */
  wk: number;
  /** Resistance moyenne en traction a 28 jours (MPa) — voir `FCTM_PAR_CLASSE`. */
  fctm: number;
  /**
   * Facteur d'age : `f_ct,eff / f_ctm`. Valeurs usuelles 0,4 / 0,5 / 0,6 / 1,0.
   *
   * C'est le parametre decisif : le Zwang des pieces massives nait de la
   * chaleur d'hydratation et fissure a quelques jours, quand le beton est loin
   * de `f_ctm` a 28 jours. Retenir 1,0 conduit a l'armature la plus forte.
   */
  kzt: number;
  cas: MeyerCas;
  bridage: MeyerBridage;
  /** Module d'elasticite de l'acier (MPa). Defaut 200000. */
  Es?: number;
  /** Defaut `lineaire`. Le mode `parabolique` est la proposition de Meyer. */
  kmode?: MeyerModeK;
  /** Largeur de calcul (mm). Defaut 1000 : les aires sortent par metre. */
  b?: number;
}

export interface MeyerResult {
  /** Armature PAR FACE (mm²/m). */
  AsFace: number;
  /** Armature totale (mm²/m) : deux faces en traction, une seule en flexion. */
  AsTotal: number;
  regime: MeyerRegime;
  /** Facteur de contraintes propres. */
  k: number;
  /** Facteur de distribution : 1,0 en traction, 0,4 en flexion. */
  kc: number;
  /** Zone d'action de l'armature (mm²). */
  Acr: number;
  /** Aire tendue mobilisee par face (mm²). */
  AcFace: number;
  /** Epaisseur de bascule entre les deux regimes de bridage exterieur (mm). */
  hGrenz: number;
  /** Resistance en traction retenue (MPa). */
  fctEff: number;
}

/**
 * Facteur `k` de contraintes propres (§4.2).
 *
 * Il DECROIT avec l'epaisseur : dans une piece epaisse, les contraintes
 * d'auto-equilibre reduisent l'effort qui traverse reellement la section au
 * moment de la fissuration. C'est un reducteur, pas une penalite.
 *
 * ⚠ Ses bornes — 0,80 et 0,50 — ne sont PAS celles du §7.3.2 de l'EN 1992-1-1
 * (1,00 et 0,65). Les deux facteurs portent le meme nom et la meme idee, mais
 * appartiennent a deux methodes differentes et ne s'echangent pas.
 */
export function facteurContraintesPropres(h: number, kmode: MeyerModeK = 'lineaire'): number {
  if (kmode === 'parabolique') {
    if (h <= 300) return 0.8;
    if (h >= 1000) return 0.5;
    return 0.5 + 0.612 * (1 - h / 1000) ** 2;
  }

  if (h <= 300) return 0.8;
  if (h >= 800) return 0.5;
  return 0.8 - ((h - 300) / 500) * 0.3;
}

/**
 * Armature de maitrise de la fissuration sous deformation genee, methode
 * Meyer / DIN 1045.
 *
 * Trois regimes, choisis et non melanges :
 *
 * - **bridage interieur** (eq. 13) : l'effort ne vient que de la peau, donc
 *   `A_s` ne depend de l'epaisseur que par le plafond de `A_cr` ;
 * - **bridage exterieur, fissure unique** (eq. 14) : piece assez mince pour
 *   qu'une seule fissure se forme, `h < h_grenz` ;
 * - **bridage exterieur, fissuration achevee** (eq. 15) : le cas des elements
 *   massifs courants, ou `h_grenz` vaut typiquement 30 a 50 cm en traction.
 *
 * CONSTATE, NE PRESCRIT PAS : rend l'aire exigee, jamais un ferraillage.
 * `choixDeBarres` propose ensuite une repartition, que l'ingenieur valide.
 */
export function meyerRestraintReinforcement(params: MeyerParams): MeyerResult {
  const { h, d1, ds, wk, fctm, kzt } = params;
  const Es = params.Es ?? 200000;
  const b = params.b ?? 1000;
  const kmode = params.kmode ?? 'lineaire';

  exigerPositif(h, 'h');
  exigerPositif(d1, 'd1');
  exigerPositif(ds, 'ds');
  exigerPositif(wk, 'wk');
  exigerPositif(fctm, 'fctm');
  exigerPositif(kzt, 'kzt');
  exigerPositif(Es, 'Es');

  const fctEff = kzt * fctm;
  const kc = params.cas === 'traction' ? 1.0 : 0.4;
  const k = facteurContraintesPropres(h, kmode);

  // Zone d'action de l'armature : la peau reellement mobilisee autour des
  // barres, plafonnee par la geometrie de la zone tendue.
  const plafond = params.cas === 'traction' ? h / 2 : h / 4;
  const Acr = Math.min(2.5 * d1, plafond) * b;

  // Aire tendue PAR FACE. En traction centree symetrique, la section est
  // reprise par deux faces et chacune mobilise h/2 ; en flexion, la zone
  // tendue vaut elle aussi h/2. Le document insiste : sans cette correction de
  // demi-section, l'armature de traction est surestimee d'un facteur ~racine
  // de 2.
  const AcFace = (h / 2) * b;

  const hGrenz = ((params.cas === 'traction' ? 5.0 : 12.5) * d1) / k;

  // Denominateur commun aux trois equations.
  const denominateur = 3.6 * wk * Es;

  if (params.bridage === 'interieur') {
    const AsFace = Acr * Math.sqrt((0.6 * fctEff * ds) / denominateur);
    return assembler(AsFace, 'interieur', params.cas, { k, kc, Acr, AcFace, hGrenz, fctEff });
  }

  if (h < hGrenz) {
    const AsFace = k * kc * AcFace * Math.sqrt((0.6 * ds * fctEff) / denominateur);
    return assembler(AsFace, 'fissure-unique', params.cas, { k, kc, Acr, AcFace, hGrenz, fctEff });
  }

  const effortResiduel = k * kc * AcFace - 0.4 * Acr;
  if (effortResiduel <= 0) {
    throw new Error(
      'meyerRestraintReinforcement : configuration hors domaine — la zone d action de ' +
        `l armature (A_cr = ${Acr.toFixed(0)} mm²) absorbe toute la section tendue mobilisee ` +
        `(k·kc·A_c,face = ${(k * kc * AcFace).toFixed(0)} mm²). Reduire l enrobage d1 ou ` +
        'revoir l epaisseur.'
    );
  }

  const AsFace = Math.sqrt((Acr * effortResiduel * ds * fctEff) / denominateur);
  return assembler(AsFace, 'fissuration-achevee', params.cas, {
    k,
    kc,
    Acr,
    AcFace,
    hGrenz,
    fctEff,
  });
}

function assembler(
  AsFace: number,
  regime: MeyerRegime,
  cas: MeyerCas,
  reste: Omit<MeyerResult, 'AsFace' | 'AsTotal' | 'regime'>
): MeyerResult {
  return {
    AsFace,
    // Traction centree : une nappe par face, donc le double. Flexion : une
    // seule face est tendue.
    AsTotal: cas === 'traction' ? 2 * AsFace : AsFace,
    regime,
    ...reste,
  };
}

export interface ChoixDeBarres {
  /** Aire d'une barre (mm²). */
  aireBarre: number;
  /** Nombre de barres par metre. */
  nParMetre: number;
  /** Espacement resultant (mm), a arrondir a une valeur ronde INFERIEURE. */
  espacement: number;
  /** Aire reellement fournie (mm²/m). */
  AsFournie: number;
}

/**
 * Repartition de barres couvrant une aire requise (§7.2).
 *
 * L'arrondi est TOUJOURS vers le haut : `A_s,fournie >= A_s,requise`. Arrondir
 * l'espacement, lui, se fait vers le BAS — c'est a l'appelant de le faire, et
 * la valeur rendue ici est l'espacement exact, non arrondi.
 *
 * Contraintes usuelles a respecter en aval, hors du perimetre de cette
 * fonction : espacement d'environ 50 mm au minimum (mise en oeuvre) et de 250
 * a 300 mm au maximum (armature de peau). Sur un radier bidirectionnel, la
 * repartition se repete pour chaque face ET chaque direction.
 */
export function choixDeBarres(AsRequise: number, ds: number): ChoixDeBarres {
  exigerPositif(ds, 'ds');

  const aireBarre = (Math.PI * ds ** 2) / 4;
  const nParMetre = Math.max(1, Math.ceil(AsRequise / aireBarre));

  return {
    aireBarre,
    nParMetre,
    espacement: 1000 / nParMetre,
    AsFournie: nParMetre * aireBarre,
  };
}

function exigerPositif(valeur: number, nom: string): void {
  if (!Number.isFinite(valeur) || valeur <= 0) {
    throw new Error(`meyerRestraintReinforcement : ${nom} doit etre strictement positif (${valeur})`);
  }
}
