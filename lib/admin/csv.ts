/**
 * Export CSV administratif.
 *
 * Deux précautions, non négociables :
 *
 *   1. **Échappement.** Une valeur contenant une virgule, un guillemet ou un
 *      retour à la ligne est encadrée et doublée selon la RFC 4180. Sans cela,
 *      un pseudo exotique décalerait toute une ligne du fichier.
 *   2. **Injection de formule.** Une cellule commençant par `=`, `+`, `-` ou
 *      `@` est exécutée comme une formule par Excel et LibreOffice. On la
 *      préfixe d'une apostrophe : la valeur reste lisible, elle n'est plus
 *      interprétée. C'est une faille connue et elle vient des données, pas du
 *      fichier.
 */

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (typeof value === 'string') {
    text = value;
  } else if (typeof value === 'number' || typeof value === 'boolean') {
    text = String(value);
  } else if (value instanceof Date) {
    text = value.toISOString();
  } else {
    text = JSON.stringify(value);
  }

  // Neutralise une formule avant tout échappement.
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }

  if (text.includes('"') || text.includes(',') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map(csvCell).join(',');
  const body = rows.map((row) => columns.map((column) => csvCell(row[column])).join(','));
  return [header, ...body].join('\r\n');
}

/**
 * Nom de fichier exporté.
 *
 * Les filtres actifs et la période y figurent : un fichier `paiements.csv`
 * retrouvé trois semaines plus tard ne dit pas ce qu'il contient, celui-ci si.
 */
export function exportFilename(
  resource: string,
  filters: Record<string, string | null | undefined>,
  date = new Date(),
): string {
  const stamp = date.toISOString().slice(0, 10);
  const active = Object.entries(filters)
    .filter(([, value]) => value && value !== 'all')
    .map(([key, value]) => `${key}-${String(value).replace(/[^a-zA-Z0-9]+/g, '_')}`)
    .slice(0, 4)
    .join('_');

  const suffix = active ? `_${active}` : '';
  return `campagnes_${resource}_${stamp}${suffix}.csv`;
}
