# section-uls · Vérification de sections en béton armé (EC2)

Noyau de calcul TypeScript pour la vérification de sections en béton armé à l'état limite ultime selon l'Eurocode 2 (EN 1992-1-1). Calcul entièrement local, sans dépendance d'exécution : le noyau ne touche ni au DOM ni au réseau, et peut être consommé par n'importe quelle interface.

## Application

Une interface web permet de saisir une section, de la voir dessinée avec ses armatures et son axe neutre oblique, d'obtenir le verdict de vérification, et d'enregistrer son travail.

```bash
npm run dev      # serveur de developpement
npm run build    # construit dans docs/, servi par GitHub Pages
npm run preview  # verifie le resultat construit
```

Trois **sorties** quittent la page. Les **dessins** partent en SVG autonomes, styles inlinés — sans quoi ils s'ouvriraient sans couleur ailleurs, les teintes venant de variables CSS définies dans la page. Les **résultats** partent en CSV, point-virgule en séparateur de colonnes (la virgule est déjà le séparateur décimal) et UTF-8 avec BOM, sans quoi un tableur massacre les accents et les `σ`, `ρ`, `ζ` des libellés.

La **note de calcul** est un document HTML autonome, ouvert dans un onglet et imprimable en PDF par le navigateur — avec repli sur un téléchargement si l'ouverture d'onglet est bloquée. Elle porte les données d'entrée, le dessin de la section et les diagrammes, puis chaque vérification **avec ses valeurs intermédiaires** : un `V_Rd,c` sans son `k`, son `ρ_l` et son `σ_cp` n'est pas vérifiable par un tiers, et c'est à cela qu'une note de calcul sert. Une vérification hors domaine y figure **avec son motif**, jamais par une absence : une section qui disparaît sans explication ferait croire qu'elle a été vérifiée.

C'est un **compte rendu**, pas une justification réglementaire signée : elle porte les hypothèses, elle n'engage personne.

L'interface n'invente aucun état : elle édite un modèle, dont tout le reste est dérivé. Ce qui est enregistré est donc exactement ce qui est calculé.

Deux diagrammes d'interaction y sont tracés, et leurs coûts n'ont rien de comparable :

- le **diagramme N–My**, avec le point sollicitant, est recalculé en continu — il ne demande aucune résolution, seulement une intégration par point. Son contour reste **ouvert du côté traction** : seule la branche du pivot béton est parcourue, et refermer dessinerait un domaine qui n'a pas été calculé. En flexion déviée, le point sollicitant sort du plan de ce graphe, qui l'annonce alors explicitement ;
- le **domaine My–Mz** à effort normal constant part **sur bouton seulement** : il enchaîne une résolution par point. On y lit le taux d'exploitation géométriquement, comme le rapport entre le point sollicitant et le rayon du domaine dans sa direction.

### Les vérifications de service dans la page

Le panneau de résultats porte, **après l'ELU et séparément de lui**, les trois vérifications de service : limitation des contraintes (§7.2), ouverture de fissures (§7.3), courbure (§7.4.3). Elles sont calculées **au chargement et à chaque frappe**, sans bouton : 9 à 24 ms chacune, contre 25 à 120 ms pour le recalcul ELU.

Elles se saisissent dans un cadre à part, parce qu'elles portent sur des **combinaisons EN 1990 différentes de l'ELU** et différentes entre elles — caractéristique pour le §7.2, quasi-permanente pour les §7.3 et §7.4.3. Reprendre le moment de l'ELU serait faux d'un facteur 1,35 à 1,5. Chacune des deux combinaisons est indépendamment optionnelle ; laisser ses deux champs vides la désactive, et une combinaison à demi remplie est refusée plutôt que complétée par un zéro.

Trois paramètres sont exposés parce que ce sont des **choix**, pas des constantes normatives :

- **`n`**, coefficient d'équivalence (défaut 15) — valeur conventionnelle de la pratique, intégrant forfaitairement le fluage, **non prescrite sous cette forme** par l'EN 1992-1-1 ;
- **`w_max`** (défaut 0,3 mm) — dépend de la **classe d'exposition** (tableau 7.1N : 0,4 / 0,3 / 0,2 mm), que le module ne connaît pas ;
- **`β`** (défaut 0,5) — durée de chargement : 0,5 en charge de longue durée ou répétée, 1,0 en charge courte.

Les autres coefficients (`k1`, `k2`, `k3`, `kt`…) restent à leurs valeurs recommandées.

**Limites, écrites dans la page autant qu'ici :**

