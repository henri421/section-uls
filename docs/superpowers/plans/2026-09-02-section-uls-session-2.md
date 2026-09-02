# Section-ULS — Session 2 (géométrie polygonale, rectangle/T/L, sections circulaires) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Généraliser le noyau de session 1 (rectangle uniquement) à un contour polygonal quelconque (T, L, etc.) et aux sections circulaires (pieux), en flexion composée droite, avec non-régression prouvée contre la session 1 et un contrôle de convergence contre une intégration analytique fermée.

**Architecture:** Les géométries deviennent une union discriminée (`RectangularGeometry | PolygonGeometry`), chacune possédant son propre constructeur dans son fichier `geometry/*.ts` (plus de constructeur partagé dans `model/section.ts`). Toutes les coordonnées deviennent centrées sur le centroïde réel de la section (calculé par la formule du lacet pour un polygone), `z` positif vers le bas. `verifyUniaxial` distribue vers `integrateRectangle` ou `integratePolygon` selon la géométrie, la bissection elle-même restant identique.

**Tech Stack :** identique à la session 1 (TypeScript strict, Vitest, `tsc --noEmit`).

**Convention géométrique révisée (remplace celle de la session 1, sans changer aucun résultat numérique) :** origine au centroïde réel de la section, `z` positif vers le bas, `y` horizontal (inutilisé tant qu'on reste en flexion droite). Pour un rectangle, cela équivaut exactement à `z = depthFromTop - height/2` — une transformation isométrique qui préserve tous les résultats de la session 1 à l'identique. `N` reste positif en compression.

---

## Task 1 : Migrer `RebarLayer` vers `(y, z)` centré sur le centroïde

**Files:**
- Modify: `src/model/section.ts`
- Modify: `src/integration/fiber-rectangle.ts`
- Modify: `src/solvers/uls-uniaxial.ts`
- Modify: `tests/geometry/rectangle.test.ts`

`rectangularSection` reste dans `model/section.ts` pour cette tâche (le déménagement vers `geometry/rectangle.ts` est la Task 2, pour séparer les deux changements). Son paramètre d'entrée pour les armatures reste `depthFromTop` (familier pour un rectangle) — c'est la conversion interne vers `z` centré-centroïde qui change, pas l'API appelante. Conséquence importante : **aucun autre fichier de test de la session 1 n'a besoin d'être modifié** — ils construisent tous leurs sections via `depthFromTop`, qui reste l'API publique de `rectangularSection`.

- [ ] **Step 1 : Mettre à jour l'assertion du seul test qui inspecte le champ interne**

Dans `tests/geometry/rectangle.test.ts`, remplacer :
```ts
    expect(section.rebars[0].depthFromTop).toBe(450);
```
par :
```ts
    expect(section.rebars[0].z).toBe(200); // 450 - height/2 = 450 - 250
    expect(section.rebars[0].y).toBe(0);
```

- [ ] **Step 2 : Lancer ce test, vérifier l'échec**

Run: `npm test -- tests/geometry/rectangle.test.ts`
Expected: FAIL — `section.rebars[0].z` est `undefined` (le champ n'existe pas encore).

- [ ] **Step 3 : Migrer `RebarLayer` et `rectangularSection` dans `model/section.ts`**

Remplacer le contenu de `src/model/section.ts` par :

```ts
import type { ConcreteMaterial } from './concrete';
import type { SteelMaterial } from './steel';
import type { RectangularGeometry } from '../geometry/rectangle';

/**
 * Convention geometrique (fixee) : repere barycentrique centre sur le
 * centroide reel de la section, z positif vers le bas, y horizontal
 * (inutilise en flexion droite). N positif en compression.
 */
export interface RebarLayer {
  /** Position horizontale depuis le centroide (mm). Inutilise en flexion droite. */
  y: number;
  /** Position verticale depuis le centroide, positif vers le bas (mm). */
  z: number;
  /** Aire de l'armature (mm²). */
  area: number;
  steel: SteelMaterial;
}

export interface Section {
  geometry: RectangularGeometry;
  concrete: ConcreteMaterial;
  rebars: RebarLayer[];
}

export interface Action {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Moment flechissant (kN·m). */
  M: number;
}

export function rectangularSection(params: {
  width: number;
  height: number;
  concrete: ConcreteMaterial;
  rebars: Array<{ depthFromTop: number; area: number; steel: SteelMaterial }>;
}): Section {
  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars: params.rebars.map((r) => ({
      y: 0,
      z: r.depthFromTop - params.height / 2,
      area: r.area,
      steel: r.steel,
    })),
  };
}
```

- [ ] **Step 4 : Mettre à jour `integrateRectangle` pour lire `z` centre-centroide**

Remplacer le contenu de `src/integration/fiber-rectangle.ts` par :

```ts
import type { Section } from '../model/section';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';

export interface StressResultant {
  /** Effort normal resultant (kN), positif en compression. */
  N: number;
  /** Moment resultant autour du centroide (kN·m). */
  M: number;
}

/**
 * Methode des fibres par bandes horizontales. `strainAt(z)` donne la
 * deformation du champ lineaire suppose a une position verticale donnee
 * (mm depuis le centroide, positif vers le bas).
 */
export function integrateRectangle(
  section: Section,
  strainAt: (z: number) => number,
  nBands: number
): StressResultant {
  const { width, height } = section.geometry;
  const dz = height / nBands;
  const zTop = -height / 2;

  let N = 0;
  let M = 0;

  for (let i = 0; i < nBands; i++) {
    const zi = zTop + (i + 0.5) * dz;
    const eps = strainAt(zi);
    const sigma = concreteStress(eps, section.concrete);
    const force = sigma * width * dz;
    const arm = -zi;
    N += force;
    M += force * arm;
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.z);
    const steelSigma = steelStress(eps, rebar.steel);
    const displacedConcreteSigma = concreteStress(eps, section.concrete);
    const netForce = (steelSigma - displacedConcreteSigma) * rebar.area;
    const arm = -rebar.z;
    N += netForce;
    M += netForce * arm;
  }

  return { N: N / 1000, M: M / 1e6 };
}
```

- [ ] **Step 5 : Mettre à jour `verifyUniaxial` pour piloter le champ de déformation en `z`**

Dans `src/solvers/uls-uniaxial.ts`, remplacer la fonction `verifyUniaxial` par :

```ts
export function verifyUniaxial(section: Section, action: Action, norm: NormProfile): UniaxialResult {
  const { epsCu2 } = section.concrete;
  const height = section.geometry.height;
  const zTop = -height / 2;

  // La bissection suppose N_R(x) strictement croissante en x. C'est vrai pour
  // les combinaisons de materiaux EC2 usuelles : Es domine la raideur tangente
  // initiale du beton, et le champ de deformation construit ici ne fait jamais
  // depasser epsCu2 a aucune fibre, donc la branche "ecrasee" non monotone de
  // concreteStress reste inatteignable. A revoir si une loi beton plus raide
  // ou une branche descendante pour l'acier est introduite.
  //
  // strainField(x) : x = profondeur de l'axe neutre depuis la fibre
  // superieure. Pour z (centroide-relatif, positif vers le bas), la
  // profondeur depuis le sommet est (z - zTop).
  const strainField = (x: number) => (z: number) => epsCu2 * (1 - (z - zTop) / x);

  const netForceAt = (x: number): number => integrateRectangle(section, strainField(x), norm.nBands).N;

  const xLow = 1e-3;
  const xHigh = 100 * height;
  const target = action.N;

  const fLow = netForceAt(xLow) - target;
  const fHigh = netForceAt(xHigh) - target;

  if (fLow > 0 || fHigh < 0) {
    return { neutralAxisDepth: NaN, M_Rd: NaN, N_Rd: NaN, converged: false };
  }

  let lo = xLow;
  let hi = xHigh;
  let x = (lo + hi) / 2;

  for (let iter = 0; iter < 60; iter++) {
    x = (lo + hi) / 2;
    const f = netForceAt(x) - target;
    if (f < 0) lo = x; else hi = x;
  }

  const result = integrateRectangle(section, strainField(x), norm.nBands);

  return { neutralAxisDepth: x, M_Rd: result.M, N_Rd: result.N, converged: true };
}
```

(Le reste du fichier — imports, `UniaxialResult` — ne change pas.)

- [ ] **Step 6 : Lancer le test modifié, vérifier le succès**

Run: `npm test -- tests/geometry/rectangle.test.ts`
Expected: `1 passed`.

- [ ] **Step 7 : Lancer la suite complète — non-régression de la migration**

Run: `npm test`
Expected: **tous les tests de la session 1 passent avec exactement les mêmes résultats qu'avant** (aucune autre valeur attendue n'a changé dans le reste de la suite — c'est la preuve que la transformation de coordonnées est correcte). Si un test échoue ailleurs que `tests/geometry/rectangle.test.ts`, ne pas ajuster ses valeurs attendues : c'est un signal d'erreur dans la migration, pas dans le test.

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 8 : Commit**

```bash
git add src/model/section.ts src/integration/fiber-rectangle.ts src/solvers/uls-uniaxial.ts tests/geometry/rectangle.test.ts
git commit -m "refactor(model): RebarLayer en (y,z) centre-centroide, migration session 1"
```

---

## Task 2 : Déménager `rectangularSection` dans `geometry/rectangle.ts`

**Files:**
- Modify: `src/geometry/rectangle.ts`
- Modify: `src/model/section.ts`
- Modify: `src/index.ts`

Aucun fichier de test ne référence `rectangularSection` via `../../src/model/section` (ils utilisent déjà `../../src/geometry/rectangle`, grâce au ré-export ajouté en session 1) — seul `src/index.ts` a besoin d'un changement de chemin d'import.

- [ ] **Step 1 : Déplacer le constructeur dans `geometry/rectangle.ts`**

Remplacer le contenu de `src/geometry/rectangle.ts` par :

```ts
import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section } from '../model/section';

export interface RectangularGeometry {
  kind: 'rectangle';
  /** Largeur (mm). */
  width: number;
  /** Hauteur totale (mm). */
  height: number;
}

export function rectangularSection(params: {
  width: number;
  height: number;
  concrete: ConcreteMaterial;
  rebars: Array<{ depthFromTop: number; area: number; steel: SteelMaterial }>;
}): Section {
  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars: params.rebars.map((r) => ({
      y: 0,
      z: r.depthFromTop - params.height / 2,
      area: r.area,
      steel: r.steel,
    })),
  };
}
```

- [ ] **Step 2 : Retirer le constructeur de `model/section.ts`**

Retirer la fonction `rectangularSection` de `src/model/section.ts` (garder `RebarLayer`, `Section`, `Action` inchangés — c'est le seul changement de ce fichier pour cette tâche).

- [ ] **Step 3 : Mettre à jour l'import dans `src/index.ts`**

Remplacer :
```ts
export { rectangularSection } from './model/section';
```
par :
```ts
export { rectangularSection } from './geometry/rectangle';
```

- [ ] **Step 4 : Lancer la suite complète**

Run: `npm test`
Expected: tous les tests passent, sans aucun changement de valeur attendue (déplacement de code pur, aucune logique modifiée).

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 5 : Commit**

```bash
git add src/geometry/rectangle.ts src/model/section.ts src/index.ts
git commit -m "refactor(geometry): rectangularSection deplace dans geometry/rectangle.ts"
```

---

## Task 3 : `PolygonGeometry`, aire/centroïde (formule du lacet), `polygonSection`

**Files:**
- Create: `src/geometry/polygon.ts`
- Modify: `src/model/section.ts`
- Modify: `src/integration/fiber-rectangle.ts` (signature uniquement, pas de logique)
- Test: `tests/geometry/polygon.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `tests/geometry/polygon.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { polygonArea, polygonCentroid, polygonSection } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('polygonArea / polygonCentroid (formule du lacet)', () => {
  it('retrouve aire et centroide d un rectangle 300x500 defini par ses 4 coins bruts', () => {
    const vertices = [
      { y: 0, z: 0 },
      { y: 300, z: 0 },
      { y: 300, z: 500 },
      { y: 0, z: 500 },
    ];

    expect(polygonArea(vertices)).toBeCloseTo(150000, 6);
    const centroid = polygonCentroid(vertices);
    expect(centroid.y).toBeCloseTo(150, 6);
    expect(centroid.z).toBeCloseTo(250, 6);
  });

  it('retrouve aire et centroide d un triangle rectangle (cas independant du rectangle)', () => {
    // Triangle rectangle : angle droit a l'origine, cotes 300 (horizontal) et 400 (vertical).
    const vertices = [
      { y: 0, z: 0 },
      { y: 300, z: 0 },
      { y: 0, z: 400 },
    ];

    // Aire = base*hauteur/2 ; centroide = moyenne des sommets (proprietes standard du triangle).
    expect(polygonArea(vertices)).toBeCloseTo(60000, 6);
    const centroid = polygonCentroid(vertices);
    expect(centroid.y).toBeCloseTo(100, 6);
    expect(centroid.z).toBeCloseTo(133.3333, 3);
  });
});

describe('polygonSection', () => {
  it('centre les sommets et les armatures sur le centroide calcule', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);

    const section = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 300, z: 0 },
        { y: 300, z: 500 },
        { y: 0, z: 500 },
      ],
      concrete,
      rebars: [{ y: 150, z: 450, area: 1000, steel: null as never }],
    });

    if (section.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');
    // Coin (0,0) brut, centroide (150,250) -> translate en (-150,-250).
    expect(section.geometry.vertices[0].y).toBeCloseTo(-150, 6);
    expect(section.geometry.vertices[0].z).toBeCloseTo(-250, 6);

    // Armature (150,450) brute -> (0, 200), coherent avec depthFromTop=450
    // pour un rectangle 300x500 (Task 1 : 450 - 500/2 = 200).
    expect(section.rebars[0].y).toBeCloseTo(0, 6);
    expect(section.rebars[0].z).toBeCloseTo(200, 6);
  });
});
```

(`steel: null as never` est un raccourci volontaire : ce test ne vérifie que la géométrie/translation, pas le comportement de l'acier — pas besoin d'un vrai `SteelMaterial` ici.)

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- tests/geometry/polygon.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter `geometry/polygon.ts`**

```ts
import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section } from '../model/section';

