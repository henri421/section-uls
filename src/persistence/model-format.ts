/**
 * Format de modele : la description SERIALISABLE d'un cas de calcul complet.
 *
 * Principe directeur : le fichier ne porte que des donnees d'ENTREE. Tout ce
 * qui se derive (fcd, epsCu2, positions de barres, sommets d'un cercle) est
 * recalcule au chargement. Le format retient donc l'INTENTION de saisie —
 * un pieu Ø600, « 3 HA20 en face inferieure » — et non ses consequences,
 * parce que seule l'intention se relit et se modifie.
 *
 * CONVENTION DE REPERE, piege principal du format : les coordonnees sont
 * transmises telles quelles aux constructeurs, dont les conventions
 * d'entree different.
 *   - `rectangle` et `circle` : la geometrie produite est deja centree sur
 *     son centroide, donc les coordonnees de `bars` et de `rows` sont
 *     BARYCENTRIQUES.
 *   - `polygon` : `polygonSection` recentre sommets ET armatures ensemble,
 *     donc le modele peut utiliser n'importe quelle origine commode — le
 *     coin superieur gauche d'une table de section en T, par exemple.
 *     C'est l'origine du modele qui fait foi, pas le centroide.
 *
 * LIMITE ASSUMEE : un modele ne porte qu'UN SEUL acier, applique a toutes
 * les barres. Le type `RebarLayer` en autorise un par barre, ce qui servira
 * aux sections existantes (melange d'un acier ancien et de renforts). Cette
 * limite est purement expressive : il n'existe pas de conversion
 * `Section -> SectionModel`, donc aucun chemin ne peut produire
 * silencieusement un fichier faux a ce titre.
 */

/**
 * Version PRODUITE a l'ecriture. Elle monte des que le format gagne un
 * champ ; la lecture, elle, ne suit pas — voir SUPPORTED_FORMAT_VERSIONS.
 *
 * Historique : 1 = format initial (session 5) ; 2 = ajout des
 * sollicitations de service (session 10) ; 3 = type d'element, effort
 * tranchant, deformation genee du §7.3.2 et methode Meyer (session 14) ;
 * 4 = verifications retenues, referentiel de la deformation genee et etat
 * de fissuration en service.
 */
export const FORMAT_VERSION = 4;

/**
 * Versions ACCEPTEES a la lecture, de la plus ancienne a la courante.
 *
 * Cette liste est le coeur de la retrocompatibilite du format, et elle
 * merite d'etre lue avant d'y toucher. Un fichier enregistre par
 * l'utilisateur porte la version qui avait cours ce jour-la, et rien ne
 * l'en fera changer : le seul moyen de continuer a le lire est que le
 * moteur, lui, accepte plusieurs versions. Une egalite stricte avec
 * FORMAT_VERSION — ce que faisait `parseModel` jusqu'a la version 2 —
 * rendrait illisible, du jour au lendemain, tout le travail deja
 * enregistre.
 *
 * Ne retirer une version d'ici que le jour ou on assume de refuser les
 * fichiers qui la portent, et alors avec un message qui le dise.
 */
export const SUPPORTED_FORMAT_VERSIONS: readonly number[] = [1, 2, 3, 4];

/**
 * Version du moteur ayant produit le fichier. Trace de provenance, JAMAIS
 * relue pour calculer : elle sert a expliquer un ecart si la derivation des
 * materiaux evolue un jour. Tenue a jour a la main avec la version du
 * paquet — pas lue depuis package.json, dont l'import en ESM impose des
 * contorsions sans commune mesure avec l'enjeu.
 */
export const ENGINE_VERSION = '0.1.0';

export interface PointModel {
  y: number;
  z: number;
}

export interface NormModel {
  /** Purement documentaire : le profil est ecrit en entier, jamais retrouve par son nom. */
  name: string;
  gammaC: number;
  gammaS: number;
  alphaCc: number;
  nBands: number;
}

export interface ConcreteModel {
  fck: number;
}

export interface SteelModel {
  fyk: number;
  Es: number;
}

export interface ActionModel {
  N: number;
  My: number;
  Mz: number;
}

/**
 * Sollicitation de service : UNIAXIALE, `{N, M}`.
 *
 * Volontairement distincte d'`ActionModel` (`{N, My, Mz}`) : les trois
 * verifications de service — methode n (§7.2), ouverture de fissures
 * (§7.3), courbure (§7.4.3) — ne traitent que la flexion droite et prennent
 * toutes une `Action` `{N, M}`. Offrir un `Mz` de service qu'aucun calcul ne
 * consomme serait un champ menteur.
 */