- le service est traité en **flexion droite seule** — la sollicitation saisie est uniaxiale par construction. Un `Mz` non nul à l'ELU donne une **précision** affichée au-dessus des blocs, jamais un refus de calculer : la combinaison quasi-permanente exclut le vent, qui apporte le plus souvent le moment transversal, et une section franchement déviée à l'ELU est très couramment droite en quasi-permanent ;
- l'**ouverture de fissures ne vaut que sur les sections rectangulaires**. Sur toute autre géométrie, son bloc affiche le motif et **les deux autres vérifications restent calculées** — une géométrie circulaire n'efface ni le résultat ELU ni le reste du service ;
- une section **entièrement comprimée** n'a ni zone tendue ni fissure : les §7.2 et §7.3 affichent alors le motif du module plutôt qu'un chiffre issu d'une hypothèse fausse ;
- la **courbure n'est pas une flèche**, et son bloc le rappelle systématiquement. Une flèche exige la portée, les appuis et la répartition des charges, qui sont du niveau élément.

### Effort tranchant, dispositions constructives et déformation gênée

Le panneau porte, **après le service et séparément de lui**, trois familles de plus, chacune concluant **pour elle-même** — aucune ne modifie le verdict de flexion, et une section peut parfaitement résister tout en restant irrégulière au §9 :

- l'**effort tranchant** (§6.2) : `V_Rd,c` sans armature d'âme, puis `V_Rd,s` et `V_Rd,max` dès que des cadres sont déclarés. `cot θ` est une **entrée** bornée à `[1 ; 2,5]`, pas une constante. Les trois modes d'échec se distinguent à l'écran, et cette distinction est tout l'enjeu : « bielles écrasées » veut dire **section trop petite**, pas « il manque des cadres » ;
- les **dispositions constructives** (§9.2, §9.3, §9.5) : `A_s` en place entre `A_s,min` et `A_s,max`, plus le taux d'armature d'âme du §9.2.2(5). Le **type d'élément est déclaré**, jamais deviné — un 300×500 est une poutre ou un poteau selon son rôle. Une dalle est dispensée du minimum d'âme (§6.2.1(4)) et cela n'est **pas** compté comme un échec ;
- l'**armature minimale sous déformation gênée** (§7.3.2), qui gouverne les voiles et radiers massifs. Elle **ne rend aucun verdict** : elle donne une aire exigée, elle ne la compare à rien.

**Ces saisies sont enregistrées** depuis la version 3 du format : l'effort tranchant, les cadres, `cot θ`, le type d'élément, les paramètres de déformation gênée et ceux de la méthode Meyer partent dans le fichier et reviennent tels quels au rechargement. L'avertissement contraire que la page portait jusque-là a disparu avec la raison qui l'avait fait écrire.

C'est **la règle de frontière du format** qui décide de ce qui part dans le fichier : *ce qui décrit l'ouvrage et son chargement se sauvegarde ; ce qui décrit une hypothèse de vérification se re-choisit.* Les cadres et le type d'élément décrivent l'ouvrage — ils s'enregistrent. Le coefficient d'équivalence `n`, l'ouverture admissible `w_max` et le coefficient `β` du service ne disent rien de l'ouvrage, seulement de la manière dont on l'examine ce jour-là : ils **se re-choisissent** à chaque ouverture plutôt que de ressortir des mois plus tard sans que personne se souvienne de les avoir choisis. `cot θ` est le **cas limite, tranché dans l'autre sens et assumé** : c'est un choix d'ingénieur, mais il conditionne le ferraillage retenu et voyage avec lui.

Un champ laissé **vide** laisse son bloc **absent** du fichier, jamais rempli d'un zéro : un `V_Ed = 0` enregistré se relirait comme « l'ingénieur a vérifié le tranchant sous effort nul », qui est une affirmation là où il n'y avait qu'une absence.

**Autres limites, écrites dans la page autant qu'ici :** effort tranchant et déformation gênée sur **sections rectangulaires** seulement — une autre géométrie affiche le motif sans effacer le reste ; ni précontrainte, ni torsion, ni bielles inclinées, ni vérification au droit de l'appui. Les valeurs du §9 sont celles **recommandées** par l'EN 1992-1-1, qu'une annexe nationale peut modifier.

La sortie construite est committée dans `docs/` : **toute modification de l'interface exige de relancer `npm run build` avant de pousser**, sans quoi la page en ligne diverge de la source.

## Capacités actuelles

