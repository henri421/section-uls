import { describe, it, expect } from 'vitest';
import { verifyServiceUniaxial } from '../../src/service/verify-service';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('Methode n — poutre rectangulaire, recalcul manuel ferme', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);

  it('retrouve l axe neutre et les contraintes du calcul classique', () => {
    const b = 300;
    const h = 500;
    const d = 450;
    const As = 3 * (Math.PI * 20 ** 2) / 4;
    const n = 15;
    const M = 100; // kN·m

    // --- Calcul manuel independant ---
    // Equilibre des moments statiques de la section homogeneisee fissuree :
    //   b*x²/2 = n*As*(d - x)
    // soit  (b/2)x² + n*As*x - n*As*d = 0
    const a2 = b / 2;
    const a1 = n * As;
    const a0 = -n * As * d;
    const xMain = (-a1 + Math.sqrt(a1 ** 2 - 4 * a2 * a0)) / (2 * a2);

    const brasMain = d - xMain / 3;
    const sigmaSMain = (M * 1e6) / (As * brasMain);
    const sigmaCMain = (2 * M * 1e6) / (b * xMain * brasMain);

    // Valeurs annoncees dans la spec, controlees ici independamment.
    expect(xMain).toBeCloseTo(164.14, 1);
    expect(brasMain).toBeCloseTo(395.29, 1);
    expect(sigmaSMain).toBeCloseTo(268.4, 0);
    expect(sigmaCMain).toBeCloseTo(10.28, 1);

    // --- Ce que produit le solveur ---
    const section = rectangularSection({
      width: b, height: h, concrete,
      rebars: [{ depthFromTop: d, area: As, steel }],
    });
    const r = verifyServiceUniaxial(section, { N: 0, M }, { n });

    expect(r.converged).toBe(true);
    // L'axe neutre du module est repere depuis le centroide.
    expect(r.neutralAxisZ).toBeCloseTo(xMain - h / 2, 2);
    expect(r.sigmaC).toBeCloseTo(sigmaCMain, 2);
    expect(r.sigmaS).toBeCloseTo(sigmaSMain, 1);
  });
});
