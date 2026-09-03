import {
  ec2Recommended, createConcrete, createSteel,
  rectangularSection, rectangularRebarLayout, verifySection,
} from '../../src/index';
import './style.css';

// Squelette : prouve que la chaine outillage -> noyau -> page fonctionne de
// bout en bout. Remplace par le vrai cablage a la tache 5.
const profile = ec2Recommended();
const concrete = createConcrete(25, profile);
const steel = createSteel(500, 200000, profile);

const layout = rectangularRebarLayout({
  width: 400, height: 400, cover: 30, stirrupDiameter: 8, steel,
  rows: [
    { face: 'bottom', bars: { count: 3, diameter: 20 } },
    { face: 'top', bars: { count: 3, diameter: 20 } },
  ],
});

const section = rectangularSection({ width: 400, height: 400, concrete, rebars: layout.bars });
const v = verifySection(section, { N: 500, My: 80, Mz: 40 }, profile);

const cible = document.querySelector('#resultat');
if (cible) {
  cible.textContent = `Taux d'exploitation : ${v.utilization.toFixed(3)} — ${v.ok ? 'verifie' : 'non verifie'}`;
}