Flexion composée droite (N + M autour d'un axe), pour :

- **sections rectangulaires** — poutres, voiles ;
- **sections polygonales quelconques** (contour simple, convexe ou non) — sections en T, en L ;
- **sections circulaires** — pieux forés et poteaux circulaires, avec générateur de cage d'armatures répartie.

Le solveur recherche par bissection la profondeur d'axe neutre équilibrant l'effort normal imposé, avec le champ de déformation calé sur le pivot béton (fibre comprimée à `εcu2`), puis en déduit le moment résistant `M_Rd`.

Flexion composée **déviée** (N + My + Mz, axe neutre d'inclinaison quelconque) sur les mêmes géométries, avec restitution de l'axe neutre comme droite oblique traçable dans le repère de la section, du bras de levier interne et des points d'application des résultantes.

**Enregistrement et chargement de modèles** : un cas de calcul complet — géométrie, matériaux, armatures, sollicitation, profil normatif — se sérialise en JSON et se recharge. Le format retient l'intention de saisie (« un pieu Ø600 », « 3 HA20 en face inférieure ») plutôt que ses conséquences, de sorte qu'un fichier rouvert reste modifiable. Le noyau ne gère aucun stockage : il produit et relit le format, l'hôte décide où le ranger.

**Format en version 3, et les trois versions se lisent.** La version 2 a ajouté les **sollicitations de service** (`serviceActions`) ; la version 3 ajoute le **type d'élément** (`elementType`), l'**effort tranchant et ses cadres** (`shear`), la **déformation gênée du §7.3.2** (`restraint`) et la **saisie Meyer** (`meyer`). L'écriture produit toujours la version courante ; la lecture accepte toutes les versions de `SUPPORTED_FORMAT_VERSIONS`, aujourd'hui `[1, 2, 3]`. C'est la seule chose qui empêche une montée de version de rendre illisible un fichier déjà enregistré : le fichier, lui, porte pour toujours la version qui avait cours le jour où il a été écrit. Un modèle de version 1 relu n'a simplement ni sollicitations de service ni aucun des quatre blocs — rien n'est inventé, pas même un défaut — et se réenregistre en version 3. Le témoin `tests/persistence/temoin-pieu.json`, écrit une fois en version 1 et jamais régénéré, est ce qui prouve cette compatibilité ; le régénérer détruirait le seul test qui l'établit.

**La frontière du format : ce qui décrit l'ouvrage se sauvegarde, ce qui décrit une hypothèse de vérification se re-choisit.** La géométrie, les matériaux, les armatures, les sollicitations, le type d'élément, les cadres et les paramètres de gêne décrivent la structure et son chargement : ils entrent dans le fichier. Le coefficient d'équivalence `n`, l'ouverture admissible `w_max` et le coefficient `β` du service n'y entrent pas : ils ne disent rien de l'ouvrage, seulement de la manière dont on l'examine ce jour-là. Les figer dans une donnée d'ouvrage les ferait ressortir des mois plus tard sans que personne se souvienne de les avoir choisis. `cot θ` est le **cas limite, tranché dans l'autre sens et assumé** : c'est un choix d'ingénieur, mais il conditionne le ferraillage retenu et n'a plus de sens séparé de lui.

Les quatre blocs sont **indépendamment optionnels**, et leurs champs facultatifs le sont aussi : un `shear` peut n'avoir qu'un `V_Ed`, un `restraint` que sa nature. Un champ absent n'est **pas écrit** à la sérialisation — ni `null`, que la relecture refuserait, ni une valeur par défaut, qui ferait passer un défaut du moteur pour un choix d'ingénieur et le figerait le jour où ce défaut changerait. `resolveModel` rend ensuite ces blocs dans les types qu'attendent `verifyShear`, `verifyDetailing`, `minimumRestraintArea` et `meyerRestraintReinforcement`, sans conversion à la charge de l'appelant.

**Pourquoi les sollicitations de service sont séparées de celle de l'ELU.** Elles relèvent de **combinaisons EN 1990 différentes** — et différentes entre elles : la combinaison **caractéristique** pour la limitation des contraintes (§7.2), la combinaison **quasi-permanente** pour l'ouverture de fissures (§7.3) et la courbure (§7.4.3). Réutiliser le moment de l'ELU en service serait faux d'un facteur de l'ordre de 1,35 à 1,5. Les deux combinaisons sont indépendamment optionnelles, et **uniaxiales** (`{N, M}`) et non `{N, My, Mz}` : c'est exactement ce que prennent `verifyServiceUniaxial`, `verifyCrackWidth` et `sectionCurvature`, qui ne traitent que la flexion droite. Offrir un `Mz` de service qu'aucun calcul ne consomme serait un champ menteur. `resolveModel` les rend sous la forme `Action` du noyau, prêtes à être passées telles quelles à ces trois fonctions.

**Effort tranchant (§6.2)** : `verifyShear` vérifie une section **rectangulaire** — `b_w` et `d` n'ont pas de définition non ambiguë ailleurs, et l'EC2 ne la donne pas ; une autre géométrie lève une erreur plutôt qu'une approximation. Sans armature d'âme, la résistance est `V_Rd,c` (éq. 6.2.a, avec son plancher 6.2.b) ; dès qu'il y a des cadres, elle vaut `min(V_Rd,s ; V_Rd,max)` — le terme `V_Rd,c` ne s'y **ajoute pas**. `cot θ` est une entrée bornée à `[1 ; 2,5]`, défaut 2,5 : c'est un arbitrage d'ingénieur, 2,5 minimisant les cadres mais sollicitant le plus les bielles. Le résultat **distingue trois échecs** qui n'appellent pas la même correction — armatures nécessaires, cadres insuffisants, bielles écrasées ; ce dernier signifie que la section est trop petite et qu'aucun cadre supplémentaire n'y changera rien.

C'est une vérification d'**ELU** : elle prend un `NormProfile` et travaille sur les valeurs de calcul, à l'inverse exact des vérifications de service. La hauteur utile `d` se mesure jusqu'au **centre de gravité** des armatures tendues, définition de l'EC2 — à ne pas confondre avec la convention d'abaque (barre la plus éloignée) retenue pour le bras de levier de l'interface : les deux diffèrent dès qu'il y a plusieurs lits tendus.

Limites : pas de précontrainte (`α_cw = 1`), cadres droits seulement (`α = 90°`), pas de torsion, pas de vérification au droit de l'appui ni d'effet de charge proche d'appui.

**Dispositions constructives (§9)** : `verifyDetailing` fait passer le verdict de « ça résiste » à « c'est réglementaire ». Armature longitudinale minimale et maximale selon le **type d'élément** — poutre (§9.2.1.1), dalle (§9.3.1.1), poteau (§9.5.2) — et minimum d'armature d'âme (§9.2.2(5)). Le type d'élément est une **saisie, jamais une déduction** : un 300×500 est une poutre ou un poteau selon son rôle, ce qu'aucune géométrie ne dit.

Le minimum d'armature d'âme **ne s'applique ni aux dalles ni aux poteaux** : le §6.2.1(4) en dispense les éléments où une redistribution transversale est possible, et les armatures transversales de poteau relèvent du §9.5.3, qui porte sur des diamètres et des espacements. L'appliquer partout déclarerait non conformes toutes les dalles courantes.

Le module rend la **liste** des règles enfreintes, pas un motif unique : une section peut être à la fois sur-armée et dépourvue d'armature d'âme. Il **constate et ne prescrit pas** — aucun ferraillage n'est proposé — et **ne modifie pas le verdict de flexion** : une section peut résister et rester irrégulière au §9, ce qui est une information et non une contradiction. Les valeurs sont celles **recommandées** par l'EN 1992-1-1 ; une annexe nationale peut les modifier.

**Fissuration sous déformation gênée — le « Zwang » des éléments massifs (§7.3.2)** : `minimumRestraintArea` rend l'armature minimale de maîtrise de la fissuration, éq. (7.1) `A_s,min·σ_s = k_c·k·f_ct,eff·A_ct`.

**À ne pas confondre avec le minimum de résistance du §9.2.1.1**, qui répond à une autre question. Celui-ci garantit que l'acier ne plastifie pas à l'instant où le béton fissure, donc que la fissuration se répartit en plusieurs fissures fines plutôt qu'en une seule large. Sur un voile ou un radier massif, c'est lui qui gouverne, et de loin — la résistance n'y est jamais le problème.

Le caractère **massif** entre par le facteur `k` : `1,00` jusqu'à 300 mm d'épaisseur, `0,65` à partir de 800 mm, interpolé entre les deux. Ce n'est pas une pénalité mais un facteur réducteur : dans une pièce épaisse, les contraintes d'auto-équilibre réduisent l'effort qui traverse réellement la section au moment de la fissuration.

Deux natures de gêne : **centrée** (`k_c = 1`, retrait ou refroidissement empêchés par un radier déjà durci, une reprise de bétonnage — toute la section est tendue) et **de flexion** (`k_c = 0,4`, gradient thermique cœur-parement, avec l'éq. 7.2 dès qu'un effort normal accompagne).

Deux paramètres décident du résultat et sont laissés à l'ingénieur :

- **`f_ct,eff`**, la résistance à la traction *à l'instant de la fissuration*. Le défaut est `f_ctm` à 28 jours, c'est-à-dire le cas défavorable. Or le Zwang des pièces massives naît de la chaleur d'hydratation et fissure à quelques jours : retenir la valeur à 28 jours surestime l'acier. Le §7.3.2(2) demande explicitement de l'estimer à l'âge attendu de la fissuration.
- **`σ_s`**, la contrainte admise dans l'acier. Le texte autorise `f_yk`, mais une valeur plus faible est souvent nécessaire pour respecter une ouverture visée (tableaux 7.2N et 7.3N, qui lient diamètre et espacement maximaux à cette contrainte).

**Option `effectiveZoneOnly`** : calculer sur la seule zone de béton tendu efficace au lieu de toute la zone tendue. Ce n'est **pas** le texte de l'EN 1992-1-1, qui écrit l'éq. 7.1 sur `A_ct` entière ; c'est le raffinement retenu par la pratique allemande pour les pièces épaisses, où seule une peau participe réellement à la maîtrise de l'ouverture. L'écart est considérable — sur un voile de 1 m, 3334 mm²/m contre 834. Le défaut reste le texte européen, qui est enveloppe.

Sections rectangulaires uniquement.

**Méthode Meyer (DIN 1045) pour les éléments massifs** : `meyerRestraintReinforcement` rend l'armature de peau maîtrisant l'ouverture de fissure sous déformation gênée, d'après G. et R. Meyer, *Rissbreitenbeschränkung nach DIN 1045*.

**Elle ne remplace pas le §7.3.2 ci-dessus, elle coexiste avec lui.** Les deux répondent à la même question par deux chemins qu'il ne faut pas mélanger : l'EN 1992-1-1 écrit `A_s,min·σ_s = k_c·k·f_ct,eff·A_ct`, **linéaire** en aire d'acier, avec `k` de 1,00 à 0,65 et l'ouverture de fissure gouvernée ailleurs (tableaux 7.2N/7.3N) ; Meyer sort `A_s` d'une **racine**, avec `k` de 0,80 à 0,50 et l'ouverture visée `w_k` explicitement dans la formule. Les deux `k` portent le même nom et la même idée sans recouvrir la même grandeur : ne jamais les échanger.

Trois régimes, choisis et non mélangés : **bridage intérieur** (contraintes propres de peau — le résultat est alors quasi indépendant de l'épaisseur), **bridage extérieur en fissure unique** (`h < h_grenz`), et **bridage extérieur en fissuration achevée**, qui est le cas des éléments massifs courants puisque `h_grenz` vaut typiquement 30 à 50 cm en traction.

`choixDeBarres` propose ensuite une répartition par mètre, arrondie **vers le haut** pour que l'acier fourni couvre toujours l'acier requis.

**Statut de validation, tel que le donne la source** : la famille traction / bridage extérieur est validée contre un diagramme de l'ouvrage à environ 3 % près sur toute la plage `h` = 40 à 160 cm. Les familles flexion et bridage intérieur découlent de la même dérivation et sont cohérentes, mais **n'ont pas été confrontées à leur diagramme** — à vérifier avant emploi en production. Le plafond d'épaisseur efficace que l'ouvrage applique au-delà d'environ 1,20 m n'est pas implémenté : le résultat en bridage extérieur peut y être conservateur. Le bridage continu de rive (voile sur radier existant) relève de l'EN 1992-3 / CIRIA C660 et n'est pas couvert.

**Cadre réglementaire, à ne pas taire** : la méthode est allemande. En Belgique et au Luxembourg, la justification réglementaire reste l'EN 1992-1-1 et ses annexes nationales (NBN / ILNAS). Elle sert au **pré-dimensionnement** et au contrôle d'ordre de grandeur.

**Vérification et domaine d'interaction** : `verifySection` conclut — taux d'exploitation, verdict, et le motif de l'échec quand il y en a un. Deux chemins de chargement sont proposés : « N constant, moment majoré », qui correspond à l'usage en poteau, et proportionnel. Les diagrammes `N`–`M` et `My`–`Mz` sont rendus comme des listes de points, prêtes à tracer — le noyau ne dessine pas.

`interactionCurveNM` balaye la profondeur d'axe neutre depuis la fibre supérieure : elle ne décrit donc **qu'une seule branche**, celle des moments d'un seul signe. `interactionDiagramNM` rend le diagramme **complet**, ses deux sens de flexion : la branche opposée s'obtient en balayant la section tournée de π, ce qui envoie `(y, z)` sur `(−y, −z)` et donc `M` sur `−M`, l'effort normal restant inchangé. Aucune approximation. Sur une section symétriquement armée les deux branches sont miroir et l'omission ne se voit pas ; sur une dalle à deux nappes inégales, une section en T, un voile dissymétrique, elles diffèrent et n'en tracer qu'une cache la moitié du domaine.

Les points sont ordonnés pour un tracé d'un seul trait : la branche opposée dans l'ordre du balayage, puis la branche positive à l'envers — l'effort normal monte de la traction dominante jusqu'à la compression maximale, puis redescend. Chaque point porte `sense` (`1` fibre supérieure comprimée, `-1` l'autre sens) et sa profondeur d'axe neutre, mesurée depuis la fibre comprimée de **sa** branche.

**Le contour reste ouvert du côté traction, et ce n'est pas un oubli** : le noyau ne parcourt que la branche du pivot béton, il n'atteint donc jamais la traction pure `N = −A_s·f_yd`. Aucun point de fermeture n'est ajouté entre les deux extrémités — refermer dessinerait un domaine qui n'a pas été calculé, crédible et faux.

**Vérification en service (méthode n)** : section fissurée homogénéisée, contraintes du béton et des armatures confrontées aux limites de l'EN 1992-1-1 §7.2. Solveur entièrement distinct de celui de l'ELU — hypothèses élastiques, béton tendu négligé — et à ne jamais confondre avec lui. Flexion droite, coefficient d'équivalence paramétrable (défaut 15, valeur conventionnelle intégrant le fluage, non prescrite par la norme sous cette forme).

**Ouverture de fissures (§7.3)** : `w_k` calculée selon l'équation 7.8, avec l'aire effective de béton tendu, le diamètre équivalent des barres et le basculement automatique sur l'équation 7.14 quand l'espacement sort du domaine de validité de 7.11. Sections rectangulaires en flexion droite. La limite `w_max` est paramétrable : elle dépend de la classe d'exposition, que le module ne connaît pas.

**Courbure et participation du béton tendu (§7.4.3)** : moment de fissuration, courbure en section non fissurée et en section fissurée, et interpolation entre les deux. **Ce n'est pas un calcul de flèche** — une flèche exige la portée, les appuis et le chargement, qui sont du niveau élément ; le module rend la courbure, l'appelant l'intègre le long de la pièce.

## Base normative

- Loi béton parabole-rectangle, EN 1992-1-1 §3.1.7 éq. 3.17-3.18, paramètres du tableau 3.1 (y compris la branche `fck > 50 MPa`).
- Loi acier bilinéaire à branche horizontale, §3.2.7 éq. 3.8.
- Coefficients partiels et `αcc` : profil `EC2_recommended` (valeurs recommandées de la norme).

**Aucune annexe nationale n'est codée dans le module.** Les coefficients (`γc`, `γs`, `αcc`, `εc2`, `εcu2`, `n`) proviennent tous d'un objet `NormProfile` que l'utilisateur peut redéfinir pour appliquer l'annexe applicable à son projet.

## Exemple

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  circularSection, circularRebarCage, verifyUniaxial,
} from './src/index';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);      // C25/30
const steel = createSteel(500, 200000, profile);   // B500