export interface ServiceActionModel {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Moment flechissant (kN·m). */
  M: number;
}

/**
 * Les deux combinaisons de service, independamment optionnelles.
 *
 * Elles sont separees de l'action ELU, et separees entre elles, parce que
 * les combinaisons EN 1990 ne sont pas les memes : reutiliser le moment de
 * l'ELU au service serait faux d'un facteur ~1,35 a 1,5.
 */
export interface ServiceActionsModel {
  /** Combinaison caracteristique — limitation des contraintes (§7.2). */
  characteristic?: ServiceActionModel;
  /** Combinaison quasi-permanente — fissuration (§7.3) et courbure (§7.4.3). */
  quasiPermanent?: ServiceActionModel;
}

/**
 * Type d'element au sens du §9 (version 3 du format).
 *
 * Les memes valeurs que l'`ElementType` du noyau, en anglais, et NON
 * traduites : le fichier est un format d'echange, pas une interface. Le
 * traduire ici imposerait une table de correspondance a chaque lecture et
 * ferait diverger le fichier des valeurs que consomment `checkLongitudinal`
 * et `verifyDetailing`.
 */
export type ElementTypeModel = 'beam' | 'slab' | 'column';

/** Cadres d'effort tranchant : la forme de `ShearReinforcement` du §6.2.3. */
export interface ShearLinksModel {
  /** Aire totale des brins d'un cours de cadres (mm²). */
  Asw: number;
  /** Espacement des cours (mm). */
  s: number;
  /** Limite elastique caracteristique des cadres (MPa). */
  fywk: number;
}

/**
 * Effort tranchant et son ferraillage d'ame (version 3 du format).
 *
 * `V_Ed` seul suffit : le §6.2.2 rend deja un verdict sans cadres, et un
 * effort tranchant se saisit avant d'avoir choisi les cadres. Son signe est
 * indifferent — `verifyShear` n'en retient que le module — mais il est
 * conserve tel quel : reecrire une valeur saisie serait la corriger en
 * silence.
 *
 * L'effort normal concomitant ne figure PAS ici : c'est celui de l'ELU,
 * `action.N`, et le dupliquer ouvrirait la porte a un fichier ou les deux se
 * contredisent.
 */
export interface ShearModel {
  /** Effort tranchant sollicitant (kN). */
  V_Ed: number;
  /** Cadres declares. Absents : verification du §6.2.2 seule. */
  links?: ShearLinksModel;
  /**
   * `cot theta` du §6.2.3(2). Absent, c'est le defaut de `shearWithLinks`
   * qui s'applique, soit 2,5 — le parseur n'inscrit rien de lui-meme.
   *
   * C'est le CAS LIMITE assume de la frontiere du format : `cot theta` est un
   * choix d'ingenieur, donc une hypothese de verification, mais il
   * conditionne le ferraillage retenu et doit voyager avec lui.
   */
  cotTheta?: number;
}

/**
 * Deformation genee (« Zwang ») au sens de l'EN 1992-1-1 §7.3.2 (version 3).
 *
 * A ne pas confondre avec `MeyerModel`, qui repond a la meme question par la
 * methode allemande. Les deux blocs coexistent dans un modele.
 */
export interface RestraintModel {
  /** Nature de la gene : centree ou de flexion. */
  type: 'central' | 'bending';
  /** `f_ct,eff` (MPa). Absent : `f_ctm` a 28 jours, le cas defavorable. */
  fctEff?: number;
  /** Contrainte d'acier admise (MPa). Absente : `f_yk`. */
  sigmaS?: number;
  /**
   * Convention nationale du facteur `k`. Absent : `ec2`.
   *
   * Remplace `effectiveZoneOnly`, devenu sans objet : les deux approches sont
   * desormais calculees et la plus petite retenue. Un fichier qui portait
   * l'ancien champ reste LISIBLE — le parseur en verifie encore le type puis
   * le jette — mais le resultat ne depend plus de lui.
   */
  thicknessConvention?: 'ec2' | 'de';
  /**
   * Famille de formules de `h_c,ef`. Absent : `din`.
   *
   * S'ENREGISTRE, contrairement au forcage des valeurs intermediaires : la
   * methode decrit le REFERENTIEL retenu, que la note de calcul doit pouvoir
   * reaffirmer six mois plus tard. Un forcage, lui, est une hypothese
   * d'examen — la regle de frontiere du format s'y applique dans son sens
   * habituel, et il se re-choisit.
   */
  method?: 'ec2' | 'din';
}

