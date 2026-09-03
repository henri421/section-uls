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

  it("l'effort normal maximal du domaine vaut fcd*Ac + (fyd - fcd)*As", () => {
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
    // A profondeur d'axe neutre tres grande, la deformation est quasi
    // uniforme a epsCu2 : le beton est partout a son palier fcd, et l'acier
    // au-dela de sa limite elastique (epsCu2 = 3,5‰ > epsYd = 2,17‰), donc a
    // fyd. Le terme (fyd - fcd) et non fyd parce que l'armature DEPLACE du
    // beton, exactement comme dans l'integration.
    const Ac = 400 * 400; // 160 000 mm²
    const As = 8 * (Math.PI * 20 ** 2) / 4; // 8 HA20 = 2513,3 mm²
    const fcd = concrete.fcd; // 16,667 MPa
    const fyd = steel.fyd; // 434,78 MPa

    const N_max_main = (fcd * Ac + (fyd - fcd) * As) / 1000; // kN

    // NOTE : le plan de session enonce 3717,4 kN. Recalcul avec la precision
    // flottante de `As` (2513,27412... mm², pas 2513 mm² arrondi) : la valeur
    // exacte est 3717,5066... kN, soit 3717,5 a la decimale pres. L'ecart de
    // ~0,1 kN vient d'un arrondi de As a la main dans le plan (2513 mm² plutot
    // que 2513,274 mm²) ; verifie independamment via calcul externe. Valeur
    // corrigee ici plutot que la tolerance elargie.
    expect(N_max_main).toBeCloseTo(3717.5, 1);

    // --- Ce que produit le balayage ---
    const courbe = interactionCurveNM(section, profile, { steps: 80 });
    const N_max_calcule = Math.max(...courbe.map((p) => p.N));

    // Le balayage s'arrete a une profondeur finie, donc la deformation n'est
    // pas rigoureusement uniforme : un ecart de l'ordre du pourcent est
    // attendu et ne doit PAS etre absorbe en elargissant la tolerance.
    const ecart = Math.abs(N_max_calcule - N_max_main) / N_max_main;
    expect(ecart).toBeLessThan(0.01);
  });
});