// Pieu Ø600, cage de 8 HA20, enrobage 50 mm
const pieu = circularSection({
  diameter: 600,
  concrete,
  rebars: circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel }),
});

const resultat = verifyUniaxial(pieu, { N: 0, M: 0 }, profile);
// resultat.M_Rd ≈ 239 kN·m, resultat.neutralAxisDepth ≈ 132 mm
```

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  rectangularSection, rectangularRebarLayout, verifyBiaxial,
} from './src/index';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

// Poteau 400x400, enrobage 30, étriers HA8, 3 HA20 en haut et en bas
const layout = rectangularRebarLayout({
  width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
  rows: [
    { face: 'bottom', bars: { count: 3, diameter: 20 } },
    { face: 'top', bars: { count: 3, diameter: 20 } },
  ],
});

const poteau = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });

// Seule la DIRECTION de (My, Mz) est utilisée : ici, flexion à 45°
const r = verifyBiaxial(poteau, { N: 500, My: 1, Mz: 1 }, profile);
// r.M_Rd.y, r.M_Rd.z — capacité colinéaire à la sollicitation
// r.neutralAxis   — droite { -y·sin(angle) + z·cos(angle) = offset }
// r.leverArm      — bras de levier interne (mm)
```

```ts
import {
  parseModel, serializeModel, resolveModel, verifyBiaxial, sectionCurvature,
  verifyShear, FORMAT_VERSION,
} from './src/index';
import type { SectionModel } from './src/index';

// Poteau 400x400, decrit par son INTENTION de saisie plutot que ses
// consequences (positions de barres, materiaux derives) : c'est ce qui se
// serialise et se relit.
const monModele: SectionModel = {
  formatVersion: FORMAT_VERSION,
  engineVersion: '0.1.0',
  name: 'Poteau P3',
  norm: { name: 'EC2_recommended', gammaC: 1.5, gammaS: 1.15, alphaCc: 1, nBands: 200 },
  concrete: { fck: 25 },
  steel: { fyk: 500, Es: 200000 },
  geometry: { kind: 'rectangle', width: 400, height: 400 },
  reinforcement: {
    kind: 'rectangular-layout',
    cover: 30,
    stirrupDiameter: 8,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
    ],
  },
  action: { N: 500, My: 1, Mz: 1 },
  // Optionnel, et independamment optionnel pour chacune des deux : ce sont
  // des combinaisons EN 1990 differentes de l'ELU, et differentes entre
  // elles. Uniaxiales {N, M} : c'est ce que prennent les modules de service.
  serviceActions: {
    characteristic: { N: 350, M: 90 },   // §7.2 limitation des contraintes
    quasiPermanent: { N: 300, M: 65 },   // §7.3 fissuration, §7.4.3 courbure
  },
  // Version 3, tout aussi optionnel et bloc par bloc. L'effort normal
  // concomitant du tranchant n'est pas saisi : c'est celui de l'ELU.
  elementType: 'column',
  shear: { V_Ed: 120, links: { Asw: 100.5, s: 200, fywk: 500 }, cotTheta: 2.5 },
};

const json = serializeModel(monModele);        // a ranger ou l'on veut
const { section, action, norm, serviceActions, shear } = resolveModel(parseModel(json));
const r = verifyBiaxial(section, action, norm);
// r.M_Rd_magnitude — capacite colineaire a (My, Mz)

// Le bloc tranchant est rendu decoupe selon la signature de verifyShear :
// son N_Ed vient de l'effort normal de l'ELU, ses options portent cadres et
// cot theta. Absent du modele, il est absent ici.
if (shear !== undefined) verifyShear(section, shear.action, norm, shear.options);

// Les sollicitations resolues ont deja la forme Action {N, M} : aucune
// conversion a faire ici. Absentes du modele, elles sont absentes ici.
const qp = serviceActions?.quasiPermanent;
if (qp !== undefined) sectionCurvature(section, qp);
```

