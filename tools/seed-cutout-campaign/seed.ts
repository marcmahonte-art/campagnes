/*
 * Amorçage — `npm run seed:cutout`
 *
 * POURQUOI CE SCRIPT EXISTE
 *
 *   Le détourage n'a **aucune interface de pose** : `subject: 'cutout'` ne
 *   vit que dans le descripteur d'un modèle, et les trois modèles détourés
 *   (`cutout-nuit-lunaire`, `cutout-hackathon-tech`, `cutout-ocean`) doivent
 *   être appliqués par l'éditeur pour devenir des cadres en base. Résultat :
 *   aucun état propre au détourage (progression, échec, réessai, accord) ne
 *   peut être ouvert dans un navigateur sans créer une campagne à la main.
 *
 *   Ce script crée exactement ce qu'il faut — un cadre détouré publié — et
 *   rien de plus. Il est **idempotent** : relancé, il remet la campagne dans
 *   le même état au lieu d'en créer une seconde.
 *
 * CE QU'IL FAIT, ET DANS QUEL ORDRE
 *
 *   1. il prend le descripteur **du modèle** (jamais un descripteur inventé :
 *      le script ne doit pas pouvoir produire un décor qui n'existe pas) ;
 *   2. il le passe par `applyTemplate()` avec `kind = 'background_frame'`,
 *      seule façon dont `subject` est conservé ;
 *   3. il insère (ou met à jour) le cadre, puis la campagne publiée.
 *
 * LE SERVICE ROLE, ET POURQUOI CE N'EST PAS UN CONTOURNEMENT
 *
 *   Ce script écrit avec la clé `SUPABASE_SERVICE_ROLE_KEY`, lue dans
 *   `.env.local`. Elle contourne RLS et le plafond de campagnes de la formule
 *   Gratuit — c'est précisément son rôle d'exploitation. Il ne touche ni aux
 *   paiements, ni aux quotas, ni aux lignes d'un autre compte que celui
 *   qu'il crée lui-même. La clé n'est jamais affichée ni écrite en clair.
 *
 * CE QU'IL NE FAIT PAS
 *
 *   Il ne publie rien sur Vercel, ne modifie pas le code applicatif, et ne
 *   supprime aucune donnée existante. Pour retirer la campagne d'essai :
 *   `npm run seed:cutout -- --delete`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { TEMPLATES, applyTemplate } from '../../lib/templates';
import type { Descriptor } from '../../lib/types';

/* --- .env.local, lu sans dépendance ni affichage ------------------------ */

function loadEnvLocal(): Record<string, string> {
  /*
   * Le script tourne depuis son dossier compilé
   * (`tools/seed-cutout-campaign/build/tools/seed-cutout-campaign/`), donc le
   * `.env.local` n'est pas à côté de lui. On remonte depuis `process.cwd()`,
   * qui est la racine du dépôt quand npm lance le script — et on s'arrête au
   * premier dossier qui porte un `package.json`.
   */
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, 'package.json'))) break;
    dir = dirname(dir);
  }
  const raw = readFileSync(join(dir, '.env.local'), 'utf8');
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    // Les guillemets éventuels ne font pas partie de la valeur.
    env[match[1]] = match[2].replace(/^["']|["']$/g, '').trim();
  }
  return env;
}

const env = loadEnvLocal();
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY est absent de .env.local.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/* --- Paramètres de l'essai ---------------------------------------------- */

const SLUG = 'essai-detourage';
const NAME = 'Essai détourage — nuit lunaire';
const EMAIL = 'seed-cutout@campagnes.local';
const TEMPLATE_ID = 'cutout-nuit-lunaire';
const RATIO = '1:1' as const;

