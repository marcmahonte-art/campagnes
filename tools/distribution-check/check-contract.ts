/** Contrat final après toutes les migrations ; les redéfinitions correctives sont légitimes. */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
let root = __dirname;
while (!existsSync(join(root, 'package.json'))) { const parent = dirname(root); if (parent === root) throw new Error('Racine introuvable'); root = parent; }
const read = (name: string) => readFileSync(join(root, name), 'utf8');
const clean = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const sql = readdirSync(join(root, 'supabase/migrations')).filter((file) => file.endsWith('.sql')).sort().map((file) => read(`supabase/migrations/${file}`)).join('\n');
const finalFunction = (name: string) => {
  const matcher = new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`, 'gi');
  return [...sql.matchAll(matcher)].at(-1)?.[0] ?? '';
};
const journey = clean(read('components/participant/participant-journey.tsx'));
const editor = clean(read('app/(creator)/campaigns/[id]/page.tsx'));
const backend = clean(read('lib/backend/supabase.ts'));
const route = read('app/d/[token]/page.tsx');
const coordinator = read('lib/distribution-export.ts');
let passed = 0;
function test(label: string, condition: boolean) { assert.ok(condition, label); passed++; console.log(`OK ${label}`); }
function pureResolve(body: string) { const stripped = body.replace(/--[^\n]*/g, ''); return !!stripped && !/\b(update|insert|delete)\b/i.test(stripped); }
test('Résolution finale pure, sans quota public', pureResolve(finalFunction('resolve_distribution')) && !/participants_granted/.test(finalFunction('resolve_distribution')));
test('Témoin rouge : une écriture ajoutée au resolve est détectée', !pureResolve(finalFunction('resolve_distribution') + '\nupdate distribution_links set status=\'ACTIVE\';'));
test('Révocation finale NULL-safe et authentification explicite', /v_uid is null/.test(finalFunction('revoke_distribution_link')) && /is distinct from v_uid/.test(finalFunction('revoke_distribution_link')));
test('Création financée, journalisée et liée à une référence', /account_credit_balances/.test(finalFunction('create_funded_distribution_link_v1')) && /account_credit_ledger/.test(finalFunction('create_funded_distribution_link_v1')) && /v_request.amount is distinct from p_quota/.test(finalFunction('create_funded_distribution_link_v1')));
test('Ancien claim ne consomme plus rien', !/\bupdate\b/i.test(finalFunction('claim_distribution')) && /select false, 0, 0, null::uuid/.test(finalFunction('claim_distribution')));
test('Le backend utilise la RPC financée et le décompte réconcilié', /rpc\('create_funded_distribution_link_v1'/.test(backend) && /rpc\('get_distribution_links_v1'/.test(backend));
test('Pas de mise à jour directe des liens', !/from\('distribution_links'\)[\s\S]{0,120}\.update/.test(backend));
test('Quota public ignoré sur la route privée', /if \(!campaign \|\| distributionToken \|\| !sharing\) return/.test(journey));
test('Parcours commun conservé et état privé explicite', /ParticipantJourney/.test(route) && /privateAccessReady/.test(route) && /getPrivateAccess/.test(route));
test('Gestion des pannes et changement de jeton', /catch\(/.test(route) && /key=\{token\}/.test(route) && /Réessayer/.test(route));
const privateBlock = journey.slice(journey.indexOf('{blocked && distributionToken'), journey.indexOf('{blocked && !distributionToken'));
test('Aucun export filigrané de secours privé ni compteur exposé', !!privateBlock && !/runWatermarkedExport|quota\.used/.test(privateBlock));
test('Secours public gardé dans le gestionnaire', /distributionToken \|\| !sharing \|\| exportBusy.current/.test(journey));
test('Entier strict et borne côté créateur', /Number\(privateQuota\)/.test(editor) && /Number.isSafeInteger\(quota\)/.test(editor) && /quota > 1000000/.test(editor));
test('Création rejouable et garde double-clic', /creationBusy.current/.test(editor) && /request.reference/.test(editor) && /sessionStorage.setItem/.test(editor));
test('Logo et révocation vérifient leurs résultats', /result.data !== true/.test(editor) && /result.error/.test(editor));
test('Promesse de confidentialité corrigée', !/sans la rendre publique/.test(editor) && /médias restent publics/.test(editor));
test('Secret sauvegardé avant réservation, rendu avant confirmation', coordinator.indexOf('this.storage.setItem(this.key') < coordinator.indexOf("await this.call('reserve')") && coordinator.indexOf('await render()') < coordinator.indexOf("await this.call('confirm')"));
test('Secret/fichier restent locaux ; aucune photo envoyée', !/fetch\(|uploadImage/.test(coordinator) && /technicalHash/.test(journey));
test('Protections privées et copie après renouvellement', /no-referrer/.test(read('middleware.ts')) && /no-store/.test(read('middleware.ts')) && /noindex/.test(read('middleware.ts')) && /response.headers.forEach/.test(read('middleware.ts')));
console.log(`\n${passed} contrôles de contrat réussis. Les privilèges SQL sont exercés par check:distribution:sql, pas prouvés par ces assertions de source.`);