```ts
import {
  ec2Recommended, createConcrete, createSteel,
  rectangularSection, rectangularRebarLayout,
  verifySection, interactionCurveAtN, interactionDiagramNM,
} from './src/index';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

const layout = rectangularRebarLayout({
  width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
  rows: [
    { face: 'bottom', bars: { count: 3, diameter: 20 } },
    { face: 'top', bars: { count: 3, diameter: 20 } },
  ],
});
const poteau = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });

const v = verifySection(poteau, { N: 500, My: 80, Mz: 40 }, profile);
// v.ok            — true si le taux ne dépasse pas 1
// v.utilization   — |M_Ed| / |M_Rd|
// v.reason        — pourquoi, quand ça ne passe pas

const contour = interactionCurveAtN(poteau, 500, profile);  // à tracer

// Diagramme N–M complet : 2 × steps points, contour ouvert côté traction.
const diagramme = interactionDiagramNM(poteau, profile, { steps: 40 });
// diagramme[i].sense — 1 fibre supérieure comprimée, -1 l'autre sens
// diagramme[i].N     — kN, positif en compression
// diagramme[i].M     — kN·m, dans le repère de la section
```

## Validation

La crédibilité de l'outil repose sur des vérifications indépendantes du chemin de calcul numérique, présentes dans `tests/` :

