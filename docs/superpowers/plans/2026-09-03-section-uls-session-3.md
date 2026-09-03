# Session 3 — Flexion composée déviée — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** vérifier une section en béton armé à l'ELU sous `N + My + Mz` (axe neutre d'inclinaison inconnue), avec saisie d'armatures barre par barre et restitution du bras de levier interne.

**Architecture:** l'axe neutre incliné d'un angle `θ` est ramené à un axe neutre horizontal en tournant une **copie de travail** de la section ; le problème interne devient alors exactement celui de la session 2 et est résolu en appelant `verifyUniaxial` sans le modifier. Une intégration biaxiale rend les **deux** composantes de moment, ce qui permet une recherche de racine scalaire sur `θ` (balayage grossier, puis méthode d'Illinois) jusqu'à ce que le moment résistant soit colinéaire au moment sollicitant. L'API et les résultats restent exprimés dans le repère de la section : la rotation n'est jamais visible de l'extérieur.

**Tech Stack:** TypeScript strict (ESM), Vitest, npm. `tsc --noEmit` est le seul contrôle de lint. Aucune dépendance d'exécution.

**Spec de référence :** `docs/superpowers/specs/2026-09-03-section-uls-session-3-design.md`. En cas de contradiction entre ce plan et la spec, **la spec fait foi** — signaler la contradiction plutôt que de choisir silencieusement.

---

## Règles de travail (valables pour toutes les tâches)

- **TDD strict** : le test est écrit et exécuté **en échec** avant l'implémentation. Un test qui passe du premier coup est suspect : vérifier qu'il teste bien quelque chose.
- **Aucune tolérance de test n'est élargie pour faire passer un écart.** Si un écart inattendu apparaît, l'investiguer et le **rapporter**, jamais l'absorber.
- **Commit après chaque tâche**, message en français sans accents (convention du dépôt), sans ligne `Co-Authored-By`.
- **Identité git** : le dépôt est configuré en local sur `henri421 <henri421@users.noreply.github.com>`. Ne jamais la changer, ne jamais committer sous une autre identité.
- Commandes : `npm test` (suite complète), `npx vitest run <fichier>` (un fichier), `npm run typecheck`.
- Le code est en **français**, les commentaires expliquent le **pourquoi** normatif ou mécanique, pas le quoi.

## File Structure

| Fichier | Statut | Responsabilité |
|---|---|---|
| `src/geometry/rectangle.ts` | modifié | + `rectangleToPolygon`, + `rebars` acceptant des `RebarLayer[]` |
| `src/geometry/rebar-layout.ts` | **créé** | `rebarRow` (primitive) et `rectangularRebarLayout` (commodité) |
| `src/geometry/circle.ts` | modifié | `circularRebarCage` : + `stirrupDiameter` |
| `src/geometry/rotate.ts` | **créé** | rotation d'une section et d'un vecteur moment |
| `src/integration/fiber-polygon-biaxial.ts` | **créé** | intégration rendant `N`, `My`, `Mz` et les résultantes séparées |
| `src/solvers/uls-uniaxial.ts` | modifié | extraction du champ de déformation en fonction exportée (refactor sans changement de comportement) |
| `src/solvers/uls-biaxial.ts` | **créé** | `verifyBiaxial` : balayage + Illinois sur `θ` |
| `src/index.ts` | modifié | exports session 3 **et correctif des exports session 2 manquants** |
| `docs/validation/vcaslu.md` | **créé** | protocole du banc de comparaison |
| `tests/validation/vcaslu-cases.ts` | **créé** | fixtures du banc, `reference: null` tant que non renseigné |

**Non modifiés, et c'est délibéré :** `src/geometry/scanline.ts`, `src/geometry/polygon.ts`, `src/integration/fiber-polygon.ts`, `src/integration/fiber-rectangle.ts`. Ils sont les témoins de non-régression des sessions 1 et 2. Si une tâche semble exiger de les modifier, **s'arrêter et le signaler** au lieu de le faire.

---

### Task 1 : `rectangleToPolygon`

Un rectangle tourné n'est plus aligné sur les axes : le solveur dévié travaille exclusivement sur des polygones.

**Files:**
- Modify: `src/geometry/rectangle.ts`
- Test: `tests/geometry/rectangle.test.ts`

- [ ] **Step 1 : écrire le test en échec**

Ajouter à `tests/geometry/rectangle.test.ts` (garder les `import` existants, ajouter ceux qui manquent) :

```ts
import { rectangleToPolygon } from '../../src/geometry/rectangle';
import { polygonArea, polygonCentroid } from '../../src/geometry/polygon';

describe('rectangleToPolygon', () => {
  it('produit un contour a quatre sommets, centre sur le centroide, de meme aire', () => {
    const poly = rectangleToPolygon({ kind: 'rectangle', width: 300, height: 500 });

    expect(poly.kind).toBe('polygon');
    expect(poly.vertices).toHaveLength(4);
    expect(polygonArea(poly.vertices)).toBeCloseTo(300 * 500, 6);

    const c = polygonCentroid(poly.vertices);
    expect(c.y).toBeCloseTo(0, 9);
    expect(c.z).toBeCloseTo(0, 9);

    // z vers le bas : la fibre superieure est a -height/2
    const zs = poly.vertices.map((v) => v.z);
    expect(Math.min(...zs)).toBeCloseTo(-250, 9);
    expect(Math.max(...zs)).toBeCloseTo(250, 9);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/geometry/rectangle.test.ts`
Expected: FAIL — `rectangleToPolygon is not a function` (ou erreur de typage à l'import).

- [ ] **Step 3 : implémenter**

Dans `src/geometry/rectangle.ts`, ajouter l'import de type et la fonction :

```ts
import type { PolygonGeometry } from './polygon';

/**
 * Contour polygonal equivalent a un rectangle, dans le repere barycentrique
 * (origine au centre, z vers le bas). Necessaire des que la section doit
 * etre tournee : un rectangle tourne n'est plus aligne sur les axes, donc
 * n'est plus representable par une `RectangularGeometry`.
 */
export function rectangleToPolygon(geometry: RectangularGeometry): PolygonGeometry {
  const { width: b, height: h } = geometry;
  return {
    kind: 'polygon',
    vertices: [
      { y: -b / 2, z: -h / 2 },
      { y: +b / 2, z: -h / 2 },
      { y: +b / 2, z: +h / 2 },
      { y: -b / 2, z: +h / 2 },
    ],
  };
}
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/geometry/rectangle.test.ts`
Expected: PASS.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/geometry/rectangle.ts tests/geometry/rectangle.test.ts
git commit -m "feat(geometry): conversion rectangle vers contour polygonal"
```

---

### Task 2 : `rebarRow` — primitive de lit d'armatures

**Files:**
- Create: `src/geometry/rebar-layout.ts`
- Test: `tests/geometry/rebar-layout.test.ts`

Rappel mécanique à porter en commentaire dans le fichier : en flexion déviée, un lit ne peut plus être forfaitisé en un point unique, car deux barres du même lit à des `y` différents n'ont pas la même déformation quand l'axe neutre est incliné.

- [ ] **Step 1 : écrire le test en échec**

Créer `tests/geometry/rebar-layout.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { rebarRow } from '../../src/geometry/rebar-layout';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const steel = createSteel(500, 200000, ec2Recommended());

describe('rebarRow', () => {
  it('mode count : n barres reparties uniformement, extremites incluses', () => {
    const row = rebarRow({
      from: { y: -150, z: 200 },
      to: { y: 150, z: 200 },
      bars: { count: 4, diameter: 20 },
      steel,
    });

    expect(row.bars).toHaveLength(4);
    expect(row.bars.map((b) => b.y)).toEqual([-150, -50, 50, 150]);
    expect(row.bars.every((b) => b.z === 200)).toBe(true);

    const aireUneBarre = (Math.PI * 20 ** 2) / 4; // 314.159 mm²
    expect(row.bars[0].area).toBeCloseTo(aireUneBarre, 9);
    expect(row.summary).toEqual({
      count: 4,
      diameter: 20,
      spacing: 100,
      totalArea: 4 * aireUneBarre,
    });
  });

  it('mode count : une barre unique est placee au milieu du segment', () => {
    const row = rebarRow({
      from: { y: -150, z: 0 },
      to: { y: 150, z: 0 },
      bars: { count: 1, diameter: 12 },
      steel,
    });

    expect(row.bars).toHaveLength(1);
    expect(row.bars[0].y).toBeCloseTo(0, 9);
    expect(row.summary.spacing).toBe(0);
  });

  it('mode maxSpacing : l espacement demande est un MAXIMUM, jamais depasse', () => {
    // 400 mm utiles, "Ø12 tous les 150" -> ceil(400/150) = 3 intervalles,
    // donc 4 barres a 133.3 mm reels. Jamais 3 barres a 150 avec un
    // intervalle residuel de 100 en bout.
    const row = rebarRow({
      from: { y: -200, z: 0 },
      to: { y: 200, z: 0 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
    });

    expect(row.bars).toHaveLength(4);
    expect(row.summary.spacing).toBeCloseTo(400 / 3, 9);
    expect(row.summary.spacing).toBeLessThanOrEqual(150);
    expect(row.bars[0].y).toBeCloseTo(-200, 9);
    expect(row.bars[3].y).toBeCloseTo(200, 9);
  });

  it('endpoints exclude : seules les barres intermediaires sont posees', () => {
    // Lit lateral d'un poteau : les barres d'angle appartiennent deja aux
    // lits inferieur et superieur, il ne faut pas les compter deux fois.
    const row = rebarRow({
      from: { y: -100, z: -200 },
      to: { y: -100, z: 200 },
      bars: { count: 3, diameter: 16 },
      steel,
      endpoints: 'exclude',
    });

    expect(row.bars).toHaveLength(3);
    expect(row.bars.map((b) => b.z)).toEqual([-100, 0, 100]);
    expect(row.bars.every((b) => b.y === -100)).toBe(true);
  });

  it('endpoints exclude en mode maxSpacing : ceil(L/s) - 1 barres intermediaires', () => {
    const row = rebarRow({
      from: { y: 0, z: -200 },
      to: { y: 0, z: 200 },
      bars: { diameter: 12, maxSpacing: 150 },
      steel,
      endpoints: 'exclude',
    });

    // ceil(400/150) = 3 intervalles -> 2 barres intermediaires a 133.3 mm
    expect(row.bars).toHaveLength(2);
    expect(row.summary.spacing).toBeCloseTo(400 / 3, 9);
  });

  it('un lit vide est licite et ne renvoie aucune barre', () => {
    const row = rebarRow({
      from: { y: 0, z: 0 },
      to: { y: 0, z: 100 },
      bars: { count: 0, diameter: 12 },
      steel,
    });

    expect(row.bars).toHaveLength(0);
    expect(row.summary.totalArea).toBe(0);
  });

  it('rejette un nombre de barres negatif et un espacement non positif', () => {
    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { count: -1, diameter: 12 }, steel })
    ).toThrow();

    expect(() =>
      rebarRow({ from: { y: 0, z: 0 }, to: { y: 100, z: 0 }, bars: { diameter: 12, maxSpacing: 0 }, steel })
    ).toThrow();
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/geometry/rebar-layout.test.ts`
Expected: FAIL — le module `src/geometry/rebar-layout.ts` n'existe pas.

- [ ] **Step 3 : implémenter**

Créer `src/geometry/rebar-layout.ts` :

```ts
import type { RebarLayer } from '../model/section';
import type { SteelMaterial } from '../model/steel';
import type { Vertex } from './polygon';

/** Lit defini par un nombre de barres et leur diametre. */
export interface BarCount {
  count: number;
  diameter: number;
}

/** Lit defini par un diametre et un espacement MAXIMAL (style "Ø12 tous les 150"). */
export interface BarSpacing {
  diameter: number;
  maxSpacing: number;
}

export type BarSpec = BarCount | BarSpacing;

/** Recapitulatif d'un lit, destine a la relecture et a l'affichage. */
export interface RowSummary {
  count: number;
  diameter: number;
  /** Espacement reel entre points de division (mm), 0 si moins de deux barres. */
  spacing: number;
  totalArea: number;
}

export interface RebarRow {
  bars: RebarLayer[];
  summary: RowSummary;
}

function barArea(diameter: number): number {
  return (Math.PI * diameter ** 2) / 4;
}

/**
 * Un lit d'armatures le long d'un segment quelconque du plan.
 *
 * Chaque barre devient un `RebarLayer` distinct : c'est une condition de
 * JUSTESSE en flexion deviee, pas un confort de saisie. Un lit forfaitise en
 * un point unique donnerait un resultat faux des que l'axe neutre est
 * incline, puisque deux barres du meme lit a des `y` differents n'ont alors
 * pas la meme deformation.
 *
 * `endpoints: 'exclude'` pose uniquement les barres intermediaires : c'est le
 * mode des lits lateraux d'un poteau, dont les barres d'angle appartiennent
 * deja aux lits inferieur et superieur. Sans lui, un poteau "4 + 4 + 2 + 2"
 * compterait 16 barres au lieu de 12.
 */
export function rebarRow(params: {
  from: Vertex;
  to: Vertex;
  bars: BarSpec;
  steel: SteelMaterial;
  endpoints?: 'include' | 'exclude';
}): RebarRow {
  const { from, to, steel } = params;
  const endpoints = params.endpoints ?? 'include';
  const { diameter } = params.bars;
  const length = Math.hypot(to.y - from.y, to.z - from.z);

  let count: number;
  let intervals: number;

  if ('count' in params.bars) {
    count = params.bars.count;
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`rebarRow : nombre de barres invalide (${count})`);
    }
    intervals = endpoints === 'include' ? Math.max(count - 1, 0) : count + 1;
  } else {
    const { maxSpacing } = params.bars;
    if (!(maxSpacing > 0)) {
      throw new Error(`rebarRow : maxSpacing doit etre strictement positif (${maxSpacing})`);
    }
    if (length === 0) {
      intervals = 0;
      count = endpoints === 'include' ? 1 : 0;
    } else {
      intervals = Math.ceil(length / maxSpacing);
      count = endpoints === 'include' ? intervals + 1 : intervals - 1;
    }
  }

  const spacing = intervals > 0 && count > 1 ? length / intervals : 0;
  const positions: number[] = [];

  if (count === 1 && endpoints === 'include') {
    positions.push(0.5); // barre unique : milieu du segment
  } else if (endpoints === 'include') {
    for (let k = 0; k < count; k++) positions.push(count === 1 ? 0.5 : k / (count - 1));
  } else {
    for (let k = 1; k <= count; k++) positions.push(k / (count + 1));
  }

  const area = barArea(diameter);
  const bars: RebarLayer[] = positions.map((t) => ({
    y: from.y + t * (to.y - from.y),
    z: from.z + t * (to.z - from.z),
    area,
    steel,
  }));

  return {
    bars,
    summary: { count: bars.length, diameter, spacing, totalArea: bars.length * area },
  };
}

/** Rendu lisible d'un lit, par exemple "4 HA12 @ 133 mm = 452 mm²". */
export function formatRow(summary: RowSummary): string {
  const aire = `${Math.round(summary.totalArea)} mm²`;
  if (summary.count < 2) return `${summary.count} HA${summary.diameter} = ${aire}`;
  return `${summary.count} HA${summary.diameter} @ ${Math.round(summary.spacing)} mm = ${aire}`;
}
```

**Attention au piège du mode `exclude` en `count`** : `intervals = count + 1` sert au calcul de `spacing` (les barres intermédiaires divisent le segment en `count + 1` parts), tandis qu'en mode `include` c'est `count - 1`. Le test « endpoints exclude » ci-dessus fixe le comportement attendu ; ne pas l'ajuster.

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/geometry/rebar-layout.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/geometry/rebar-layout.ts tests/geometry/rebar-layout.test.ts
git commit -m "feat(geometry): lit d armatures barre par barre, par nombre ou par espacement maximal"
```

---

### Task 3 : `rectangularRebarLayout` — l'idiome de saisie

**Files:**
- Modify: `src/geometry/rebar-layout.ts`
- Test: `tests/geometry/rebar-layout.test.ts`

Chaîne de saisie réelle : **distance d'axe = enrobage + Ø étrier + Ø barre / 2**, appliquée en profondeur comme latéralement, avec le diamètre du lit concerné.

- [ ] **Step 1 : écrire le test en échec**

Ajouter à `tests/geometry/rebar-layout.test.ts` :

```ts
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';

describe('rectangularRebarLayout', () => {
  it('positionne les barres selon enrobage + etrier + demi-diametre', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    });

    const a = 30 + 8 + 10; // 48 mm d'axe
    expect(layout.bars).toHaveLength(3);
    expect(layout.bars.every((b) => b.z === 600 / 2 - a)).toBe(true); // 252, z vers le bas
    expect(layout.bars.map((b) => b.y)).toEqual([-(200 - a), 0, 200 - a]); // -152, 0, 152
  });

  it('face top : le lit est place du cote de la fibre superieure (z negatif)', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'top', bars: { count: 2, diameter: 20 } }],
    });

    expect(layout.bars.every((b) => b.z === -(600 / 2 - 48))).toBe(true); // -252
  });

  it('les lits lateraux ne redoublent pas les barres d angle : 4+4+2+2 donne 12 barres', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 4, diameter: 20 } },
        { face: 'top', bars: { count: 4, diameter: 20 } },
        { face: 'left', bars: { count: 2, diameter: 20 } },
        { face: 'right', bars: { count: 2, diameter: 20 } },
      ],
    });

    expect(layout.bars).toHaveLength(12);

    // Aucune position dupliquee (le controle qui attrape le double comptage).
    const cles = new Set(layout.bars.map((b) => `${b.y.toFixed(6)}:${b.z.toFixed(6)}`));
    expect(cles.size).toBe(12);

    // Les lits lateraux sont bien a l'interieur, jamais sur les coins.
    const zAngles = [600 / 2 - 48, -(600 / 2 - 48)];
    const lateraux = layout.bars.filter((b) => Math.abs(Math.abs(b.y) - (200 - 48)) < 1e-9);
    expect(lateraux).toHaveLength(4 + 4); // 4 barres d'angle des lits bas/haut + 4 laterales
    expect(lateraux.filter((b) => !zAngles.some((z) => Math.abs(b.z - z) < 1e-9))).toHaveLength(4);
  });

  it('un recapitulatif est rendu par lit, dans l ordre de saisie', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { diameter: 12, maxSpacing: 150 } },
      ],
    });

    expect(layout.rows).toHaveLength(2);
    expect(layout.rows[0].count).toBe(3);
    expect(layout.rows[0].diameter).toBe(20);
    expect(layout.rows[1].diameter).toBe(12);
    expect(layout.rows[1].spacing).toBeLessThanOrEqual(150);
  });

  it('stirrupDiameter est optionnel et vaut 0 par defaut', () => {
    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      steel,
      rows: [{ face: 'bottom', bars: { count: 2, diameter: 20 } }],
    });

    expect(layout.bars[0].z).toBeCloseTo(300 - (30 + 10), 9); // 260
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/geometry/rebar-layout.test.ts`
Expected: FAIL — `rectangularRebarLayout is not a function`.

- [ ] **Step 3 : implémenter**

Ajouter à `src/geometry/rebar-layout.ts` :

```ts
export type RowFace = 'top' | 'bottom' | 'left' | 'right';

/**
 * Ferraillage d'une section rectangulaire dans l'idiome de saisie usuel :
 * enrobage, diametre d'etrier, puis un lit par face defini soit par un
 * nombre de barres, soit par un espacement maximal.
 *
 * Distance d'axe = enrobage + Ø etrier + Ø barre / 2, avec le diametre du
 * lit concerne, appliquee en profondeur comme lateralement.
 *
 * Les lits lateraux ('left'/'right') sont poses en mode 'exclude' : leurs
 * barres d'extremite seraient les barres d'angle, deja posees par les lits
 * 'bottom' et 'top'. Un poteau "4 + 4 + 2 + 2" donne donc 12 barres.
 *
 * Repere de sortie : barycentrique (origine au centre du rectangle), z vers
 * le bas — directement consommable par `rectangularSection`.
 */
export function rectangularRebarLayout(params: {
  width: number;
  height: number;
  cover: number;
  stirrupDiameter?: number;
  steel: SteelMaterial;
  rows: Array<{ face: RowFace; bars: BarSpec }>;
}): { bars: RebarLayer[]; rows: RowSummary[] } {
  const { width: b, height: h, cover, steel } = params;
  const stirrup = params.stirrupDiameter ?? 0;

  const bars: RebarLayer[] = [];
  const summaries: RowSummary[] = [];

  for (const row of params.rows) {
    const a = cover + stirrup + row.bars.diameter / 2;
    const yGauche = -b / 2 + a;
    const yDroite = b / 2 - a;
    const zHaut = -h / 2 + a;
    const zBas = h / 2 - a;

    let from: Vertex;
    let to: Vertex;
    let endpoints: 'include' | 'exclude';

    switch (row.face) {
      case 'bottom':
        from = { y: yGauche, z: zBas };
        to = { y: yDroite, z: zBas };
        endpoints = 'include';
        break;
      case 'top':
        from = { y: yGauche, z: zHaut };
        to = { y: yDroite, z: zHaut };
        endpoints = 'include';
        break;
      case 'left':
        from = { y: yGauche, z: zHaut };
        to = { y: yGauche, z: zBas };
        endpoints = 'exclude';
        break;
      case 'right':
        from = { y: yDroite, z: zHaut };
        to = { y: yDroite, z: zBas };
        endpoints = 'exclude';
        break;
    }

    const built = rebarRow({ from, to, bars: row.bars, steel, endpoints });
    bars.push(...built.bars);
    summaries.push(built.summary);
  }

  return { bars, rows: summaries };
}
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/geometry/rebar-layout.test.ts`
Expected: PASS, 12 tests au total dans le fichier.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/geometry/rebar-layout.ts tests/geometry/rebar-layout.test.ts
git commit -m "feat(geometry): ferraillage rectangle par faces, sans double comptage des barres d angle"
```

---

### Task 4 : brancher le ferraillage sur les constructeurs existants

`rectangularRebarLayout` produit des armatures réellement positionnées ; `rectangularSection` les place aujourd'hui toutes à `y = 0`. Sans cette tâche, le ferraillage de la tâche 3 est inutilisable avec la géométrie pour laquelle il est écrit.

**Files:**
- Modify: `src/geometry/rectangle.ts`
- Modify: `src/geometry/circle.ts`
- Test: `tests/geometry/rectangle.test.ts`, `tests/geometry/circle.test.ts`

- [ ] **Step 1 : écrire les tests en échec**

Ajouter à `tests/geometry/rectangle.test.ts` :

```ts
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';

describe('rectangularSection — armatures deja positionnees', () => {
  it('accepte des RebarLayer et conserve leurs coordonnees telles quelles', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const layout = rectangularRebarLayout({
      width: 400,
      height: 600,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [{ face: 'bottom', bars: { count: 3, diameter: 20 } }],
    });

    const section = rectangularSection({ width: 400, height: 600, concrete, rebars: layout.bars });

    expect(section.rebars).toHaveLength(3);
    expect(section.rebars.map((r) => r.y)).toEqual([-152, 0, 152]);
    expect(section.rebars.every((r) => r.z === 252)).toBe(true);
  });

  it('la forme historique depthFromTop reste inchangee', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ depthFromTop: 450, area: 1000, steel }],
    });

    expect(section.rebars[0].y).toBe(0);
    expect(section.rebars[0].z).toBe(200);
  });
});
```

Ajouter à `tests/geometry/circle.test.ts` :

```ts
describe('circularRebarCage — diametre d etrier', () => {
  it('la spirale reduit le rayon de la cage', () => {
    const steel = createSteel(500, 200000, ec2Recommended());

    const sans = circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 6, steel });
    const avec = circularRebarCage({
      diameter: 600,
      cover: 50,
      barDiameter: 20,
      count: 6,
      steel,
      stirrupDiameter: 12,
    });

    const rayon = (b: { y: number; z: number }) => Math.hypot(b.y, b.z);
    expect(rayon(sans[0])).toBeCloseTo(300 - 50 - 10, 9); // 240
    expect(rayon(avec[0])).toBeCloseTo(300 - 50 - 12 - 10, 9); // 228
  });
});
```

- [ ] **Step 2 : lancer les tests, vérifier l'échec**

Run: `npx vitest run tests/geometry/rectangle.test.ts tests/geometry/circle.test.ts`
Expected: FAIL — erreur de typage sur `rebars: layout.bars`, et `stirrupDiameter` inconnu.

- [ ] **Step 3 : implémenter**

Dans `src/geometry/rectangle.ts`, remplacer la signature et le corps de `rectangularSection` :

```ts
import type { Section, RebarLayer } from '../model/section';

