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
