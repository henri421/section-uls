/**
 * Version anglaise (lot 8.8) : traduction A LA SORTIE. PUR.
 *
 * L'app et le noyau ecrivent en francais ; en anglais, tout texte affiche
 * passe par un traducteur au moment d'etre ecrit dans la page : `tr` pour une
 * phrase, `trHtml` pour un fragment HTML ou SVG, `trBlocs` pour les blocs du
 * CSV, `trNote` pour la note (avant sa mise en HTML, qui coupe les phrases).
 * Trois etages : phrases exactes, regles a motif, puis un glossaire de
 * morceaux en une seule passe, du plus long au plus court.
 *
 * En francais, tout sort intact.
 */

import { langueCourante, notationHtml as notationHtmlCommun, pointDecimal } from 'aedificium-ui';
import type { BlocService } from './service-view';

const EXACTES: Record<string, string> = {
  "Identification": "Identification",
  "Nom": "Name",
  "Forme": "Shape",
  "Polygone": "Polygon",
  "Cercle": "Circle",
  "Ferraillage": "Reinforcement",
  "Cage circulaire": "Circular cage",
  "Face": "Face",
  "inferieure": "bottom",
  "superieure": "top",
  "gauche": "left",
  "droite": "right",
  "Sollicitation": "Action",
  "sollicitation": "action",
  "Sorties": "Outputs",
  "Enregistrer": "Save",
  "Combinaison": "Combination",
  "N constant": "constant N",
  "Nombres possibles": "Possible numbers",
};

/** Regles a motif : une phrase entiere, ou l'ordre des mots change. */
const REGLES: ReadonlyArray<readonly [RegExp, string | ((...a: string[]) => string)]> = [
  [/^element absent de la page: (.*)$/, 'element missing from the page: $1'],
];

/**
 * Glossaire de morceaux, du plus long au plus court, sur des mots entiers.
 * Un « # » dans une cle vaut un nombre quelconque ; les nombres trouves
 * reprennent, dans l'ordre, la place des « # » de la traduction.
 */