type RebarParDepth = { depthFromTop: number; area: number; steel: SteelMaterial };

/**
 * Constructeur rectangle. Le parametre `rebars` accepte deux formes :
 *
 * - `depthFromTop` (forme historique, session 1) : cotation depuis la fibre
 *   superieure, usage naturel pour un enrobage de poutre. Les barres sont
 *   alors placees a `y = 0` — suffisant en flexion droite, ou seule la
 *   position verticale intervient.
 * - `RebarLayer[]` deja positionnes en `(y, z)` barycentriques, ce que
 *   produit `rectangularRebarLayout`. Indispensable en flexion deviee, ou la
 *   position horizontale de chaque barre change sa deformation.
 */
export function rectangularSection(params: {
  width: number;
  height: number;
  concrete: ConcreteMaterial;
  rebars: RebarParDepth[] | RebarLayer[];
}): Section & { geometry: RectangularGeometry } {
  const rebars: RebarLayer[] = params.rebars.map((r) =>
    'depthFromTop' in r
      ? { y: 0, z: r.depthFromTop - params.height / 2, area: r.area, steel: r.steel }
      : r
  );

  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars,
  };
}
```

Dans `src/geometry/circle.ts`, ajouter le paramètre à `circularRebarCage` (signature et calcul du rayon) :

```ts
export function circularRebarCage(params: {
  diameter: number;
  cover: number;
  barDiameter: number;
  count: number;
  steel: SteelMaterial;
  /** Diametre de la spirale ou des cerces (mm). Defaut 0 : comportement session 2. */
  stirrupDiameter?: number;
  rotationOffset?: number;
}): RebarLayer[] {
  const stirrup = params.stirrupDiameter ?? 0;
  const radius = params.diameter / 2 - params.cover - stirrup - params.barDiameter / 2;
  // ... reste du corps inchange, en utilisant `radius`
}
```

**Ne pas modifier le reste du corps de `circularRebarCage`** : conserver `rotationOffset` et la répartition existants tels quels. Reprendre la signature exacte du fichier au moment de l'édition — l'extrait ci-dessus montre les seules lignes à changer.

- [ ] **Step 4 : lancer la suite complète, vérifier qu'aucun test existant ne casse**

Run: `npm test`
Expected: PASS — les tests des sessions 1 et 2 doivent passer **sans modification**. Si l'un d'eux casse, c'est que la compatibilité ascendante est rompue : investiguer et rapporter, ne pas modifier le test existant.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/geometry/rectangle.ts src/geometry/circle.ts tests/geometry/rectangle.test.ts tests/geometry/circle.test.ts
git commit -m "feat(geometry): armatures positionnees acceptees par rectangularSection, etriers dans la cage circulaire"
```