export interface Vertex {
  y: number;
  z: number;
}

export interface PolygonGeometry {
  kind: 'polygon';
  /** Sommets ordonnes, contour simple unique, deja centres sur le centroide. */
  vertices: Vertex[];
}

/** Aire signee (formule du lacet). Positive ou negative selon le sens de parcours. */
function signedArea(vertices: Vertex[]): number {
  let sum = 0;
  const n = vertices.length;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    sum += a.y * b.z - b.y * a.z;
  }
  return sum / 2;
}

export function polygonArea(vertices: Vertex[]): number {
  return Math.abs(signedArea(vertices));
}

export function polygonCentroid(vertices: Vertex[]): Vertex {
  const A = signedArea(vertices);
  const n = vertices.length;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];
    const cross = a.y * b.z - b.y * a.z;
    cy += (a.y + b.y) * cross;
    cz += (a.z + b.z) * cross;
  }
  const factor = 1 / (6 * A);
  return { y: cy * factor, z: cz * factor };
}

export function polygonSection(params: {
  vertices: Vertex[];
  concrete: ConcreteMaterial;
  rebars: Array<{ y: number; z: number; area: number; steel: SteelMaterial }>;
}): Section {
  const centroid = polygonCentroid(params.vertices);

  const vertices = params.vertices.map((v) => ({ y: v.y - centroid.y, z: v.z - centroid.z }));
  const rebars = params.rebars.map((r) => ({
    y: r.y - centroid.y,
    z: r.z - centroid.z,
    area: r.area,
    steel: r.steel,
  }));

  return {
    geometry: { kind: 'polygon', vertices },
    concrete: params.concrete,
    rebars,
  };
}
```

- [ ] **Step 4 : Étendre `Section.geometry` à l'union et corriger la signature de `integrateRectangle`**

Dans `src/model/section.ts`, remplacer l'import et le type `Section` :

```ts
import type { ConcreteMaterial } from './concrete';
import type { SteelMaterial } from './steel';
import type { RectangularGeometry } from '../geometry/rectangle';
import type { PolygonGeometry } from '../geometry/polygon';

