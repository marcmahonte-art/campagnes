# Audit — éditeur de création et distribution (2026-10-07)

> Question posée : l'éditeur est-il logiquement cohérent, et la distribution
> n'a-t-elle aucun souci ? Réponse par mesure, pas par relecture : chaque
> affirmation ci-dessous est appuyée par un fichier:ligne ou par la sortie
> réelle d'un harnais.

## 1. Verdict

**Aucun défaut bloquant trouvé.** L'éditeur et la distribution sont cohérents
entre eux : aucun chemin du code de l'éditeur n'écrit un compteur de
distribution, et les deux compteurs (campagne / lien privé) sont volontairement
indépendants. Les 22 migrations ont été rejouées dans un PostgreSQL réel en
mémoire : les invariants transactionnels tiennent.

Deux réserves honnêtes :
- le harnais SQL tourne dans un moteur **mono-session** : la concurrence
  multi-connexion reste à vérifier avant montée en charge ;
- `npm run check:distribution:sql` était **cassé** (dépendance manquante) —
  corrigé en ajoutant `@electric-sql/pglite` aux dépendances de développement.

## 2. Éditeur de création

| Point | Statut | Preuve |
|---|---|---|
| Repère natif du ratio, zoom par `setZoom` | OK | `frame-editor.tsx:105-112`, `fitToView()` `:482-507` |
| `z` réécrit à chaque émission depuis l'ordre réel du canvas | OK | `frame-editor.tsx:262` ; `nextZ()` seule autorité `:883, :911, :1189` |
| `clipPath` du canvas | OK | `originX/originY: 'left'/'top'` posés `:411-412` ; le harnais prouve qu'**oubliés**, Fabric centre le `Rect` et rogne le cadre (témoin à `left=-540.5`) |
| Forme : boîte lue sans l'épaisseur du contour | OK | `:281-282` |
| Texte étiré : l'échelle est remise dans le corps | OK | `bakeTextScale` `:320` |
| Visibilité / verrou repris du descripteur, pas du canvas | OK | `:251-265` |
| Zone participant verrouillée par défaut | OK | `applyLocks()` `:361-383` |
| Zone photo : repli si le calque ancre disparaît | OK | `lib/descriptor.ts:162-172` (retombe sur le cadre entier) ; ancre nettoyée à la suppression `:781` |
| Publication | OK | refuse un cadre vide (`campaigns/[id]/page.tsx:312`), sauve le cadre **avant** de changer le statut `:319-322` |

Harnais exécutés : `check:frame-render` **36/36** (dont témoin hors cadre),
`check:shapes`, `check:text`, `check:history`, `check:watermark`,
`check:templates`, `check:participant` — tous verts. `tsc --noEmit` : 0 erreur.

## 3. Distribution

| Point | Statut | Preuve |
|---|---|---|
| Deux compteurs indépendants (campagne vs lien) | OK, **voulu** | public : `claim_participation` (`participant-journey.tsx:439`) ; privé : opération d'export réservée puis confirmée (`:408-426`) |
| Débit au bon instant | OK | rien n'est consommé à l'ouverture ; la réservation précède le rendu, la confirmation suit (`lib/distribution-export.ts:45-64`) |
| Idempotence (rejeu, double-clic, onglet rechargé) | OK | `distribution_export_v1` : secret + jeton + format + empreinte liés (`0022:630-641`) ; reprise par `resolve_distribution_resume_v1` |
| Ancien lien « historique » | OK | bascule figée `history_used` / `history_quota_total` (`0022:28-35`), immuable par trigger (`:138-146`) ; jamais remboursé (`:514-515`) |
| Enveloppe financée par les crédits du compte | OK | `create_funded_distribution_link_v1` (`0022:285-361`) débite le portefeuille et journalise la même référence |
| Remboursement | OK | uniquement lien expiré ou révoqué (`0022:508-509`), une seule fois (`refund_closed_at`) |
| Campagne épuisée n'entrave pas le lien privé | OK | prouvé en SQL : « Campagne publique épuisée : accès privé indépendant » |
| Secret du jeton | OK | `/d/` : `no-referrer`, `no-store`, `noindex` (`middleware.ts:60-64`) ; exclu de `robots.ts` et `sitemap.ts` ; le partage ne propose jamais `/d/` (`share-panel.tsx:34`) |
| Anonyme ne voit rien | OK | RLS activée + policy propriétaire (`0009:119-150`) ; `revoke all` puis `grant select` ciblés (`0022:839-875`) |
| Filigrane | OK | une seule règle, appelée par l'écran et l'export (`lib/watermark-policy.ts:50-63`) : accès public ⇒ badge, lien privé ⇒ suit la formule du créateur |

Harnais exécutés : `check:distribution` **19 contrôles de contrat** +
**6 groupes de reprise d'export** ; `check:distribution:sql` **16 groupes SQL**
sur PostgreSQL embarqué (22 migrations rejouées), dont « 20 demandes
simultanées pour une unité : une seule réservée ».

## 4. Ce qui reste ouvert

1. **Concurrence multi-connexion** non prouvée (moteur mono-session).
2. `refundableCount` est lu côté client (`supabase.ts:665`) mais la RPC
   `get_distribution_links_v1` ne renvoie pas cette colonne : la valeur est
   toujours 0. Sans incidence aujourd'hui — aucun écran ne l'affiche — mais le
   bouton « Restituer les crédits achetés non utilisés » n'annonce donc pas le
   montant qui sera rendu.
3. `grantParticipation` (`supabase.ts:450-471`) fait un « lire puis écrire »
   depuis le navigateur, sans transaction. Aucun appelant : **code mort** à
   retirer plutôt qu'à corriger.
4. L'écran de campagne n'affiche pas le solde de crédits du compte : le
   créateur découvre l'insuffisance au moment de créer le lien.

## 5. Commandes et résultats réels

```
npm run typecheck              → 0 erreur
npm run check:frame-render     → 36 réussis / 0 échoués
npm run check:participant      → PASS
npm run check:distribution     → 19 contrôles de contrat + 6 groupes d'export
npm run check:distribution:sql → 16 groupes SQL réussis (PGlite)
npm run check:shapes|text|history|watermark|templates → verts
```

Seul fichier modifié : `package.json` (ajout de `@electric-sql/pglite` en
dépendance de développement, sans laquelle le harnais SQL ne démarre pas).
Aucun commit, aucun déploiement.