---

### Task 5 : rotation de la section et du vecteur moment

**Files:**
- Create: `src/geometry/rotate.ts`
- Test: `tests/geometry/rotate.test.ts`

Conventions (spec §3.1, §5.2) :
- point : `(y', z') = (y·cos θ + z·sin θ, −y·sin θ + z·cos θ)`, matrice `R(θ)` ;
- le vecteur moment `(M_y, M_z) = (−∫σz dA, +∫σy dA)` se transforme avec **la même** matrice ; le retour dans le repère section est donc `R(θ)ᵀ`.

- [ ] **Step 1 : écrire le test en échec**

Créer `tests/geometry/rotate.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { rotatePoint, rotateSection, rotateMomentBack } from '../../src/geometry/rotate';
import { polygonSection, polygonArea, polygonCentroid } from '../../src/geometry/polygon';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

describe('rotation', () => {
  it('theta = 0 est l identite', () => {
    const p = rotatePoint({ y: 37, z: -12 }, 0);
    expect(p.y).toBeCloseTo(37, 12);
    expect(p.z).toBeCloseTo(-12, 12);
  });

  it('theta = 90 deg envoie l axe y sur l axe z negatif', () => {
    const p = rotatePoint({ y: 1, z: 0 }, Math.PI / 2);
    expect(p.y).toBeCloseTo(0, 12);
    expect(p.z).toBeCloseTo(-1, 12);
  });

  it('la rotation est une isometrie : aire et centroide preserves', () => {
    // Section en T, non convexe et non symetrique en z.
    const section = polygonSection({
      vertices: [
        { y: 0, z: 0 },
        { y: 600, z: 0 },
        { y: 600, z: 150 },
        { y: 425, z: 150 },
        { y: 425, z: 500 },
        { y: 175, z: 500 },
        { y: 175, z: 150 },
        { y: 0, z: 150 },
      ],
      concrete,
      rebars: [],
    });

    const aireInitiale = polygonArea(section.geometry.vertices);
    const tournee = rotateSection(section, 0.7);

    expect(polygonArea(tournee.geometry.vertices)).toBeCloseTo(aireInitiale, 6);
    const c = polygonCentroid(tournee.geometry.vertices);
    expect(c.y).toBeCloseTo(0, 6);
    expect(c.z).toBeCloseTo(0, 6);
  });

  it('les armatures tournent avec la geometrie, la section d origine est intacte', () => {
    const section = rectangularSection({
      width: 400,
      height: 600,
      concrete,
      rebars: [{ y: 150, z: 250, area: 314, steel }],
    });

    const tournee = rotateSection(section, Math.PI / 2);

    expect(tournee.rebars[0].y).toBeCloseTo(250, 9);
    expect(tournee.rebars[0].z).toBeCloseTo(-150, 9);
    expect(tournee.rebars[0].area).toBe(314);

    // La section d'origine n'a pas bouge.
    expect(section.rebars[0].y).toBe(150);
    expect(section.geometry.kind).toBe('rectangle');
  });

  it('un rectangle est converti en polygone avant rotation', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const tournee = rotateSection(section, 0.3);

    expect(tournee.geometry.kind).toBe('polygon');
    expect(tournee.geometry.vertices).toHaveLength(4);
    expect(polygonArea(tournee.geometry.vertices)).toBeCloseTo(300 * 500, 6);
  });

  it('rotateMomentBack est l inverse exact de la rotation du moment', () => {
    const theta = 0.87;
    const m = { y: 123.4, z: -56.7 };

    const tourne = rotatePoint(m, theta); // le moment se transforme comme un point
    const revenu = rotateMomentBack(tourne, theta);

    expect(revenu.y).toBeCloseTo(m.y, 10);
    expect(revenu.z).toBeCloseTo(m.z, 10);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/geometry/rotate.test.ts`
Expected: FAIL — module `src/geometry/rotate.ts` introuvable.

- [ ] **Step 3 : implémenter**

Créer `src/geometry/rotate.ts` :

