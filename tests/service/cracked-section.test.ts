import { describe, it, expect } from 'vitest';
import { crackedProperties } from '../../src/service/cracked-section';
import { rectangularSection } from '../../src/geometry/rectangle';
import { createConcrete } from '../../src/model/concrete';
import { createSteel } from '../../src/model/steel';
import { ec2Recommended } from '../../src/norms/ec2-recommended';

const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

/** Poutre 300x500, 3 HA20 a 450 mm de la fibre superieure. */
function poutre() {
  const As = 3 * (Math.PI * 20 ** 2) / 4; // 942,478 mm²
  return rectangularSection({
    width: 300, height: 500, concrete,
    rebars: [{ depthFromTop: 450, area: As, steel }],
  });
}

describe('caracteristiques homogeneisees fissurees', () => {
  it('sans beton comprime, il ne reste que l acier homogeneise', () => {
    // Axe neutre a la fibre superieure : aucune zone comprimee.
    const p = crackedProperties(poutre(), -250, 15, 400);
    const As = 3 * (Math.PI * 20 ** 2) / 4;

    expect(p.A).toBeCloseTo(15 * As, 3);
    expect(p.S).toBeCloseTo(15 * As * 200, 1); // barre a z = 450 - 250 = 200
  });

  it('la zone comprimee est integree exactement pour une largeur constante', () => {
    // Axe neutre a mi-hauteur : rectangle comprime 300 x 250, de z=-250 a z=0.
    const p = crackedProperties(poutre(), 0, 15, 400);
    const As = 3 * (Math.PI * 20 ** 2) / 4;

    const aireBeton = 300 * 250;
    // Moment statique du beton : 300 * (0² - (-250)²)/2
    const sBeton = 300 * (0 - 250 ** 2) / 2;
    // Moment quadratique : 300 * (0³ - (-250)³)/3
    const iBeton = (300 * (0 - -(250 ** 3))) / 3;

    expect(p.A).toBeCloseTo(aireBeton + 15 * As, 3);
    expect(p.S).toBeCloseTo(sBeton + 15 * As * 200, 0);
    expect(p.I).toBeCloseTo(iBeton + 15 * As * 200 ** 2, -1);
  });

  it('une barre comprimee compte pour (n-1)A, une barre tendue pour nA', () => {
    const As = 500;
    const section = rectangularSection({
      width: 300, height: 500, concrete,
      rebars: [
        { depthFromTop: 50, area: As, steel },  // z = -200, comprimee si zNa > -200
        { depthFromTop: 450, area: As, steel }, // z = 200, tendue
      ],
    });

    // Axe neutre a z = 0 : la barre haute est comprimee, la barre basse tendue.
    const p = crackedProperties(section, 0, 15, 400);
    const aireBeton = 300 * 250;

    // Le -1 sur la barre comprimee traduit le beton qu'elle DEPLACE.
    expect(p.A).toBeCloseTo(aireBeton + 14 * As + 15 * As, 3);
  });

  it('un axe neutre au-dela de la fibre inferieure comprime toute la section', () => {
    const p = crackedProperties(poutre(), 400, 15, 400);
    const As = 3 * (Math.PI * 20 ** 2) / 4;

    // Toute la hauteur est comprimee : 300 x 500. Les deux barres sont
    // comprimees, donc homogeneisees a (n-1).
    expect(p.A).toBeCloseTo(300 * 500 + 14 * As, 3);
  });
});
