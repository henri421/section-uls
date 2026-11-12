// Barre des feuilles de calcul (etape 9.5).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const lire = (f: string): string => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

describe('feuilles de calcul (etape 9.5)', () => {
  it('depend d aedificium-ui v1', () => {
    expect(lire('package.json')).toContain('github:henri421/aedificium-ui#v1.');
  });

  it('les pages francaise et anglaise ont la zone de la barre, sous l en-tete', () => {
    for (const page of ['app/index.html', 'app/en/index.html']) {
      const html = lire(page);
      const zone = html.indexOf('data-role="feuilles"');
      expect(zone, page).toBeGreaterThan(html.indexOf('</header>'));
      expect(zone, page).toBeLessThan(html.indexOf('<main'));
    }
  });

  it('main.ts branche la barre et, dans un projet, ne touche pas la memoire locale', () => {
    const m = lire('app/src/main.ts');
    expect(m).toContain("app: 'section-uls'");
    expect(m).toMatch(/if \(barre\?\.dansUnProjet\(\)\) barre\.signaler\(\);\s*else sauvegarderLocalement/);
  });
});
