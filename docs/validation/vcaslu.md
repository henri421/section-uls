# Banc de comparaison VCASLU — flexion composée déviée

VCASLU (Prof. P. Gelfi, Université de Brescia) sert de **banc de comparaison
externe**, jamais de source de code. Ce document décrit trois cas à saisir
dans VCASLU ; les valeurs relevées se reportent ensuite dans
`tests/validation/vcaslu-cases.ts`.

## Conventions

- Unités : mm, kN, kN·m, MPa.
- `N` **positif en compression**.
- Repère barycentrique : origine au centroïde de la section, `y` horizontal,
  `z` positif **vers le bas**.
- Seule la **direction** de `(My, Mz)` est utilisée par le module : la
  magnitude saisie n'influence pas le résultat. La grandeur à relever est la
  **magnitude du moment résistant** `√(M_Rd,y² + M_Rd,z²)`, en kN·m, à
  l'effort normal indiqué et dans la direction indiquée.

## Point normatif

VCASLU travaille dans le cadre NTC. Le seul écart de coefficient pertinent
ici est `αcc = 0,85` (contre 1,0 en valeur recommandée EC2). Le banc applique
donc un `NormProfile` dérivé, **local aux fixtures de test** : le module ne
publie qu'un seul profil, `EC2_recommended`, conformément à la décision du
projet. Vérifier dans VCASLU que `γc = 1,5`, `γs = 1,15`, `εc2 = 2,0‰`,
`εcu2 = 3,5‰`, loi parabole-rectangle, acier à branche horizontale.

Matériaux communs aux trois cas : béton **C25/30**, acier **B500**
(`Es = 200 000 MPa`).

## Cas 1 — Poteau rectangulaire 300 × 500

- Section : 300 (largeur, `y`) × 500 (hauteur, `z`).
- Enrobage 30, étriers HA8.
- Ferraillage : 3 HA20 en face inférieure, 3 HA20 en face supérieure.
  Distance d'axe = 30 + 8 + 10 = 48 mm de chaque face.
- `N = 800 kN` (compression).
- Direction du moment : 30° depuis l'axe fort, soit `(My, Mz) ∝ (cos 30°, sin 30°)`.
- **Valeur à relever :** magnitude de `M_Rd` (kN·m).

## Cas 2 — Section en T, flexion simple déviée

- Table 600 × 150 en partie supérieure ; âme 250 × 350 en dessous, centrée.
  Hauteur totale 500.
- Ferraillage : 3 HA20 en nappe inférieure, répartis de `y = 200` à `y = 400`
  à `z = 450` (coordonnées brutes, origine au coin supérieur gauche de la
  table, avant recentrage sur le centroïde).
- `N = 0` (flexion simple).
- Direction du moment : 45°, soit `(My, Mz) ∝ (1, 1)`.
- **Valeur à relever :** magnitude de `M_Rd` (kN·m).

## Cas 3 — Pieu circulaire Ø600

- Section circulaire Ø600 (le module l'approche par un polygone régulier à
  32 côtés ; c'est une source d'écart connue, couverte par la tolérance).
- Enrobage 50, spirale HA12.
- Cage : 8 HA20 répartis uniformément, rayon d'axe
  = 300 − 50 − 12 − 10 = 228 mm.
- `N = 1200 kN` (compression).
- Direction du moment : 45°, soit `(My, Mz) ∝ (1, 1)`.
- **Valeur à relever :** magnitude de `M_Rd` (kN·m).

## Marche à suivre

1. Saisir le cas dans VCASLU, relever la magnitude du moment résistant.
2. Reporter la valeur dans le champ `reference` du cas correspondant de
   `tests/validation/vcaslu-cases.ts` (elle vaut `null` par défaut, ce qui
   met le test de comparaison en `skip` explicite).
3. Relancer `npm test`.
4. **En cas d'écart supérieur à 5 %** : le rapporter et l'investiguer.
   Ne jamais élargir `TOLERANCE_RELATIVE` pour faire passer la comparaison.

## Valeurs calculées par le module

Ces valeurs sont le résultat produit **aujourd'hui** par `verifyBiaxial` sur
les trois cas ci-dessus (profil `banc_VCASLU_NTC`, `αcc = 0,85`). **Ce ne
sont pas des valeurs de référence** : elles ne valident rien par
elles-mêmes, ce ne sont que le résultat du module à confronter à VCASLU une
fois la saisie faite. Elles servent de point de repère au moment de saisir
dans VCASLU — un écart grossier avec ces chiffres se verra immédiatement.

| Cas | `M_Rd` (kN·m) | `rootCount` | `converged` |
| --- | ---: | :---: | :---: |
| 1 — Poteau rectangulaire 300×500 | 168,47 | 1 | oui |
| 2 — Section en T | 97,15 | 1 | oui |
| 3 — Pieu circulaire Ø600 | 359,06 | 1 | oui |
