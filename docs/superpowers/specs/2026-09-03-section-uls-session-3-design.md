# Spec — module `section-uls`, session 3 (flexion composée déviée)

**Statut :** approuvé pour développement.
**Source :** `PLAN_module_section-uls_Aedificium.md` sections 5.5 et 6 (« Session 3 — Flexion composée déviée »), adapté sur les points ci-dessous après clarification avec l'utilisateur (2026-09-03).

## 1. Contexte et périmètre

Les sessions 1 et 2 ont livré un moteur ELU en flexion composée **droite** : matériaux EC2, lois parabole-rectangle et acier bilinéaire, intégration par fibres sur géométrie polygonale quelconque, solveur par bissection sur la profondeur d'axe neutre. Voir `docs/superpowers/specs/2026-09-01-section-uls-sessions1-4-design.md` et `2026-09-02-section-uls-session-2-design.md`.

Cette session généralise le solveur à la flexion **déviée** : l'axe neutre n'est plus horizontal, son inclinaison devient une inconnue. Elle emporte trois compléments demandés par l'utilisateur, tous liés au même besoin de justesse ou de lisibilité :

- **saisie d'armatures barre par barre** (enrobage, étriers, lit défini par nombre + diamètre ou par diamètre + espacement) — ce n'est pas du confort : en flexion déviée, un lit forfaitisé en un point unique donnerait un résultat faux ;
- **bras de levier interne** et points d'application des résultantes, pour la lecture d'ingénieur et le tracé ;
- **correctif des exports publics de la session 2**, absents de `src/index.ts` (défaut constaté pendant la conception, voir §8).

L'enregistrement et le chargement de modèles, également demandés, sont sortis en **session 3b** : c'est de la sérialisation, sans lien avec la mécanique, avec sa propre forme de validation (aller-retour, versionnement de format). Spec et plan distincts, enchaînés immédiatement après cette session.

## 2. Décisions prises avec l'utilisateur (2026-09-03)