const MORCEAUX: Record<string, string> = {
  "Une nouvelle version est disponible. Recharger maintenant ?": "A new version is available. Reload now?",
  "Calcul en cours…": "Calculating…",
  "Trace du domaine en cours…": "Plotting the domain…",
  "valeur ou expression attendue, recu": "value or expression expected, received",
  "(caractère inattendu": "(unexpected character",
  "(caractere inattendu": "(unexpected character",
  "(valeur vide)": "(empty value)",
  "doit etre strictement positif": "must be strictly positive",
  "doit être strictement positif": "must be strictly positive",
  "contrainte d acier nulle ou negative": "zero or negative steel stress",
  "# MPa en compression, eps # ‰ — PLASTIFIEE": "# MPa in compression, eps # ‰ — YIELDED",
  "# MPa en traction, eps # ‰ — PLASTIFIEE": "# MPa in tension, eps # ‰ — YIELDED",
  "# MPa en compression, eps # ‰": "# MPa in compression, eps # ‰",
  "# MPa en traction, eps # ‰": "# MPa in tension, eps # ‰",
  "# barres HA# par metre, espacement # mm a arrondir vers le BAS (A_s fournie # mm²/m)": "# bars H# per metre, spacing # mm to be rounded DOWN (A_s provided # mm²/m)",
  "# barres HA# par metre": "# bars H# per metre",
  "# barres HA#": "# bars H#",
  "# barres, # mm²": "# bars, # mm²",
  "# barres": "# bars",
  "# cm²/m par nappe": "# cm²/m per layer",
  "# cm²/m sur # nappe(s)": "# cm²/m over # layer(s)",
  "— cm²/m par nappe": "— cm²/m per layer",
  "— cm²/m sur # nappe(s)": "— cm²/m over # layer(s)",
  "# kg/m³ de béton": "# kg/m³ of concrete",
  "# mm (limite w_max # mm)": "# mm (limit w_max # mm)",
  "— mm (limite w_max # mm)": "— mm (limit w_max # mm)",
  "# mm sous la fibre supérieure": "# mm below the top fibre",
  "#.#: armature longitudinale au-dela du maximum — # mm² en place pour # mm² admis": "#.#: longitudinal reinforcement above the maximum — # mm² provided for # mm² allowed",
  "#.#: armature longitudinale insuffisante — # mm² en place pour Infinity mm² exiges": "#.#: insufficient longitudinal reinforcement — # mm² provided for Infinity mm² required",
  "#.#: armature longitudinale insuffisante — # mm² en place pour # mm² exiges": "#.#: insufficient longitudinal reinforcement — # mm² provided for # mm² required",
  "#.#: aucune armature d ame: le #.#(#) en exige au minimum rho_w,min = #e#": "#.#: no shear reinforcement: #.#(#) requires at least rho_w,min = #e#",
  "#.#: aucune armature d ame: le #.#(#) en exige au minimum": "#.#: no shear reinforcement: #.#(#) requires at least",
  "s_r,max donne par l eq.": "s_r,max given by Eq.",
  "hors du domaine de l eq.": "outside the range of Eq.",
  "(bascule des deux regimes exterieurs)": "(switch between the two external regimes)",
  "(sans armature d'âme)": "(without shear reinforcement)",
  "(une face)": "(one face)",
  "(zone d'action de l'armature)": "(area of action of the reinforcement)",
  "(zone tendue entière)": "(whole tension zone)",
  "(aire tendue mobilisee)": "(mobilised tension area)",
  "= # kN·m): le point sollicitant ne se trouve pas dans le plan de ce graphe, qui ne peut donc pas rendre le verdict.": "= # kN·m): the design point does not lie in the plane of this graph, which therefore cannot give the verdict.",
  "C'est le domaine My-Mz ci-dessous qui fait foi.": "The My-Mz domain below is authoritative.",
  "A_s en place": "A_s provided",
  "A_s par face": "A_s per face",
  "A_s total": "A_s total",
  "A_s,min approche mince": "A_s,min thin approach",
  "A_s,min approche épaisse": "A_s,min thick approach",
  "A_s,min retenu": "A_s,min used",
  "A_s,min total": "A_s,min total",
  "approche épaisse": "thick approach",
  "approche mince": "thin approach",
  "Aire de béton": "Concrete area",
  "Aire totale A_s": "Total area A_s",
  "Annex allemande — # vers #": "German Annex — # to #",
  "EC# recommandé — # vers #": "EC# recommended — # to #",
  "Armature d'âme (#.#)": "Shear reinforcement (#.#)",
  "Armatures d'effort tranchant: l'aire A_sw est vide alors que l'espacement est renseigné.": "Shear reinforcement: the area A_sw is empty while the spacing is given.",
  "Armatures d'effort tranchant: l'espacement est vide alors que l'aire A_sw est renseignée.": "Shear reinforcement: the spacing is empty while the area A_sw is given.",
  "Les cadres se saisissent entièrement, ou pas du tout.": "Links are entered completely, or not at all.",
  "Armatures d'âme": "Shear reinforcement",
  "Armatures inférieures": "Bottom reinforcement",
  "Armatures supérieures": "Top reinforcement",
  "Armatures tendues": "Tension reinforcement",
  "Armatures": "Reinforcement",
  "Aucune donnée de niveau ÉLÉMENT — portée, conditions d'appui, schéma statique — n'entre dans ce calcul.": "No MEMBER-level data — span, support conditions, structural system — enters this calculation.",
  "Axe neutre en service (≠ ELU)": "Neutral axis in service (≠ ULS)",
  "Axe neutre": "Neutral axis",
  "Barre # (y #, z #)": "Bar # (y #, z #)",
  "Bras de levier z = d − #x": "Lever arm z = d − #x",
  "Ce bloc ne rend AUCUN verdict: il donne l'aire d'acier exigée par la méthode, il ne la compare à aucune armature en place.": "This block gives NO verdict: it gives the steel area required by the method, it does not compare it with any reinforcement provided.",
  "Ce bloc ne rend AUCUN verdict: il donne l'aire d'acier exigée par le #.#, il ne la compare à aucune armature en place.": "This block gives NO verdict: it gives the steel area required by #.#, it does not compare it with any reinforcement provided.",
  "Ce n'est PAS une flèche.": "It is NOT a deflection.",
  "Ce n'est pas une incohérence: elles portent sur des combinaisons DIFFÉRENTES de l'ELU, saisies séparément et uniaxiales.": "This is not an inconsistency: they apply to combinations DIFFERENT from the ULS, entered separately and uniaxial.",
  "Ces trois-la sont des CHOIX de vérification, pas des constantes normatives, et ils ne sont pas enregistres avec le modèle: n = # est conventionnel et n'est pas prescrit sous cette forme par l'EN ###; w_max depend de la classe d'exposition (Table #N); beta vaut # en charge de longue durée ou répétée, # en charge courte.": "These three are verification CHOICES, not code constants, and they are not saved with the model: n = # is conventional and is not prescribed in this form by EN ###; w_max depends on the exposure class (Table #N); beta is # for long-term or repeated loading, # for short-term loading.",
  "Chemin de chargement": "Loading path",
  "Combinaison caractéristique": "Characteristic combination",
  "Combinaisons EN # DIFFÉRENTES de l'ELU et différentes entre elles: la caractéristique gouverne le #, la quasi-permanente le # et le #.#.": "EN # combinations DIFFERENT from the ULS and from each other: the characteristic one governs #, the quasi-permanent one # and #.#.",
  "Composantes M_Rd": "Components M_Rd",
  "Compression du béton sigma_c": "Concrete compression sigma_c",
  "Compression maximale des aciers": "Maximum steel compression",
  "Contraintes de service non vérifiées": "Service stresses not satisfied",
  "Contraintes de service vérifiées sur l'état retenu": "Service stresses satisfied on the state used",
  "Contraintes de service vérifiées": "Service stresses satisfied",
  "Contraintes obtenues avec les LOIS DE CALCUL de l'ELU (f_cd, f_yd, parabole-rectangle, béton tendu neglige), sous la sollicitation ELU.": "Stresses obtained with the ULS DESIGN LAWS (f_cd, f_yd, parabola-rectangle, concrete in tension neglected), under the ULS action.",
  "Convention du facteur k": "Convention for the factor k",
  "Courbure (#.#): ce N'EST PAS UNE FLÈCHE.": "Curvature (#.#): this IS NOT A DEFLECTION.",
  "Deux bras de levier, deux definitions.": "Two lever arms, two definitions.",
  "Dispositions constructives non respectees": "Detailing rules not met",
  "Dispositions constructives respectées": "Detailing rules met",
  "Dispositions constructives respectees": "Detailing rules met",
  "Dispositions constructives": "Detailing rules",
  "Distance entre resultantes": "Distance between resultants",
  "Déformation fibre inférieure": "Strain at bottom fibre",
  "Déformation fibre supérieure": "Strain at top fibre",
  "Déformation gênée (#.#) et méthode Meyer: une aire d'acier EXIGÉE est rendue, sans comparaison à aucune armature en place, et donc sans verdict.": "Restrained deformation (#.#) and Meyer method: a REQUIRED steel area is given, without comparison with any reinforcement provided, and therefore without a verdict.",
  "Déformation gênée, armature minimale (#.#)": "Restrained deformation, minimum reinforcement (#.#)",
  "Déformation gênée": "Restrained deformation",
  "déformation gênée — référentiel: DIN #, méthode Meyer": "restrained deformation — reference: DIN #, Meyer method",
  "déformation gênée — référentiel: comparatif #.# / Meyer": "restrained deformation — reference: comparison #.# / Meyer",
  "déformation gênée — référentiel: EN ### (#.#)": "restrained deformation — reference: EN ### (#.#)",
  "déformation gênée": "restrained deformation",
  "EC#_recommended": "EC#_recommended",
  "Effort normal N": "Axial force N",
  "Effort tranchant (#) et ouverture de fissures (#): sections RECTANGULAIRES seulement.": "Shear (#) and crack width (#): RECTANGULAR sections only.",
  "Effort tranchant non vérifié": "Shear not satisfied",
  "Effort tranchant vérifié": "Shear satisfied",
  "Effort tranchant, dispositions constructives, déformation gênée": "Shear, detailing, restrained deformation",
  "Effort tranchant": "Shear",
  "effort tranchant V_Ed": "shear force V_Ed",
  "Elle NE REMPLACE PAS le #.# affiché juste au-dessus: les deux coexistent et répondent autrement à la même question.": "It DOES NOT REPLACE #.# shown just above: both coexist and answer the same question differently.",
  "Elle ne remplace pas le #.# et n'a de valeur réglementaire ni en Belgique ni au Luxembourg.": "It does not replace #.# and has no regulatory standing in Belgium or Luxembourg.",
  "Elle sert ici au PRÉDIMENSIONNEMENT et au contrôle d'ordre de grandeur.": "It is used here for PRELIMINARY DESIGN and order-of-magnitude checks.",
  "En Belgique et au Luxembourg, la norme applicable reste l'EN ### et ses annexes NBN / ILNAS.": "In Belgium and Luxembourg, the applicable standard remains EN ### and its NBN / ILNAS annexes.",
  "Enfin, seule la famille traction / bridage extérieur est VALIDÉE — confrontee au diagramme de l'ouvrage a environ # % pres.": "Finally, only the tension / external restraint family is VALIDATED — compared with the diagram of the reference work to within about # %.",
  "Espacement des barres": "Bar spacing",
  "Flexion droite uniquement.": "Uniaxial bending only.",
  "Flexion déviée": "Biaxial bending",
  "Géométrie non rectangulaire.": "Non-rectangular geometry.",
  "Géométrie": "Geometry",
  "Identification et profil normatif": "Identification and code profile",
  "Inclinaison de l'axe neutre": "Inclination of the neutral axis",
  "L'aire de béton tendu A_ct du #.# suppose une largeur constante et n'est pas transposable telle quelle.": "The tensile concrete area A_ct of #.# assumes a constant width and cannot be transposed as such.",
  "L'équilibre sous sollicitation donnée est résolu en flexion DROITE: il faudrait une orientation d'axe neutre supplementaire, que ce module ne cherche pas.": "The equilibrium under the given action is solved in UNIAXIAL bending: it would need an additional neutral axis orientation, which this module does not search for.",
  "La combinaison quasi-permanente (#, #.#) exclut d'ailleurs le vent, qui apporte le plus souvent le moment transversal.": "The quasi-permanent combination (#, #.#) moreover excludes wind, which most often brings the transverse moment.",
  "La courbure s'intègre le long de la pièce par qui dispose du schéma statique.": "The curvature is integrated along the member by whoever has the structural system.",
  "La distance entre resultantes separe les resultantes de compression et de traction TOTALES, toutes armatures comprises: elle se raccourcit des qu'une seconde nappe se trouve du cote tendu, même faiblement sollicitée.": "The distance between resultants separates the TOTAL compression and tension resultants, all reinforcement included: it shortens as soon as a second layer lies on the tension side, even lightly stressed.",
  "La flexion et le bridage intérieur sont dérivés de la même formulation, et n'ont ete confrontes a rien.": "Bending and internal restraint are derived from the same formulation, and have not been compared with anything.",
  "La largeur d'âme b_w et la hauteur utile d du # n'ont pas de définition non ambiguë hors du rectangle, et l'EN ### ne la donne pas: le calcul est refuse plutôt qu'approxime.": "The web width b_w and the effective depth d of # have no unambiguous definition outside the rectangle, and EN ### does not give one: the calculation is refused rather than approximated.",
  "La largeur d'âme b_w, la hauteur utile d, ainsi que la zone tendue n'ont pas de définition non ambiguë hors du rectangle, et le calcul est refuse plutôt qu'approxime.": "The web width b_w, the effective depth d and the tension zone have no unambiguous definition outside the rectangle, and the calculation is refused rather than approximated.",
  "La méthode est allemande (DIN #): en Belgique et au Luxembourg la norme applicable reste l'EN ### et ses annexes nationales (NBN, ILNAS).": "The method is German (DIN #): in Belgium and Luxembourg the applicable standard remains EN ### and its National Annexes (NBN, ILNAS).",
  "La traction du béton atteint f_ct,eff: le béton tendu est integralement neglige, et toute la traction passe dans les armatures.": "The concrete tension reaches f_ct,eff: the concrete in tension is entirely neglected, and all the tension goes into the reinforcement.",
  "La zone efficace des # faces (# mm²) depasse la section de beton (# mm²): h_c,ef impose au-dela de h/#.": "The effective area of the # faces (# mm²) exceeds the concrete section (# mm²): h_c,ef imposed beyond h/#.",
  "Le #.# est LINÉAIRE en A_s, son k va de # à # et l'ouverture de fissure n'entre pas dans sa formule; Meyer tire A_s d'une RACINE, son k va de # à # et w_k y figure explicitement.": "#.# is LINEAR in A_s, its k ranges from # to # and the crack width does not enter its formula; Meyer obtains A_s from a SQUARE ROOT, its k ranges from # to # and w_k appears in it explicitly.",
  "Le béton tendu participe, ce qui soulage les armatures: le sigma_s ci-dessus est plus faible que celui d'un calcul en section fissurée, et c'est legitime tant que la traction reste sous f_ct,eff.": "The concrete in tension contributes, which relieves the reinforcement: the sigma_s above is lower than that of a cracked-section calculation, and this is legitimate as long as the tension stays below f_ct,eff.",
  "Le calcul est mene tel quel.": "The calculation is carried out as it is.",
  "Le coefficient d'équivalence n'est un choix assume, non une prescription de l'EN ###.": "The modular ratio n is an assumed choice, not a requirement of EN ###.",
  "Le critère du #(#) designe l'autre: état I — section NON fissurée, le béton tendu travaille.": "The criterion of #(#) points to the other one: state I — UNCRACKED section, the concrete in tension works.",
  "Le critère du #(#) designe l'autre: état II — section FISSURÉE, le béton tendu est neglige.": "The criterion of #(#) points to the other one: state II — CRACKED section, the concrete in tension is neglected.",
  "Le facteur k est un PARAMÈTRE NATIONAL.": "The factor k is a NATIONALLY DETERMINED PARAMETER.",
  "Le moment résistant, lui, reste calcule en flexion déviée par le bloc de flexion.": "The resisting moment, for its part, is still calculated in biaxial bending by the bending block.",
  "Le z = d − #x est celui des abaques, fonde sur le bloc rectangulaire et sur la seule nappe la plus eloignee.": "The z = d − #x is that of the design charts, based on the rectangular block and on the furthest layer only.",
  "Les coefficients k#, k#, k#, kt et les valeurs du # restent a leurs valeurs RECOMMANDÉES par l'EN ###: une Annex nationale (NBN, ILNAS, NF) peut les modifier, et c'est alors elle qui fait foi.": "The coefficients k#, k#, k#, kt and the values of # stay at the values RECOMMENDED by EN ###: a National Annex (NBN, ILNAS, NF) may modify them, and it is then authoritative.",
  "Les contraintes (#) et la courbure (#.#) restent calculables.": "The stresses (#) and the curvature (#.#) can still be calculated.",
  "Les contraintes ci-dessus sont donc celles d une hypothèse que la norme n aurait pas retenue ici — c'est un examen, pas une justification.": "The stresses above are therefore those of an assumption the code would not have made here — it is an examination, not a justification.",
  "Les deux k portent le même nom sans recouvrir la même grandeur: deux valeurs différentes à dix lignes d'écart ne sont pas une incohérence, et il ne faut ni les comparer ni les échanger.": "The two k share the same name without covering the same quantity: two different values ten lines apart are not an inconsistency, and they must be neither compared nor swapped.",
  "Les deux sont exacts et ne mesurent pas la même chose.": "Both are exact and do not measure the same thing.",
  "Les formules du #.# supposent une zone tendue rectangulaire et ne sont pas transposables telles quelles.": "The formulas of #.# assume a rectangular tension zone and cannot be transposed as such.",
  "Limite k#·f_ck": "Limit k#·f_ck",
  "Limite k#·f_yk": "Limit k#·f_yk",
  "Méthode de G. et R. MEYER: méthode ALLEMANDE (DIN #), servant au pre-dimensionnement et au contrôle d'ordre de grandeur.": "Method of G. and R. MEYER: GERMAN method (DIN #), used for preliminary design and order-of-magnitude checks.",
  "MINCE — zone tendue entière": "THIN — whole tension zone",
  "ÉPAISSE — zone de béton tendu efficace": "THICK — effective tensile concrete zone",
  "Matériaux": "Materials",
  "Mode de saisie": "Input mode",
  "Moment de fissuration M_cr": "Cracking moment M_cr",
  "Moment résistant": "Resisting moment",
  "Méthode Meyer: une aire d'acier EXIGÉE est rendue, sans comparaison à aucune armature en place, et donc sans verdict.": "Meyer method: a REQUIRED steel area is given, without comparison with any reinforcement provided, and therefore without a verdict.",
  "Méthode de h_c,ef": "Method for h_c,ef",
  "Nombre de barres": "Number of bars",
  "Non vérifié — taux out of range": "Not satisfied — ratio out of range",
  "Non vérifié — taux #": "Not satisfied — ratio #",
  "Vérifié — taux #": "Satisfied — ratio #",
  "Ouverture de fissure non vérifiée": "Crack width not satisfied",
  "Ouverture de fissure vérifiée": "Crack width satisfied",
  "Ouverture de fissures (#)": "Crack width (#)",
  "Ouverture de fissures": "Crack width",
  "Par défaut f_ct,eff est prise à # jours, ce qui est le cas DEFAVORABLE: la fissuration des pieces massives survient a quelques jours, et le #.#(#) demande d'estimer f_ct,eff à l'âge ou elle est attendue.": "By default f_ct,eff is taken at # days, which is the UNFAVOURABLE case: cracking of massive members occurs after a few days, and #.#(#) asks for f_ct,eff to be estimated at the age when it is expected.",
  "Paramètres de service assumés": "Assumed service parameters",
  "Position de l'axe neutre": "Position of the neutral axis",
  "Poteau P#": "Column P#",
  "Profil normatif retenu: EC#_recommended.": "Code profile used: EC#_recommended.",
  "Régime": "Regime",
  "Répartition proposee, par face": "Proposed distribution, per face",
  "Répartition proposée, par face": "Proposed distribution, per face",
  "Résistance retenue V_Rd": "Resistance used V_Rd",
  "Résistance": "Resistance",
  "Résultante de compression": "Compression resultant",
  "Résultante de traction": "Tension resultant",
  "Section, armatures et axe neutre à l'ELU": "Section, reinforcement and neutral axis at ULS",
  "Seule la famille traction / bridage extérieur a ete confrontee au diagramme de l'ouvrage.": "Only the tension / external restraint family has been compared with the diagram of the reference work.",
  "Sollicitation ELU déviée (Mz = # kN·m), alors que les vérifications ci-dessous sont en flexion droite.": "Biaxial ULS action (Mz = # kN·m), whereas the verifications below are in uniaxial bending.",
  "Sollicitation de service caractéristique (#)": "Characteristic service action (#)",
  "Sollicitation de service quasi-permanente (#, #.#)": "Quasi-permanent service action (#, #.#)",
  "M est vide alors que N est renseigné.": "M is empty while N is given.",
  "N est vide alors que M est renseigné.": "N is empty while M is given.",
  "Sollicitation déviée (M_z = # kN·m).": "Biaxial action (M_z = # kN·m).",
  "Sollicitations de service": "Service actions",
  "Taux V_Ed / V_Rd": "Ratio V_Ed / V_Rd",
  "Taux d'armature d'âme rho_w": "Shear reinforcement ratio rho_w",
  "Taux dans les aciers sigma_s / f_yd": "Steel ratio sigma_s / f_yd",
  "Traction des aciers sigma_s": "Steel tension sigma_s",
  "Traction extreme du béton (état I)": "Extreme concrete tension (state I)",
  "Traction maximale des aciers": "Maximum steel tension",
  "Type d'élément (déclaré)": "Element type (declared)",
  "Une combinaison de service se saisit entièrement, ou pas du tout.": "A service combination is entered completely, or not at all.",
  "Une flèche exige la portée, les conditions d'appui et la répartition des charges — des données de niveau ÉLÉMENT, que ce module de sections ne connaît pas.": "A deflection requires the span, the support conditions and the load distribution — MEMBER-level data, which this section module does not know.",
  "Une flèche exige la portée, les conditions d'appui et la répartition des charges.": "A deflection requires the span, the support conditions and the load distribution.",
  "V_Ed = # kN au-dela de V_Rd,c = # kN: des armatures d ame sont necessaires (aucune n est declaree)": "V_Ed = # kN beyond V_Rd,c = # kN: shear reinforcement is required (none is declared)",
  "V_Rd,c (sans armature d'âme)": "V_Rd,c (without shear reinforcement)",
  "Version du format": "Format version",
  "Version du moteur": "Engine version",
  "Vérification de SECTION: la note ne traite ni le flambement (#), ni l'ancrage et les recouvrements (#), ni la torsion, ni le poinçonnement, ni la précontrainte.": "SECTION verification: the note covers neither buckling (#), nor anchorage and laps (#), nor torsion, nor punching, nor prestressing.",
  "Vérifications de service (#, #, #.#): FLEXION DROITE uniquement, sur les combinaisons saisies séparément de l'ELU.": "Service verifications (#, #, #.#): UNIAXIAL BENDING only, on the combinations entered separately from the ULS.",
  "Vérifications de service (ELS)": "Service verifications (SLS)",
  "Vérifier que la sollicitation de service saisie décrit bien la flexion attendue.": "Check that the service action entered does describe the expected bending.",
  "aucun axe neutre dans la section: elle est vraisemblablement entièrement comprimée, et l'hypothèse de section fissurée ne s'applique plus (la section non fissurée n'est pas couverte)": "no neutral axis in the section: it is probably entirely in compression, and the cracked-section assumption no longer applies (the uncracked section is not covered)",
  "aucune armature dans l'aire effective de béton tendu": "no reinforcement in the effective tensile concrete area",
  "caractéristique — celle que le # limite": "characteristic — the one that # limits",
  "cercle de diamètre # mm (intégré en polygone à # côtés)": "circle of diameter # mm (integrated as a polygon with # sides)",
  "compression du beton # MPa au-dela de la limite # MPa": "concrete compression # MPa beyond the limit # MPa",
  "compression du béton # MPa au-delà de la limite # MPa": "concrete compression # MPa beyond the limit # MPa",
  "traction de l acier # MPa au-dela de la limite # MPa": "steel tension # MPa beyond the limit # MPa",
  "traction de l'acier # MPa au-delà de la limite # MPa": "steel tension # MPa beyond the limit # MPa",
  "ouverture de fissure # mm au-dela de la limite # mm": "crack width # mm beyond the limit # mm",
  "contour OUVERT du cote traction: seule la branche du pivot béton est parcourue": "contour OPEN on the tension side: only the concrete pivot branch is traced",
  "dalle": "slab",
  "poteau": "column",
  "poutre": "beam",
  "effort normal hors du domaine resistant: la section est depassee avant toute flexion": "axial force outside the resistance domain: the section fails before any bending",
  "exigees par le calcul (V_Ed > V_Rd,c) — le minimum du #.# s y ajoute": "required by calculation (V_Ed > V_Rd,c) — the minimum of #.# is added",
  "exigees par le calcul (V_Ed &gt; V_Rd,c) — le minimum du #.# s y ajoute": "required by calculation (V_Ed &gt; V_Rd,c) — the minimum of #.# is added",
  "non exigees par le calcul (V_Ed ≤ V_Rd,c) — le minimum du #.# reste du": "not required by calculation (V_Ed ≤ V_Rd,c) — the minimum of #.# is still due",
  "f_ct,eff du critère": "f_ct,eff of the criterion",
  "fissuration achevée (h ≥ h_grenz) — le cas des éléments massifs courants": "stabilised cracking (h ≥ h_grenz) — the case of common massive members",
  "fissure unique (h inférieure à h_grenz) — la pièce est assez mince pour qu'une seule fissure se forme": "single crack (h below h_grenz) — the member is thin enough for a single crack to form",
  "non fissurée": "uncracked",
  "fissurée": "cracked",
  "graphe de la flexion droite autour de y": "graph of uniaxial bending about y",
  "h_c,ef (une face)": "h_c,ef (one face)",
  "h_grenz (bascule des deux regimes exterieurs)": "h_grenz (switch between the two external regimes)",
  "hors section: aucune fibre ne change de signe": "outside the section: no fibre changes sign",
  "k (contraintes propres, # à # — pas le k du #.#)": "k (self-equilibrating stresses, # to # — not the k of #.#)",
  "k (facteur d'épaisseur)": "k (thickness factor)",
  "k_c (distribution)": "k_c (distribution)",
  "le calcul de service ne converge pas, il n'y a pas de section fissuree a verifier": "the service calculation does not converge, there is no cracked section to check",
  "lits par faces": "layers per face",
  "n, coefficient d'équivalence": "n, modular ratio",
  "coefficient d'équivalence": "modular ratio",
  "coefficient d'equivalence n": "modular ratio n",
  "non (h inférieure à # mm)": "no (h below # mm)",
  "par face": "per face",
  "pratique allemande — branches selon h/d#": "German practice — branches by h/d#",
  "resolveModel: un ferraillage rectangular-layout exige une geometrie rectangle, recu polygon": "resolveModel: a rectangular-layout reinforcement requires a rectangle geometry, received polygon",
  "sans objet — aucune fibre extreme n atteint f_ct,eff en faisant croitre le moment dans son sens actuel: la fissuration n est pas gouvernee par le moment ici": "not applicable — no extreme fibre reaches f_ct,eff when the moment grows in its current direction: cracking is not governed by the moment here",
  "sans objet — dalle: le #.#(#) dispense du minimum d armature d ame les elements ou une redistribution transversale des efforts est possible": "not applicable — slab: #.#(#) exempts from minimum shear reinforcement members where transverse redistribution of loads is possible",
  "sans objet — poteau: les armatures transversales relèvent du #.# (diamètres et espacements), hors du périmètre de ce module": "not applicable — column: transverse reinforcement falls under #.# (diameters and spacings), outside the scope of this module",
  "sans objet — règle non applicable à cet élément": "not applicable — rule not applicable to this element",
  "sans objet": "not applicable",
  "utilizationRatio: (My, Mz) nul, la direction de flexion est indefinie.": "utilizationRatio: (My, Mz) zero, the bending direction is undefined.",
  "À ne pas confondre avec le minimum de RÉSISTANCE du #.#, qui répond à une autre question.": "Not to be confused with the STRENGTH minimum of #.#, which answers another question.",
  "À ne pas confondre avec le sigma_s des # et #, qui sort de la méthode n sous combinaison de SERVICE, avec f_ck et f_yk: deux nombres differents pour deux questions différentes.": "Not to be confused with the sigma_s of # and #, which comes from the n method under a SERVICE combination, with f_ck and f_yk: two different numbers for two different questions.",
  "ÉCART DOCUMENTÉ AU TEXTE en méthode « pratique allemande »: les branches de h_c,ef selon h/d# ne figurent pas dans l'EN ###, dont le #.#(#) écrit h_c,ef = min(#(h−d); (h−x)/#; h/#).": "DOCUMENTED DEVIATION FROM THE TEXT in the « German practice » method: the branches of h_c,ef by h/d# do not appear in EN ###, whose #.#(#) writes h_c,ef = min(#(h−d); (h−x)/#; h/#).",
  "Élément massif": "Massive member",
  "Éléments massifs, méthode Meyer (DIN #)": "Massive members, Meyer method (DIN #)",
  "Éléments massifs": "Massive members",
  "Équilibre de la section": "Equilibrium of the section",
  "État IMPOSE par l'utilisateur.": "State IMPOSED by the user.",
  "État de fissuration (#(#))": "Cracking state (#(#))",
  "État de fissuration": "Cracking state",
  "État retenu": "State used",
  "État sous quasi-permanente (#)": "State under quasi-permanent (#)",
  "État sous sollicitation (ELU)": "State under action (ULS)",
  "État sous sollicitation": "State under action",
  "État": "State",
  "état I — section NON fissurée, le béton tendu travaille": "state I — UNCRACKED section, the concrete in tension works",
  "état II — section FISSURÉE, le béton tendu est neglige": "state II — CRACKED section, the concrete in tension is neglected",
  "état fissuré incalculable": "cracked state cannot be calculated",
  "méthode Meyer (DIN #)": "Meyer method (DIN #)",
  "méthode Meyer": "Meyer method",
  "Méthode Meyer": "Meyer method",
  "A_c,ef impose": "A_c,ef imposed",
  "A_ct impose": "A_ct imposed",
  "d# impose": "d# imposed",
  "f_ct,eff impose": "f_ct,eff imposed",
  "h_c,ef impose": "h_c,ef imposed",
  "k impose": "k imposed",
  "k_c impose": "k_c imposed",
  "sigma_s impose": "sigma_s imposed",
  "Meyer: diamètre des barres ds": "Meyer: bar diameter ds",
  "Meyer: enrobage à l'axe d#": "Meyer: cover to axis d#",
  "Meyer: facteur d âge k_zt": "Meyer: age factor k_zt",
  "Meyer: ouverture visee w_k": "Meyer: target crack width w_k",
  "Meyer: épaisseur h": "Meyer: thickness h",
  "cot theta": "cot theta",
  "diamètre étrier": "link diameter",
  "durée de chargement beta": "load duration beta",
  "enrobage": "cover",
  "f_ct,eff de fissuration": "f_ct,eff for cracking",
  "hauteur": "height",
  "largeur": "width",
  "ouverture limite w_max": "limit crack width w_max",
  "sigma_s de la déformation gênée": "sigma_s of the restrained deformation",
  "Calculation note — Poteau P#": "Calculation note — Column P#",
  "<em>cot θ</em> est un <strong>arbitrage</strong>, pas une constante: 2.5 minimise les cadres et sollicite le plus les bielles, 1 fait l'inverse.": "<em>cot θ</em> is a <strong>trade-off</strong>, not a constant: 2.5 minimises the links and loads the struts most, 1 does the opposite.",
  "&lt;em&gt;cot θ&lt;/em&gt; est un &lt;strong&gt;arbitrage&lt;/strong&gt;, pas une constante: 2.5 minimise les cadres et sollicite le plus les bielles, 1 fait l'inverse.": "&lt;em&gt;cot θ&lt;/em&gt; is a &lt;strong&gt;trade-off&lt;/strong&gt;, not a constant: 2.5 minimises the links and loads the struts most, 1 does the opposite.",
  "<em>k</em> est un <strong>paramètre national</strong>: 1 &rarr; 0.65 en valeurs recommandées de l EC2, 0.8 &rarr; 0.5 en Annex allemande. En Belgique et au Luxembourg, la norme applicable reste l'EN 1992-1-1 et ses annexes NBN / ILNAS.": "<em>k</em> is a <strong>nationally determined parameter</strong>: 1 &rarr; 0.65 with the EC2 recommended values, 0.8 &rarr; 0.5 in the German Annex. In Belgium and Luxembourg, the applicable standard remains EN 1992-1-1 and its NBN / ILNAS annexes.",
  "&lt;em&gt;k&lt;/em&gt; est un &lt;strong&gt;paramètre national&lt;/strong&gt;: 1 &rarr; 0.65 en valeurs recommandées de l EC2, 0.8 &rarr; 0.5 en Annex allemande. En Belgique et au Luxembourg, la norme applicable reste l'EN 1992-1-1 et ses annexes NBN / ILNAS.": "&lt;em&gt;k&lt;/em&gt; is a &lt;strong&gt;nationally determined parameter&lt;/strong&gt;: 1 &rarr; 0.65 with the EC2 recommended values, 0.8 &rarr; 0.5 in the German Annex. In Belgium and Luxembourg, the applicable standard remains EN 1992-1-1 and its NBN / ILNAS annexes.",
  "<em>k<sub>zt</sub></em> est le paramètre <strong>décisif</strong> de la méthode. Le Zwang des pieces massives nait de la chaleur d <strong>hydratation</strong> et fissure a quelques jours, quand le béton est loin de son f<sub>ctm</sub> a 28 jours: <em>k<sub>zt</sub></em> = 1.0 correspond a 28 jours, donne l'armature la plus forte, et <strong>n'est pas le cas courant</strong>. Valeurs usuelles: 0.4 / 0.5 / 0.6.": "<em>k<sub>zt</sub></em> is the <strong>decisive</strong> parameter of the method. Restraint (Zwang) in massive members comes from the heat of <strong>hydration</strong> and cracks after a few days, when the concrete is far from its 28-day f<sub>ctm</sub>: <em>k<sub>zt</sub></em> = 1.0 corresponds to 28 days, gives the most reinforcement, and <strong>is not the usual case</strong>. Usual values: 0.4 / 0.5 / 0.6.",
  "&lt;em&gt;k&lt;sub&gt;zt&lt;/sub&gt;&lt;/em&gt; est le paramètre &lt;strong&gt;décisif&lt;/strong&gt; de la méthode. Le Zwang des pieces massives nait de la chaleur d &lt;strong&gt;hydratation&lt;/strong&gt; et fissure a quelques jours, quand le béton est loin de son f&lt;sub&gt;ctm&lt;/sub&gt; a 28 jours: &lt;em&gt;k&lt;sub&gt;zt&lt;/sub&gt;&lt;/em&gt; = 1.0 correspond a 28 jours, donne l'armature la plus forte, et &lt;strong&gt;n'est pas le cas courant&lt;/strong&gt;. Valeurs usuelles: 0.4 / 0.5 / 0.6.": "&lt;em&gt;k&lt;sub&gt;zt&lt;/sub&gt;&lt;/em&gt; is the &lt;strong&gt;decisive&lt;/strong&gt; parameter of the method. Restraint (Zwang) in massive members comes from the heat of &lt;strong&gt;hydration&lt;/strong&gt; and cracks after a few days, when the concrete is far from its 28-day f&lt;sub&gt;ctm&lt;/sub&gt;: &lt;em&gt;k&lt;sub&gt;zt&lt;/sub&gt;&lt;/em&gt; = 1.0 corresponds to 28 days, gives the most reinforcement, and &lt;strong&gt;is not the usual case&lt;/strong&gt;. Usual values: 0.4 / 0.5 / 0.6.",
  "<em>n</em> = 15 est conventionnel et n'est <strong>pas prescrit sous cette forme</strong> par l'EN 1992-1-1.": "<em>n</em> = 15 is conventional and is <strong>not prescribed in this form</strong> by EN 1992-1-1.",
  "&lt;em&gt;n&lt;/em&gt; = 15 est conventionnel et n'est &lt;strong&gt;pas prescrit sous cette forme&lt;/strong&gt; par l'EN 1992-1-1.": "&lt;em&gt;n&lt;/em&gt; = 15 is conventional and is &lt;strong&gt;not prescribed in this form&lt;/strong&gt; by EN 1992-1-1.",
  "<strong>0.5</strong> en charge de longue durée ou répétée, <strong>1</strong> en charge courte.": "<strong>0.5</strong> for long-term or repeated loading, <strong>1</strong> for short-term loading.",
  "&lt;strong&gt;0.5&lt;/strong&gt; en charge de longue durée ou répétée, &lt;strong&gt;1&lt;/strong&gt; en charge courte.": "&lt;strong&gt;0.5&lt;/strong&gt; for long-term or repeated loading, &lt;strong&gt;1&lt;/strong&gt; for short-term loading.",
  "A<sub>c,ef</sub> impose, une face (mm²)": "A<sub>c,ef</sub> imposed, one face (mm²)",
  "A&lt;sub&gt;c,ef&lt;/sub&gt; impose, une face (mm²)": "A&lt;sub&gt;c,ef&lt;/sub&gt; imposed, one face (mm²)",
  "Ajouter un lit libre (par d)": "Add a free layer (by d)",
  "Ajouter un lit": "Add a layer",
  "Armature minimale sous déformation gênée (Zwang)": "Minimum reinforcement under restrained deformation (Zwang)",
  "Armatures d'âme (vides = aucun cadre déclaré)": "Shear reinforcement (empty = no links declared)",
  "Automatique: critère du 7.1(2)": "Automatic: criterion of 7.1(2)",
  "Barres libres": "Free bars",
  "Centree (retrait ou refroidissement empeches)": "Central (restrained shrinkage or cooling)",
  "Ces trois-la sont des <strong>choix</strong>, pas des constantes normatives. Les autres coefficients (k1, k2, k3, kt…) restent a leurs valeurs recommandées.": "These three are <strong>choices</strong>, not code constants. The other coefficients (k1, k2, k3, kt…) stay at their recommended values.",
  "Ces trois-la sont des &lt;strong&gt;choix&lt;/strong&gt;, pas des constantes normatives. Les autres coefficients (k1, k2, k3, kt…) restent a leurs valeurs recommandées.": "These three are &lt;strong&gt;choices&lt;/strong&gt;, not code constants. The other coefficients (k1, k2, k3, kt…) stay at their recommended values.",
  "Charger un modèle": "Load a model",
  "Chemin de chargement: <strong>N constant</strong>, recalcule en continu. Le mode proportionnel et le trace du domaine My-Mz ne partent que sur demande — ils coutent de quelques dixiemes de seconde a quelques secondes.": "Loading path: <strong>constant N</strong>, recalculated continuously. The proportional mode and the plot of the My-Mz domain only run on request — they take from a few tenths of a second to a few seconds.",
  "Chemin de chargement: &lt;strong&gt;N constant&lt;/strong&gt;, recalcule en continu. Le mode proportionnel et le trace du domaine My-Mz ne partent que sur demande — ils coutent de quelques dixiemes de seconde a quelques secondes.": "Loading path: &lt;strong&gt;constant N&lt;/strong&gt;, recalculated continuously. The proportional mode and the plot of the My-Mz domain only run on request — they take from a few tenths of a second to a few seconds.",
  "Combinaisons EN 1990 <strong>différentes de l'ELU</strong> et différentes entre elles: reprendre le moment de l'ELU serait faux d'un facteur 1.35 a 1.5. Flexion droite uniquement — un seul moment M par combinaison. Laisser les deux champs d'une combinaison vides la desactive.<br /><br /> La combinaison <strong>caractéristique</strong> gouverne la limitation des contraintes (7.2); la <strong>quasi-permanente</strong> gouverne l'ouverture de fissures (7.3) et la courbure (7.4.3).": "EN 1990 combinations <strong>different from the ULS</strong> and from each other: reusing the ULS moment would be wrong by a factor of 1.35 to 1.5. Uniaxial bending only — a single moment M per combination. Leaving both fields of a combination empty disables it.<br /><br /> The <strong>characteristic</strong> combination governs stress limitation (7.2); the <strong>quasi-permanent</strong> one governs crack width (7.3) and curvature (7.4.3).",
  "Combinaisons EN 1990 &lt;strong&gt;différentes de l'ELU&lt;/strong&gt; et différentes entre elles: reprendre le moment de l'ELU serait faux d'un facteur 1.35 a 1.5. Flexion droite uniquement — un seul moment M par combinaison. Laisser les deux champs d'une combinaison vides la desactive.&lt;br /&gt;&lt;br /&gt; La combinaison &lt;strong&gt;caractéristique&lt;/strong&gt; gouverne la limitation des contraintes (7.2); la &lt;strong&gt;quasi-permanente&lt;/strong&gt; gouverne l'ouverture de fissures (7.3) et la courbure (7.4.3).": "EN 1990 combinations &lt;strong&gt;different from the ULS&lt;/strong&gt; and from each other: reusing the ULS moment would be wrong by a factor of 1.35 to 1.5. Uniaxial bending only — a single moment M per combination. Leaving both fields of a combination empty disables it.&lt;br /&gt;&lt;br /&gt; The &lt;strong&gt;characteristic&lt;/strong&gt; combination governs stress limitation (7.2); the &lt;strong&gt;quasi-permanent&lt;/strong&gt; one governs crack width (7.3) and curvature (7.4.3).",
  "Comparatif: les deux cote a cote": "Comparison: both side by side",
  "Dalle": "Slab",
  "De flexion (gradient thermique au jeune âge)": "Bending (thermal gradient at early age)",
  "Definir par espacement maximal": "Define by maximum spacing",
  "Depend de la <strong>classe d'exposition</strong> — Table 7.1N: 0.4 / 0.3 / 0.2 mm.": "Depends on the <strong>exposure class</strong> — Table 7.1N: 0.4 / 0.3 / 0.2 mm.",
  "Depend de la &lt;strong&gt;classe d'exposition&lt;/strong&gt; — Table 7.1N: 0.4 / 0.3 / 0.2 mm.": "Depends on the &lt;strong&gt;exposure class&lt;/strong&gt; — Table 7.1N: 0.4 / 0.3 / 0.2 mm.",
  "Deux familles de formules. Le <strong>texte</strong> de l'EN 1992-1-1 7.3.2(3) donne <em>2.5·d1</em>; la <strong>pratique allemande</strong> donne des branches selon <em>h/d1</em>, qui croissent avec l'épaisseur. Sur un radier de 1.30 m, l'écart entre les deux vaut environ 43 % d'armature.<br /><br /> Ce choix est <strong>independant</strong> de la convention de <em>k</em> ci-dessous: <em>k</em> est un paramètre d'Annex nationale, <em>h<sub>c,ef</sub></em> est un choix de méthode. « Branches allemandes, <em>k</em> de l'Annex belge » est un cas parfaitement legitime.": "Two families of formulas. The <strong>text</strong> of EN 1992-1-1 7.3.2(3) gives <em>2.5·d1</em>; <strong>German practice</strong> gives branches by <em>h/d1</em>, which grow with the thickness. On a 1.30 m raft, the difference between the two is about 43 % of reinforcement.<br /><br /> This choice is <strong>independent</strong> of the convention for <em>k</em> below: <em>k</em> is a National Annex parameter, <em>h<sub>c,ef</sub></em> is a choice of method. « German branches, <em>k</em> from the Belgian Annex » is a perfectly legitimate case.",
  "Deux familles de formules. Le &lt;strong&gt;texte&lt;/strong&gt; de l'EN 1992-1-1 7.3.2(3) donne &lt;em&gt;2.5·d1&lt;/em&gt;; la &lt;strong&gt;pratique allemande&lt;/strong&gt; donne des branches selon &lt;em&gt;h/d1&lt;/em&gt;, qui croissent avec l'épaisseur. Sur un radier de 1.30 m, l'écart entre les deux vaut environ 43 % d'armature.&lt;br /&gt;&lt;br /&gt; Ce choix est &lt;strong&gt;independant&lt;/strong&gt; de la convention de &lt;em&gt;k&lt;/em&gt; ci-dessous: &lt;em&gt;k&lt;/em&gt; est un paramètre d'Annex nationale, &lt;em&gt;h&lt;sub&gt;c,ef&lt;/sub&gt;&lt;/em&gt; est un choix de méthode. « Branches allemandes, &lt;em&gt;k&lt;/em&gt; de l'Annex belge » est un cas parfaitement legitime.": "Two families of formulas. The &lt;strong&gt;text&lt;/strong&gt; of EN 1992-1-1 7.3.2(3) gives &lt;em&gt;2.5·d1&lt;/em&gt;; &lt;strong&gt;German practice&lt;/strong&gt; gives branches by &lt;em&gt;h/d1&lt;/em&gt;, which grow with the thickness. On a 1.30 m raft, the difference between the two is about 43 % of reinforcement.&lt;br /&gt;&lt;br /&gt; This choice is &lt;strong&gt;independent&lt;/strong&gt; of the convention for &lt;em&gt;k&lt;/em&gt; below: &lt;em&gt;k&lt;/em&gt; is a National Annex parameter, &lt;em&gt;h&lt;sub&gt;c,ef&lt;/sub&gt;&lt;/em&gt; is a choice of method. « German branches, &lt;em&gt;k&lt;/em&gt; from the Belgian Annex » is a perfectly legitimate case.",
  "Deux méthodes répondent à cette question et ne se remplacent pas: le <strong>7.3.2</strong> de l'EN 1992-1-1 et la méthode <strong>Meyer / DIN 1045</strong>. Le comparatif montre laquelle surarme; la note de calcul <strong>nomme</strong> celle qui a servi, parce qu'en Belgique et au Luxembourg la norme applicable reste l'EN 1992-1-1.": "Two methods answer this question and do not replace each other: <strong>7.3.2</strong> of EN 1992-1-1 and the <strong>Meyer / DIN 1045</strong> method. The comparison shows which one over-reinforces; the calculation note <strong>names</strong> the one used, because in Belgium and Luxembourg the applicable standard remains EN 1992-1-1.",
  "Deux méthodes répondent à cette question et ne se remplacent pas: le &lt;strong&gt;7.3.2&lt;/strong&gt; de l'EN 1992-1-1 et la méthode &lt;strong&gt;Meyer / DIN 1045&lt;/strong&gt;. Le comparatif montre laquelle surarme; la note de calcul &lt;strong&gt;nomme&lt;/strong&gt; celle qui a servi, parce qu'en Belgique et au Luxembourg la norme applicable reste l'EN 1992-1-1.": "Two methods answer this question and do not replace each other: &lt;strong&gt;7.3.2&lt;/strong&gt; of EN 1992-1-1 and the &lt;strong&gt;Meyer / DIN 1045&lt;/strong&gt; method. The comparison shows which one over-reinforces; the calculation note &lt;strong&gt;names&lt;/strong&gt; the one used, because in Belgium and Luxembourg the applicable standard remains EN 1992-1-1.",
  "Diamètre étrier (mm, vide = 0)": "Link diameter (mm, empty = 0)",
  "Diamètre (mm)": "Diameter (mm)",
  "Dispositions constructives 9 (dont A<sub>s,min</sub> de non-fragilite)": "Detailing 9 (including A<sub>s,min</sub> against brittle failure)",
  "Dispositions constructives 9 (dont A&lt;sub&gt;s,min&lt;/sub&gt; de non-fragilite)": "Detailing 9 (including A&lt;sub&gt;s,min&lt;/sub&gt; against brittle failure)",
  "Effort tranchant et dispositions (6.2, 9)": "Shear and detailing (6.2, 9)",
  "Enrobage (mm)": "Cover (mm)",
  "Espacement des cours s (mm)": "Spacing of link sets s (mm)",
  "Extérieur: appuis, radier durci, reprise de betonnage": "External: supports, hardened raft, construction joint",
  "Flexion: gene de flexion, une seule face tendue": "Bending: bending restraint, one face in tension",
  "Forcer des valeurs intermediaires": "Impose intermediate values",
  "Forcer l'état I: béton tendu actif": "Impose state I: concrete in tension active",
  "Forcer l'état II: béton tendu neglige": "Impose state II: concrete in tension neglected",
  "Hauteur utile d": "Effective depth d",
  "Hauteur (mm)": "Height (mm)",
  "Interpolation du facteur k": "Interpolation of the factor k",
  "Intérieur: contraintes propres, gradient de peau": "Internal: self-equilibrating stresses, skin gradient",
  "L espacement se mesure entre les <strong>axes des barres extremes</strong>, sur <em>b &minus; 2a</em> et non sur la largeur brute: l'écart, c'est l'enrobage. Le nombre en gras est le plus petit qui respecte le maximum demande, et c'est celui qui est pose. Les autres sont la parce que sur une <strong>poutre</strong> il n'existe pas de demi-barre, et qu'un depassement de deux millimetres se refuse ou s'assume — pas en silence.": "The spacing is measured between the <strong>axes of the outer bars</strong>, over <em>b &minus; 2a</em> and not over the gross width: the difference is the cover. The number in bold is the smallest that meets the requested maximum, and it is the one placed. The others are there because on a <strong>beam</strong> there is no half bar, and exceeding by two millimetres is either refused or accepted — not silently.",
  "L espacement se mesure entre les &lt;strong&gt;axes des barres extremes&lt;/strong&gt;, sur &lt;em&gt;b &minus; 2a&lt;/em&gt; et non sur la largeur brute: l'écart, c'est l'enrobage. Le nombre en gras est le plus petit qui respecte le maximum demande, et c'est celui qui est pose. Les autres sont la parce que sur une &lt;strong&gt;poutre&lt;/strong&gt; il n'existe pas de demi-barre, et qu'un depassement de deux millimetres se refuse ou s'assume — pas en silence.": "The spacing is measured between the &lt;strong&gt;axes of the outer bars&lt;/strong&gt;, over &lt;em&gt;b &minus; 2a&lt;/em&gt; and not over the gross width: the difference is the cover. The number in bold is the smallest that meets the requested maximum, and it is the one placed. The others are there because on a &lt;strong&gt;beam&lt;/strong&gt; there is no half bar, and exceeding by two millimetres is either refused or accepted — not silently.",
  "La <strong>flexion composee à l'ELU</strong> est toujours calculée: c'est l'objet de l'outil. Tout le reste se coche. Une vérification décochée disparait de la saisie, du résultat, du CSV <strong>et de la note de calcul</strong> — elle n'est pas seulement cachee, elle n'est pas faite.": "<strong>Combined bending at ULS</strong> is always calculated: it is the purpose of the tool. Everything else is ticked. An unticked verification disappears from the input, the result, the CSV <strong>and the calculation note</strong> — it is not merely hidden, it is not done.",
  "La &lt;strong&gt;flexion composee à l'ELU&lt;/strong&gt; est toujours calculée: c'est l'objet de l'outil. Tout le reste se coche. Une vérification décochée disparait de la saisie, du résultat, du CSV &lt;strong&gt;et de la note de calcul&lt;/strong&gt; — elle n'est pas seulement cachee, elle n'est pas faite.": "&lt;strong&gt;Combined bending at ULS&lt;/strong&gt; is always calculated: it is the purpose of the tool. Everything else is ticked. An unticked verification disappears from the input, the result, the CSV &lt;strong&gt;and the calculation note&lt;/strong&gt; — it is not merely hidden, it is not done.",
  "Largeur (mm)": "Width (mm)",
  "Le <strong>7.1(2)</strong> tranche: la section est non fissurée tant que la traction du béton reste sous <em>f<sub>ct,eff</sub></em>. En <strong>état I</strong> le béton tendu travaille et soulage les armatures; en <strong>état II</strong> il est integralement neglige et toute la traction passe dans l'acier. Forcer un état sert à l'EXAMINER — ce n'est alors plus le choix de la norme, et la note le dira.": "<strong>7.1(2)</strong> decides: the section is uncracked as long as the concrete tension stays below <em>f<sub>ct,eff</sub></em>. In <strong>state I</strong> the concrete in tension works and relieves the reinforcement; in <strong>state II</strong> it is entirely neglected and all the tension goes into the steel. Imposing a state is for EXAMINING it — it is then no longer the code's choice, and the note will say so.",
  "Le &lt;strong&gt;7.1(2)&lt;/strong&gt; tranche: la section est non fissurée tant que la traction du béton reste sous &lt;em&gt;f&lt;sub&gt;ct,eff&lt;/sub&gt;&lt;/em&gt;. En &lt;strong&gt;état I&lt;/strong&gt; le béton tendu travaille et soulage les armatures; en &lt;strong&gt;état II&lt;/strong&gt; il est integralement neglige et toute la traction passe dans l'acier. Forcer un état sert à l'EXAMINER — ce n'est alors plus le choix de la norme, et la note le dira.": "&lt;strong&gt;7.1(2)&lt;/strong&gt; decides: the section is uncracked as long as the concrete tension stays below &lt;em&gt;f&lt;sub&gt;ct,eff&lt;/sub&gt;&lt;/em&gt;. In &lt;strong&gt;state I&lt;/strong&gt; the concrete in tension works and relieves the reinforcement; in &lt;strong&gt;state II&lt;/strong&gt; it is entirely neglected and all the tension goes into the steel. Imposing a state is for EXAMINING it — it is then no longer the code's choice, and the note will say so.",
  "Le défaut est le cas <strong>defavorable</strong>: la fissuration des pieces massives survient a quelques jours, quand le béton n'a pas atteint sa résistance a 28 jours.": "The default is the <strong>unfavourable</strong> case: cracking of massive members occurs after a few days, when the concrete has not reached its 28-day strength.",
  "Le défaut est le cas &lt;strong&gt;defavorable&lt;/strong&gt;: la fissuration des pieces massives survient a quelques jours, quand le béton n'a pas atteint sa résistance a 28 jours.": "The default is the &lt;strong&gt;unfavourable&lt;/strong&gt; case: cracking of massive members occurs after a few days, when the concrete has not reached its 28-day strength.",
  "Le type d'élément est <strong>déclaré</strong>, jamais devine: un 300&times;500 est une poutre ou un poteau selon son role, et les règles du 9 different.": "The element type is <strong>declared</strong>, never guessed: a 300&times;500 is a beam or a column depending on its role, and the rules of 9 differ.",
  "Le type d'élément est &lt;strong&gt;déclaré&lt;/strong&gt;, jamais devine: un 300&times;500 est une poutre ou un poteau selon son role, et les règles du 9 different.": "The element type is &lt;strong&gt;declared&lt;/strong&gt;, never guessed: a 300&times;500 is a beam or a column depending on its role, and the rules of 9 differ.",
  "Les sorties decrivent le dernier calcul <strong>réussi</strong>. La note s'ouvre dans un nouvel onglet, d'où le navigateur l'imprime en PDF; si l'ouverture est bloquee, elle est telechargee. C'est un <strong>compte rendu</strong> de calcul, pas une justification réglementaire signee.": "The outputs describe the last <strong>successful</strong> calculation. The note opens in a new tab, from which the browser prints it to PDF; if opening is blocked, it is downloaded. It is a calculation <strong>report</strong>, not a signed regulatory justification.",
  "Les sorties decrivent le dernier calcul &lt;strong&gt;réussi&lt;/strong&gt;. La note s'ouvre dans un nouvel onglet, d'où le navigateur l'imprime en PDF; si l'ouverture est bloquee, elle est telechargee. C'est un &lt;strong&gt;compte rendu&lt;/strong&gt; de calcul, pas une justification réglementaire signee.": "The outputs describe the last &lt;strong&gt;successful&lt;/strong&gt; calculation. The note opens in a new tab, from which the browser prints it to PDF; if opening is blocked, it is downloaded. It is a calculation &lt;strong&gt;report&lt;/strong&gt;, not a signed regulatory justification.",
  "Linéaire (0.8 à 0.5 entre 300 et 800 mm)": "Linear (0.8 to 0.5 between 300 and 800 mm)",
  "Lit #": "Layer #",
  "Lits par faces": "Layers per face",
  "Lits sur segments": "Layers on segments",
  "M caractéristique (kN·m)": "Characteristic M (kN·m)",
  "N caractéristique (kN)": "Characteristic N (kN)",
  "Modèle": "Model",
  "Méthode <strong>allemande</strong>, distincte du 7.3.2 ci-dessus et qui ne le remplace pas: elle sert au <strong>pre-dimensionnement</strong> et au contrôle d'ordre de grandeur, la norme applicable restant l'EN 1992-1-1 et ses annexes nationales. Elle ne lit ni la géométrie ni le ferraillage — ses paramètres sont les siens, et <em>h</em> comme <em>f<sub>ctm</sub></em> sont seulement <strong>pre-remplis</strong> a partir de la section au chargement.": "<strong>German</strong> method, distinct from 7.3.2 above and not replacing it: it is used for <strong>preliminary design</strong> and order-of-magnitude checks, the applicable standard remaining EN 1992-1-1 and its National Annexes. It reads neither the geometry nor the reinforcement — its parameters are its own, and <em>h</em> like <em>f<sub>ctm</sub></em> are only <strong>pre-filled</strong> from the section on loading.",
  "Méthode &lt;strong&gt;allemande&lt;/strong&gt;, distincte du 7.3.2 ci-dessus et qui ne le remplace pas: elle sert au &lt;strong&gt;pre-dimensionnement&lt;/strong&gt; et au contrôle d'ordre de grandeur, la norme applicable restant l'EN 1992-1-1 et ses annexes nationales. Elle ne lit ni la géométrie ni le ferraillage — ses paramètres sont les siens, et &lt;em&gt;h&lt;/em&gt; comme &lt;em&gt;f&lt;sub&gt;ctm&lt;/sub&gt;&lt;/em&gt; sont seulement &lt;strong&gt;pre-remplis&lt;/strong&gt; a partir de la section au chargement.": "&lt;strong&gt;German&lt;/strong&gt; method, distinct from 7.3.2 above and not replacing it: it is used for &lt;strong&gt;preliminary design&lt;/strong&gt; and order-of-magnitude checks, the applicable standard remaining EN 1992-1-1 and its National Annexes. It reads neither the geometry nor the reinforcement — its parameters are its own, and &lt;em&gt;h&lt;/em&gt; like &lt;em&gt;f&lt;sub&gt;ctm&lt;/sub&gt;&lt;/em&gt; are only &lt;strong&gt;pre-filled&lt;/strong&gt; from the section on loading.",
  "Méthode de calcul de h<sub>c,ef</sub>": "Calculation method for h<sub>c,ef</sub>",
  "Méthode de calcul de h&lt;sub&gt;c,ef&lt;/sub&gt;": "Calculation method for h&lt;sub&gt;c,ef&lt;/sub&gt;",
  "Méthode": "Method",
  "Nature de la gene": "Nature of the restraint",
  "Note de calcul (HTML imprimable)": "Calculation note (printable HTML)",
  "Optimisation de la disposition": "Layout optimisation",
  "Origine du bridage": "Origin of the restraint",
  "Parabolique (proposition de Meyer)": "Parabolic (Meyer's proposal)",
  "Pratique allemande — branches selon h/d1": "German practice — branches by h/d1",
  "Référentiel retenu": "Reference used",
  "Résultats (CSV)": "Results (CSV)",
  "Sections <strong>rectangulaires</strong> seulement; ni précontrainte, ni torsion, ni bielles inclinees, ni vérification au droit de l'appui. Les valeurs du 9 sont celles <strong>recommandées</strong> par l'EN 1992-1-1: une Annex nationale peut les modifier.": "<strong>Rectangular</strong> sections only; no prestressing, no torsion, no inclined struts, no check at the support. The values of 9 are those <strong>recommended</strong> by EN 1992-1-1: a National Annex may modify them.",
  "Sections &lt;strong&gt;rectangulaires&lt;/strong&gt; seulement; ni précontrainte, ni torsion, ni bielles inclinees, ni vérification au droit de l'appui. Les valeurs du 9 sont celles &lt;strong&gt;recommandées&lt;/strong&gt; par l'EN 1992-1-1: une Annex nationale peut les modifier.": "&lt;strong&gt;Rectangular&lt;/strong&gt; sections only; no prestressing, no torsion, no inclined struts, no check at the support. The values of 9 are those &lt;strong&gt;recommended&lt;/strong&gt; by EN 1992-1-1: a National Annex may modify them.",
  "Seule la famille <strong>traction / bridage extérieur</strong> a ete confrontee au diagramme de l'ouvrage (a environ 3 % pres). La flexion et le bridage intérieur sont dérivés de la même formulation et n'ont ete confrontes a rien.": "Only the <strong>tension / external restraint</strong> family has been compared with the diagram of the reference work (to within about 3 %). Bending and internal restraint are derived from the same formulation and have not been compared with anything.",
  "Seule la famille &lt;strong&gt;traction / bridage extérieur&lt;/strong&gt; a ete confrontee au diagramme de l'ouvrage (a environ 3 % pres). La flexion et le bridage intérieur sont dérivés de la même formulation et n'ont ete confrontes a rien.": "Only the &lt;strong&gt;tension / external restraint&lt;/strong&gt; family has been compared with the diagram of the reference work (to within about 3 %). Bending and internal restraint are derived from the same formulation and have not been compared with anything.",
  "Sous un <em>M<sub>Ed</sub></em> inférieur a <em>M<sub>Rd</sub></em>, la section n'est pas à l'ultime et ses armatures ne travaillent pas a <em>f<sub>yd</sub></em>. Ce bloc donne la contrainte <strong>reelle</strong> de chaque barre à la sollicitation appliquee.": "Under an <em>M<sub>Ed</sub></em> below <em>M<sub>Rd</sub></em>, the section is not at ultimate and its reinforcement does not work at <em>f<sub>yd</sub></em>. This block gives the <strong>actual</strong> stress of each bar under the applied action.",
  "Sous un &lt;em&gt;M&lt;sub&gt;Ed&lt;/sub&gt;&lt;/em&gt; inférieur a &lt;em&gt;M&lt;sub&gt;Rd&lt;/sub&gt;&lt;/em&gt;, la section n'est pas à l'ultime et ses armatures ne travaillent pas a &lt;em&gt;f&lt;sub&gt;yd&lt;/sub&gt;&lt;/em&gt;. Ce bloc donne la contrainte &lt;strong&gt;reelle&lt;/strong&gt; de chaque barre à la sollicitation appliquee.": "Under an &lt;em&gt;M&lt;sub&gt;Ed&lt;/sub&gt;&lt;/em&gt; below &lt;em&gt;M&lt;sub&gt;Rd&lt;/sub&gt;&lt;/em&gt;, the section is not at ultimate and its reinforcement does not work at &lt;em&gt;f&lt;sub&gt;yd&lt;/sub&gt;&lt;/em&gt;. This block gives the &lt;strong&gt;actual&lt;/strong&gt; stress of each bar under the applied action.",
  "Supprimer ce lit": "Delete this layer",
  "Tracer le domaine My-Mz (une fraction de seconde)": "Plot the My-Mz domain (a fraction of a second)",
  "Traction: gene centree, deux faces armées": "Tension: central restraint, two reinforced faces",
  "Type d'élément": "Element type",
  "Un champ <strong>vide</strong> veut dire « calcule ». Une valeur saisie <strong>court-circuite sa formule</strong> et alimente la suite de la chaine: imposer <em>d1</em> change <em>h<sub>c,ef</sub></em>, imposer <em>f<sub>ct,eff</sub></em> change ce qui en depend. Toute valeur imposée est <strong>marquee</strong> dans les résultats et dans la note de calcul — une note qui presenterait une valeur forcee comme calculée ne serait verifiable par personne.<br /><br /> Une valeur hors du domaine physique produit un <strong>avertissement</strong>, jamais un ecretage silencieux: ecreter vous retirerait la decision que vous venez de prendre.": "An <strong>empty</strong> field means « calculated ». An entered value <strong>short-circuits its formula</strong> and feeds the rest of the chain: imposing <em>d1</em> changes <em>h<sub>c,ef</sub></em>, imposing <em>f<sub>ct,eff</sub></em> changes what depends on it. Every imposed value is <strong>marked</strong> in the results and in the calculation note — a note presenting a forced value as calculated would be verifiable by nobody.<br /><br /> A value outside the physical range produces a <strong>warning</strong>, never a silent clipping: clipping would take away the decision you have just made.",
  "Un champ &lt;strong&gt;vide&lt;/strong&gt; veut dire « calcule ». Une valeur saisie &lt;strong&gt;court-circuite sa formule&lt;/strong&gt; et alimente la suite de la chaine: imposer &lt;em&gt;d1&lt;/em&gt; change &lt;em&gt;h&lt;sub&gt;c,ef&lt;/sub&gt;&lt;/em&gt;, imposer &lt;em&gt;f&lt;sub&gt;ct,eff&lt;/sub&gt;&lt;/em&gt; change ce qui en depend. Toute valeur imposée est &lt;strong&gt;marquee&lt;/strong&gt; dans les résultats et dans la note de calcul — une note qui presenterait une valeur forcee comme calculée ne serait verifiable par personne.&lt;br /&gt;&lt;br /&gt; Une valeur hors du domaine physique produit un &lt;strong&gt;avertissement&lt;/strong&gt;, jamais un ecretage silencieux: ecreter vous retirerait la decision que vous venez de prendre.": "An &lt;strong&gt;empty&lt;/strong&gt; field means « calculated ». An entered value &lt;strong&gt;short-circuits its formula&lt;/strong&gt; and feeds the rest of the chain: imposing &lt;em&gt;d1&lt;/em&gt; changes &lt;em&gt;h&lt;sub&gt;c,ef&lt;/sub&gt;&lt;/em&gt;, imposing &lt;em&gt;f&lt;sub&gt;ct,eff&lt;/sub&gt;&lt;/em&gt; changes what depends on it. Every imposed value is &lt;strong&gt;marked&lt;/strong&gt; in the results and in the calculation note — a note presenting a forced value as calculated would be verifiable by nobody.&lt;br /&gt;&lt;br /&gt; A value outside the physical range produces a &lt;strong&gt;warning&lt;/strong&gt;, never a silent clipping: clipping would take away the decision you have just made.",
  "Vérifications": "Verifications",
  "d1, enrobage à l'AXE des barres (mm)": "d1, cover to the bar AXIS (mm)",
  "ds, diamètre des barres (mm)": "ds, bar diameter (mm)",
  "f<sub>ct,eff</sub> du critère (MPa, vide = f<sub>ctm</sub> a 28 jours)": "f<sub>ct,eff</sub> of the criterion (MPa, empty = f<sub>ctm</sub> at 28 days)",
  "f&lt;sub&gt;ct,eff&lt;/sub&gt; du critère (MPa, vide = f&lt;sub&gt;ctm&lt;/sub&gt; a 28 jours)": "f&lt;sub&gt;ct,eff&lt;/sub&gt; of the criterion (MPa, empty = f&lt;sub&gt;ctm&lt;/sub&gt; at 28 days)",
  "f<sub>ywk</sub> des cadres (MPa)": "f<sub>ywk</sub> of the links (MPa)",
  "f&lt;sub&gt;ywk&lt;/sub&gt; des cadres (MPa)": "f&lt;sub&gt;ywk&lt;/sub&gt; of the links (MPa)",
  "h, épaisseur de l'élément (mm)": "h, element thickness (mm)",
  "libre, à la profondeur d": "free, at depth d",
  "lit bottom: espacement maximal": "layer bottom: maximum spacing",
  "lit top: espacement maximal": "layer top: maximum spacing",
  "lit left: espacement maximal": "layer left: maximum spacing",
  "lit right: espacement maximal": "layer right: maximum spacing",
  "vide = nom du modèle": "empty = model name",
  "Élément": "Element",
  "Projet": "Project",
  "État sous sollicitation, contrainte des aciers": "State under action, steel stresses",
  "β, durée de chargement": "β, load duration",
  "⚠ À ne pas confondre avec le <em>f<sub>ct,eff</sub></em> du 7.3.2 plus bas, qui porte le même nom et joue le role <strong>inverse</strong>: ici une valeur elevee <strong>retarde</strong> la fissuration, la-bas elle <strong>augmente</strong> l'armature exigée.": "⚠ Not to be confused with the <em>f<sub>ct,eff</sub></em> of 7.3.2 below, which has the same name and plays the <strong>opposite</strong> role: here a high value <strong>delays</strong> cracking, there it <strong>increases</strong> the required reinforcement.",
  "⚠ À ne pas confondre avec le &lt;em&gt;f&lt;sub&gt;ct,eff&lt;/sub&gt;&lt;/em&gt; du 7.3.2 plus bas, qui porte le même nom et joue le role &lt;strong&gt;inverse&lt;/strong&gt;: ici une valeur elevee &lt;strong&gt;retarde&lt;/strong&gt; la fissuration, la-bas elle &lt;strong&gt;augmente&lt;/strong&gt; l'armature exigée.": "⚠ Not to be confused with the &lt;em&gt;f&lt;sub&gt;ct,eff&lt;/sub&gt;&lt;/em&gt; of 7.3.2 below, which has the same name and plays the &lt;strong&gt;opposite&lt;/strong&gt; role: here a high value &lt;strong&gt;delays&lt;/strong&gt; cracking, there it &lt;strong&gt;increases&lt;/strong&gt; the required reinforcement.",
  "zone comprimée": "compression zone",
  "zone tendue": "tension zone",
  "axe neutre": "neutral axis",
  "cercles: resultantes, reliees par le bras de levier": "circles: resultants, joined by the lever arm",
  "origine du repere au centroide, y vers la droite, z vers le bas": "origin of the axes at the centroid, y to the right, z downwards",
  "décisif": "decisive",
  "déclaré": "declared",
  "Poteau": "Column",
  "Poutre": "Beam",
  "(MPa, vide = f<sub>ctm</sub> a 28 jours)": "(MPa, empty = f<sub>ctm</sub> at 28 days)",
  "(MPa, vide = f&lt;sub&gt;ctm&lt;/sub&gt; a 28 jours)": "(MPa, empty = f&lt;sub&gt;ctm&lt;/sub&gt; at 28 days)",
  "(MPa, vide = f<sub>yk</sub>)": "(MPa, empty = f<sub>yk</sub>)",
  "(MPa, vide = f&lt;sub&gt;yk&lt;/sub&gt;)": "(MPa, empty = f&lt;sub&gt;yk&lt;/sub&gt;)",
  "Espacement max (mm)": "Max spacing (mm)",
  "N (kN, positif en compression)": "N (kN, positive in compression)",
  "Calculer en proportionnel (quelques secondes)": "Calculate proportionally (a few seconds)",
  "A<sub>sw</sub>, aire d'un cours (mm²)": "A<sub>sw</sub>, area of one set of links (mm²)",
  "A&lt;sub&gt;sw&lt;/sub&gt;, aire d'un cours (mm²)": "A&lt;sub&gt;sw&lt;/sub&gt;, area of one set of links (mm²)",
  "N quasi-permanent (kN)": "Quasi-permanent N (kN)",
  "M quasi-permanent (kN·m)": "Quasi-permanent M (kN·m)",
  "n, coefficient d'equivalence": "n, modular ratio",
  "f<sub>ct,eff</sub> impose (MPa)": "f<sub>ct,eff</sub> imposed (MPa)",
  "f&lt;sub&gt;ct,eff&lt;/sub&gt; impose (MPa)": "f&lt;sub&gt;ct,eff&lt;/sub&gt; imposed (MPa)",
  "h<sub>c,ef</sub> impose (mm)": "h<sub>c,ef</sub> imposed (mm)",
  "h&lt;sub&gt;c,ef&lt;/sub&gt; impose (mm)": "h&lt;sub&gt;c,ef&lt;/sub&gt; imposed (mm)",
  "k<sub>c</sub> impose": "k<sub>c</sub> imposed",
  "k&lt;sub&gt;c&lt;/sub&gt; impose": "k&lt;sub&gt;c&lt;/sub&gt; imposed",
  "A<sub>ct</sub> impose (mm²)": "A<sub>ct</sub> imposed (mm²)",
  "A&lt;sub&gt;ct&lt;/sub&gt; impose (mm²)": "A&lt;sub&gt;ct&lt;/sub&gt; imposed (mm²)",
  "σ<sub>s</sub> impose (MPa)": "σ<sub>s</sub> imposed (MPa)",
  "σ&lt;sub&gt;s&lt;/sub&gt; impose (MPa)": "σ&lt;sub&gt;s&lt;/sub&gt; imposed (MPa)",
  "d1 impose (mm)": "d1 imposed (mm)",
  "w<sub>k</sub> visee (mm)": "target w<sub>k</sub> (mm)",
  "w&lt;sub&gt;k&lt;/sub&gt; visee (mm)": "target w&lt;sub&gt;k&lt;/sub&gt; (mm)",
  "f<sub>ctm</sub> a 28 jours (MPa)": "f<sub>ctm</sub> at 28 days (MPa)",
  "f&lt;sub&gt;ctm&lt;/sub&gt; a 28 jours (MPa)": "f&lt;sub&gt;ctm&lt;/sub&gt; at 28 days (MPa)",
  "k<sub>c</sub> (distribution)": "k<sub>c</sub> (distribution)",
  "k&lt;sub&gt;c&lt;/sub&gt; (distribution)": "k&lt;sub&gt;c&lt;/sub&gt; (distribution)",
  "Coefficients normatifs": "Code coefficients",
  "Bandes d'integration": "Integration strips",
  "Diagramme N-M (SVG)": "N-M diagram (SVG)",
  "Diagramme d'interaction N-My": "N-My interaction diagram",
  "Moment sollicitant": "Design moment",
  "Marge disponible": "Available margin",
  "Taux d'armature total": "Total reinforcement ratio",
  "Ratio acier tendu": "Tension steel ratio",
  "EI effectif": "Effective EI",
  "Approche retenue": "Approach used",
  "Borne anti-plastification": "Anti-yielding bound",
  "Contraintes en service (7.2)": "Service stresses (7.2)",
  "Courbure en service (7.4.3)": "Service curvature (7.4.3)",
  "Texte EN 1992-1-1": "Text of EN 1992-1-1",
  "Le ferraillage actuel n'est pas exploitable, il ne peut pas être converti en barres:": "The current reinforcement cannot be used, it cannot be converted into bars:",
  "(ELS)": "(SLS)",
  "(ELU)": "(ULS)",
  "Service: contraintes 7.2, fissuration 7.3, courbure 7.4.3": "Service: stresses 7.2, cracking 7.3, curvature 7.4.3",
};