// ... RebarLayer inchange ...

export interface Section {
  geometry: RectangularGeometry | PolygonGeometry;
  concrete: ConcreteMaterial;
  rebars: RebarLayer[];
}

// ... Action inchange ...
```

Cette union casse la compilation de `integration/fiber-rectangle.ts`, qui lit `section.geometry.width`/`height` — ces champs n'existent que sur `RectangularGeometry`. Dans `src/integration/fiber-rectangle.ts`, changer uniquement la signature de la fonction (aucune ligne de logique interne ne change) :

```ts
export function integrateRectangle(
  section: Section & { geometry: RectangularGeometry },
  strainAt: (z: number) => number,
  nBands: number
): StressResultant {
```

Ajouter l'import nécessaire en tête de fichier :
```ts
import type { RectangularGeometry } from '../geometry/rectangle';
```

- [ ] **Step 5 : Lancer le test, vérifier le succès**

Run: `npm test -- tests/geometry/polygon.test.ts`
Expected: `3 passed`.

- [ ] **Step 6 : Lancer la suite complète — non-régression**

Run: `npm test`
Expected: tous les tests passent (le changement de signature de `integrateRectangle` est purement un raffinement de type, aucun appelant existant ne construit de section polygonale).

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 7 : Commit**

```bash
git add src/geometry/polygon.ts src/model/section.ts src/integration/fiber-rectangle.ts tests/geometry/polygon.test.ts
git commit -m "feat(geometry): PolygonGeometry, aire/centroide (formule du lacet), polygonSection"
```

---

## Task 4 : Balayage horizontal (largeur du polygone à une hauteur donnée)

**Files:**
- Create: `src/geometry/scanline.ts`
- Test: `tests/geometry/scanline.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `tests/geometry/scanline.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { polygonWidthAtZ } from '../../src/geometry/scanline';

describe('polygonWidthAtZ', () => {
  it('donne une largeur constante pour un rectangle centre sur son centroide', () => {
    // Rectangle 300x500 deja centre (comme produit par polygonSection).
    const vertices = [
      { y: -150, z: -250 },
      { y: 150, z: -250 },
      { y: 150, z: 250 },
      { y: -150, z: 250 },
    ];

    expect(polygonWidthAtZ(vertices, -200)).toBeCloseTo(300, 6);
    expect(polygonWidthAtZ(vertices, 0)).toBeCloseTo(300, 6);
    expect(polygonWidthAtZ(vertices, 200)).toBeCloseTo(300, 6);
  });

  it('donne une largeur variable (triangle, largeur nulle au sommet)', () => {
    // Triangle isocele, base en bas (z=100, largeur 300), sommet en haut (z=-100, y=0).
    const vertices = [
      { y: -150, z: 100 },
      { y: 150, z: 100 },
      { y: 0, z: -100 },
    ];

    // Au sommet exact : largeur nulle.
    expect(polygonWidthAtZ(vertices, -100)).toBeCloseTo(0, 6);
    // A mi-hauteur (z=0, a mi-chemin entre sommet -100 et base 100) : interpolation
    // lineaire de la largeur, de 0 (sommet) a 300 (base) -> largeur = 150.
    expect(polygonWidthAtZ(vertices, 0)).toBeCloseTo(150, 6);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- tests/geometry/scanline.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/geometry/scanline.ts` :

```ts
import type { Vertex } from './polygon';

export interface Span {
  yStart: number;
  yEnd: number;
}

/**
 * Portions horizontales du contour a la hauteur z (repere du polygone, deja
 * centre sur le centroide). Fonctionne pour un contour simple, convexe ou
 * non, sans trou. Convention demi-ouverte [zMin, zMax) par arete pour ne
 * jamais compter un sommet deux fois (les aretes horizontales ne
 * contribuent jamais, ce qui est le comportement correct).
 */
export function polygonSpansAtZ(vertices: Vertex[], z: number): Span[] {
  const crossings: number[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % n];

    const zMin = Math.min(a.z, b.z);
    const zMax = Math.max(a.z, b.z);

    if (z >= zMin && z < zMax) {
      const t = (z - a.z) / (b.z - a.z);
      const y = a.y + t * (b.y - a.y);
      crossings.push(y);
    }
  }

  crossings.sort((p, q) => p - q);

  const spans: Span[] = [];
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    spans.push({ yStart: crossings[i], yEnd: crossings[i + 1] });
  }
  return spans;
}

export function polygonWidthAtZ(vertices: Vertex[], z: number): number {
  return polygonSpansAtZ(vertices, z).reduce((sum, span) => sum + (span.yEnd - span.yStart), 0);
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- tests/geometry/scanline.test.ts`
Expected: `2 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/geometry/scanline.ts tests/geometry/scanline.test.ts
git commit -m "feat(geometry): balayage horizontal (largeur du polygone a une hauteur donnee)"
```

---

## Task 5 : Intégration par fibres généralisée (`integratePolygon`) + non-régression

**Files:**
- Create: `src/integration/fiber-polygon.ts`
- Test: `tests/integration/fiber-polygon.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `tests/integration/fiber-polygon.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('integratePolygon', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);

  it('non-regression : un rectangle modelise en polygone donne le meme resultat que integrateRectangle', () => {
    const width = 300;
    const height = 500;

    const rectSection = rectangularSection({ width, height, concrete, rebars: [] });
    const polySection = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: width, z: 0 },
        { y: width, z: height },
        { y: 0, z: height },
      ],
      concrete,
      rebars: [],
    });

    if (polySection.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');

    const strainAt = () => concrete.epsC2; // plateau, constante quel que soit z

    const rectResult = integrateRectangle(rectSection, strainAt, 200);
    const polyResult = integratePolygon(polySection, strainAt, 200);

    const relN = Math.abs(polyResult.N - rectResult.N) / Math.abs(rectResult.N);
    expect(relN).toBeLessThan(1e-9);
    expect(Math.abs(polyResult.M)).toBeLessThan(1e-6); // symetrie -> M quasi nul
    expect(Math.abs(rectResult.M)).toBeLessThan(1e-6);
  });

  it('largeur variable : un triangle asymetrique en hauteur donne un moment non nul', () => {
    const polySection = polygonSection({
      vertices: [
        { y: -150, z: 100 },
        { y: 150, z: 100 },
        { y: 0, z: -100 },
      ],
      concrete,
      rebars: [],
    });

    if (polySection.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');

    const strainAt = () => concrete.epsC2;
    const result = integratePolygon(polySection, strainAt, 200);

    expect(result.N).toBeGreaterThan(0);
    expect(Math.abs(result.M)).toBeGreaterThan(1); // pas de symetrie verticale ici
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- tests/integration/fiber-polygon.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/integration/fiber-polygon.ts` :

```ts
import type { Section } from '../model/section';
import type { PolygonGeometry } from '../geometry/polygon';
import { polygonWidthAtZ } from '../geometry/scanline';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';
import type { StressResultant } from './fiber-rectangle';

export function integratePolygon(
  section: Section & { geometry: PolygonGeometry },
  strainAt: (z: number) => number,
  nBands: number
): StressResultant {
  const { vertices } = section.geometry;
  const zValues = vertices.map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);
  const dz = (zBottom - zTop) / nBands;

  let N = 0;
  let M = 0;

  for (let i = 0; i < nBands; i++) {
    const zi = zTop + (i + 0.5) * dz;
    const eps = strainAt(zi);
    const sigma = concreteStress(eps, section.concrete);
    const width = polygonWidthAtZ(vertices, zi);
    const force = sigma * width * dz;
    const arm = -zi;
    N += force;
    M += force * arm;
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.z);
    const steelSigma = steelStress(eps, rebar.steel);
    const displacedConcreteSigma = concreteStress(eps, section.concrete);
    const netForce = (steelSigma - displacedConcreteSigma) * rebar.area;
    const arm = -rebar.z;
    N += netForce;
    M += netForce * arm;
  }

  return { N: N / 1000, M: M / 1e6 };
}
```

Rendre `StressResultant` exportable si ce n'est pas déjà le cas (vérifier `src/integration/fiber-rectangle.ts` — il l'est déjà depuis la session 1 : `export interface StressResultant`).

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- tests/integration/fiber-polygon.test.ts`
Expected: `2 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/integration/fiber-polygon.ts tests/integration/fiber-polygon.test.ts
git commit -m "feat(integration): methode des fibres generalisee au polygone + non-regression"
```

---

## Task 6 : Intégration analytique de contrôle (rectangle) + contrôle de convergence

**Files:**
- Create: `src/integration/analytical-rectangle.ts`
- Test: `tests/integration/analytical-rectangle.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `tests/integration/analytical-rectangle.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { analyticalRectangleResultant } from '../../src/integration/analytical-rectangle';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { polygonSection } from '../../src/geometry/polygon';
import { concreteStress } from '../../src/constitutive/concrete-law';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('analyticalRectangleResultant', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const width = 300;
  const height = 500;
  const x = 200; // profondeur d'axe neutre arbitraire, dans (0, height)

  it('correspond a une integration numerique tres fine, ecrite independamment', () => {
    const analytical = analyticalRectangleResultant(concrete, width, height, x);

    // Integration numerique tres fine (100000 bandes), ecrite ici directement,
    // sans passer par integrateRectangle/integratePolygon, pour verifier la
    // formule fermee de maniere independante.
    const nBands = 100000;
    const dz = height / nBands;
    const zTop = -height / 2;
    let N = 0;
    let M = 0;
    for (let i = 0; i < nBands; i++) {
      const zi = zTop + (i + 0.5) * dz;
      const depthFromTop = zi - zTop;
      const eps = concrete.epsCu2 * (1 - depthFromTop / x);
      const sigma = concreteStress(eps, concrete);
      const force = sigma * width * dz;
      N += force;
      M += force * -zi;
    }
    const numericN = N / 1000;
    const numericM = M / 1e6;

    expect(Math.abs(analytical.N - numericN) / numericN).toBeLessThan(1e-4);
    expect(Math.abs(analytical.M - numericM) / numericM).toBeLessThan(1e-4);
  });

  it('la methode des fibres generalisee (integratePolygon) converge vers l integration analytique', () => {
    const vertices = [
      { y: 0, z: 0 },
      { y: width, z: 0 },
      { y: width, z: height },
      { y: 0, z: height },
    ];
    const polySection = polygonSection({ vertices, concrete, rebars: [] });
    if (polySection.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');

    const zTop = -height / 2;
    const strainAt = (z: number) => concrete.epsCu2 * (1 - (z - zTop) / x);

    const analytical = analyticalRectangleResultant(concrete, width, height, x);

    const coarse = integratePolygon(polySection, strainAt, 10);
    const fine = integratePolygon(polySection, strainAt, 1000);

    const coarseError = Math.abs(coarse.M - analytical.M) / analytical.M;
    const fineError = Math.abs(fine.M - analytical.M) / analytical.M;

    expect(fineError).toBeLessThan(coarseError);
    expect(fineError).toBeLessThan(1e-4);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- tests/integration/analytical-rectangle.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/integration/analytical-rectangle.ts` :

```ts
import type { ConcreteMaterial } from '../model/concrete';

export interface ConcreteBlockResultant {
  /** Effort normal du bloc beton seul (kN), positif en compression. */
  N: number;
  /** Moment du bloc beton seul autour du centroide de la section (kN·m). */
  M: number;
}

/**
 * Integrale fermee du bloc parabole-rectangle (EN 1992-1-1 §3.1.7 eq.
 * 3.17-3.18), beton seul (pas d'armature). `x` = profondeur de l'axe
 * neutre depuis la fibre superieure (mm), pivot beton fixe a epsCu2 en
 * fibre superieure — meme convention que verifyUniaxial. Valide pour
 * 0 < x <= height. N en kN, M en kN·m autour du centroide de la section.
 *
 * Decomposition standard : zone plateau (0 a xi1, contrainte constante
 * fcd) et zone parabolique (xi1 a x, contrainte croissante de 0 a fcd) —
 * meme derivation que tests/handcalc/rectangular-beam-pure-bending.test.ts
 * (session 1), extraite ici en code de bibliotheque reutilisable.
 */
export function analyticalRectangleResultant(
  concrete: ConcreteMaterial,
  width: number,
  height: number,
  x: number
): ConcreteBlockResultant {
  const { fcd, epsC2, epsCu2 } = concrete;

  const xi1 = x * (1 - epsC2 / epsCu2);
  const Lp = x - xi1;
  const force1 = fcd * width * xi1;
  const force2 = (2 / 3) * fcd * width * Lp;
  const centre1 = xi1 / 2;
  const centre2 = xi1 + (3 * Lp) / 8;

  const forceTotal = force1 + force2; // N
  const centroidFromTop = (force1 * centre1 + force2 * centre2) / forceTotal; // mm

  return {
    N: forceTotal / 1000,
    M: (forceTotal * (height / 2 - centroidFromTop)) / 1e6,
  };
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- tests/integration/analytical-rectangle.test.ts`
Expected: `2 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/integration/analytical-rectangle.ts tests/integration/analytical-rectangle.test.ts
git commit -m "feat(integration): integration analytique de controle + convergence"
```

---

## Task 7 : Généraliser `verifyUniaxial` aux sections polygonales

**Files:**
- Modify: `src/solvers/uls-uniaxial.ts`
- Test: `tests/solvers/uls-uniaxial.test.ts` (ajout de cas, aucun cas existant modifié)

- [ ] **Step 1 : Ajouter les nouveaux tests**

Ajouter à `tests/solvers/uls-uniaxial.test.ts` (les imports et les 3 tests existants restent inchangés — ajouter ce qui suit à l'intérieur du même `describe`, plus les imports nécessaires en tête de fichier) :

Imports à ajouter :
```ts
import { polygonSection } from '../../src/geometry/polygon';
```

Tests à ajouter :
```ts
  it('donne le meme M_Rd qu avant generalisation pour une section rectangulaire (non-regression)', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    // Valeurs de reference, verifiees en session 1 (Task 9) et confirmees par
    // le calcul manuel independant (Task 11, ecart < 0.001%).
    expect(result.M_Rd).toBeCloseTo(215.184, 1);
    expect(result.neutralAxisDepth).toBeCloseTo(134.976, 1);
  });

  it('donne un M_Rd equivalent pour le meme rectangle modelise en polygone', () => {
    const width = 300;
    const height = 500;
    const depthFromTop = 450;

    const rectSection = rectangularSection({
      width,
      height,
      concrete,
      rebars: [{ area: As, depthFromTop, steel }],
    });

    const polySection = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: width, z: 0 },
        { y: width, z: height },
        { y: 0, z: height },
      ],
      concrete,
      rebars: [{ y: width / 2, z: depthFromTop, area: As, steel }],
    });

    const rectResult = verifyUniaxial(rectSection, { N: 0, M: 0 }, profile);
    const polyResult = verifyUniaxial(polySection, { N: 0, M: 0 }, profile);

    expect(polyResult.converged).toBe(true);
    const relError = Math.abs(polyResult.M_Rd - rectResult.M_Rd) / rectResult.M_Rd;
    expect(relError).toBeLessThan(1e-6);
  });

  it('converge sur une section en T (sanity check, sans valeur de reference precise)', () => {
    const vertices = [
      { y: 0, z: 0 },
      { y: 600, z: 0 },
      { y: 600, z: 150 },
      { y: 425, z: 150 },
      { y: 425, z: 500 },
      { y: 175, z: 500 },
      { y: 175, z: 150 },
      { y: 0, z: 150 },
    ];

    const section = polygonSection({
      vertices,
      concrete,
      rebars: [{ y: 300, z: 450, area: As, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
  });
```

- [ ] **Step 2 : Lancer ces tests, vérifier l'échec**

Run: `npm test -- tests/solvers/uls-uniaxial.test.ts`
Expected: FAIL — `verifyUniaxial` n'accepte pas encore de section polygonale (erreur de type ou `section.geometry.height` undefined pour un polygone).

- [ ] **Step 3 : Généraliser `verifyUniaxial`**

Remplacer le contenu de `src/solvers/uls-uniaxial.ts` par :

```ts
import type { Section, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import type { RectangularGeometry } from '../geometry/rectangle';
import type { PolygonGeometry } from '../geometry/polygon';
import { integrateRectangle } from '../integration/fiber-rectangle';
import { integratePolygon } from '../integration/fiber-polygon';
import type { StressResultant } from '../integration/fiber-rectangle';

export interface UniaxialResult {
  /** Profondeur de l'axe neutre depuis la fibre superieure (mm). */
  neutralAxisDepth: number;
  /** Moment resistant a l'effort normal impose (kN·m). */
  M_Rd: number;
  /** Effort normal resultant au point de convergence (kN), doit egaler action.N. */
  N_Rd: number;
  converged: boolean;
}

function zRange(section: Section): { zTop: number; zBottom: number } {
  if (section.geometry.kind === 'rectangle') {
    const { height } = section.geometry;
    return { zTop: -height / 2, zBottom: height / 2 };
  }
  const zValues = section.geometry.vertices.map((v) => v.z);
  return { zTop: Math.min(...zValues), zBottom: Math.max(...zValues) };
}

function integrate(section: Section, strainAt: (z: number) => number, nBands: number): StressResultant {
  if (section.geometry.kind === 'rectangle') {
    return integrateRectangle(section as Section & { geometry: RectangularGeometry }, strainAt, nBands);
  }
  return integratePolygon(section as Section & { geometry: PolygonGeometry }, strainAt, nBands);
}

/**
 * Verification ELU en flexion composee droite (EN 1992-1-1), pour une
 * section rectangulaire ou polygonale quelconque. Recherche par bissection
 * de la profondeur d'axe neutre x telle que N_R(x) = N_Ed, avec le champ de
 * deformation cale sur le pivot beton (fibre superieure a epsCu2) — voir
 * limitation documentee en tete du plan de session 1 concernant le pivot
 * acier (toujours valable : SteelMaterial n'a pas de limite de deformation
 * cette session).
 *
 * Le pivot est toujours en zTop (fibre la plus haute de la geometrie) : le
 * M_Rd retourne ne couvre donc que le sens de flexion "compression en fibre
 * superieure" pour la `section` fournie. Pour le sens oppose sur une
 * section a ferraillage asymetrique, l'appelant doit fournir une section
 * miroir (armatures et geometrie symetrisees en z).
 */
export function verifyUniaxial(section: Section, action: Action, norm: NormProfile): UniaxialResult {
  const { epsCu2 } = section.concrete;
  const { zTop, zBottom } = zRange(section);
  const totalDepth = zBottom - zTop;

  // La bissection suppose N_R(x) strictement croissante en x — voir la note
  // de la session 1 sur la raideur tangente du beton vs. l'acier.
  const strainField = (x: number) => (z: number) => epsCu2 * (1 - (z - zTop) / x);

  const netForceAt = (x: number): number => integrate(section, strainField(x), norm.nBands).N;

  const xLow = 1e-3;
  const xHigh = 100 * totalDepth;
  const target = action.N;

  const fLow = netForceAt(xLow) - target;
  const fHigh = netForceAt(xHigh) - target;

  if (fLow > 0 || fHigh < 0) {
    return { neutralAxisDepth: NaN, M_Rd: NaN, N_Rd: NaN, converged: false };
  }

  let lo = xLow;
  let hi = xHigh;
  let x = (lo + hi) / 2;

  for (let iter = 0; iter < 60; iter++) {
    x = (lo + hi) / 2;
    const f = netForceAt(x) - target;
    if (f < 0) lo = x; else hi = x;
  }

  const result = integrate(section, strainField(x), norm.nBands);

  return { neutralAxisDepth: x, M_Rd: result.M, N_Rd: result.N, converged: true };
}
```

Note : si le contrôle de flux de TypeScript sur `section.geometry.kind === 'rectangle'` dans `integrate` ne suffit pas à éliminer le besoin des casts `as Section & {...}` (cela dépend de la structure exacte de l'union une fois compilée), garder les casts tels quels — ils sont corrects et sûrs ici (le `if`/`else` garantit que le bon type est utilisé à l'exécution).

- [ ] **Step 4 : Lancer les tests, vérifier le succès**

Run: `npm test -- tests/solvers/uls-uniaxial.test.ts`
Expected: `6 passed` (3 tests de la session 1 + 3 nouveaux).

- [ ] **Step 5 : Lancer la suite complète**

Run: `npm test`
Expected: tous les tests passent, y compris `tests/handcalc/rectangular-beam-pure-bending.test.ts` et `tests/index.test.ts` (aucune régression sur le chemin rectangulaire).

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 6 : Commit**

```bash
git add src/solvers/uls-uniaxial.ts tests/solvers/uls-uniaxial.test.ts
git commit -m "feat(solvers): verifyUniaxial generalise aux sections polygonales"
```

---

## Task 8 : Sections circulaires (`circularSection`, `circularRebarCage`) — pieux

**Files:**
- Create: `src/geometry/circle.ts`
- Test: `tests/geometry/circle.test.ts`

- [ ] **Step 1 : Écrire le test**

Créer `tests/geometry/circle.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { polygonArea, polygonCentroid } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('circularSection', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const diameter = 600;
  const exactArea = Math.PI * (diameter / 2) ** 2;

  it('converge vers l aire theorique du cercle quand le nombre de segments augmente', () => {
    const coarse = circularSection({ diameter, concrete, rebars: [], segments: 8 });
    const fine = circularSection({ diameter, concrete, rebars: [], segments: 64 });

    if (coarse.geometry.kind !== 'polygon' || fine.geometry.kind !== 'polygon') {
      throw new Error('expected polygon geometry');
    }

    const coarseError = Math.abs(polygonArea(coarse.geometry.vertices) - exactArea) / exactArea;
    const fineError = Math.abs(polygonArea(fine.geometry.vertices) - exactArea) / exactArea;

    expect(fineError).toBeLessThan(coarseError);
    expect(fineError).toBeLessThan(0.005); // < 0.5% a 64 segments
  });

  it('centre le polygone sur son propre centroide (proche de (0,0))', () => {
    const section = circularSection({ diameter, concrete, rebars: [], segments: 32 });
    if (section.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');

    const centroid = polygonCentroid(section.geometry.vertices);
    expect(centroid.y).toBeCloseTo(0, 6);
    expect(centroid.z).toBeCloseTo(0, 6);
  });

  it('utilise 32 segments par defaut si non precise', () => {
    const section = circularSection({ diameter, concrete, rebars: [] });
    if (section.geometry.kind !== 'polygon') throw new Error('expected polygon geometry');
    expect(section.geometry.vertices).toHaveLength(32);
  });
});

describe('circularRebarCage', () => {
  it('genere le bon nombre de barres, toutes au meme rayon et de la bonne aire', () => {
    const steel = createSteel(500, 200000, ec2Recommended());
    const cage = circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel });

    expect(cage).toHaveLength(8);

    const expectedRadius = 600 / 2 - 50 - 20 / 2; // 240
    for (const bar of cage) {
      const r = Math.sqrt(bar.y ** 2 + bar.z ** 2);
      expect(r).toBeCloseTo(expectedRadius, 6);
    }

    const expectedArea = Math.PI * (20 / 2) ** 2;
    expect(cage[0].area).toBeCloseTo(expectedArea, 6);
  });
});
```

- [ ] **Step 2 : Lancer le test, vérifier l'échec**

Run: `npm test -- tests/geometry/circle.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : Implémenter**

Créer `src/geometry/circle.ts` :

```ts
import type { ConcreteMaterial } from '../model/concrete';
import type { SteelMaterial } from '../model/steel';
import type { Section } from '../model/section';
import type { Vertex } from './polygon';
import { polygonSection } from './polygon';

/**
 * Section circulaire, approximee par un polygone regulier a `segments`
 * cotes (defaut 32 — precision suffisante pour un usage bureau d'etudes ;
 * voir tests/geometry/circle.test.ts pour le controle de convergence).
 * Utile pour la verification de pieux et poteaux circulaires.
 */
export function circularSection(params: {
  diameter: number;
  concrete: ConcreteMaterial;
  rebars: Array<{ y: number; z: number; area: number; steel: SteelMaterial }>;
  segments?: number;
}): Section {
  const segments = params.segments ?? 32;
  const radius = params.diameter / 2;

  const vertices: Vertex[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    vertices.push({ y: radius * Math.cos(angle), z: radius * Math.sin(angle) });
  }

  return polygonSection({ vertices, concrete: params.concrete, rebars: params.rebars });
}

/**
 * Cage d'armatures reparties uniformement sur un cercle — modelise le
 * ferraillage typique d'un pieu fore ou d'un poteau circulaire.
 */
export function circularRebarCage(params: {
  diameter: number;
  cover: number;
  barDiameter: number;
  count: number;
  steel: SteelMaterial;
}): Array<{ y: number; z: number; area: number; steel: SteelMaterial }> {
  const cageRadius = params.diameter / 2 - params.cover - params.barDiameter / 2;
  const area = Math.PI * (params.barDiameter / 2) ** 2;

  const bars: Array<{ y: number; z: number; area: number; steel: SteelMaterial }> = [];
  for (let i = 0; i < params.count; i++) {
    const angle = (2 * Math.PI * i) / params.count;
    bars.push({
      y: cageRadius * Math.cos(angle),
      z: cageRadius * Math.sin(angle),
      area,
      steel: params.steel,
    });
  }
  return bars;
}
```

- [ ] **Step 4 : Lancer le test, vérifier le succès**

Run: `npm test -- tests/geometry/circle.test.ts`
Expected: `4 passed`.

- [ ] **Step 5 : Commit**

```bash
git add src/geometry/circle.ts tests/geometry/circle.test.ts
git commit -m "feat(geometry): sections circulaires (pieux) + cage d armatures"
```

---

## Task 9 : Calcul manuel indépendant — section en T (aire et centroïde)

**Files:**
- Create: `tests/handcalc/t-section-area-centroid.test.ts`

- [ ] **Step 1 : Écrire le calcul manuel et le comparer à la formule du lacet**

Créer `tests/handcalc/t-section-area-centroid.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { polygonArea, polygonCentroid } from '../../src/geometry/polygon';

describe('Section en T — aire et centroide, recalcul manuel par decomposition', () => {
  it('aire et centroide du polygone correspondent a la decomposition rectangle-par-rectangle', () => {
    // Table (aile) 600x150 en haut, ame (nervure) 250x350 en dessous, centree
    // sous la table. Origine du repere brut : coin superieur gauche de
    // l'aile, y vers la droite, z vers le bas.
    const vertices = [
      { y: 0, z: 0 },
      { y: 600, z: 0 },
      { y: 600, z: 150 },
      { y: 425, z: 150 },
      { y: 425, z: 500 },
      { y: 175, z: 500 },
      { y: 175, z: 150 },
      { y: 0, z: 150 },
    ];

    // --- Calcul manuel independant, par decomposition en deux rectangles ---
    const flangeArea = 600 * 150; // 90000 mm²
    const flangeCentroidZ = 150 / 2; // 75 mm, depuis le sommet

    const webArea = 250 * 350; // 87500 mm²
    const webCentroidZ = 150 + 350 / 2; // 325 mm, depuis le sommet

    const totalAreaHand = flangeArea + webArea; // 177500 mm²
    const centroidZHand = (flangeArea * flangeCentroidZ + webArea * webCentroidZ) / totalAreaHand;
    const centroidYHand = 300; // symetrie : aile (0-600) et ame (175-425) toutes deux centrees sur y=300

    expect(centroidZHand).toBeCloseTo(198.2394, 3);

    // --- Formule du lacet (geometry/polygon.ts) ---
    const area = polygonArea(vertices);
    const centroid = polygonCentroid(vertices);

    expect(area).toBeCloseTo(totalAreaHand, 6);
    expect(centroid.y).toBeCloseTo(centroidYHand, 6);
    expect(centroid.z).toBeCloseTo(centroidZHand, 3);
  });
});
```

- [ ] **Step 2 : Lancer le test**

Run: `npm test -- tests/handcalc/t-section-area-centroid.test.ts`
Expected: `1 passed`.

Si le test échoue : ne pas ajuster la tolérance. Vérifier d'abord si l'erreur vient du calcul manuel (relire la décomposition ci-dessus) ou de `polygonArea`/`polygonCentroid` (formule du lacet, Task 3) — documenter la cause avant de corriger.

- [ ] **Step 3 : Commit**

```bash
git add tests/handcalc/t-section-area-centroid.test.ts
git commit -m "test(handcalc): section en T - aire et centroide par decomposition"
```

---

## Task 10 : Vérification finale de la session 2

**Files:** aucun fichier nouveau — vérification de bout en bout.

- [ ] **Step 1 : Lancer la suite complète**

Run: `npm test`
Expected: tous les tests passent (session 1 complète, inchangée dans ses résultats, + tous les ajouts de session 2 : géométrie polygonale, balayage, intégration généralisée, intégration analytique, solveur généralisé, sections circulaires, calcul manuel T).

- [ ] **Step 2 : Lancer le typecheck**

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 3 : Vérifier l'état git**

Run: `git status`
Expected: working tree propre, tous les fichiers committés.

- [ ] **Step 4 : Commit de clôture (si nécessaire)**

S'il reste des fichiers non committés :

```bash
git add -A
git commit -m "chore: cloture session 2 - geometrie polygonale, rectangle/T/L, sections circulaires"
```

**Session 2 terminée.** Le noyau vérifie désormais une section de forme quelconque (rectangle, T, L, cercle pour les pieux) à l'ELU en flexion composée droite, avec non-régression prouvée contre la session 1 et convergence prouvée contre une intégration analytique indépendante. Prochaine étape : plan de la session 3 (flexion composée déviée), à rédiger séparément.