/**
 * Saisie de la methode Meyer / DIN 1045 (version 3 du format).
 *
 * Elle porte sa PROPRE geometrie (`h`, `d1`) et sa propre resistance en
 * traction (`fctm`), independantes de `geometry` et de `concrete` : la
 * methode s'emploie couramment en pre-dimensionnement, sur une epaisseur
 * qu'on fait varier avant meme d'avoir arrete la section. Les lier
 * interdirait cet usage.
 *
 * `Es` et `b` ne sont pas du modele : ce sont les defauts de
 * `meyerRestraintReinforcement` (200000 MPa, 1000 mm), et les aires sortent
 * par metre de largeur.
 */
export interface MeyerModel {
  /** Epaisseur de l'element (mm). */
  h: number;
  /** Enrobage A L'AXE des barres (mm). */
  d1: number;
  /** Diametre des barres (mm). */
  ds: number;
  /** Ouverture de fissure visee (mm). */
  wk: number;
  /** Resistance moyenne en traction a 28 jours (MPa). */
  fctm: number;
  /** Facteur d'age `f_ct,eff / f_ctm`. */
  kzt: number;
  cas: 'traction' | 'flexion';
  bridage: 'exterieur' | 'interieur';
  /** Interpolation du facteur `k`. Absent : `lineaire`. */
  kmode?: 'lineaire' | 'parabolique';
}

/**
 * Referentiel retenu pour l'armature minimale sous deformation genee
 * (version 4 du format).
 *
 * Les deux methodes coexistent dans le noyau et ne se remplacent pas : le
 * §7.3.2 de l'EN 1992-1-1 d'un cote, la methode Meyer / DIN 1045 de l'autre.
 * Les afficher toutes les deux en permanence ne dit pas laquelle a servi ;
 * ce champ le dit, et la note de calcul le reproduit.
 *
 * `both` n'est pas une indecision : c'est le mode COMPARATIF, celui qui
 * montre laquelle des deux surarme, et il reste un choix declare.
 */
export type RestraintReferentialModel = 'ec2' | 'meyer' | 'both';

/**
 * Comment l'etat de fissuration en service est choisi (version 4).
 *
 * `auto` applique le critere du §7.1(2) ; les deux autres imposent l'etat I
 * (beton tendu actif) ou l'etat II (beton tendu neglige).
 */
export type CrackingModeModel = 'auto' | 'uncracked' | 'cracked';

/** Etat de fissuration retenu en service (version 4). */
export interface CrackingModel {
  mode?: CrackingModeModel;
  /**
   * `f_ct,eff` du critere (MPa). Absent : `f_ctm` a 28 jours.
   *
   * ⚠ A ne pas confondre avec le `fctEff` de `RestraintModel`, qui porte le
   * meme nom et joue le role INVERSE : ici une valeur elevee repousse la
   * fissuration, la-bas elle augmente l'armature exigee. Deux champs
   * distincts, deliberement, plutot qu'un seul dont le sens changerait selon
   * le lecteur.
   */
  fctEff?: number;
}

/**
 * LES VERIFICATIONS RETENUES (version 4 du format).
 *
 * ⚠ EXCEPTION ASSUMEE A LA FRONTIERE DU FORMAT, enoncee en bas de ce
 * fichier : ceci decrit bien une HYPOTHESE DE VERIFICATION, pas l'ouvrage,
 * et la regle voudrait donc que cela se re-choisisse a chaque session.
 *
 * Ce qui fait pencher dans l'autre sens : cette selection gouverne ce que la
 * NOTE DE CALCUL affirme. Une note qui annoncerait d'autres verifications
 * que le fichier dont elle sort ne serait pas relisable six mois plus tard,
 * et c'est precisement ce que la frontiere cherche a eviter. Le champ est
 * donc du cote « se sauvegarde », pour la meme raison que `cot theta`, et
 * l'arbitrage est ecrit ici plutot que devine.
 *
 * Tous les drapeaux sont OPTIONNELS. Absents — un fichier de version 1 a 3 —
 * ils se deduisent de ce que le fichier PORTE : un modele qui a des
 * sollicitations de service voulait verifier le service. C'est ce qui rend
 * un fichier ancien identique a lui-meme apres la mise a jour.
 */
