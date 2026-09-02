# Spec — module `section-uls`, session 2 (géométrie polygonale, cas rectangulaire et circulaire)

**Statut :** approuvé pour développement.
**Source :** `PLAN_module_section-uls_Aedificium.md` section 6 (« Session 2 — Géométrie polygonale quelconque »), adapté sur les points ci-dessous après clarification avec l'utilisateur (2026-09-02).

## 1. Contexte et périmètre

Session 1 a livré un moteur ELU rectangulaire droit (voir `docs/superpowers/specs/2026-09-01-section-uls-sessions1-4-design.md` et le plan de session 1). Cette session généralise la géométrie à un contour polygonal quelconque, tout en restant en **flexion composée droite** (un seul axe de flexion, comme la session 1 — la flexion déviée avec rotation de l'axe neutre reste la session 3).

Décisions prises avec l'utilisateur (2026-09-02) :

- **Un seul contour, pas de trous.** Le plan d'origine prévoyait « contours multiples (trous) » dans cette session ; c'est repoussé à une session ultérieure pour garder celle-ci plus légère. Le polygone peut être non convexe (section en T, en L) mais reste un contour fermé unique.
- **Armatures généralisées en position 2D `(y, z)`**, conformément au modèle de données d'origine (section 4 du plan). Ceci implique une migration de la session 1 : `RebarLayer.depthFromTop` (scalaire) devient `RebarLayer.y` + `RebarLayer.z` (le champ `y` reste inutilisé par le solveur tant qu'on est en flexion droite, mais le modèle est prêt pour la session 3).
- **Inversion de la propriété géométrie/constructeur**, suite à la remarque de revue de la session 1 (Task 7) : `rectangularSection` déménage de `model/section.ts` vers `geometry/rectangle.ts`, son domicile canonique désormais. `model/section.ts` ne garde que les types partagés (`Section`, `RebarLayer`, `Action`) — plus de constructeur, plus de ré-export qui s'empile à chaque nouvelle géométrie.
- **Ajout de sections circulaires** (demande utilisateur, pour la vérification de pieux) : un cercle est traité comme un cas particulier de polygone — approximé par un contour à N côtés — donc aucune nouvelle mécanique de calcul n'est nécessaire. Deux constructeurs de confort sont ajoutés au-dessus des primitives polygonales : `circularSection` (génère le contour) et un générateur de cage d'armatures circulaire (positions réparties uniformément sur un cercle).
- **Câbles de précontrainte : toujours hors scope** (session 7, inchangé).
- **`verifyUniaxial` généralisé** pour accepter indifféremment une section rectangulaire ou polygonale : le solveur par bissection ne dépend pas de la forme, seule l'intégration en dépend. Sans cette généralisation, le support polygonal resterait inatteignable depuis l'API publique.

## 2. Modèle de données

### 2.1 Géométrie

`src/geometry/rectangle.ts` (migré depuis `model/section.ts`) :
- `RectangularGeometry` (inchangé : `kind: 'rectangle'`, `width`, `height`)
- `rectangularSection(params)` — déplacé ici, comportement inchangé