- **Recalcul manuel fermé** (`tests/handcalc/`) : le `M_Rd` d'une poutre rectangulaire en flexion simple est confronté à l'intégrale analytique du bloc parabole-rectangle — écart mesuré 0,001 %.
- **Convergence** : la méthode des fibres converge vers cette intégrale analytique quand le nombre de bandes augmente (erreur divisée par ~26 000 entre 10 et 1000 bandes).
- **Non-régression** : un rectangle modélisé comme polygone donne un résultat identique au chemin rectangulaire dédié.
- **Décomposition composite** : aire et centroïde d'une section en T vérifiés par décomposition rectangle-par-rectangle, indépendamment de la formule du lacet.
- **Approximation du cercle** : l'aire du polygone régulier converge vers `πr²` (0,16 % d'écart à 64 segments).
- **Flexion déviée** (`tests/handcalc/biaxial-triangle-parabolic.test.ts`) : `N`, `My` et `Mz` d'un triangle intégralement sur la branche parabolique confrontés à trois intégrales fermées calculées à la main.
- **Invariance par isométrie** : tourner la section et la sollicitation du même angle laisse la capacité inchangée.
- **Compression centrée** (`tests/handcalc/compression-centree.test.ts`) : le sommet du diagramme `N`–`M` confronté à `fcd·Ac + (fyd − fcd)·As`, calculé à la main.
- **Cohérence domaine / taux** : un point pris sur le contour rendu par le domaine donne un taux d'exploitation voisin de 1.
- **Méthode n** (`tests/handcalc/methode-n-poutre.test.ts`) : axe neutre, bras de levier et contraintes d'une poutre fissurée confrontés au calcul classique fermé.
- **Ouverture de fissure** (`tests/handcalc/ouverture-fissure.test.ts`) : les quatre étapes du calcul — méthode n, aire effective, déformation relative, ouverture — vérifiées séparément contre un recalcul manuel.
- **Courbure** (`tests/handcalc/courbure.test.ts`) : caractéristiques non fissurées, moment de fissuration, deux courbures et interpolation vérifiés séparément contre un recalcul manuel, plus un contrôle élémentaire `M_cr = f_ctm·b·h²/6` sur section non armée.

