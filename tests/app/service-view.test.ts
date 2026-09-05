import { describe, it, expect } from 'vitest';
import { obstacleService, obstacleFissuration } from '../../app/src/service-view';
import {
  rectangularSection,
  polygonSection,
  circularSection,
  createConcrete,
  createSteel,
  ec2Recommended,
} from '../../src/index';

const profil = ec2Recommended();
const beton = createConcrete(30, profil);
const acier = createSteel(500, 200000, profil);

function rectangle() {
  return rectangularSection({
    width: 300,
    height: 500,
    concrete: beton,
    rebars: [{ depthFromTop: 450, area: 1000, steel: acier }],
  });
}

function pieu() {
  return circularSection({ diameter: 600, concrete: beton, rebars: [] });
}

/** Section en Te : polygonale, donc hors domaine de la fissuration. */
function sectionEnTe() {
  return polygonSection({
    vertices: [
      { y: -400, z: -250 },
      { y: 400, z: -250 },
      { y: 400, z: -100 },
      { y: 100, z: -100 },
      { y: 100, z: 250 },
      { y: -100, z: 250 },
      { y: -100, z: -100 },
      { y: -400, z: -100 },
    ],
    concrete: beton,
    rebars: [],
  });
}

describe('obstacles aux verifications de service', () => {
  it('une flexion droite ne fait obstacle a rien', () => {
    expect(obstacleService(0)).toBeNull();
  });

  it('un Mz non nul met les TROIS verifications hors domaine', () => {
    // Les trois modules prennent une Action uniaxiale {N, M} : projeter le
    // moment sur un axe serait un mensonge silencieux.
    const motif = obstacleService(12.5);

    expect(motif).not.toBeNull();
    expect(motif).toMatch(/flexion deviee/i);
    expect(motif).toContain('12,5');
  });

  it('le signe du Mz est indifferent : seule compte sa presence', () => {
    expect(obstacleService(-3)).not.toBeNull();
    expect(obstacleService(-3)).toMatch(/flexion deviee/i);
  });

  it('une section rectangulaire ne fait pas obstacle a la fissuration', () => {
    expect(obstacleFissuration(rectangle())).toBeNull();
  });

  it('une section circulaire met la seule fissuration hors domaine', () => {
    // `verifyCrackWidth` LEVE sur cette geometrie ; les contraintes et la
    // courbure, elles, restent calculables et doivent s afficher.
    const motif = obstacleFissuration(pieu());

    expect(motif).not.toBeNull();
    expect(motif).toContain('rectangulaire');
  });

  it('une section polygonale aussi', () => {
    const motif = obstacleFissuration(sectionEnTe());

    expect(motif).not.toBeNull();
    expect(motif).toContain('rectangulaire');
  });
});