```ts
import type { Section } from '../model/section';
import type { PolygonGeometry, Vertex } from './polygon';
import { rectangleToPolygon } from './rectangle';

/**
 * Rotation d'un point du plan par R(theta) = [[cos, sin], [-sin, cos]].
 *
 * Le repere tourne est celui dans lequel l'axe neutre d'angle `theta`
 * devient horizontal : la coordonnee `z` du repere tourne vaut
 * `zeta = -y*sin(theta) + z*cos(theta)`, exactement la coordonnee
 * perpendiculaire a l'axe neutre definie par la spec (§3.2). En theta = 0 on
 * retrouve l'identite, donc la convention de la session 2.
 */
export function rotatePoint(p: Vertex, theta: number): Vertex {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { y: p.y * c + p.z * s, z: -p.y * s + p.z * c };
}

/**
 * Copie de travail de la section dans le repere tourne. La section d'origine
 * n'est jamais modifiee : l'API et le trace restent dans le repere de la
 * section, la rotation est un detail interne du solveur.
 *
 * La rotation est une isometrie autour de l'origine, et la geometrie stockee
 * est deja centree sur le centroide : le centroide reste donc en place.
 */
export function rotateSection(section: Section, theta: number): Section & { geometry: PolygonGeometry } {
  const base =
    section.geometry.kind === 'rectangle' ? rectangleToPolygon(section.geometry) : section.geometry;

  return {
    geometry: { kind: 'polygon', vertices: base.vertices.map((v) => rotatePoint(v, theta)) },
    concrete: section.concrete,
    rebars: section.rebars.map((r) => {
      const p = rotatePoint(r, theta);
      return { y: p.y, z: p.z, area: r.area, steel: r.steel };
    }),
  };
}

export interface MomentVector {
  y: number;
  z: number;
}

/**
 * Ramene un vecteur moment du repere tourne vers le repere de la section.
 *
 * Le couple (M_y, M_z) = (-∫σz dA, +∫σy dA) se transforme comme un point du
 * plan sous R(theta) — c'est la propriete qui rend la rotation interne exacte
 * et reversible, et qui rend structurelle (et non approchee) la
 * non-regression en theta = 0. L'inverse est donc R(theta) transposee.
 */
export function rotateMomentBack(m: MomentVector, theta: number): MomentVector {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { y: m.y * c - m.z * s, z: m.y * s + m.z * c };
}
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/geometry/rotate.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/geometry/rotate.ts tests/geometry/rotate.test.ts
git commit -m "feat(geometry): rotation de section et de vecteur moment pour l axe neutre incline"
```

---

### Task 6 : intégration biaxiale — `N`, `My`, `Mz`

**Files:**
- Create: `src/integration/fiber-polygon-biaxial.ts`
- Test: `tests/integration/fiber-polygon-biaxial.test.ts`

`src/integration/fiber-polygon.ts` **n'est pas modifié** : il reste le témoin de non-régression de la session 2.

- [ ] **Step 1 : écrire le test en échec**

Créer `tests/integration/fiber-polygon-biaxial.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { integratePolygon } from '../../src/integration/fiber-polygon';
import { integratePolygonBiaxial } from '../../src/integration/fiber-polygon-biaxial';
import { polygonSection } from '../../src/geometry/polygon';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

// Section en T : non convexe, plusieurs spans possibles, asymetrique en z.
const sectionT = polygonSection({
  vertices: [
    { y: 0, z: 0 },
    { y: 600, z: 0 },
    { y: 600, z: 150 },
    { y: 425, z: 150 },
    { y: 425, z: 500 },
    { y: 175, z: 500 },
    { y: 175, z: 150 },
    { y: 0, z: 150 },
  ],
  concrete,
  rebars: [
    { y: 220, z: 450, area: 804, steel },
    { y: 380, z: 450, area: 804, steel },
  ],
});

const zTop = Math.min(...sectionT.geometry.vertices.map((v) => v.z));
const champ = (z: number) => 3.5e-3 * (1 - (z - zTop) / 250);

describe('integratePolygonBiaxial', () => {
  it('non-regression : N et My identiques a integratePolygon', () => {
    const ref = integratePolygon(sectionT, champ, 400);
    const bi = integratePolygonBiaxial(sectionT, champ, 400);

    expect(Math.abs(bi.N - ref.N) / Math.abs(ref.N)).toBeLessThan(1e-12);
    expect(Math.abs(bi.My - ref.M) / Math.abs(ref.M)).toBeLessThan(1e-12);
  });

  it('Mz est nul sur une section symetrique en y, quelle que soit son asymetrie en z', () => {
    // La section en T ci-dessus est symetrique par rapport a y = centroide,
    // et ses armatures aussi : la composante Mz doit s'annuler.
    const bi = integratePolygonBiaxial(sectionT, champ, 400);

    expect(Math.abs(bi.Mz)).toBeLessThan(1e-9);
  });

  it('Mz est non nul des que les armatures rompent la symetrie en y', () => {
    const sectionAsym = polygonSection({
      vertices: sectionT.geometry.vertices.map((v) => ({ y: v.y, z: v.z })),
      concrete,
      rebars: [{ y: 100, z: 200, area: 2000, steel }],
    });

    const bi = integratePolygonBiaxial(sectionAsym, champ, 400);
    expect(Math.abs(bi.Mz)).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/integration/fiber-polygon-biaxial.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3 : implémenter**

Créer `src/integration/fiber-polygon-biaxial.ts` :

```ts
import type { Section } from '../model/section';
import type { PolygonGeometry } from '../geometry/polygon';
import { polygonSpansAtZ } from '../geometry/scanline';
import { concreteStress } from '../constitutive/concrete-law';
import { steelStress } from '../constitutive/steel-law';

/** Resultante (force en valeur absolue, kN) et son point d'application (mm). */
export interface Resultant {
  force: number;
  y: number;
  z: number;
}

export interface BiaxialResultant {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Moment autour de y (kN·m) : -∫σz dA, identique au M de la session 2. */
  My: number;
  /** Moment autour de z (kN·m) : +∫σy dA. */
  Mz: number;
  /** `null` si la section n'a aucune fibre comprimee. */
  compression: Resultant | null;
  /** `null` si la section n'a aucune fibre tendue. */
  tension: Resultant | null;
}

/**
 * Methode des fibres par bandes horizontales, rendant les DEUX composantes de
 * moment ainsi que les resultantes de compression et de traction separees.
 *
 * Le moment statique en y d'une bande vaut, par span, `σ·dz·(y2² - y1²)/2` ;
 * c'est exactement `force * milieu_du_span`, forme retenue ici. Les spans
 * viennent de `polygonSpansAtZ` inchange (session 2).
 *
 * `strainAt(z)` donne la deformation du champ lineaire suppose a la hauteur z
 * (mm depuis l'origine du repere fourni, positif vers le bas). L'integration
 * se fait autour de l'ORIGINE du repere des sommets fournis : c'est a
 * l'appelant de fournir une geometrie centree sur son centroide s'il veut des
 * moments barycentriques.
 */
export function integratePolygonBiaxial(
  section: Section & { geometry: PolygonGeometry },
  strainAt: (z: number) => number,
  nBands: number
): BiaxialResultant {
  const { vertices } = section.geometry;
  const zValues = vertices.map((v) => v.z);
  const zTop = Math.min(...zValues);
  const zBottom = Math.max(...zValues);
  const dz = (zBottom - zTop) / nBands;

  let N = 0;
  let My = 0;
  let Mz = 0;
  let fComp = 0;
  let fCompY = 0;
  let fCompZ = 0;
  let fTrac = 0;
  let fTracY = 0;
  let fTracZ = 0;

  const ajouter = (force: number, y: number, z: number): void => {
    N += force;
    My += force * -z;
    Mz += force * y;

    if (force > 0) {
      fComp += force;
      fCompY += force * y;
      fCompZ += force * z;
    } else if (force < 0) {
      fTrac -= force;
      fTracY -= force * y;
      fTracZ -= force * z;
    }
  };

  for (let i = 0; i < nBands; i++) {
    const zi = zTop + (i + 0.5) * dz;
    const sigma = concreteStress(strainAt(zi), section.concrete);
    if (sigma === 0) continue; // le beton tendu ne contribue pas : inutile de balayer

    for (const span of polygonSpansAtZ(vertices, zi)) {
      const largeur = span.yEnd - span.yStart;
      if (largeur <= 0) continue;
      ajouter(sigma * largeur * dz, (span.yStart + span.yEnd) / 2, zi);
    }
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.z);
    const sigmaAcier = steelStress(eps, rebar.steel);
    const sigmaBetonDeplace = concreteStress(eps, section.concrete);
    ajouter((sigmaAcier - sigmaBetonDeplace) * rebar.area, rebar.y, rebar.z);
  }

  return {
    N: N / 1000,
    My: My / 1e6,
    Mz: Mz / 1e6,
    compression: fComp > 0 ? { force: fComp / 1000, y: fCompY / fComp, z: fCompZ / fComp } : null,
    tension: fTrac > 0 ? { force: fTrac / 1000, y: fTracY / fTrac, z: fTracZ / fTrac } : null,
  };
}
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/integration/fiber-polygon-biaxial.test.ts`
Expected: PASS, 3 tests.

Si la non-régression sur `My` échoue au-delà de `1e-12`, **ne pas élargir la tolérance** : l'écart viendrait d'une différence d'ordre de sommation entre le calcul par span et le calcul par largeur totale. Le rapporter avec l'écart mesuré.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/integration/fiber-polygon-biaxial.ts tests/integration/fiber-polygon-biaxial.test.ts
git commit -m "feat(integration): integration biaxiale, deux composantes de moment et resultantes separees"
```

---

### Task 7 : recalcul manuel — triangle sur branche parabolique (porte de validation)

C'est la **preuve indépendante** de l'intégration biaxiale : trois intégrales fermées, calculées à la main, portant sur `N`, `My` **et** `Mz`.

**Files:**
- Create: `tests/handcalc/biaxial-triangle-parabolic.test.ts`

Dérivation (spec §9.4), à reproduire en commentaire dans le test :

- géométrie : sommet `(0, 0)`, base horizontale de `(−100, 300)` à `(200, 300)`. À la hauteur `z` : largeur `w(z) = z`, milieu de bande `ȳ(z) = z/6` ;
- champ imposé : `ε(z) = εc2·(1 − z/300)` — la fibre extrême est calée sur `εc2`, donc **toute** la zone comprimée est sur la branche parabolique, sans plateau, et rien n'est tendu ;
- avec `n = 2` : `σ(z) = fcd·(1 − (z/300)²)` ;
- en posant `s = z/300` : `N = fcd·9,0e4·∫₀¹(s − s³)ds = fcd·2,25e4`, `My = −fcd·2,7e7·∫₀¹(s² − s⁴)ds = −fcd·3,6e6`, `Mz = fcd·6,0e5` ;
- `fcd = 25/1,5` donne `N = 375 kN`, `My = −60 kN·m`, `Mz = +10 kN·m`, `z_c = 160 mm`, `y_c = 26,667 mm`.

