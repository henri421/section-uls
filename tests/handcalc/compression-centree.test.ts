import { describe, it, expect } from 'vitest';
import { interactionCurveNM } from '../../src/domains/interaction';
import { rectangularSection } from '../../src/geometry/rectangle';
import { rectangularRebarLayout } from '../../src/geometry/rebar-layout';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

describe('Compression centree — recalcul manuel du sommet du diagramme N-M', () => {
  const profile = ec2Recommended();
  const concrete = createConcrete(25, profile);
  const steel = createSteel(500, 200000, profile);

  it("l'effort normal maximal du domaine vaut fcd*Ac + (sigma_s(epsC2) - fcd)*As", () => {
    const layout = rectangularRebarLayout({
      width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
      rows: [
        { face: 'bottom', bars: { count: 3, diameter: 20 } },
        { face: 'top', bars: { count: 3, diameter: 20 } },
        { face: 'left', bars: { count: 1, diameter: 20 } },
        { face: 'right', bars: { count: 1, diameter: 20 } },
      ],
    });
    const section = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });

    // --- Calcul manuel independant ---
    // En compression pure, le pivot C impose la deformation uniforme epsC2,
    // figure 6.1 : le beton est a fcd, et l'acier SOUS sa limite elastique
    // (epsC2 = 2‰ < epsYd = 2,17‰), donc a Es*epsC2 = 400 MPa et non a fyd. Le
    // terme (sigma_s - fcd) et non sigma_s parce que l'armature DEPLACE du
    // beton, exactement comme dans l'integration.
    const Ac = 400 * 400; // 160 000 mm²
    const As = 8 * (Math.PI * 20 ** 2) / 4; // 8 HA20 = 2513,3 mm²
    const fcd = concrete.fcd; // 16,667 MPa
    const sigmaS = 200000 * 0.002; // 400 MPa

    const N_max_main = (fcd * Ac + (sigmaS - fcd) * As) / 1000; // kN

    expect(N_max_main).toBeCloseTo(3630.1, 1);

    // --- Ce que produit le balayage ---
    const courbe = interactionCurveNM(section, profile, { steps: 80 });
    const N_max_calcule = Math.max(...courbe.map((p) => p.N));

    // Le dernier point du balayage est a profondeur infinie : la deformation
    // y est rigoureusement uniforme.
    expect(N_max_calcule).toBeCloseTo(N_max_main, 3);
  });
});