`src/geometry/polygon.ts` (nouveau) :
- `PolygonGeometry` : `{ kind: 'polygon', vertices: Array<{ y: number; z: number }> }` — liste ordonnée de sommets, contour unique, simple (non auto-intersectant).
- `polygonArea(vertices)` et `polygonCentroid(vertices)` : formule du lacet (shoelace), nécessaires car le repère barycentrique n'est plus trivialement `hauteur/2` comme pour le rectangle — c'est le véritable centroïde géométrique du contour.
- `polygonSection(params)` : assemble geometry + concrete + rebars, en calculant et en attachant le centroïde (évite de le recalculer à chaque bande lors de l'intégration).

`src/geometry/circle.ts` (nouveau) :
- `circularSection(params: { diameter, concrete, rebars, segments? })` : génère un `PolygonGeometry` approximant un cercle par un polygone régulier à `segments` côtés (défaut : 32 — précision largement suffisante pour un usage bureau d'études ; un nombre de côtés trop faible se voit dans le contrôle de convergence). Documenté explicitement comme une **approximation polygonale**, pas un traitement analytique exact du cercle.
- `circularRebarCage(params: { diameter, cover, barDiameter, count, steel })` : génère un tableau de `RebarLayer` réparti uniformément sur un cercle de rayon `diameter/2 - cover - barDiameter/2` — modélise la cage d'armatures typique d'un pieu foré ou d'un poteau circulaire.

### 2.2 Section et armatures

`src/model/section.ts` (réduit aux types partagés) :
- `RebarLayer` : `{ y: number; z: number; area: number; steel: SteelMaterial }` (remplace `depthFromTop`).
- `Section` : `geometry: RectangularGeometry | PolygonGeometry` (union), `concrete`, `rebars`.
- `Action` : inchangé.

**Convention géométrique révisée (remplace celle de la session 1) :** repère barycentrique centré sur le centroïde réel de la section (calculé, pas supposé à `hauteur/2`), `z` croissant vers le bas (cohérent avec la convention « profondeur depuis la fibre supérieure » de la session 1 — pour un rectangle symétrique, `z = depthFromTop - hauteur/2`, ce qui donne des résultats identiques). `y` horizontal, inutilisé par le solveur droit de cette session. N positif en compression, inchangé.

## 3. Géométrie de calcul

`src/geometry/scanline.ts` (nouveau) : fonction de balayage donnant, pour un contour polygonal simple et une hauteur `z` donnée, la ou les portions horizontales (« spans ») où le polygone existe à cette hauteur — par intersection de chaque arête avec la ligne `z = constante`, tri des abscisses d'intersection, appariement pair-impair. Fonctionne pour un contour convexe ou non (T, L), un seul contour, sans trou. C'est la brique géométrique qui permet à la méthode des fibres de calculer la largeur réelle de chaque bande, au lieu de la largeur constante utilisée pour le rectangle en session 1.

## 4. Intégration

`src/integration/fiber-polygon.ts` (nouveau) : généralise la méthode des fibres (même principe que `fiber-rectangle.ts` — bandes horizontales, contribution des armatures nette du béton déplacé) en utilisant la largeur de bande donnée par le balayage plutôt qu'une largeur constante. `src/integration/fiber-rectangle.ts` (session 1) **reste inchangé** — il sert de référence pour la porte de validation de non-régression.

`src/integration/analytical-rectangle.ts` (nouveau) : intégration fermée exacte du bloc parabole-rectangle pour un rectangle (même dérivation que `tests/handcalc/rectangular-beam-pure-bending.test.ts` de la session 1, mais exposée comme code de bibliothèque réutilisable plutôt qu'un calcul unique dans un test) — sert de référence de convergence pour `fiber-polygon.ts`.

## 5. Solveur

`src/solvers/uls-uniaxial.ts` : généralisé pour accepter `Section['geometry']` quel qu'il soit (`RectangularGeometry | PolygonGeometry`), en distribuant vers `integrateRectangle` ou `integratePolygon` selon `section.geometry.kind`. La logique de bissection elle-même ne change pas — elle ne connaît que `netForceAt(x)`, indépendant de la forme.

## 6. Stratégie de validation

Reprise du plan d'origine, sur le périmètre resserré de cette session :

1. **Non-régression** : une section rectangulaire modélisée comme polygone à 4 sommets, passée dans `integratePolygon`, donne un résultat numériquement identique (à la précision flottante près) à `integrateRectangle` sur la même section — même géométrie, même matériau, même champ de déformation.
2. **Convergence** : sur un rectangle modélisé en polygone, `integratePolygon` converge vers `analytical-rectangle.ts` quand le nombre de bandes augmente — contrôle indépendant de la méthode des fibres généralisée.
3. **Section circulaire** : un test de cohérence supplémentaire — aire et centroïde d'un `circularSection` approchent l'aire/centroïde théoriques d'un cercle exact (`π·r²`, centre géométrique) à une tolérance qui se resserre avec le nombre de segments, validant que l'approximation polygonale du cercle est correcte et convergente.
4. **Calculs manuels** : au moins un cas `tests/handcalc/` sur une section en T ou en L (aire et centroïde vérifiés à la main), en plus du contrôle analytique du rectangle.

## 7. Hors scope de cette spec

Contours multiples/trous, flexion déviée (axe neutre incliné), câbles de précontrainte, méthode n, ductilité, sections existantes, import DXF, UI, PWA — inchangé par rapport aux réserves de la session 1, plus le report explicite des trous décidé ci-dessus.

## 8. Réserve non bloquante

Le nombre de segments par défaut pour l'approximation d'un cercle (32) est un choix raisonnable mais arbitraire ; il reste configurable par l'appelant via le paramètre `segments`, et le contrôle de convergence (section 6.3) documente explicitement l'écart introduit par un nombre de segments donné.