export interface ChecksModel {
  /** Contraintes (§7.2), fissuration (§7.3), courbure (§7.4.3), etat de fissuration (§7.1). */
  service?: boolean;
  /** Effort tranchant (§6.2). */
  shear?: boolean;
  /** Dispositions constructives (§9). */
  detailing?: boolean;
  /** Armature minimale sous deformation genee. Voir `restraintReferential`. */
  restraint?: boolean;
  /** Etat d'equilibre et contrainte des aciers sous la sollicitation ELU. */
  sectionState?: boolean;
  /** Absent : `both`, le comparatif. */
  restraintReferential?: RestraintReferentialModel;
  cracking?: CrackingModel;
}

export type GeometryModel =
  | { kind: 'rectangle'; width: number; height: number }
  | { kind: 'polygon'; vertices: PointModel[] }
  | { kind: 'circle'; diameter: number; segments?: number };

export type BarSpecModel =
  | { count: number; diameter: number }
  | { diameter: number; maxSpacing: number };

export type RowFaceModel = 'top' | 'bottom' | 'left' | 'right';

export type ReinforcementModel =
  | {
      kind: 'rectangular-layout';
      cover: number;
      stirrupDiameter?: number;
      rows: Array<{ face: RowFaceModel; bars: BarSpecModel }>;
    }
  | {
      kind: 'circular-cage';
      cover: number;
      stirrupDiameter?: number;
      barDiameter: number;
      count: number;
      rotationOffset?: number;
    }
  | {
      kind: 'rows';
      rows: Array<{
        from: PointModel;
        to: PointModel;
        bars: BarSpecModel;
        endpoints?: 'include' | 'exclude';
      }>;
    }
  | { kind: 'bars'; bars: Array<{ y: number; z: number; area: number }> };

export interface SectionModel {
  formatVersion: number;
  engineVersion: string;
  name?: string;
  norm: NormModel;
  concrete: ConcreteModel;
  steel: SteelModel;
  geometry: GeometryModel;
  reinforcement: ReinforcementModel;
  action: ActionModel;
  /**
   * Sollicitations de service (version 2 du format). OPTIONNEL : un modele
   * de version 1 n'en porte pas, et un modele de version 2 peut n'en porter
   * aucune, ou une seule. Absentes, elles ne sont pas inventees.
   */
  serviceActions?: ServiceActionsModel;
  /**
   * Type d'element au sens du §9 (version 3). OPTIONNEL : absent d'un fichier
   * anterieur, et absent d'un modele dont on ne verifie que la flexion.
   */
  elementType?: ElementTypeModel;
  /** Effort tranchant et cadres (version 3). Voir `ShearModel`. */
  shear?: ShearModel;
  /** Deformation genee, §7.3.2 (version 3). Voir `RestraintModel`. */
  restraint?: RestraintModel;
  /** Saisie de la methode Meyer (version 3). Voir `MeyerModel`. */
  meyer?: MeyerModel;
  /**
   * Verifications retenues (version 4). Voir `ChecksModel`, et l'exception
   * a la frontiere du format qui y est justifiee.
   */
  checks?: ChecksModel;
}

/**
 * LA FRONTIERE DU FORMAT, etablie en session 10 et tenue depuis :
 *
 *   ce qui decrit la STRUCTURE et son CHARGEMENT se sauvegarde ;
 *   ce qui decrit une HYPOTHESE DE VERIFICATION se re-choisit.
 *
 * C'est pourquoi le coefficient d'equivalence `n`, l'ouverture admissible
 * `w_max` et le coefficient `beta` du service n'entrent pas dans le modele :
 * ils ne disent rien de l'ouvrage, seulement de la maniere dont on l'examine
 * ce jour-la. Un fichier qui les porterait figerait une hypothese de travail
 * dans une donnee d'ouvrage, et la ferait ressortir des mois plus tard sans
 * que personne se souvienne de l'avoir choisie.
 *
 * `cot theta` est le cas limite, tranche dans l'autre sens et assume : c'est
 * un choix d'ingenieur, mais il conditionne le ferraillage retenu et n'a plus
 * de sens separe de lui.
 */
