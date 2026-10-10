# Notification — Accès Super Admin Campagnes

**À :** marcmahonte@gmail.com
**Objet :** Vous êtes désormais Super Admin de Campagnes — votre tableau de bord est en ligne

---

Bonjour,

Votre compte **marcmahonte@gmail.com** est maintenant le premier compte **Super Administrateur** de Campagnes. Le tableau de bord est en ligne et connecté aux données réelles de la production.

## Votre accès

**https://campagnes-nu.vercel.app/super-admin**

Connectez-vous avec cette adresse e-mail. Si vous n'êtes pas déjà connecté, vous serez redirigé vers la page de connexion, puis ramené automatiquement au tableau de bord.

## Ce que vous y trouverez

Cinq sections, toutes alimentées par les données réelles — aucune maquette, aucune valeur inventée :

| Section | Contenu |
| --- | --- |
| **Vue d'ensemble** | Comptes, répartition des plans, campagnes, quotas consommés, paiements confirmés, crédits, distributions, pass sans filigrane. Séries temporelles par période. |
| **Utilisateurs** | Recherche, filtre par plan et par statut, pagination côté serveur (25 par page). |
| **Paiements** | Abonnements et recharges de crédits confirmés, statut, montants, méthode. |
| **Campagnes** | Statut, quota de participants, activité. |
| **Système** | État des tables et des migrations, erreurs remontées. |

## Points de sécurité

- **Accès fermé par défaut.** Aucune migration ne désigne d'administrateur : sans ligne active dans la table des administrateurs, l'accès est refusé. Vous avez été désigné explicitement.
- **Vérifié en production :** les routes d'API administrateur répondent `401` sans session valide, et `/super-admin` redirige vers la connexion (`307`).
- **Pages non indexables** par les moteurs de recherche (`noindex, nofollow`).
- **Journal d'audit immuable** : chaque export CSV exige un motif écrit, et ce motif est enregistré. Le journal refuse toute modification et toute suppression, y compris depuis le service serveur.
- **Aucun rôle ne détient les droits d'écriture.** Le tableau de bord est aujourd'hui en **lecture seule** : il ne peut ni rembourser, ni changer un plan, ni modifier un compte. Ces droits existent dans le modèle mais ne sont attribués à personne.

## Sur l'honnêteté des chiffres

Une métrique qui n'est pas encore instrumentée s'affiche **« Non mesuré »** — jamais `0`, ce qui laisserait croire à une absence d'activité. Concrètement, ne sont pas encore disponibles : pages vues, visiteurs uniques, entonnoirs de conversion, historique détaillé des changements de plan et revenu net. Ces chiffres demandent une instrumentation préalable, ils n'ont pas été simulés.

## Détails techniques

- Migrations `0025_super_admin_access.sql` et `0026_admin_audit_log.sql` appliquées et vérifiées sur la base de production.
- Code livré sur la branche `feat/super-admin-dashboard` (commit `8c16bf4`), déployé en production.
- Rôle attribué : `super_admin`, statut `active`.

Bonne prise en main.

---

*Ce message est un brouillon prêt à envoyer. Aucun outil d'envoi d'e-mail n'est disponible dans cette session : il doit être expédié manuellement, ou après connexion d'un connecteur de messagerie.*