const parLongueur = (a: string, b: string): number => b.length - a.length;
const CLES = Object.keys(MORCEAUX).filter((k) => !k.includes('#')).sort(parLongueur);
const echapperRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Bornes de mot seulement du cote ou la cle commence ou finit par une lettre. */
const LETTRE = /\p{L}/u;
const borne = (k: string): string =>
  `${LETTRE.test(k.charAt(0)) ? '(?<!\\p{L})' : ''}${echapperRegex(k)}${LETTRE.test(k.charAt(k.length - 1)) ? '(?!\\p{L})' : ''}`;
const MOTIF = new RegExp(CLES.map(borne).join('|'), 'gu');
const NOMBRE = '(-?\\d+(?:\\.\\d+)?|Infinity|NaN)';
const AVEC_NOMBRES = Object.keys(MORCEAUX)
  .filter((k) => k.includes('#'))
  .sort(parLongueur)
  .map((k) => [new RegExp(borne(k).replace(/#/g, NOMBRE), 'gu'), MORCEAUX[k]] as const);

/** Les cles a nombres d'abord, puis le glossaire en une passe. */
function morceaux(t: string): string {
  let s = t;
  for (const [motif, en] of AVEC_NOMBRES) {
    s = s.replace(motif, (...g: unknown[]) => {
      let i = 1;
      return en.replace(/#/g, () => String(g[i++]));
    });
  }
  return CLES.length === 0 ? s : s.replace(MOTIF, (m) => MORCEAUX[m] ?? m);
}

/** Une phrase (espaces de bord conserves). */
export function tr(t: string): string {
  if (langueCourante() === 'fr') return t;
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(t);
  if (m === null || m[2] === '') return t;
  // Normalise avant le glossaire : une seule espace (le HTML les fond), renvois
  // sans « § », tableau et annexe en anglais, point decimal, pas d'espace
  // avant « : » et « ; ».
  const coeur = pointDecimal(
    m[2]
      .replace(/\s*\n\s*/g, ' ')
      .replace(/§\s?/g, '')
      .replace(/\b[Tt]ableau\b/g, 'Table')
      .replace(/\b[Aa]nnexe\b/g, 'Annex')
      .replace(/[   ]+([:;])(?=\s|$)/g, '$1'),
  );
  let sortie = EXACTES[coeur] ?? MORCEAUX[coeur];
  if (sortie === undefined) {
    const r = REGLES.find(([motif]) => motif.test(coeur));
    // Apres une regle, le glossaire traite ce qui reste autour.
    sortie = r === undefined ? morceaux(coeur) : morceaux(coeur.replace(r[0], r[1] as string));
  }
  // « M_Rd : ... » coupe par la notation : pas d'espace avant le deux-points.
  return (/^[:;]/.test(sortie) ? '' : m[1]) + sortie + m[3];
}

/**
 * La notation commune, precedee de la traduction : la phrase est traduite
 * ENTIERE, avant que la notation ne la coupe en morceaux autour des indices.
 */
export function notationHtml(texte: string): string {
  return notationHtmlCommun(tr(texte));
}

/**
 * Une suite de texte et de balises EN LIGNE (indices, gras, italique…),
 * entre deux balises de structure : traduite d'un bloc, parce qu'une phrase
 * du formulaire porte souvent un `<strong>` ou un indice en son milieu.
 */
const EN_LIGNE = '(?:sub|sup|strong|em|b|i|code|var|br)\\b';
const SUITE_DE_TEXTE = new RegExp(`(?<=>)(?:[^<]|<\\/?${EN_LIGNE}[^>]*>)+(?=<(?!\\/?${EN_LIGNE}))`, 'g');

/** Fragment HTML ou SVG : noeuds de texte et attributs lisibles, hors <style>. */
export function trHtml(html: string): string {
  if (langueCourante() === 'fr') return html;
  return html
    .split(/(<style[\s\S]*?<\/style>)/)
    .map((morceau, i) =>
      i % 2 === 1
        ? morceau
        : morceau
            .replace(SUITE_DE_TEXTE, (texte: string) => tr(texte))
            .replace(/\s(title|aria-label|placeholder|label|data-info)="([^"]*)"/g, (_m, a: string, v: string) => ` ${a}="${tr(v)}"`)
    )
    .join('');
}

/**
 * Note de calcul (ou toute structure) : chaque chaine passe par `tr`, les SVG
 * des figures par `trHtml`. Traduire AVANT la mise en HTML garde les phrases
 * entieres (la notation les coupe en morceaux de texte).
 */
export function trNote<T>(x: T): T {
  if (langueCourante() === 'fr') return x;
  const parcourir = (v: unknown, cle: string): unknown => {
    if (typeof v === 'string') return cle === 'svg' ? trHtml(v) : tr(v);
    if (Array.isArray(v)) return v.map((e) => parcourir(e, cle));
    if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, e]) => [k, parcourir(e, k)]));
    return v;
  };
  return parcourir(x, '') as T;
}

/** Blocs du CSV. */
export function trBlocs(blocs: BlocService[]): BlocService[] {
  if (langueCourante() === 'fr') return blocs;
  return blocs.map((b) => ({
    ...b,
    titre: tr(b.titre),
    lignes: b.lignes.map((l) => ({ libelle: tr(l.libelle), valeur: tr(l.valeur) })),
    verdict: b.verdict === null ? null : { ...b.verdict, texte: tr(b.verdict.texte) },
    note: b.note === null ? null : tr(b.note),
  }));
}