**Les sommets ne sont volontairement pas centrés sur le centroïde** : l'intégrateur intègre autour de l'origine du repère qu'on lui donne, ce qui rend le calcul à la main direct.

- [ ] **Step 1 : écrire le test en échec**

Créer `tests/handcalc/biaxial-triangle-parabolic.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { integratePolygonBiaxial } from '../../src/integration/fiber-polygon-biaxial';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';
import type { PolygonGeometry } from '../../src/geometry/polygon';

describe('Flexion deviee — triangle sur branche parabolique, recalcul manuel ferme', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile); // fcd = 25/1.5 = 16.6667 MPa

  // Triangle : sommet en (0,0), base horizontale de (-100,300) a (200,300).
  // A la hauteur z : largeur w(z) = z, milieu de bande ybar(z) = z/6.
  // Volontairement NON centre sur le centroide : l'integration se fait autour
  // de l'origine du repere fourni, ce qui rend le calcul a la main direct.
  const geometry: PolygonGeometry = {
    kind: 'polygon',
    vertices: [
      { y: 0, z: 0 },
      { y: 200, z: 300 },
      { y: -100, z: 300 },
    ],
  };

  const section = { geometry, concrete, rebars: [] };

  // Fibre extreme calee sur epsC2 (et non epsCu2) : toute la zone comprimee
  // est sur la branche parabolique, aucun plateau, aucune fibre tendue.
  // sigma(z) = fcd * (1 - (z/300)^2).
  const champ = (z: number) => concrete.epsC2 * (1 - z / 300);

  // --- Valeurs fermees, calculees a la main ---
  const fcd = concrete.fcd;
  const N_main = (fcd * 2.25e4) / 1000; // kN
  const My_main = (-fcd * 3.6e6) / 1e6; // kN·m
  const Mz_main = (fcd * 6.0e5) / 1e6; // kN·m

  it('les valeurs manuelles sont bien celles annoncees dans la spec', () => {
    expect(N_main).toBeCloseTo(375, 6);
    expect(My_main).toBeCloseTo(-60, 6);
    expect(Mz_main).toBeCloseTo(10, 6);
  });

  it('l integration par fibres retrouve les trois integrales fermees', () => {
    const r = integratePolygonBiaxial(section, champ, 4000);

    expect(Math.abs(r.N - N_main) / Math.abs(N_main)).toBeLessThan(1e-4);
    expect(Math.abs(r.My - My_main) / Math.abs(My_main)).toBeLessThan(1e-4);
    expect(Math.abs(r.Mz - Mz_main) / Math.abs(Mz_main)).toBeLessThan(1e-4);
  });

  it('le point d application de la compression est retrouve, et rien n est tendu', () => {
    const r = integratePolygonBiaxial(section, champ, 4000);

    expect(r.tension).toBeNull();
    expect(r.compression).not.toBeNull();
    expect(r.compression!.z).toBeCloseTo(160, 1);
    expect(r.compression!.y).toBeCloseTo(160 / 6, 1);
    expect(r.compression!.force).toBeCloseTo(N_main, 1);
  });

  it('convergence : l erreur decroit quand le nombre de bandes augmente', () => {
    const erreur = (nBands: number) => {
      const r = integratePolygonBiaxial(section, champ, nBands);
      return Math.abs(r.Mz - Mz_main) / Math.abs(Mz_main);
    };

    const e50 = erreur(50);
    const e500 = erreur(500);

    expect(e500).toBeLessThan(e50);
    expect(e500).toBeLessThan(1e-3);
  });
});
```

- [ ] **Step 2 : lancer le test**

Run: `npx vitest run tests/handcalc/biaxial-triangle-parabolic.test.ts`
Expected: PASS — l'intégrateur de la tâche 6 existe déjà.

**Ce test est la porte de validation de l'intégration.** S'il échoue, l'erreur est dans `integratePolygonBiaxial` (tâche 6), pas dans les valeurs manuelles : celles-ci sont dérivées analytiquement et vérifiées par le premier `it`. Investiguer l'implémentation, ne jamais réajuster les constantes.

- [ ] **Step 3 : commit**

```bash
git add tests/handcalc/biaxial-triangle-parabolic.test.ts
git commit -m "test(handcalc): integrales fermees N, My et Mz sur triangle en branche parabolique"
```

---

### Task 8 : extraction du champ de déformation (refactor sans changement de comportement)

Unique modification autorisée de `uls-uniaxial.ts` cette session. Objectif : **un seul point de vérité** pour la formule du champ de déformation, que les deux solveurs partagent. Recopier la formule dans le solveur dévié est proscrit.

**Files:**
- Modify: `src/solvers/uls-uniaxial.ts`
- Test: `tests/solvers/uls-uniaxial.test.ts`

- [ ] **Step 1 : écrire le test en échec**

Ajouter à `tests/solvers/uls-uniaxial.test.ts` :

```ts
import { concretePivotStrainField } from '../../src/solvers/uls-uniaxial';

describe('concretePivotStrainField', () => {
  it('vaut epsCu2 a la fibre extreme et zero a l axe neutre', () => {
    const champ = concretePivotStrainField(-250, 200, 3.5e-3);

    expect(champ(-250)).toBeCloseTo(3.5e-3, 12); // fibre extreme comprimee
    expect(champ(-250 + 200)).toBeCloseTo(0, 12); // axe neutre
    expect(champ(0)).toBeCloseTo(3.5e-3 * (1 - 250 / 200), 12); // au-dela : traction
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/solvers/uls-uniaxial.test.ts`
Expected: FAIL — `concretePivotStrainField` n'est pas exportée.

- [ ] **Step 3 : implémenter le refactor**

Dans `src/solvers/uls-uniaxial.ts`, ajouter la fonction exportée **au-dessus** de `verifyUniaxial` :

```ts
/**
 * Champ de deformation lineaire cale sur le pivot beton : la fibre extreme
 * comprimee (`zTop`, ou la coordonnee perpendiculaire minimale dans le repere
 * tourne du solveur devie) est a `epsCu2`, la deformation s'annule a la
 * profondeur `x`. Source unique partagee par les solveurs droit et devie —
 * ne pas recopier cette formule ailleurs.
 */
export function concretePivotStrainField(
  zTop: number,
  x: number,
  epsCu2: number
): (z: number) => number {
  return (z: number) => epsCu2 * (1 - (z - zTop) / x);
}
```

puis remplacer, dans le corps de `verifyUniaxial`, la ligne définissant `strainField` par :

```ts
  const strainField = (x: number) => concretePivotStrainField(zTop, x, epsCu2);
```

**Conserver intégralement le commentaire de monotonie** qui précède cette ligne : il documente l'hypothèse sur laquelle repose la bissection, y compris pour les géométries non convexes.

- [ ] **Step 4 : lancer la suite complète**

Run: `npm test`
Expected: PASS — tous les tests des sessions 1 et 2 passent **sans modification**. C'est le contrôle qu'il s'agit bien d'un refactor sans changement de comportement.

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/solvers/uls-uniaxial.ts tests/solvers/uls-uniaxial.test.ts
git commit -m "refactor(solvers): champ de deformation extrait en source unique partagee"
```

---

### Task 9 : `verifyBiaxial` — solveur dévié

**Files:**
- Create: `src/solvers/uls-biaxial.ts`
- Test: `tests/solvers/uls-biaxial.test.ts`

Algorithme (spec §6.2) : pour chaque `θ`, rotation de la section, résolution interne par `verifyUniaxial` (inchangé), intégration biaxiale au champ convergé, retour du moment dans le repère section. Puis recherche de `θ` annulant l'écart angulaire signé, par balayage à 15° (replis 5° puis 1°) et méthode d'Illinois.

- [ ] **Step 1 : écrire le test en échec**

Créer `tests/solvers/uls-biaxial.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poteau carre 400x400, ferraillage symetrique : 4 coins + 4 milieux de face. */
function poteauCarre() {
  const layout = rectangularRebarLayout({
    width: 400,
    height: 400,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
      { face: 'left', bars: { count: 1, diameter: 20 } },
      { face: 'right', bars: { count: 1, diameter: 20 } },
    ],
  });
  return rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
}