## Développement

```bash
npm install
npm test          # suite complète (Vitest)
npm run typecheck # tsc --noEmit
```

## Réserves

Cet outil est une aide au calcul ; la vérification finale et la responsabilité des résultats incombent à l'ingénieur du projet. Limites connues de la version actuelle, documentées dans le code :

- le domaine ne parcourt que la branche du pivot béton — la loi acier à branche horizontale n'impose aucune limite de déformation, donc aucun pivot acier n'existe dans le modèle. Le contour `N`–`M` est donc **ouvert du côté traction** : `interactionDiagramNM` ne le referme pas, plutôt que d'inventer un domaine non calculé ;
- contour simple sans trou (les réservations ne sont pas gérées) ;
- une section circulaire est approximée par un polygone régulier (32 côtés par défaut, paramétrable) ;
- pas de précontrainte, pas de contrôle de ductilité ;
- un modèle ne porte qu'un seul acier, appliqué à toutes les barres — le mélange d'aciers (sections existantes renforcées) n'est pas encore représentable ;
- le format est en version 3 ; la lecture accepte les versions 1, 2 et 3 (`SUPPORTED_FORMAT_VERSIONS`), l'écriture produit toujours la version courante. Il n'existe pas de migration au sens propre : la compatibilité tient à ce que les champs ajoutés soient optionnels et à ce que la lecture n'exige jamais l'égalité avec la version courante. Une évolution qui ne pourrait pas se dire par un champ optionnel exigerait, elle, une vraie reprise des fichiers existants ;
- le câblage de l'interface est couvert par des tests de bout en bout dans un DOM simulé (`tests/app/cablage.test.ts`) : saisir une valeur doit changer le résultat affiché. Ces tests ont été ajoutés après une régression réelle que la seule couverture des fonctions pures n'avait pas vue ;
- les diagrammes d'interaction sont calculés par la bibliothèque (`interactionCurveAtN`, `interactionCurveNM`, `interactionDiagramNM`) mais ne sont pas encore tracés par l'interface ;
- le mode de chargement proportionnel est nettement plus coûteux que le mode « N constant » (quelques secondes contre quelques dizaines de millisecondes) : il ne se déclenche que sur demande explicite ;
- la vérification en service ne couvre que la **flexion droite** et la section **fissurée** : une section entièrement comprimée est détectée et signalée, non calculée ;
- l'ouverture de fissures ne couvre que les sections **rectangulaires** en flexion droite ; une autre géométrie lève une erreur plutôt que d'être approximée ;
- la limite `w_max` vaut 0,3 mm par défaut, valeur du cas courant XC2–XC4 : elle dépend de la classe d'exposition et doit être ajustée au projet ;
- la **courbure** est rendue au niveau de la section (§7.4.3) ; le calcul de **flèche** proprement dit, qui exige la portée, les appuis et le chargement, reste à la charge de l'appelant ;
- l'équation 7.19 est appliquée sous la forme `(M_cr/M)`, exacte en flexion pure, approchée en flexion composée ;
- l'équation 7.18 n'est **continue au moment de fissuration que pour `β = 1`** : avec la valeur courante `β = 0,5`, la courbure saute de `(1 − β)` fois l'écart entre les deux états. C'est une propriété de la norme, pas un artefact de calcul, et elle est testée comme telle.
