# Section-ULS — Session 1 (socle, matériaux, ELU rectangulaire droit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer un noyau de calcul TypeScript testé qui vérifie une section rectangulaire en béton armé à l'ELU en flexion composée droite (N + M autour d'un seul axe), conforme à l'EN 1992-1-1, avec une porte de validation par recalcul manuel indépendant.

**Architecture:** Noyau pur (aucune dépendance DOM/réseau), organisé en couches : `model/` (types + dérivation des grandeurs normatives), `constitutive/` (lois contrainte-déformation), `norms/` (profil `EC2_recommended`), `geometry/` (géométrie rectangulaire pour cette session), `integration/` (méthode des fibres par bandes), `solvers/` (recherche de l'axe neutre par bissection). Convention : **N positif en compression**, déformations positives en compression, profondeur mesurée depuis la fibre supérieure (comprimée).

**Tech Stack:** TypeScript (strict), Vitest pour les tests, `tsc --noEmit` comme unique gate de lint/typage (pas d'ESLint séparé — outillage volontairement minimal). npm comme gestionnaire de paquets. Aucun bundler pour l'instant : le noyau est du code TS pur sans UI à ce stade.

**Limitation assumée et documentée (pas un bug) :** le profil `EC2_recommended` utilise la branche horizontale de l'acier (pas de limite de déformation `εud`). En conséquence, seul le pivot béton (`εcu2` en fibre supérieure) gouverne dans cette session — le pivot acier (`εud`) et la branche inclinée de l'acier ne sont pas implémentés ici ; ils seront ajoutés avec le contrôle de ductilité (session 7 du plan d'origine). Ceci est cohérent avec le comportement réel de l'EC2 §3.2.7 : la branche horizontale n'impose justement aucune limite de déformation à vérifier.

---

## Task 1: Scaffold du dépôt npm/TypeScript/Vitest

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Créer `package.json`**

```json
{
  "name": "section-uls",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Créer `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Créer `.gitignore`**

```
node_modules/
dist/
```

- [ ] **Step 4: Installer les dépendances**

Run: `npm install`
Expected: `package-lock.json` créé, `node_modules/` peuplé, aucune erreur.

- [ ] **Step 5: Écrire un test de fumée**

Créer `tests/smoke.test.ts` :

```ts
import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('exécute un test trivial', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Vérifier que le pipeline tourne**

Run: `npm test`
Expected: `1 passed` (le test de fumée).

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore tests/smoke.test.ts
git commit -m "chore: scaffold npm/TypeScript/Vitest"
```

---

## Task 2: `NormProfile` et profil `EC2_recommended`

**Files:**
- Create: `src/model/norm-profile.ts`
- Create: `src/norms/ec2-recommended.ts`
- Test: `tests/norms/ec2-recommended.test.ts`

- [ ] **Step 1: Écrire le test (échoue, rien n'existe encore)**

Créer `tests/norms/ec2-recommended.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('ec2Recommended', () => {
  it('retourne les coefficients partiels recommandés EN 1992-1-1 tableau 2.1N', () => {
    const profile = ec2Recommended();
    expect(profile.name).toBe('EC2_recommended');
    expect(profile.gammaC).toBe(1.5);
    expect(profile.gammaS).toBe(1.15);
    expect(profile.alphaCc).toBe(1.0);
    expect(profile.nBands).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/norms/ec2-recommended.test.ts`
Expected: FAIL — `Cannot find module '../../src/norms/ec2-recommended'`.

- [ ] **Step 3: Implémenter le type `NormProfile`**

Créer `src/model/norm-profile.ts` :

```ts
/**
 * Couche de configuration normative (EN 1992-1-1 §2.4.2.4, §3.1.6).
 * Aucune constante normative n'est codée en dur ailleurs dans le noyau —
 * toute grandeur qui dépend de l'annexe nationale provient d'un NormProfile.
 */
export interface NormProfile {
  name: string;
  gammaC: number;
  gammaS: number;
  alphaCc: number;
  /** Nombre de bandes pour la méthode des fibres (intégration/fiber-rectangle.ts). */
  nBands: number;
}
```

- [ ] **Step 4: Implémenter `ec2Recommended`**

Créer `src/norms/ec2-recommended.ts` :

```ts
import type { NormProfile } from '../model/norm-profile';

/**
 * Valeurs recommandées de l'EN 1992-1-1, sans modification d'annexe nationale.
 * L'utilisateur du module définit lui-même ses propres coefficients d'annexe
 * (belge, luxembourgeoise ou autre) en dérivant un NormProfile personnalisé —
 * aucune annexe nationale spécifique n'est codée dans le noyau.
 */
export function ec2Recommended(): NormProfile {
  return {
    name: 'EC2_recommended',
    gammaC: 1.5, // §2.4.2.4, tableau 2.1N
    gammaS: 1.15, // §2.4.2.4, tableau 2.1N
    alphaCc: 1.0, // §3.1.6(1)P, éq. 3.15, valeur recommandée
    nBands: 200,
  };
}
```

- [ ] **Step 5: Lancer le test, vérifier le succès**

Run: `npm test -- tests/norms/ec2-recommended.test.ts`
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/model/norm-profile.ts src/norms/ec2-recommended.ts tests/norms/ec2-recommended.test.ts
git commit -m "feat(norms): NormProfile + profil EC2_recommended"
```

---

## Task 3: Matériau béton — dérivation des paramètres (EN 1992-1-1 tableau 3.1)

**Files:**
- Create: `src/model/concrete.ts`
- Test: `tests/model/concrete.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/model/concrete.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('createConcrete', () => {
  it('dérive fcd, epsC2, epsCu2, n pour fck <= 50 MPa (EN 1992-1-1 tableau 3.1)', () => {
    const profile = ec2Recommended();
    const c = createConcrete(25, profile);
    expect(c.fcd).toBeCloseTo(16.6667, 3); // alphaCc * fck / gammaC = 1.0*25/1.5
    expect(c.epsC2).toBeCloseTo(0.002, 6);
    expect(c.epsCu2).toBeCloseTo(0.0035, 6);
    expect(c.n).toBe(2);
    expect(c.law).toBe('parabola-rectangle');
  });

  it('dérive fcd, epsC2, epsCu2, n pour fck > 50 MPa via les formules du tableau 3.1', () => {
    const profile = ec2Recommended();
    const c = createConcrete(70, profile);
    // epsC2 = (2.0 + 0.085*(fck-50)^0.53) * 1e-3
    expect(c.epsC2).toBeCloseTo(0.0024159, 5);
    // epsCu2 = (2.6 + 35*((90-fck)/100)^4) * 1e-3 — exact car (20/100)^4 = 0.0016
    expect(c.epsCu2).toBeCloseTo(0.002656, 6);
    // n = 1.4 + 23.4*((90-fck)/100)^4 — exact
    expect(c.n).toBeCloseTo(1.43744, 5);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/model/concrete.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `src/model/concrete.ts` :

```ts
import type { NormProfile } from './norm-profile';

export type ConcreteLaw = 'parabola-rectangle';

/**
 * Matériau béton avec paramètres dérivés (EN 1992-1-1 §3.1.6, §3.1.7, tableau 3.1).
 * Seule la loi parabole-rectangle est implémentée dans cette session.
 */
export interface ConcreteMaterial {
  fck: number;
  gammaC: number;
  alphaCc: number;
  fcd: number;
  law: ConcreteLaw;
  epsC2: number;
  epsCu2: number;
  n: number;
}

export function createConcrete(fck: number, profile: NormProfile): ConcreteMaterial {
  const fcd = (profile.alphaCc * fck) / profile.gammaC;

  let epsC2: number;
  let epsCu2: number;
  let n: number;

  if (fck <= 50) {
    epsC2 = 2.0e-3;
    epsCu2 = 3.5e-3;
    n = 2;
  } else {
    epsC2 = (2.0 + 0.085 * Math.pow(fck - 50, 0.53)) * 1e-3;
    epsCu2 = (2.6 + 35 * Math.pow((90 - fck) / 100, 4)) * 1e-3;
    n = 1.4 + 23.4 * Math.pow((90 - fck) / 100, 4);
  }

  return {
    fck,
    gammaC: profile.gammaC,
    alphaCc: profile.alphaCc,
    fcd,
    law: 'parabola-rectangle',
    epsC2,
    epsCu2,
    n,
  };
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/model/concrete.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/model/concrete.ts tests/model/concrete.test.ts
git commit -m "feat(model): dérivation matériau béton (EN 1992-1-1 tableau 3.1)"
```

---

## Task 4: Loi constitutive béton — parabole-rectangle

**Files:**
- Create: `src/constitutive/concrete-law.ts`
- Test: `tests/constitutive/concrete-law.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/constitutive/concrete-law.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { concreteStress } from '../../src/constitutive/concrete-law';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('concreteStress (parabole-rectangle, EN 1992-1-1 §3.1.7 éq. 3.17-3.18)', () => {
  const concrete = createConcrete(25, ec2Recommended()); // fcd=16.6667, epsC2=0.002, epsCu2=0.0035, n=2

  it('vaut 0 en traction (deformation negative ou nulle)', () => {
    expect(concreteStress(-0.001, concrete)).toBe(0);
    expect(concreteStress(0, concrete)).toBe(0);
  });

  it('suit la parabole entre 0 et epsC2', () => {
    // eps=0.001 -> eps/epsC2=0.5 -> sigma = fcd*(1-(1-0.5)^2) = fcd*0.75
    expect(concreteStress(0.001, concrete)).toBeCloseTo(16.6667 * 0.75, 3);
  });

  it('vaut fcd sur le plateau entre epsC2 et epsCu2', () => {
    expect(concreteStress(0.002, concrete)).toBeCloseTo(16.6667, 3);
    expect(concreteStress(0.003, concrete)).toBeCloseTo(16.6667, 3);
    expect(concreteStress(0.0035, concrete)).toBeCloseTo(16.6667, 3);
  });

  it('vaut 0 au-dela de epsCu2 (beton ecrase, ne devrait pas se produire en pratique)', () => {
    expect(concreteStress(0.004, concrete)).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/constitutive/concrete-law.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `src/constitutive/concrete-law.ts` :

```ts
import type { ConcreteMaterial } from '../model/concrete';

/**
 * Loi parabole-rectangle (EN 1992-1-1 §3.1.7(1), éq. 3.17-3.18).
 * Convention : deformation positive en compression.
 */
export function concreteStress(eps: number, concrete: ConcreteMaterial): number {
  const { fcd, epsC2, epsCu2, n } = concrete;

  if (eps <= 0) return 0;
  if (eps < epsC2) return fcd * (1 - Math.pow(1 - eps / epsC2, n));
  if (eps <= epsCu2) return fcd;
  return 0;
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/constitutive/concrete-law.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/constitutive/concrete-law.ts tests/constitutive/concrete-law.test.ts
git commit -m "feat(constitutive): loi beton parabole-rectangle"
```

---

## Task 5: Matériau acier — dérivation des paramètres

**Files:**
- Create: `src/model/steel.ts`
- Test: `tests/model/steel.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/model/steel.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('createSteel', () => {
  it('derive fyd et epsYd (EN 1992-1-1 §3.2.7)', () => {
    const profile = ec2Recommended();
    const s = createSteel(500, 200000, profile);
    expect(s.fyd).toBeCloseTo(434.7826, 3); // fyk/gammaS = 500/1.15
    expect(s.epsYd).toBeCloseTo(0.0021739, 6); // fyd/Es
    expect(s.Es).toBe(200000);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/model/steel.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `src/model/steel.ts` :

```ts
import type { NormProfile } from './norm-profile';

/**
 * Matériau acier, branche horizontale (EN 1992-1-1 §3.2.7 éq. 3.8) —
 * pas de limite de deformation dans cette session (voir en-tete du plan).
 */
export interface SteelMaterial {
  fyk: number;
  gammaS: number;
  Es: number;
  fyd: number;
  epsYd: number;
}

export function createSteel(fyk: number, Es: number, profile: NormProfile): SteelMaterial {
  const fyd = fyk / profile.gammaS;
  const epsYd = fyd / Es;
  return { fyk, gammaS: profile.gammaS, Es, fyd, epsYd };
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/model/steel.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/model/steel.ts tests/model/steel.test.ts
git commit -m "feat(model): derivation matiere acier"
```

---

## Task 6: Loi constitutive acier — bilinéaire, branche horizontale

**Files:**
- Create: `src/constitutive/steel-law.ts`
- Test: `tests/constitutive/steel-law.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/constitutive/steel-law.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { steelStress } from '../../src/constitutive/steel-law';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('steelStress (bilineaire, branche horizontale, EN 1992-1-1 §3.2.7)', () => {
  const steel = createSteel(500, 200000, ec2Recommended()); // fyd=434.7826, epsYd=0.0021739

  it('est elastique lineaire sous la limite elastique', () => {
    expect(steelStress(0.001, steel)).toBeCloseTo(200, 3); // Es*eps
    expect(steelStress(0.002, steel)).toBeCloseTo(400, 3); // encore < epsYd
  });

  it('plafonne a fyd en compression au-dela de la limite elastique', () => {
    expect(steelStress(0.003, steel)).toBeCloseTo(434.7826, 3);
    expect(steelStress(0.01, steel)).toBeCloseTo(434.7826, 3);
  });

  it('plafonne a -fyd en traction au-dela de la limite elastique, sans limite de deformation', () => {
    expect(steelStress(-0.003, steel)).toBeCloseTo(-434.7826, 3);
    expect(steelStress(-0.05, steel)).toBeCloseTo(-434.7826, 3);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/constitutive/steel-law.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `src/constitutive/steel-law.ts` :

```ts
import type { SteelMaterial } from '../model/steel';

/**
 * Loi bilineaire, branche horizontale (EN 1992-1-1 §3.2.7 éq. 3.8).
 * Convention : deformation positive en compression. Pas de limite de
 * deformation (branche inclinee avec epsUd hors scope de cette session).
 */
export function steelStress(eps: number, steel: SteelMaterial): number {
  const { Es, fyd, epsYd } = steel;

  if (eps >= epsYd) return fyd;
  if (eps <= -epsYd) return -fyd;
  return Es * eps;
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/constitutive/steel-law.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/constitutive/steel-law.ts tests/constitutive/steel-law.test.ts
git commit -m "feat(constitutive): loi acier bilineaire branche horizontale"
```

---

## Task 7: Géométrie rectangulaire, `Section` et `Action`

**Files:**
- Create: `src/geometry/rectangle.ts`
- Create: `src/model/section.ts`
- Test: `tests/geometry/rectangle.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/geometry/rectangle.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('rectangularSection', () => {
  it('assemble une section rectangulaire avec ses armatures', () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 4 * Math.PI * 10 ** 2; // 4 x diam 20mm

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    expect(section.geometry.kind).toBe('rectangle');
    expect(section.geometry.width).toBe(300);
    expect(section.geometry.height).toBe(500);
    expect(section.rebars).toHaveLength(1);
    expect(section.rebars[0].depthFromTop).toBe(450);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/geometry/rectangle.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter la géométrie**

Créer `src/geometry/rectangle.ts` :

```ts
export interface RectangularGeometry {
  kind: 'rectangle';
  /** Largeur (mm). */
  width: number;
  /** Hauteur totale (mm). */
  height: number;
}
```

- [ ] **Step 4: Implémenter `Section`, `RebarLayer`, `Action` et le constructeur**

Créer `src/model/section.ts` :

```ts
import type { ConcreteMaterial } from './concrete';
import type { SteelMaterial } from './steel';
import type { RectangularGeometry } from '../geometry/rectangle';

/**
 * Convention geometrique (fixee, ne change plus une fois la session 1 entamee) :
 * - reperage barycentrique de la section brute de beton ;
 * - profondeur mesuree depuis la fibre superieure (comprimee), croissante vers le bas ;
 * - N positif en compression, deformations positives en compression.
 */
export interface RebarLayer {
  /** Aire de l'armature (mm²). */
  area: number;
  /** Profondeur depuis la fibre superieure (mm). */
  depthFromTop: number;
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
  rebars: RebarLayer[];
}): Section {
  return {
    geometry: { kind: 'rectangle', width: params.width, height: params.height },
    concrete: params.concrete,
    rebars: params.rebars,
  };
}
```

- [ ] **Step 5: Lancer le test, vérifier le succès**

Run: `npm test -- tests/geometry/rectangle.test.ts`
Expected: `1 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/geometry/rectangle.ts src/model/section.ts tests/geometry/rectangle.test.ts
git commit -m "feat(model): Section, RebarLayer, Action + geometrie rectangulaire"
```

---

## Task 8: Intégration par fibres (section rectangulaire)

**Files:**
- Create: `src/integration/fiber-rectangle.ts`
- Test: `tests/integration/fiber-rectangle.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/integration/fiber-rectangle.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { integrateRectangle } from '../../src/integration/fiber-rectangle';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('integrateRectangle', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile); // fcd=16.6667

  it('donne un moment nul pour une contrainte uniforme (symetrie autour du centroide)', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    // Deformation constante sur le plateau (epsC2 <= eps <= epsCu2) -> sigma = fcd partout
    const strainAt = () => concrete.epsC2;

    const result = integrateRectangle(section, strainAt, 100);

    // N attendu = fcd * b * h / 1000 (conversion N -> kN)
    expect(result.N).toBeCloseTo((concrete.fcd * 300 * 500) / 1000, 1);
    expect(result.M).toBeCloseTo(0, 6);
  });

  it('vaut 0 en N et M pour une section entierement tendue', () => {
    const section = rectangularSection({ width: 300, height: 500, concrete, rebars: [] });
    const strainAt = () => -0.001; // traction partout -> beton ne resiste pas

    const result = integrateRectangle(section, strainAt, 50);

    expect(result.N).toBe(0);
    expect(result.M).toBe(0);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/integration/fiber-rectangle.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `src/integration/fiber-rectangle.ts` :

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
 * Methode des fibres par bandes horizontales (EN 1992-1-1, principe general).
 * `strainAt(depthFromTop)` donne la deformation du champ lineaire suppose a
 * une profondeur donnee (mm depuis la fibre superieure). Les armatures sont
 * traitees comme des contributions ponctuelles ; le beton qu'elles deplacent
 * est retranche pour ne pas le compter deux fois.
 */
export function integrateRectangle(
  section: Section,
  strainAt: (depthFromTop: number) => number,
  nBands: number
): StressResultant {
  const { width, height } = section.geometry;
  const dz = height / nBands;
  const centroid = height / 2;

  let N = 0; // Newtons
  let M = 0; // Newton*mm

  for (let i = 0; i < nBands; i++) {
    const xi = (i + 0.5) * dz;
    const eps = strainAt(xi);
    const sigma = concreteStress(eps, section.concrete); // MPa
    const force = sigma * width * dz; // N
    const arm = centroid - xi; // mm, positif au-dessus du centroide
    N += force;
    M += force * arm;
  }

  for (const rebar of section.rebars) {
    const eps = strainAt(rebar.depthFromTop);
    const steelSigma = steelStress(eps, rebar.steel);
    const displacedConcreteSigma = concreteStress(eps, section.concrete);
    const netForce = (steelSigma - displacedConcreteSigma) * rebar.area; // N
    const arm = centroid - rebar.depthFromTop;
    N += netForce;
    M += netForce * arm;
  }

  return { N: N / 1000, M: M / 1e6 }; // kN, kN·m
}
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/integration/fiber-rectangle.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/integration/fiber-rectangle.ts tests/integration/fiber-rectangle.test.ts
git commit -m "feat(integration): methode des fibres pour section rectangulaire"
```

---

## Task 9: Solveur ELU flexion droite (`verifyUniaxial`)

**Files:**
- Create: `src/solvers/uls-uniaxial.ts`
- Test: `tests/solvers/uls-uniaxial.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/solvers/uls-uniaxial.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('verifyUniaxial', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);
  const As = 4 * Math.PI * 10 ** 2; // 4Ø20

  it('converge et donne un M_Rd positif en flexion simple (N=0)', () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
    expect(result.N_Rd).toBeCloseTo(0, 1);
    expect(result.neutralAxisDepth).toBeGreaterThan(0);
    expect(result.neutralAxisDepth).toBeLessThan(500);
  });

  it("signale la non-convergence quand l'effort de traction demande depasse la capacite de la section", () => {
    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    // Capacite max en traction ~ -fyd*As ~ -546 kN ; on demande bien au-dela.
    const result = verifyUniaxial(section, { N: -2000, M: 0 }, profile);

    expect(result.converged).toBe(false);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/solvers/uls-uniaxial.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter**

Créer `src/solvers/uls-uniaxial.ts` :

```ts
import type { Section, Action } from '../model/section';
import type { NormProfile } from '../model/norm-profile';
import { integrateRectangle } from '../integration/fiber-rectangle';

export interface UniaxialResult {
  /** Profondeur de l'axe neutre depuis la fibre superieure (mm). */
  neutralAxisDepth: number;
  /** Moment resistant a l'effort normal impose (kN·m). */
  M_Rd: number;
  /** Effort normal resultant au point de convergence (kN), doit egaler action.N. */
  N_Rd: number;
  converged: boolean;
}

/**
 * Verification ELU en flexion composee droite, section rectangulaire
 * (EN 1992-1-1). Recherche par bissection de la profondeur d'axe neutre x
 * telle que N_R(x) = N_Ed, avec le champ de deformation cale sur le pivot
 * beton (fibre superieure a epsCu2) — voir limitation documentee en tete du
 * plan de session 1 concernant le pivot acier.
 */
export function verifyUniaxial(section: Section, action: Action, norm: NormProfile): UniaxialResult {
  const { epsCu2 } = section.concrete;
  const height = section.geometry.height;

  const strainField = (x: number) => (xi: number) => epsCu2 * (1 - xi / x);

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

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/solvers/uls-uniaxial.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/solvers/uls-uniaxial.ts tests/solvers/uls-uniaxial.test.ts
git commit -m "feat(solvers): solveur ELU flexion composee droite (bissection)"
```

---

## Task 10: API publique du noyau (`src/index.ts`)

**Files:**
- Create: `src/index.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Écrire le test**

Créer `tests/index.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { ec2Recommended, createConcrete, createSteel, rectangularSection, verifyUniaxial } from '../src/index';

describe('API publique du noyau', () => {
  it("permet de verifier une section rectangulaire de bout en bout via l'entree publique", () => {
    const profile = ec2Recommended();
    const concrete = createConcrete(25, profile);
    const steel = createSteel(500, 200000, profile);
    const As = 4 * Math.PI * 10 ** 2;

    const section = rectangularSection({
      width: 300,
      height: 500,
      concrete,
      rebars: [{ area: As, depthFromTop: 450, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);
    expect(result.M_Rd).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Lancer le test, vérifier l'échec**

Run: `npm test -- tests/index.test.ts`
Expected: FAIL — module introuvable.

- [ ] **Step 3: Implémenter le barrel**

Créer `src/index.ts` :

```ts
export type { NormProfile } from './model/norm-profile';
export { ec2Recommended } from './norms/ec2-recommended';

export type { ConcreteMaterial, ConcreteLaw } from './model/concrete';
export { createConcrete } from './model/concrete';
export { concreteStress } from './constitutive/concrete-law';

export type { SteelMaterial } from './model/steel';
export { createSteel } from './model/steel';
export { steelStress } from './constitutive/steel-law';

export type { RectangularGeometry } from './geometry/rectangle';
export type { Section, RebarLayer, Action } from './model/section';
export { rectangularSection } from './model/section';

export type { StressResultant } from './integration/fiber-rectangle';
export { integrateRectangle } from './integration/fiber-rectangle';

export type { UniaxialResult } from './solvers/uls-uniaxial';
export { verifyUniaxial } from './solvers/uls-uniaxial';
```

- [ ] **Step 4: Lancer le test, vérifier le succès**

Run: `npm test -- tests/index.test.ts`
Expected: `1 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: API publique du noyau (src/index.ts)"
```

---

## Task 11: Porte de validation — recalcul manuel indépendant (flexion simple)

**Files:**
- Create: `tests/handcalc/rectangular-beam-pure-bending.test.ts`

C'est la porte de validation de la session 1 : le résultat du solveur numérique doit
être confronté à un calcul fermé, **indépendant du chemin de code numérique**
(formules d'intégration fermée du bloc parabole-rectangle, pas une ré-exécution
de `integrateRectangle`).

- [ ] **Step 1: Écrire le calcul fermé et le comparer au solveur**

Créer `tests/handcalc/rectangular-beam-pure-bending.test.ts` :

```ts
import { describe, it, expect } from 'vitest';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { verifyUniaxial } from '../../src/solvers/uls-uniaxial';
import { rectangularSection } from '../../src/geometry/rectangle';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('Poutre rectangulaire, flexion simple pure (N=0) — recalcul manuel', () => {
  it('M_Rd du solveur correspond au calcul ferme du bloc parabole-rectangle (EN 1992-1-1 §3.1.7 eq. 3.17-3.18), ecart < 1%', () => {
    const b = 300; // mm
    const h = 500; // mm
    const d = 450; // mm, profondeur de l'armature tendue depuis la fibre superieure
    const fck = 25; // MPa
    const fyk = 500; // MPa
    const Es = 200000; // MPa
    const As = 4 * Math.PI * 10 ** 2; // 4Ø20, mm²

    const profile = ec2Recommended();
    const concrete = createConcrete(fck, profile);
    const steel = createSteel(fyk, Es, profile);

    // --- Calcul manuel ferme, independant du solveur numerique ---
    //
    // Pour le bloc parabole-rectangle (n=2, fck<=50), l'integrale fermee de
    // la resultante de compression sur une profondeur d'axe neutre x est un
    // resultat standard :
    //   Fc(x) = fcd * b * x * (1 - epsC2/(3*epsCu2))
    // decompose en une zone "plateau" (0 a xi1, contrainte constante fcd) et
    // une zone parabolique (xi1 a x, contrainte croissante de 0 a fcd) :
    //   xi1 = x*(1 - epsC2/epsCu2)     [profondeur ou eps atteint epsC2]
    //   Lp  = x - xi1 = x*epsC2/epsCu2
    //   force1 = fcd*b*xi1                    (zone plateau)
    //   force2 = (2/3)*fcd*b*Lp                (zone parabolique, integrale standard)
    //   centre1 = xi1/2                        (depuis la fibre superieure)
    //   centre2 = xi1 + 3*Lp/8
    //
    // On suppose l'armature tendue plastifiee a l'ELU (hypothese verifiee
    // ci-dessous) : Fc(x) = fyd*As donne x directement (equilibre N=0).

    const k1 = 1 - concrete.epsC2 / (3 * concrete.epsCu2);
    const fcCoeffPerMm = concrete.fcd * b * k1; // N par mm de profondeur d'axe neutre

    const fsYield = steel.fyd * As; // N
    const xHand = fsYield / fcCoeffPerMm; // mm

    // Verification de l'hypothese de plastification de l'armature tendue
    const epsSteelHand = concrete.epsCu2 * (d / xHand - 1);
    expect(epsSteelHand).toBeGreaterThan(steel.epsYd);

    const xi1 = xHand * (1 - concrete.epsC2 / concrete.epsCu2);
    const Lp = xHand - xi1;
    const force1 = concrete.fcd * b * xi1;
    const force2 = (2 / 3) * concrete.fcd * b * Lp;
    const centre1 = xi1 / 2;
    const centre2 = xi1 + (3 * Lp) / 8;

    const fcTotal = force1 + force2; // N
    const centroidFromTop = (force1 * centre1 + force2 * centre2) / fcTotal; // mm

    const mRdHand = (fcTotal * (d - centroidFromTop)) / 1e6; // kN·m

    // --- Solveur numerique (methode des fibres + bissection) ---
    const section = rectangularSection({
      width: b,
      height: h,
      concrete,
      rebars: [{ area: As, depthFromTop: d, steel }],
    });

    const result = verifyUniaxial(section, { N: 0, M: 0 }, profile);

    expect(result.converged).toBe(true);

    const relativeError = Math.abs(result.M_Rd - mRdHand) / mRdHand;
    expect(relativeError).toBeLessThan(0.01); // porte de validation : ecart < 1%
  });
});
```

- [ ] **Step 2: Lancer le test**

Run: `npm test -- tests/handcalc/rectangular-beam-pure-bending.test.ts`
Expected: `1 passed`.

Si le test échoue avec un écart > 1% : ne pas ajuster la tolérance pour le faire
passer. Vérifier d'abord si l'erreur vient du calcul fermé (relire la dérivation
ci-dessus) ou du solveur numérique (`nBands` insuffisant, signe de l'arme de levier,
erreur dans `integrateRectangle`) — documenter la cause trouvée dans le message de
commit avant de corriger, conformément à la stratégie de validation du plan d'origine
(« tout écart doit être expliqué, jamais masqué »).

- [ ] **Step 3: Commit**

```bash
git add tests/handcalc/rectangular-beam-pure-bending.test.ts
git commit -m "test(handcalc): porte de validation session 1 - flexion simple rectangulaire"
```

---

## Task 12: Vérification finale de la session 1

**Files:** aucun fichier nouveau — vérification de bout en bout.

- [ ] **Step 1: Lancer la suite complète**

Run: `npm test`
Expected: tous les tests passent (scaffold + norms + model + constitutive + geometry + integration + solvers + index + handcalc).

- [ ] **Step 2: Lancer le typecheck**

Run: `npm run typecheck`
Expected: sortie vide, code de sortie 0.

- [ ] **Step 3: Vérifier l'état git**

Run: `git status`
Expected: working tree propre, tous les fichiers committés.

- [ ] **Step 4: Commit de clôture (si nécessaire)**

S'il reste des fichiers non committés (résidus des étapes précédentes) :

```bash
git add -A
git commit -m "chore: cloture session 1 - noyau ELU rectangulaire droit valide"
```

**Session 1 terminée.** Le moteur vérifie une section rectangulaire en béton armé
à l'ELU en flexion composée droite, avec porte de validation franchie. Prochaine
étape : plan de la session 2 (géométrie polygonale quelconque), à rédiger séparément
une fois cette session revue.