describe('verifyBiaxial', () => {
  it('refuse une sollicitation sans direction de moment', () => {
    expect(() => verifyBiaxial(poteauCarre(), { N: 500, My: 0, Mz: 0 }, profile)).toThrow();
  });

  it('non-regression : une sollicitation autour de y seul redonne le resultat du solveur droit', () => {
    const section = poteauCarre();
    const droit = verifyUniaxial(section, { N: 800, M: 0 }, profile);
    const devie = verifyBiaxial(section, { N: 800, My: 1, Mz: 0 }, profile);

    expect(devie.converged).toBe(true);
    expect(Math.abs(devie.M_Rd.y - droit.M_Rd) / Math.abs(droit.M_Rd)).toBeLessThan(1e-6);
    expect(Math.abs(devie.M_Rd.z)).toBeLessThan(1e-6);
    expect(Math.abs(devie.neutralAxis.angle)).toBeLessThan(1e-4);
    expect(Math.abs(devie.neutralAxisDepth - droit.neutralAxisDepth)).toBeLessThan(1e-3);

    // La racine tombe ici exactement sur un point de balayage (theta = 0) :
    // elle doit etre comptee UNE fois, pas deux. Sans deduplication, le
    // balayage la detecte a la fois comme echantillon et comme encadrement
    // de l'intervalle precedent.
    expect(devie.rootCount).toBe(1);
  });

  it('seule la direction du moment sollicitant compte, pas sa magnitude', () => {
    const section = poteauCarre();
    const petit = verifyBiaxial(section, { N: 500, My: 1, Mz: 0.5 }, profile);
    const grand = verifyBiaxial(section, { N: 500, My: 1000, Mz: 500 }, profile);

    expect(grand.M_Rd_magnitude).toBeCloseTo(petit.M_Rd_magnitude, 6);
  });

  it('porte de validation : a 45 deg sur un poteau carre symetrique, les deux composantes sont egales', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 600, My: 1, Mz: 1 }, profile);

    expect(r.converged).toBe(true);
    expect(r.M_Rd.y).toBeGreaterThan(0);
    expect(r.M_Rd.z).toBeGreaterThan(0);
    expect(Math.abs(r.M_Rd.y - r.M_Rd.z) / r.M_Rd.y).toBeLessThan(1e-4);

    // Axe neutre parallele a une diagonale : |cos| = |sin|.
    const t = r.neutralAxis.angle;
    expect(Math.abs(Math.abs(Math.cos(t)) - Math.abs(Math.sin(t)))).toBeLessThan(1e-3);
  });

  it('symetries d orientation : les quatre directions cardinales donnent la meme capacite', () => {
    const section = poteauCarre();
    const directions = [
      { My: 1, Mz: 0 },
      { My: 0, Mz: 1 },
      { My: -1, Mz: 0 },
      { My: 0, Mz: -1 },
    ];

    const magnitudes = directions.map(
      (d) => verifyBiaxial(section, { N: 600, ...d }, profile).M_Rd_magnitude
    );

    for (const m of magnitudes) {
      expect(Math.abs(m - magnitudes[0]) / magnitudes[0]).toBeLessThan(1e-6);
    }
  });

  it('le moment resistant est colinéaire et de meme sens que le moment sollicitant', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 400, My: 3, Mz: -2 }, profile);

    const produitVectoriel = r.M_Rd.y * -2 - r.M_Rd.z * 3;
    const produitScalaire = r.M_Rd.y * 3 + r.M_Rd.z * -2;

    expect(Math.abs(produitVectoriel) / r.M_Rd_magnitude).toBeLessThan(1e-4);
    expect(produitScalaire).toBeGreaterThan(0);
  });

  it('budget : la convergence tient en moins de 60 resolutions droites', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 600, My: 1, Mz: 1 }, profile);
    expect(r.innerSolves).toBeLessThanOrEqual(60);
  });

  it('le bras de levier recoupe M = F * z en flexion simple', () => {
    const r = verifyBiaxial(poteauCarre(), { N: 0, My: 1, Mz: 1 }, profile);

    expect(r.leverArm).not.toBeNull();
    expect(r.compression).not.toBeNull();
    expect(r.tension).not.toBeNull();
    // N = 0 : les deux resultantes sont egales en module, et M = F * z.
    expect(r.compression!.force).toBeCloseTo(r.tension!.force, 3);
    const produit = (r.compression!.force * r.leverArm!) / 1000; // kN * mm -> kN·m
    expect(Math.abs(produit - r.M_Rd_magnitude) / r.M_Rd_magnitude).toBeLessThan(1e-3);
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/solvers/uls-biaxial.test.ts`
Expected: FAIL — module `src/solvers/uls-biaxial.ts` introuvable.

- [ ] **Step 3 : implémenter**

Créer `src/solvers/uls-biaxial.ts` :

```ts
import type { Section } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import { rotateSection, rotatePoint, rotateMomentBack } from '../geometry/rotate';
import { integratePolygonBiaxial } from '../integration/fiber-polygon-biaxial';
import type { Resultant } from '../integration/fiber-polygon-biaxial';
import { verifyUniaxial, concretePivotStrainField } from './uls-uniaxial';

export interface BiaxialAction {
  /** Effort normal (kN), positif en compression. */
  N: number;
  /** Composantes du moment sollicitant (kN·m). SEULE LEUR DIRECTION est utilisee. */
  My: number;
  Mz: number;
}

export interface BiaxialResult {
  /**
   * Axe neutre dans le repere de la section, directement tracable :
   * droite { (y,z) : -y*sin(angle) + z*cos(angle) = offset }.
   */
  neutralAxis: { angle: number; offset: number };
  /** Profondeur perpendiculaire depuis la fibre extreme comprimee (mm). */
  neutralAxisDepth: number;
  /** Moment resistant (kN·m), colineaire et de meme sens que (My, Mz). */
  M_Rd: { y: number; z: number };
  M_Rd_magnitude: number;
  N_Rd: number;
  /** Bras de levier interne (mm), `null` si la section n'a aucune fibre tendue. */
  leverArm: number | null;
  compression: Resultant | null;
  tension: Resultant | null;
  /** Nombre de racines detectees au balayage (voir la note d'unicite). */
  rootCount: number;
  /** Nombre de resolutions droites consommees — diagnostic de budget. */
  innerSolves: number;
  converged: boolean;
}

interface EtatAngle {
  theta: number;
  M: { y: number; z: number };
  ecart: number;
  x: number;
  offset: number;
  compression: Resultant | null;
  tension: Resultant | null;
  leverArm: number | null;
  N_Rd: number;
}

function wrapToPi(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * Verification ELU en flexion composee DEVIEE (EN 1992-1-1).
 *
 * Deux inconnues : l'inclinaison `theta` de l'axe neutre et sa profondeur
 * `x`. Deux equations : `N_R = N_Ed`, et moment resistant colineaire au
 * moment sollicitant.
 *
 * La resolution est imbriquee plutot que par Newton a deux parametres (ecart
 * assume au plan d'origine, justifie dans la spec §6.1) : a `theta` fixe, on
 * tourne une copie de travail de la section, ce qui rend l'axe neutre
 * horizontal et ramene le probleme interne EXACTEMENT a celui de la session
 * 2 — `verifyUniaxial` est appele tel quel, sans etre modifie. Reste une
 * recherche de racine SCALAIRE sur `theta`, encadree donc sans divergence
 * possible.
 *
 * Seule la DIRECTION de `(My, Mz)` est utilisee, jamais sa magnitude : la
 * fonction rend la capacite dans cette direction, pas un verdict. La
 * comparaison sollicitation/capacite releve du domaine d'interaction
 * (session 4).
 *
 * Limitation reconduite des sessions 1 et 2 : pivot beton uniquement.
 */
export function verifyBiaxial(
  section: Section,
  action: BiaxialAction,
  norm: NormProfile
): BiaxialResult {
  const magnitudeSollicitante = Math.hypot(action.My, action.Mz);
  if (magnitudeSollicitante === 0) {
    throw new Error(
      "verifyBiaxial : (My, Mz) nul, la direction de flexion est indefinie. " +
        'Utiliser verifyUniaxial pour la flexion droite, ou le domaine d\'interaction (session 4).'
    );
  }

  const angleSollicitant = Math.atan2(action.Mz, action.My);
  const { epsCu2 } = section.concrete;
  let innerSolves = 0;

  const evaluer = (theta: number): EtatAngle | null => {
    innerSolves += 1;
    const tournee = rotateSection(section, theta);
    const droit = verifyUniaxial(tournee, { N: action.N, M: 0 }, norm);
    if (!droit.converged) return null;

    const zTop = Math.min(...tournee.geometry.vertices.map((v) => v.z));
    const champ = concretePivotStrainField(zTop, droit.neutralAxisDepth, epsCu2);
    const r = integratePolygonBiaxial(tournee, champ, norm.nBands);

    const M = rotateMomentBack({ y: r.My, z: r.Mz }, theta);

    // Le bras de levier se mesure perpendiculairement a l'axe neutre : dans
    // le repere tourne, c'est simplement l'ecart des coordonnees z.
    const leverArm =
      r.compression && r.tension ? Math.abs(r.compression.z - r.tension.z) : null;

    const versSection = (p: Resultant | null): Resultant | null => {
      if (!p) return null;
      const q = rotatePoint({ y: p.y, z: p.z }, -theta);
      return { force: p.force, y: q.y, z: q.z };
    };

    return {
      theta,
      M,
      ecart: wrapToPi(Math.atan2(M.z, M.y) - angleSollicitant),
      x: droit.neutralAxisDepth,
      offset: zTop + droit.neutralAxisDepth,
      compression: versSection(r.compression),
      tension: versSection(r.tension),
      leverArm,
      N_Rd: r.N,
    };
  };

  const echec = (): BiaxialResult => ({
    neutralAxis: { angle: NaN, offset: NaN },
    neutralAxisDepth: NaN,
    M_Rd: { y: NaN, z: NaN },
    M_Rd_magnitude: NaN,
    N_Rd: NaN,
    leverArm: null,
    compression: null,
    tension: null,
    rootCount: 0,
    innerSolves,
    converged: false,
  });

  const TOL_ANGLE = 1e-6;

  // Balayage grossier, puis replis de plus en plus fins. La racine n'est
  // jamais devinee : on exige un encadrement franc, les deux extremites
  // verifiant |ecart| < pi/2 — ce qui ecarte la discontinuite de repliement
  // a +/-pi, qui n'est pas une racine.
  for (const pas of [Math.PI / 12, Math.PI / 36, Math.PI / 180]) {
    const n = Math.round((2 * Math.PI) / pas);
    const etats: Array<EtatAngle | null> = [];
    for (let i = 0; i < n; i++) etats.push(evaluer(i * pas));

    const racines: EtatAngle[] = [];

    for (let i = 0; i < n; i++) {
      const a = etats[i];
      const b = etats[(i + 1) % n];
      if (!a) continue;

      if (Math.abs(a.ecart) < TOL_ANGLE) {
        racines.push(a);
        continue;
      }
      if (!b) continue;
      if (Math.abs(a.ecart) >= Math.PI / 2 || Math.abs(b.ecart) >= Math.PI / 2) continue;
      if (a.ecart * b.ecart > 0) continue;

      const affine = illinois(evaluer, a, b, pas, TOL_ANGLE);
      if (affine) racines.push(affine);
    }

    // Deduplication AVANT comptage : une racine tombant exactement sur un
    // point de balayage est detectee deux fois — une fois comme echantillon,
    // une fois comme encadrement de l'intervalle precedent, dont le produit
    // des ecarts est alors nul. C'est le cas de toute sollicitation alignee
    // sur un axe (theta = 0), donc du controle de non-regression lui-meme :
    // sans cette etape, rootCount vaudrait 2 sur un cas parfaitement sain.
    const distinctes: EtatAngle[] = [];
    for (const r of racines) {
      const dejaVue = distinctes.some(
        (d) => Math.abs(wrapToPi(d.theta - r.theta)) < 1e-3
      );
      if (!dejaVue) distinctes.push(r);
    }

    if (distinctes.length === 0) continue;

    // Choix conservatif si plusieurs racines DISTINCTES subsistent (spec
    // §6.3) : la plus faible capacite. Un rootCount > 1 sur un cas de
    // validation doit etre investigue, pas absorbe.
    const retenue = distinctes.reduce((meilleure, r) =>
      Math.hypot(r.M.y, r.M.z) < Math.hypot(meilleure.M.y, meilleure.M.z) ? r : meilleure
    );

    return {
      neutralAxis: { angle: wrapToPi(retenue.theta), offset: retenue.offset },
      neutralAxisDepth: retenue.x,
      M_Rd: retenue.M,
      M_Rd_magnitude: Math.hypot(retenue.M.y, retenue.M.z),
      N_Rd: retenue.N_Rd,
      leverArm: retenue.leverArm,
      compression: retenue.compression,
      tension: retenue.tension,
      rootCount: distinctes.length,
      innerSolves,
      converged: true,
    };
  }

  return echec();
}

/**
 * Methode d'Illinois (regula falsi amortie) sur l'ecart angulaire, dans un
 * intervalle deja encadre. Convergence garantie par l'encadrement, sans
 * jacobien ni amortissement a regler.
 */
function illinois(
  evaluer: (theta: number) => EtatAngle | null,
  bas: EtatAngle,
  haut: EtatAngle,
  pas: number,
  tol: number,
  maxIter = 40
): EtatAngle | null {
  let tBas = bas.theta;
  let tHaut = bas.theta + pas;
  let fBas = bas.ecart;
  let fHaut = haut.ecart;
  let dernier: EtatAngle | null = null;

  for (let i = 0; i < maxIter; i++) {
    const t = tHaut - (fHaut * (tHaut - tBas)) / (fHaut - fBas);
    const etat = evaluer(t);
    if (!etat) return dernier;
    dernier = etat;

    if (Math.abs(etat.ecart) < tol || Math.abs(tHaut - tBas) < tol) return etat;

    if (etat.ecart * fHaut < 0) {
      tBas = tHaut;
      fBas = fHaut;
    } else {
      fBas *= 0.5; // amortissement Illinois : evite la stagnation d'une extremite
    }
    tHaut = t;
    fHaut = etat.ecart;
  }

  return dernier;
}
```

**Points d'attention pour l'implémenteur :**

- `evaluer` est appelée avec `theta = i * pas` : l'angle `haut` de l'encadrement vaut `bas.theta + pas`, y compris au repli sur `i = n-1` où le suivant est `0` — c'est pourquoi `illinois` reçoit `pas` plutôt que `haut.theta`.
- Le compteur `innerSolves` doit compter **toutes** les évaluations, balayage compris.
- `verifyUniaxial` reçoit `{ N: action.N, M: 0 }` : le champ `M` de `Action` n'est pas utilisé par le solveur droit.

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/solvers/uls-biaxial.test.ts`
Expected: PASS, 8 tests.

Si le test de non-régression échoue, comparer d'abord `neutralAxis.angle` : une erreur de signe dans `rotateMomentBack` ou dans `rotatePoint` se voit immédiatement sur ce cas. **Ne pas élargir les tolérances.**

- [ ] **Step 5 : typecheck et commit**

```bash
npm run typecheck
git add src/solvers/uls-biaxial.ts tests/solvers/uls-biaxial.test.ts
git commit -m "feat(solvers): verification ELU en flexion deviee par resolution imbriquee"
```

---

### Task 10 : invariance par isométrie

Contrôle le plus fort de la chaîne rotation / rotation inverse : une section tournée de `α`, sollicitée par un moment tourné du même `α`, doit donner la même capacité, et un axe neutre décalé de `−α`.

**Files:**
- Test: `tests/solvers/uls-biaxial-isometry.test.ts`

- [ ] **Step 1 : écrire le test**

Créer `tests/solvers/uls-biaxial-isometry.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { rotateSection, rotatePoint } from '../../src/geometry/rotate';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

describe('verifyBiaxial — invariance par isometrie', () => {
  // Section RECTANGULAIRE non carree et ferraillage asymetrique : aucune
  // symetrie ne peut masquer une erreur de rotation.
  const layout = rectangularRebarLayout({
    width: 300,
    height: 500,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 2, diameter: 12 } },
    ],
  });
  const section = rectangularSection({ width: 300, height: 500, concrete, rebars: layout.bars });

  it('tourner la section et le moment du meme angle laisse la capacite inchangee', () => {
    const alpha = 0.3;
    const action = { N: 700, My: 5, Mz: 2 };

    const direct = verifyBiaxial(section, action, profile);
    const tournee = rotateSection(section, alpha);
    const mTourne = rotatePoint({ y: action.My, z: action.Mz }, alpha);
    const apres = verifyBiaxial(tournee, { N: action.N, My: mTourne.y, Mz: mTourne.z }, profile);

    expect(direct.converged).toBe(true);
    expect(apres.converged).toBe(true);

    expect(
      Math.abs(apres.M_Rd_magnitude - direct.M_Rd_magnitude) / direct.M_Rd_magnitude
    ).toBeLessThan(1e-6);
    expect(Math.abs(apres.neutralAxisDepth - direct.neutralAxisDepth)).toBeLessThan(1e-3);

    // Dans la section tournee, l'axe neutre est a theta - alpha.
    const ecart = Math.atan2(
      Math.sin(apres.neutralAxis.angle - (direct.neutralAxis.angle - alpha)),
      Math.cos(apres.neutralAxis.angle - (direct.neutralAxis.angle - alpha))
    );
    expect(Math.abs(ecart)).toBeLessThan(1e-4);
  });

  it('une rotation de 90 deg d un poteau carre le laisse identique a lui-meme', () => {
    const carre = rectangularSection({
      width: 400,
      height: 400,
      concrete,
      rebars: rectangularRebarLayout({
        width: 400,
        height: 400,
        cover: 30,
        stirrupDiameter: 8,
        steel,
        rows: [
          { face: 'bottom', bars: { count: 3, diameter: 20 } },
          { face: 'top', bars: { count: 3, diameter: 20 } },
          { face: 'left', bars: { count: 1, diameter: 20 } },
          { face: 'right', bars: { count: 1, diameter: 20 } },
        ],
      }).bars,
    });

    const a = verifyBiaxial(carre, { N: 600, My: 1, Mz: 0 }, profile);
    const b = verifyBiaxial(carre, { N: 600, My: 0, Mz: 1 }, profile);

    expect(Math.abs(b.M_Rd_magnitude - a.M_Rd_magnitude) / a.M_Rd_magnitude).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2 : lancer le test**

Run: `npx vitest run tests/solvers/uls-biaxial-isometry.test.ts`
Expected: PASS, 2 tests.

Un échec ici avec les tests de la tâche 9 au vert signale une erreur de **signe d'angle** (confusion entre `θ` et `−θ` quelque part dans la chaîne). Investiguer et rapporter ; ne pas « corriger » en changeant le signe attendu dans le test sans avoir compris lequel des deux est faux.

- [ ] **Step 3 : commit**

```bash
git add tests/solvers/uls-biaxial-isometry.test.ts
git commit -m "test(solvers): invariance de la flexion deviee par isometrie"
```

---

### Task 11 : API publique et correctif des exports de la session 2

`src/index.ts` n'a jamais reçu les exports de la session 2 : l'exemple du README ne compile pas.

**Files:**
- Modify: `src/index.ts`
- Modify: `README.md`
- Test: `tests/index.test.ts`

- [ ] **Step 1 : écrire le test en échec**

Ajouter à `tests/index.test.ts` :

```ts
import {
  polygonSection,
  circularSection,
  circularRebarCage,
  rebarRow,
  rectangularRebarLayout,
  verifyBiaxial,
} from '../src/index';

describe('API publique — session 2 et 3', () => {
  it("l'exemple du README s'execute tel quel depuis l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const pieu = circularSection({
      diameter: 600,
      concrete,
      rebars: circularRebarCage({ diameter: 600, cover: 50, barDiameter: 20, count: 8, steel }),
    });

    const resultat = verifyUniaxial(pieu, { N: 0, M: 0 }, profile);

    expect(resultat.converged).toBe(true);
    expect(resultat.M_Rd).toBeGreaterThan(200);
    expect(resultat.M_Rd).toBeLessThan(280);
  });

  it('la verification deviee est accessible depuis l entree publique', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const layout = rectangularRebarLayout({
      width: 400,
      height: 400,
      cover: 30,
      stirrupDiameter: 8,
      steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
      ],
    });

    const section = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
    const r = verifyBiaxial(section, { N: 500, My: 1, Mz: 1 }, profile);

    expect(r.converged).toBe(true);
    expect(r.M_Rd_magnitude).toBeGreaterThan(0);
  });

  it('les primitives polygonales sont exportees', () => {
    expect(typeof polygonSection).toBe('function');
    expect(typeof rebarRow).toBe('function');
  });
});
```

- [ ] **Step 2 : lancer le test, vérifier l'échec**

Run: `npx vitest run tests/index.test.ts`
Expected: FAIL — `polygonSection`, `circularSection`, `circularRebarCage`, `verifyBiaxial` ne sont pas exportés par `src/index.ts`.

- [ ] **Step 3 : implémenter**

Ajouter à `src/index.ts`, à la suite des exports existants :

```ts
export type { PolygonGeometry, Vertex } from './geometry/polygon';
export { polygonSection, polygonArea, polygonCentroid } from './geometry/polygon';
export { rectangleToPolygon } from './geometry/rectangle';
export { circularSection, circularRebarCage } from './geometry/circle';