- **L'API renvoie la capacité, pas un verdict.** `verifyBiaxial` rend le couple résistant colinéaire au moment sollicitant, l'angle et la position de l'axe neutre. Ni `utilization` ni `ok` : le taux d'exploitation appartient à la session 4, où l'homothétie radiale est définie.
- **Le repère de la section ne tourne jamais côté API.** La rotation est un détail d'implémentation interne. L'axe neutre est restitué comme une **droite oblique dans le repère de la section**, directement traçable.
- **Résolution imbriquée plutôt que Newton-Raphson à deux paramètres** (écart assumé au plan d'origine, §5.5). Justification en §6.
- **Porte de validation étendue à un banc de comparaison VCASLU** (choix (C) de l'utilisateur), à exécuter par l'utilisateur lui-même — le module ne peut pas lancer VCASLU. Voir §9.5.
- **Aucun preset normatif public supplémentaire.** Le banc VCASLU a besoin de `αcc = 0,85` (cadre NTC) : ce profil est dérivé **localement dans les fixtures de test**, pas exporté. La décision « un seul profil public, `EC2_recommended` » du 2026-09-01 tient.
- **L'aire d'armature n'est jamais saisie directement** dans les nouveaux constructeurs : elle découle de `count × π·Ø²/4`. Le `RebarLayer` brut, qui prend une aire, reste disponible pour les sections existantes dont on ne connaît que l'aire.

## 3. Conventions (fixées, non renégociables en cours de session)

### 3.1 Vecteur moment

La session 2 calcule `M = −∫σ·z dA` (positif quand la compression est en fibre supérieure). Cette grandeur devient la composante `y`, inchangée, et la composante manquante est ajoutée :

```
M_y = −∫ σ·z dA     (identique au M_Rd de verifyUniaxial)
M_z = +∫ σ·y dA
```

Ce couple `(M_y, M_z)` se transforme comme un vecteur du plan sous rotation du repère. C'est la propriété qui rend la rotation interne exacte et réversible, et qui rend la non-régression `θ = 0` structurelle plutôt qu'approchée.

Convention de signe : ce vecteur est l'opposé du moment au sens de la règle de la main droite (`M_mech = ∫σ·z dA · e_y − ∫σ·y dA · e_z`). Le choix est dicté par la compatibilité avec la session 2 ; il est cohérent, homogène sur les deux composantes, et sans effet sur les magnitudes.

### 3.2 Axe neutre

Paramétré par un angle `θ` et une position. On pose la coordonnée perpendiculaire à l'axe neutre :

```
ζ(y, z) = −y·sin θ + z·cos θ
```

En `θ = 0` on a `ζ = z` : on retrouve exactement la convention de la session 2, compression du côté des `ζ` faibles (fibre supérieure). La droite d'axe neutre est l'ensemble `{ (y, z) : −y·sin θ + z·cos θ = offset }`.

`θ` balaye `[0, 2π)`, ce qui couvre à la fois toutes les orientations d'axe neutre **et** les deux côtés comprimés possibles — il n'y a donc pas de second paramètre de « sens de flexion » à gérer.

### 3.3 Champ de déformation

Inchangé par rapport aux sessions 1 et 2, transposé en `ζ` : pivot béton, fibre la plus comprimée à `εcu2`.

```
ε(ζ) = εcu2 · (1 − (ζ − ζmin) / x)
```

où `ζmin` est le minimum de `ζ` sur les sommets de la géométrie et `x` la profondeur d'axe neutre mesurée **perpendiculairement** à celui-ci depuis la fibre extrême comprimée.

**Limitation reconduite :** pivot béton uniquement. La loi acier à branche horizontale n'impose aucune limite de déformation, donc aucun pivot acier n'existe dans le modèle actuel (même réserve qu'en sessions 1 et 2).

## 4. Saisie des armatures

### 4.1 Motif mécanique

En flexion droite, seule la coordonnée `z` d'une barre influe sur sa déformation : un lit de `n` barres à la même profondeur peut être forfaitisé en un point unique d'aire cumulée. **En flexion déviée cette équivalence tombe** : l'axe neutre étant incliné, deux barres du même lit à des `y` différents ont des déformations différentes. Modéliser un lit par un point unique surestimerait ou sous-estimerait la résistance selon l'inclinaison.

La saisie barre par barre est donc une **condition de justesse** de cette session, pas un ajout ergonomique.

### 4.2 Chaîne de saisie

La distance d'axe d'une barre à la face de béton suit la chaîne réelle du ferraillage :

```
distance d'axe = enrobage + Ø étrier + Ø barre / 2
```

appliquée aussi bien en profondeur (position du lit) que latéralement (position des barres d'extrémité du lit).

### 4.3 `src/geometry/rebar-layout.ts` (nouveau)

**Primitive générique** — un lit le long d'un segment quelconque du plan, utilisable sur n'importe quelle géométrie (y compris un lit oblique dans une section en T) :

```ts
rebarRow(params: {
  from: { y: number; z: number };   // position d'axe de la première barre
  to:   { y: number; z: number };   // position d'axe de la dernière barre
  bars: { count: number; diameter: number }
      | { diameter: number; maxSpacing: number };
  steel: SteelMaterial;
  endpoints?: 'include' | 'exclude';  // défaut 'include'
}): RebarLayer[]
```

Règles :

- **Mode `count`** — `count` barres réparties uniformément entre `from` et `to` inclus. `count === 1` place une barre unique au milieu du segment.
- **Mode `maxSpacing`** — `maxSpacing` est un **maximum, pas une valeur exacte**. Pour une longueur utile `L`, le nombre de barres est `ceil(L / maxSpacing) + 1` et l'espacement réel `L / (count − 1)`, donc toujours `≤ maxSpacing`. « Ø12 tous les 150 » sur 400 mm donne 4 barres à 133 mm, jamais 3 barres à 150 avec un intervalle résiduel de 100 au bout. Si `L = 0`, une seule barre.
- **`endpoints: 'exclude'`** — les barres sont placées aux points de division **intérieurs** du segment (`count` barres intermédiaires, aux positions `k·L/(count+1)` pour `k = 1..count`). En mode `maxSpacing`, `ceil(L / maxSpacing) − 1` barres intermédiaires. Ce mode existe pour les lits latéraux d'un poteau, dont les barres d'angle appartiennent déjà aux lits inférieur et supérieur.
- Chaque barre produit un `RebarLayer` distinct, d'aire `π·Ø²/4`.

**Commodité rectangle** — l'idiome de saisie VCASLU :

```ts
rectangularRebarLayout(params: {
  width: number; height: number;
  cover: number;
  stirrupDiameter?: number;        // défaut 0
  steel: SteelMaterial;
  rows: Array<{
    face: 'top' | 'bottom' | 'left' | 'right';
    bars: { count: number; diameter: number }
        | { diameter: number; maxSpacing: number };
  }>;
}): RebarLayer[]
```

Positions déduites, dans le repère barycentrique du rectangle (`z` vers le bas, origine au centre) avec `a = cover + stirrupDiameter + diameter/2` calculé **avec le diamètre du lit concerné** :

- `bottom` : `z = +height/2 − a`, `y` de `−width/2 + a` à `+width/2 − a`, `endpoints: 'include'` ;
- `top` : `z = −height/2 + a`, même étendue en `y`, `endpoints: 'include'` ;
- `left` : `y = −width/2 + a`, `z` de `−height/2 + a` à `+height/2 − a`, `endpoints: 'exclude'` ;
- `right` : `y = +width/2 − a`, même étendue en `z`, `endpoints: 'exclude'`.

Le choix `exclude` sur les faces latérales évite le **double comptage des barres d'angle**, erreur classique de saisie : un poteau « 4 + 4 + 2 + 2 » se saisit tel quel et donne 12 barres, pas 16.

### 4.4 Récapitulatif de saisie

`rebarRow` et `rectangularRebarLayout` exposent, en plus des `RebarLayer`, un récapitulatif lisible destiné à la relecture et au futur affichage : nombre de barres, diamètre, espacement réel, aire totale du lit — par exemple `4 HA12 @ 133 mm = 452 mm²`. Forme retenue : un objet structuré (`{ count, diameter, spacing, totalArea }`) plus une fonction de formatage, pas une chaîne construite en dur dans le constructeur.

### 4.5 `rectangularSection` — accepter des armatures déjà positionnées

Manque constaté en préparant le plan : `rectangularSection` n'accepte aujourd'hui que des armatures décrites par `depthFromTop`, et les place toutes à `y = 0`. Le résultat de `rectangularRebarLayout`, qui porte de vraies positions `y`, serait donc inutilisable avec le constructeur rectangle — c'est-à-dire précisément avec la géométrie pour laquelle il est écrit.

Le paramètre `rebars` accepte donc les deux formes, discriminées à l'exécution par la présence de `depthFromTop` :

```ts
rebars: Array<{ depthFromTop: number; area: number; steel: SteelMaterial }> | RebarLayer[]
```

La forme historique conserve son comportement exact (`y = 0`, `z = depthFromTop − height/2`) ; la forme `RebarLayer[]` est reprise telle quelle, ses coordonnées étant déjà barycentriques — ce que produit `rectangularRebarLayout`. Aucun test existant n'est affecté.

### 4.6 `circularRebarCage` — ajout de `stirrupDiameter`

Une cage de pieu comporte une spirale, ignorée en session 2. Paramètre `stirrupDiameter?: number` ajouté, **défaut 0** : le comportement existant est préservé à l'identique, et les tests de la session 2 restent valides sans modification. Le rayon de la cage devient `diameter/2 − cover − stirrupDiameter − barDiameter/2`.

## 5. Intégration

### 5.1 `src/integration/fiber-polygon-biaxial.ts` (nouveau)

Généralise `integratePolygon` en renvoyant **les deux composantes de moment** ainsi que les résultantes séparées :

```ts
interface Resultant { force: number; y: number; z: number; }  // force en valeur absolue (kN), point d'application (mm)

interface BiaxialResultant {
  N: number;                 // kN
  My: number; Mz: number;    // kN·m, conventions §3.1
  compression: Resultant | null;
  tension: Resultant | null;
}
```

Une résultante nulle est rendue `null`, jamais un objet de force nulle dont le point d'application serait `0` ou `NaN` : une section entièrement comprimée n'a pas de point d'application de traction, et le type doit obliger l'appelant à traiter ce cas.

Mise en œuvre :

- **Bandes de béton** — mêmes bandes horizontales que `integratePolygon`. La composante `My` est identique à l'actuelle. La composante `Mz` d'une bande vaut `σ · dz · Σ_spans (y₂² − y₁²)/2`, moment statique en `y` des portions du contour à cette hauteur. Les spans sont déjà fournis par `polygonSpansAtZ` : **`scanline.ts` n'est pas modifié**.
- **Armatures** — contribution nette `(σs − σc)·A` comme aujourd'hui, avec les deux bras `−z` et `+y`.
- **Résultantes** — accumulation séparée des contributions à force positive (compression) et négative (traction), avec leurs moments statiques en `y` et `z`, d'où le point d'application de chacune. Une contribution nulle n'est comptée nulle part. Le béton ne contribue jamais en traction (la loi parabole-rectangle rend une contrainte nulle en traction) ; seules les armatures peuvent alimenter la résultante de traction.

`integratePolygon` et `integrateRectangle` restent **intacts** : ils demeurent les témoins de non-régression des sessions 1 et 2, exactement comme `fiber-rectangle.ts` l'était en session 2.

### 5.2 `src/geometry/rotate.ts` (nouveau)

- `rotateVertices` / `rotateSection(section, θ)` — copie de travail de la section dans le repère où l'axe neutre d'angle `θ` est horizontal : `(y', z') = (y·cos θ + z·sin θ, −y·sin θ + z·cos θ)`. Sommets **et** armatures. La `Section` d'origine n'est jamais modifiée.
- `rotateMomentBack(M', θ)` — transformation inverse du vecteur moment : `(M_y, M_z) = (M_y'·cos θ − M_z'·sin θ, M_y'·sin θ + M_z'·cos θ)`.

La rotation est une isométrie : aire, centroïde et champ de déformation sont préservés. Comme la géométrie stockée est déjà centrée sur le centroïde, la rotation se fait autour de l'origine et le centroïde reste en place.

### 5.3 `rectangleToPolygon` (`src/geometry/rectangle.ts`)

Un rectangle tourné n'est plus aligné sur les axes : `verifyBiaxial` convertit toute `RectangularGeometry` en `PolygonGeometry` à quatre sommets avant rotation. La conversion est triviale et son équivalence numérique est déjà acquise par la porte de non-régression de la session 2.

## 6. Solveur

### 6.1 Écart assumé au plan d'origine

Le plan (§5.5) prévoyait un Newton-Raphson à deux paramètres avec jacobien numérique, amortissement, bornes et repli sur bissection imbriquée. Cette spec retient **la bissection imbriquée comme méthode primaire, sans Newton**.

Raisons :

- la boucle interne est **exactement** le problème résolu en session 2 — on appelle `verifyUniaxial` sur la copie tournée de la section, sans réécrire ni modifier le solveur validé ;
- la convergence est garantie dès qu'un intervalle est encadré, sans jacobien numérique, sans amortissement, sans divergence possible ;
- le code neuf se réduit à une recherche de racine scalaire.

Newton apporterait de la vitesse au prix de tous les garde-fous que le plan lui-même énumérait. Le coût de ce choix est un budget de calcul, traité en §6.4 par une mesure et non par une supposition.

### 6.2 `src/solvers/uls-biaxial.ts` (nouveau)

```ts
interface BiaxialAction { N: number; My: number; Mz: number; }  // kN, kN·m

interface BiaxialResult {
  neutralAxis: { angle: number; offset: number };   // repère section, traçable
  neutralAxisDepth: number;      // x, ⟂ depuis la fibre extrême comprimée (mm)
  M_Rd: { y: number; z: number };  // colinéaire et de même sens que (My, Mz)
  M_Rd_magnitude: number;
  N_Rd: number;
  leverArm: number | null;       // §7
  compression: Resultant | null; // points d'application ramenés dans le repère section
  tension: Resultant | null;
  rootCount: number;             // §6.3
  converged: boolean;
}

verifyBiaxial(section: Section, action: BiaxialAction, norm: NormProfile): BiaxialResult
```

**Seule la _direction_ de `(My, Mz)` est utilisée**, jamais sa magnitude : l'action fixe l'orientation du plan de flexion, et le solveur rend la capacité dans cette direction. `{ My: 1, Mz: 0 }` et `{ My: 1000, Mz: 0 }` donnent le même résultat. La comparaison entre sollicitation et capacité appartient à la session 4. Ce point doit être écrit dans la documentation de la fonction, faute de quoi l'appelant croira que l'action est comparée.

Algorithme :

1. **Garde** — si `My = Mz = 0`, la direction du moment est indéfinie : erreur explicite renvoyant vers `verifyUniaxial` (ou vers le domaine d'interaction de la session 4). Ce n'est pas un `converged: false`, c'est une erreur de saisie.
2. **Boucle interne**, à `θ` fixé — rotation de la section, puis `verifyUniaxial(sectionTournée, { N, M: 0 }, norm)` donne `x` tel que `N_R = N_Ed`. Si cette résolution échoue (effort normal hors de la plage résistante à cette orientation), l'orientation est marquée indéfinie.
3. **Moment résultant** — une intégration biaxiale au champ convergé donne `(M_y', M_z')` dans le repère tourné, ramené dans le repère section par `rotateMomentBack`.
4. **Boucle externe** — recherche de `θ` annulant l'écart angulaire signé `g(θ) = wrapToPi(angle(M_R(θ)) − angle(M_Ed))`. Balayage grossier de `[0, 2π)` au pas de 15°, puis encadrement d'un changement de signe **franc** (les deux extrémités de l'intervalle vérifiant `|g| < π/2`, ce qui écarte la discontinuité de repliement à ±π, qui n'est pas une racine). Raffinement par la méthode d'Illinois jusqu'à `|Δθ| < 1e-6 rad`.
5. **Échec de balayage** — si aucun encadrement n'est trouvé au pas de 15°, raffiner à 5° puis 1° avant de conclure `converged: false`. Jamais de résultat renvoyé sans encadrement.

**Un seul point de vérité pour le champ de déformation :** `uls-uniaxial.ts` reçoit sa seule modification autorisée de la session — l'expression du champ `ε(z)` est extraite en une fonction exportée (`concretePivotStrainField`), utilisée par les deux solveurs. Refactor sans changement de comportement ; les tests existants doivent passer sans modification. Recopier la formule dans le solveur dévié est explicitement proscrit.

### 6.3 Unicité de la solution

Pour une direction de moment donnée et un `N` donné, on attend une racine unique : les orientations donnant un moment résistant de sens **opposé** produisent `g = π`, pas `g = 0`, et sont donc naturellement écartées par l'usage de l'écart *signé*.

L'implémentation ne doit néanmoins **pas supposer l'unicité** : tous les encadrements détectés au balayage sont résolus, `rootCount` rapporte leur nombre, et si plusieurs racines distinctes subsistent, celle de **plus faible `M_Rd_magnitude`** est retenue (choix conservatif pour une vérification de capacité). Un `rootCount > 1` sur un cas de validation doit être investigué, non absorbé.

### 6.4 Budget de calcul

Une résolution déviée enchaîne plusieurs dizaines de résolutions droites, chacune faisant 60 itérations de bissection sur 200 bandes. Deux contrôles :

- **Assertion déterministe** — un compteur de résolutions internes ; le solveur doit converger en **≤ 60 résolutions droites** par appel sur les cas de validation. Déterministe, donc non instable en intégration continue, contrairement à une assertion de temps.
- **Mesure rapportée, non assertée** — temps mural d'une résolution sur un pieu Ø600 aux réglages par défaut, mesuré et consigné dans le rapport d'implémentation. Au-delà de ~300 ms, signaler ; l'accélération de la boucle interne (tolérance adaptative en remplacement des 60 itérations fixes) sera arbitrée à ce moment, pas par anticipation.

## 7. Bras de levier interne

Les deux résultantes étant des points du plan, le bras de levier est la distance entre elles **mesurée perpendiculairement à l'axe neutre** :

```
leverArm = | (P_compression − P_traction) · p |,   p = (−sin θ, cos θ)
```

C'est la grandeur qui vérifie `M = F · z` au sens de l'ingénieur, et elle est issue de l'intégration exacte — jamais de l'approximation `d − 0,4x`.

Cas particulier : section entièrement comprimée (aucune armature tendue, `tension.force = 0`). Le bras de levier n'a alors pas de sens ; `leverArm` vaut `null` et le point d'application de la traction n'est pas défini. Documenté, jamais renvoyé sous forme de zéro ou de `NaN` silencieux.

## 8. API publique

`src/index.ts` reçoit les exports de la session 3 (`verifyBiaxial`, `BiaxialAction`, `BiaxialResult`, `rebarRow`, `rectangularRebarLayout`, `integratePolygonBiaxial`).

**Correctif :** `src/index.ts` n'a jamais reçu les exports de la session 2 — `polygonSection`, `PolygonGeometry`, `circularSection`, `circularRebarCage` en sont absents, alors que l'exemple du README les importe depuis `./src/index`. **L'exemple du README ne compile pas en l'état.** Défaut constaté pendant la conception de cette session ; il est corrigé ici, et un test d'API publique vérifie que l'exemple exact du README s'exécute, pour que la régression ne puisse pas se reproduire silencieusement.

## 9. Stratégie de validation

### 9.1 Non-régression

Sollicitation purement autour de `y` (`Mz = 0`) sur une section symétrique : `verifyBiaxial` doit rendre `θ → 0` et le `M_Rd` de `verifyUniaxial` au flottant près. La composante `M_y` étant définie à l'identique (§3.1), l'égalité est structurelle et non approchée.

### 9.2 Symétrie à 45° (porte du plan)

Poteau carré à armatures symétriques, sollicitation à 45° → `|M_Rd,y| = |M_Rd,z|`, axe neutre à 45°.

### 9.3 Symétries d'orientation et invariance par isométrie

Sur ce même poteau : directions 0°/90°/180°/270° de même magnitude résistante. Et, cas plus fort, une section tournée d'un angle `α` sollicitée par un moment tourné du même `α` donne une magnitude identique — contrôle direct de la correction de la chaîne rotation / rotation inverse.

### 9.4 Recalcul manuel — zone comprimée triangulaire (`tests/handcalc/`)

Configuration que la flexion droite ne produit **jamais**, donc preuve neuve et non un doublon de la session 2, et première référence fermée indépendante portant sur les **deux** composantes de moment.

**Deux pistes écartées, et pourquoi.** Une zone comprimée « entièrement sur le plateau » n'existe pas : la zone comprimée s'étend jusqu'à l'axe neutre, et le plateau n'en couvre que les premiers `x·(1 − εc2/εcu2) ≈ 0,4286·x`. Et un champ de contrainte uniforme est inutilisable comme preuve : les deux moments autour du centroïde s'y annulent identiquement, quelle que soit l'asymétrie de la forme.

**Cas retenu — branche parabolique pure sur un triangle de largeur linéaire.** Le test appelle `integratePolygonBiaxial` directement, avec un champ de déformation choisi, **hors solveur** : on est donc libre de caler la fibre extrême à `εc2` plutôt qu'à `εcu2`, ce qui place toute la zone comprimée sur la branche parabolique, sans plateau.

Géométrie (sommets donnés explicitement, délibérément **non centrés sur le centroïde** — l'intégrateur intègre autour de l'origine du repère qu'on lui donne, ce qui rend le calcul à la main direct) : sommet en `(0, 0)`, base horizontale de `(−100, 300)` à `(200, 300)`. À la hauteur `z` : largeur `w(z) = z`, milieu de bande `ȳ(z) = z/6`.

Champ : `ε(z) = εc2·(1 − z/300)`, donc, avec `n = 2`, `σ(z) = fcd·(1 − (z/300)²)`.

En posant `s = z/300`, les trois intégrales sont exactes :

```
N   = fcd · 9,0e4 · ∫₀¹ (s − s³) ds  = fcd · 2,25e4          = 375 kN
M_y = −fcd · 2,7e7 · ∫₀¹ (s² − s⁴) ds = −fcd · 3,6e6         = −60 kN·m
M_z = M_y / (−6)                      = +fcd · 6,0e5         = +10 kN·m
```

pour `fcd = 25/1,5 = 16,667 MPa` (C25/30, `αcc = 1`). Le point d'application de la compression suit : `z_c = 160 mm`, `y_c = 26,667 mm`, et l'on vérifie `M_y = −N·z_c` et `M_z = +N·y_c`.

Ce cas unique prouve d'un coup l'effort normal, **les deux** composantes de moment, le point d'application de la résultante de compression, et le cas « aucune traction » (`ε ≥ 0` partout, donc résultante de traction nulle). La convergence vers ces valeurs exactes quand le nombre de bandes augmente est vérifiée en plus de la comparaison à tolérance.

Contrôle complémentaire, gratuit : sur un cas de flexion **simple** (`N = 0`), les deux résultantes sont égales en module et `M_Rd_magnitude = F · leverArm` exactement. Recoupement direct du bras de levier de §7.

### 9.5 Banc de comparaison VCASLU

Trois cas déviés, entièrement spécifiés dans le dépôt, à saisir et exécuter par l'utilisateur dans VCASLU. Ils sont choisis pour couvrir les trois familles de géométrie déjà supportées, chacune sollicitée à 30° ou 45° de l'axe fort :

1. **poteau rectangulaire** 300 × 500, ferraillage symétrique saisi via `rectangularRebarLayout`, effort normal de compression non nul ;
2. **section en T** (géométrie non convexe, la plus exigeante pour le balayage de spans), flexion simple déviée ;
3. **pieu circulaire** Ø600 à cage répartie, effort normal de compression non nul.

Tolérance de comparaison : **5 %** sur `M_Rd_magnitude`. Elle couvre l'approximation polygonale du cercle, la différence de schéma d'intégration et les écarts de détail du cadre normatif ; un écart supérieur n'est pas absorbé par un élargissement de seuil mais investigué et rapporté (§9.6).

- `docs/validation/vcaslu.md` — description des cas (géométrie, matériaux, ferraillage, sollicitation), unités, conventions de signe, marche à suivre de saisie, et correspondance normative : VCASLU travaille dans le cadre NTC, dont le seul écart de coefficient pertinent ici est `αcc = 0,85`. Le banc l'applique via un `NormProfile` dérivé **local aux fixtures**, sans introduire de preset public (§2).
- `tests/validation/vcaslu-cases.ts` — les cas, avec un champ `reference` valant `null` tant que l'utilisateur n'a pas saisi les valeurs relevées. Tant qu'il est nul, le test est **explicitement `skip` avec un message disant ce qu'il attend** ; dès qu'il est renseigné, la comparaison s'exécute à tolérance. La suite reste donc verte sans intervention, et devient un vrai contrôle croisé dès remplissage.

### 9.6 Discipline de tolérance

Aucune tolérance ne sera ajustée pour faire passer un test. Tout écart inattendu est investigué et rapporté, jamais absorbé par un élargissement de seuil.

## 10. Hors scope

Inchangé par rapport aux sessions précédentes : pivot acier, contours multiples et trous, précontrainte, méthode n (service), contrôle de ductilité, import DXF, interface utilisateur, PWA.

Reportés explicitement :

- **domaine d'interaction, taux d'exploitation et verdict** → session 4 ;
- **enregistrement / chargement de modèles** → session 3b, spec et plan distincts ;
- **intégrale fermée sur section non-convexe** (réserve ouverte depuis la session 2) → maintenue ouverte, redirigée vers la session 4, où la cohérence géométrique du domaine d'interaction la couvrira mieux qu'une analyse de cas isolée sur une section en T.

## 11. Réserves non bloquantes

- Le pas de balayage initial de 15° est un compromis entre coût et sûreté de détection ; le repli adaptatif à 5° puis 1° (§6.2) le rend sans conséquence sur la justesse, seulement sur le temps.
- Le choix conservatif en cas de racines multiples (§6.3) n'a été éprouvé sur aucun cas réel : aucune configuration de validation n'est attendue avec `rootCount > 1`. Si un cas s'en écarte, la règle est à réexaminer avec l'utilisateur, pas à contourner.
