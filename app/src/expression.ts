/**
 * Evaluation d'une expression arithmetique saisie dans un champ.
 *
 * Un ingenieur cote rarement une valeur brute : il ecrit « 30 + 10 » pour un
 * enrobage majore de l'etrier, « 500/2 » pour une mi-hauteur. Pouvoir taper
 * le calcul plutot que son resultat evite une etape mentale, et surtout
 * garde la trace du raisonnement dans le champ.
 *
 * Analyse par descente recursive, volontairement RESTREINTE aux quatre
 * operations et aux parentheses. Aucun recours a `eval` ni au constructeur
 * `Function` : une saisie utilisateur ne doit jamais devenir du code
 * executable, meme dans une page locale.
 *
 * La virgule est acceptee comme separateur decimal, l'usage francais etant
 * celui de l'interface.
 */

export class ExpressionError extends Error {}

interface Analyseur {
  texte: string;
  position: number;
}

function passerEspaces(a: Analyseur): void {
  while (a.position < a.texte.length && /\s/.test(a.texte[a.position])) a.position += 1;
}

/** Somme et difference, l'operation la moins prioritaire. */
function lireSomme(a: Analyseur): number {
  let valeur = lireProduit(a);
  for (;;) {
    passerEspaces(a);
    const operateur = a.texte[a.position];
    if (operateur !== '+' && operateur !== '-') return valeur;
    a.position += 1;
    const droite = lireProduit(a);
    valeur = operateur === '+' ? valeur + droite : valeur - droite;
  }
}

function lireProduit(a: Analyseur): number {
  let valeur = lireUnaire(a);
  for (;;) {
    passerEspaces(a);
    const operateur = a.texte[a.position];
    if (operateur !== '*' && operateur !== '/') return valeur;
    a.position += 1;
    const droite = lireUnaire(a);
    if (operateur === '/' && droite === 0) {
      throw new ExpressionError('division par zero');
    }
    valeur = operateur === '*' ? valeur * droite : valeur / droite;
  }
}

/** Signe prefixe : « -30 », « +12 ». */
function lireUnaire(a: Analyseur): number {
  passerEspaces(a);
  const signe = a.texte[a.position];
  if (signe === '-') {
    a.position += 1;
    return -lireUnaire(a);
  }
  if (signe === '+') {
    a.position += 1;
    return lireUnaire(a);
  }
  return lireFacteur(a);
}

function lireFacteur(a: Analyseur): number {
  passerEspaces(a);

  if (a.texte[a.position] === '(') {
    a.position += 1;
    const valeur = lireSomme(a);
    passerEspaces(a);
    if (a.texte[a.position] !== ')') {
      throw new ExpressionError('parenthese fermante manquante');
    }
    a.position += 1;
    return valeur;
  }

  const debut = a.position;
  while (a.position < a.texte.length && /[0-9.]/.test(a.texte[a.position])) a.position += 1;

  if (a.position === debut) {
    const reste = a.texte.slice(debut).trim();
    throw new ExpressionError(
      reste === '' ? 'expression incomplete' : `caractere inattendu "${reste[0]}"`
    );
  }

  const nombre = Number(a.texte.slice(debut, a.position));
  if (!Number.isFinite(nombre)) {
    throw new ExpressionError(`nombre invalide "${a.texte.slice(debut, a.position)}"`);
  }
  return nombre;
}

/**
 * Evalue une expression arithmetique. Leve `ExpressionError` si la saisie
 * n'en est pas une — ce qui inclut le cas d'une chaine vide.
 */
export function evaluateExpression(saisie: string): number {
  const texte = saisie.replace(/,/g, '.').trim();
  if (texte === '') throw new ExpressionError('valeur vide');

  const analyseur: Analyseur = { texte, position: 0 };
  const valeur = lireSomme(analyseur);
  passerEspaces(analyseur);

  if (analyseur.position !== texte.length) {
    throw new ExpressionError(`caractere inattendu "${texte[analyseur.position]}"`);
  }
  if (!Number.isFinite(valeur)) {
    throw new ExpressionError('resultat non fini');
  }
  return valeur;
}