async function main() {
  const remove = process.argv.includes('--delete');

  if (remove) {
    const { data: campaign } = await supabase
      .from('campaigns')
      .select('id, frame_id')
      .eq('slug', SLUG)
      .maybeSingle();
    if (campaign) {
      await supabase.from('campaigns').delete().eq('id', campaign.id);
      if (campaign.frame_id) {
        await supabase.from('frames').delete().eq('id', campaign.frame_id);
      }
      console.log(`Supprimé : campagne « ${SLUG} » et son cadre.`);
    } else {
      console.log(`Rien à supprimer : aucune campagne « ${SLUG} ».`);
    }
    return;
  }

  /* 1. Le compte propriétaire, créé seulement s'il manque. */
  let ownerId: string;
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, username')
    .eq('email', EMAIL)
    .maybeSingle();

  if (existingUser) {
    ownerId = existingUser.id;
    console.log(`Compte réutilisé : ${existingUser.username} (${ownerId}).`);
  } else {
    /*
     * `users.id` référence `auth.users(id)` : un simple insert dans `users`
     * échouerait sur la contrainte. On crée donc d'abord l'identité
     * d'authentification, puis sa ligne de profil.
     */
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: EMAIL,
      email_confirm: true,
      password: crypto.randomUUID(),
    });
    if (authError || !authUser?.user) {
      console.error("Création de l'identité impossible :", authError?.message);
      process.exit(1);
    }

    const { data: created, error } = await supabase
      .from('users')
      .insert({
        id: authUser.user.id,
        email: EMAIL,
        username: 'essai-detourage',
        plan: 'creator',
      })
      .select('id, username')
      .single();

    if (error || !created) {
      /*
       * Un **trigger d'inscription** (migration 0002) crée la ligne `users`
       * dès que l'identité d'authentification apparaît. L'insertion ci-dessus
       * est donc un doublon la plupart du temps : on relit la ligne que le
       * trigger a posée, au lieu de traiter ce cas comme une panne.
       */
      const { data: byId } = await supabase
        .from('users')
        .select('id, username')
        .eq('id', authUser.user.id)
        .maybeSingle();
      if (!byId) {
        console.error('Création du profil impossible :', error?.message);
        process.exit(1);
      }
      ownerId = byId.id;
      console.log(`Profil posé par le trigger : ${byId.username} (${ownerId}).`);
    } else {
      ownerId = created.id;
      console.log(`Compte créé : ${created.username} (${ownerId}).`);
    }
  }

  /* 2. Le descripteur vient du MODÈLE, jamais d'une main humaine. */
  const template = TEMPLATES.find((t) => t.id === TEMPLATE_ID);
  if (!template) {
    console.error(`Modèle introuvable : ${TEMPLATE_ID}`);
    process.exit(1);
  }

  // La base de départ : un cadre nu au bon format et bon fond. `applyTemplate`
  // ne remplace que les calques — lui donner le modèle comme `current` serait
  // circulaire, on part donc du canevas vide.
  const base: Descriptor = {
    version: 1,
    ratio: RATIO,
    // Le fond du MODÈLE (transparent en détourage) : c'est le décor du modèle
    // qui peint, pas un fond solide qui le cacherait.
    background: template.descriptor.background,
    layers: [],
  };

  const descriptor = applyTemplate(base, template, false, 'background_frame');

  if (descriptor.subject !== 'cutout') {
    console.error("Le descripteur produit n'est pas détouré — arrêt avant écriture.");
    process.exit(1);
  }

  /* 3. Le cadre : mis à jour s'il existe, inséré sinon. */
  const { data: existingCampaign } = await supabase
    .from('campaigns')
    .select('id, frame_id')
    .eq('slug', SLUG)
    .maybeSingle();

  let frameId: string;
  if (existingCampaign?.frame_id) {
    frameId = existingCampaign.frame_id;
    const { error } = await supabase
      .from('frames')
      .update({ name: template.title, descriptor_json: descriptor })
      .eq('id', frameId);
    if (error) {
      console.error('Mise à jour du cadre impossible :', error.message);
      process.exit(1);
    }
    console.log(`Cadre mis à jour : ${frameId}.`);
  } else {
    const { data: frame, error } = await supabase
      .from('frames')
      .insert({ owner_id: ownerId, name: template.title, descriptor_json: descriptor })
      .select('id')
      .single();
    if (error || !frame) {
      console.error('Création du cadre impossible :', error?.message);
      process.exit(1);
    }
    frameId = frame.id;
    console.log(`Cadre créé : ${frameId}.`);
  }

  /* 4. La campagne, publiée et rattachée au cadre. */
  if (existingCampaign) {
    const { error } = await supabase
      .from('campaigns')
      .update({
        name: NAME,
        frame_id: frameId,
        ratio: RATIO,
        kind: 'background_frame',
        status: 'published',
      })
      .eq('id', existingCampaign.id);
    if (error) {
      console.error('Mise à jour de la campagne impossible :', error.message);
      process.exit(1);
    }
    console.log(`Campagne republiée : ${existingCampaign.id}.`);
  } else {
    const { data: campaign, error } = await supabase
      .from('campaigns')
      .insert({
        owner_id: ownerId,
        name: NAME,
        slug: SLUG,
        frame_id: frameId,
        ratio: RATIO,
        kind: 'background_frame',
        status: 'published',
      })
      .select('id')
      .single();
    if (error || !campaign) {
      console.error('Création de la campagne impossible :', error?.message);
      process.exit(1);
    }
    console.log(`Campagne créée : ${campaign.id}.`);
  }

  console.log(
    `\nParcours public : ${env.NEXT_PUBLIC_SITE_URL ?? 'https://campagnes-nu.vercel.app'}/c/${SLUG}`,
  );
  console.log(`Modèle appliqué : ${template.title} (subject = ${descriptor.subject}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