export type { BarSpec, BarCount, BarSpacing, RowSummary, RebarRow, RowFace } from './geometry/rebar-layout';
export { rebarRow, rectangularRebarLayout, formatRow } from './geometry/rebar-layout';

export type { Resultant, BiaxialResultant } from './integration/fiber-polygon-biaxial';
export { integratePolygonBiaxial } from './integration/fiber-polygon-biaxial';

export type { BiaxialAction, BiaxialResult } from './solvers/uls-biaxial';
export { verifyBiaxial } from './solvers/uls-biaxial';
```

- [ ] **Step 4 : lancer le test, vérifier le succès**

Run: `npx vitest run tests/index.test.ts`
Expected: PASS.

- [ ] **Step 5 : mettre à jour le README**

Dans `README.md` :

1. section « Capacités actuelles » — ajouter la flexion déviée :

```markdown
Flexion composée **déviée** (N + My + Mz, axe neutre d'inclinaison quelconque) sur les mêmes géométries, avec restitution de l'axe neutre comme droite oblique traçable dans le repère de la section, du bras de levier interne et des points d'application des résultantes.
```

2. ajouter un exemple de flexion déviée après l'exemple existant :

````markdown
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
````

3. section « Validation » — ajouter :

```markdown
- **Flexion déviée** (`tests/handcalc/biaxial-triangle-parabolic.test.ts`) : `N`, `My` et `Mz` d'un triangle intégralement sur la branche parabolique confrontés à trois intégrales fermées calculées à la main.
- **Invariance par isométrie** : tourner la section et la sollicitation du même angle laisse la capacité inchangée.
```

- [ ] **Step 6 : suite complète, typecheck et commit**

```bash
npm test && npm run typecheck
git add src/index.ts README.md tests/index.test.ts
git commit -m "feat+fix(api): exports session 3 et correctif des exports session 2 absents"
```

---

### Task 12 : banc de comparaison VCASLU

Le banc reste **vert sans intervention** tant que l'utilisateur n'a pas relevé les valeurs, et devient un contrôle croisé réel dès qu'il les renseigne.

**Files:**
- Create: `docs/validation/vcaslu.md`
- Create: `tests/validation/vcaslu-cases.ts`
- Create: `tests/validation/vcaslu.test.ts`

- [ ] **Step 1 : écrire les fixtures**

Créer `tests/validation/vcaslu-cases.ts` :

```ts
import type { NormProfile } from '../../src/model/norm-profile';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

/**
 * Profil normatif du banc de comparaison, LOCAL AUX FIXTURES.
 *
 * VCASLU travaille dans le cadre NTC, dont le seul ecart de coefficient
 * pertinent ici est alphaCc = 0.85. Ce profil n'est deliberement PAS exporte
 * par le module : la decision du projet est de ne publier qu'un seul profil,
 * `EC2_recommended`, l'utilisateur derivant lui-meme le sien pour son annexe
 * nationale.
 */
export function profilBancVcaslu(): NormProfile {
  return { ...ec2Recommended(), name: 'banc_VCASLU_NTC', alphaCc: 0.85 };
}

export interface CasVcaslu {
  nom: string;
  /**
   * Valeur relevee dans VCASLU : magnitude du moment resistant (kN·m) a
   * l'effort normal et dans la direction indiques. `null` tant que
   * l'utilisateur ne l'a pas saisie — le test est alors explicitement
   * ignore, pas faussement vert.
   */
  reference: number | null;
}

/** Tolerance de comparaison (spec §9.5). Ne pas elargir sans accord explicite. */
export const TOLERANCE_RELATIVE = 0.05;

export const CAS: CasVcaslu[] = [
  { nom: 'poteau rectangulaire 300x500, N = 800 kN, moment a 30 deg', reference: null },
  { nom: 'section en T, flexion simple deviee a 45 deg', reference: null },
  { nom: 'pieu circulaire D600, N = 1200 kN, moment a 45 deg', reference: null },
];
```

- [ ] **Step 2 : écrire le test**

Créer `tests/validation/vcaslu.test.ts`. Il construit les trois sections **exactement** comme les décrit `docs/validation/vcaslu.md` (tâche suivante), et compare quand la référence existe :

```ts
import { describe, it, expect } from 'vitest';
import { verifyBiaxial } from '../../src/solvers/uls-biaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { polygonSection } from '../../src/geometry/polygon';
import { circularSection, circularRebarCage } from '../../src/geometry/circle';
import { rectangularRebarLayout, rebarRow } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { profilBancVcaslu, CAS, TOLERANCE_RELATIVE } from './vcaslu-cases';

const profile = profilBancVcaslu();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

function cas0() {
  const layout = rectangularRebarLayout({
    width: 300,
    height: 500,
    cover: 30,
    stirrupDiameter: 8,
    steel,
    rows: [
      { face: 'bottom', bars: { count: 3, diameter: 20 } },
      { face: 'top', bars: { count: 3, diameter: 20 } },
    ],
  });
  const section = rectangularSection({ width: 300, height: 500, concrete, rebars: layout.bars });
  return verifyBiaxial(section, { N: 800, My: Math.cos(Math.PI / 6), Mz: Math.sin(Math.PI / 6) }, profile);
}

function cas1() {
  const bas = rebarRow({
    from: { y: 200, z: 450 },
    to: { y: 400, z: 450 },
    bars: { count: 3, diameter: 20 },
    steel,
  });
  const section = polygonSection({
    vertices: [
      { y: 0, z: 0 },
      { y: 600, z: 0 },
      { y: 600, z: 150 },
      { y: 425, z: 150 },
      { y: 425, z: 500 },
      { y: 175, z: 500 },
      { y: 175, z: 150 },
      { y: 0, z: 150 },
    ],
    concrete,
    rebars: bas.bars,
  });
  return verifyBiaxial(section, { N: 0, My: 1, Mz: 1 }, profile);
}

function cas2() {
  const section = circularSection({
    diameter: 600,
    concrete,
    rebars: circularRebarCage({
      diameter: 600,
      cover: 50,
      stirrupDiameter: 12,
      barDiameter: 20,
      count: 8,
      steel,
    }),
  });
  return verifyBiaxial(section, { N: 1200, My: 1, Mz: 1 }, profile);
}

const CALCULS = [cas0, cas1, cas2];

describe('Banc de comparaison VCASLU', () => {
  CAS.forEach((cas, i) => {
    const calculer = CALCULS[i];

    it(`${cas.nom} — converge et produit une capacite exploitable`, () => {
      const r = calculer();
      expect(r.converged).toBe(true);
      expect(r.M_Rd_magnitude).toBeGreaterThan(0);
      expect(r.rootCount).toBe(1);
    });

    const nomComparaison = `${cas.nom} — ecart a VCASLU sous ${TOLERANCE_RELATIVE * 100} %`;

    if (cas.reference === null) {
      it.skip(`${nomComparaison} (reference non saisie : voir docs/validation/vcaslu.md)`, () => {});
    } else {
      it(nomComparaison, () => {
        const r = calculer();
        const ecart = Math.abs(r.M_Rd_magnitude - cas.reference!) / cas.reference!;
        expect(ecart).toBeLessThan(TOLERANCE_RELATIVE);
      });
    }
  });
});
```

- [ ] **Step 3 : lancer le test**

Run: `npx vitest run tests/validation/vcaslu.test.ts`
Expected: PASS — 3 tests passés, 3 tests `skipped` avec le message de référence manquante.

**Si `rootCount` vaut autre chose que 1** sur l'un des trois cas : ne pas assouplir l'assertion. C'est précisément la situation que la spec §11 demande de rapporter à l'utilisateur.

- [ ] **Step 4 : écrire le protocole**

Créer `docs/validation/vcaslu.md` avec **exactement** cette structure et ces valeurs (elles doivent correspondre au test de l'étape 2 — si une valeur diverge entre les deux, c'est un défaut à corriger, pas à arbitrer) :

```markdown
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
```

Le document doit rester auto-suffisant : quelqu'un qui ne connaît pas le code doit pouvoir saisir les trois cas dans VCASLU sans lire une ligne de TypeScript.

- [ ] **Step 5 : commit**

```bash
git add docs/validation/vcaslu.md tests/validation/
git commit -m "test(validation): banc de comparaison VCASLU, references a relever par l utilisateur"
```

---

### Task 13 : porte de session — suite complète, budget mesuré, documentation

**Files:**
- Modify: `README.md` (si un manque apparaît)

- [ ] **Step 1 : suite complète et typecheck**

```bash
npm test
npm run typecheck
```

Expected: tous les tests au vert (les 3 tests VCASLU `skipped` sont attendus), aucune erreur de typage.

- [ ] **Step 2 : mesurer le budget de calcul**

La mesure n'est **pas assertée** — une assertion de temps rendrait la suite instable. Écrire ce fichier temporaire :

```ts
// tests/tmp-budget.test.ts — A SUPPRIMER apres relevé
import { describe, it } from 'vitest';
import { verifyBiaxial } from '../src/solvers/uls-biaxial';
import { circularSection, circularRebarCage } from '../src/geometry/circle';
import { createConcrete } from '../src/model/concrete';
import { createSteel } from '../src/model/steel';
import { ec2Recommended } from '../src/norms/ec2-recommended';

describe('budget', () => {
  it('mesure une resolution deviee sur pieu D600', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);

    const pieu = circularSection({
      diameter: 600,
      concrete,
      rebars: circularRebarCage({
        diameter: 600, cover: 50, stirrupDiameter: 12,
        barDiameter: 20, count: 8, steel,
      }),
    });

    const t0 = performance.now();
    const r = verifyBiaxial(pieu, { N: 1200, My: 1, Mz: 1 }, profile);
    const dt = performance.now() - t0;

    console.log(`duree = ${dt.toFixed(1)} ms, innerSolves = ${r.innerSolves}`);
  });
});
```

Run: `npx vitest run tests/tmp-budget.test.ts`

Puis **supprimer le fichier** (`rm tests/tmp-budget.test.ts`) : il ne doit pas rester dans la suite. Rapporter :

- temps d'une résolution déviée sur le pieu Ø600 aux réglages par défaut ;
- `innerSolves` observé sur ce même cas.

Au-delà de ~300 ms, le signaler dans le rapport de tâche : l'accélération de la boucle interne sera arbitrée avec l'utilisateur, **pas décidée ici**.

- [ ] **Step 3 : vérifier la couverture de la spec**

Relire `docs/superpowers/specs/2026-09-03-section-uls-session-3-design.md` et vérifier point par point que chaque exigence a un test ou un fichier correspondant. Rapporter tout écart constaté plutôt que de le combler en silence.

- [ ] **Step 4 : commit final si des ajustements de documentation ont été nécessaires**

```bash
git add -A
git commit -m "docs: porte de validation session 3"
```

---

## Résumé des portes de validation

| Porte | Tâche | Ce qu'elle prouve |
|---|---|---|
| Recalcul manuel fermé | 7 | `N`, `My` **et** `Mz` de l'intégration biaxiale, contre trois intégrales calculées à la main |
| Non-régression `θ = 0` | 9 | Le solveur dévié redonne exactement le solveur droit de la session 2 |
| Symétrie 45° | 9 | Porte du plan d'origine : composantes égales sur poteau carré symétrique |
| Symétries d'orientation | 9 | Quatre directions cardinales de même capacité |
| Invariance par isométrie | 10 | Chaîne rotation / rotation inverse correcte, sur section et ferraillage asymétriques |
| Bras de levier | 9 | `M = F · z` vérifié en flexion simple |
| Budget | 9 + 13 | Convergence en ≤ 60 résolutions droites, temps mesuré et rapporté |
| Non-double-comptage | 3 | Un poteau « 4+4+2+2 » donne 12 barres, pas 16 |
| API publique | 11 | L'exemple du README s'exécute réellement |
| Banc VCASLU | 12 | Contrôle croisé externe, armé dès que l'utilisateur saisit les relevés |
