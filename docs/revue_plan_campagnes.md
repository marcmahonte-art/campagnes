# Revue du plan produit « Campagnes »

*Document analysé : `plan_produit_campagnes.md`, version 2.0*

---

## Constat général

Le plan est solide dans l'ensemble : la séparation en trois moteurs (Frame, Motion, Media), la promesse en 5 actions, le rendu côté client par défaut pour maîtriser les coûts, et les sources vérifiées (dépréciation de Sora, tarifs Cloudflare, benchmarks ffmpeg.wasm) en font un document crédible plutôt qu'un vœu pieux.

Une incohérence saute cependant aux yeux — et c'est justement le genre de détail qui trahit la philosophie du produit.

---

## Le problème identifié

**Le QR code est promis gratuit… puis vendu comme module premium.**

| Endroit | Ce qui est dit |
|---|---|
| § 1.2, point 3 (proposition de valeur) | *« Publier une campagne et obtenir un lien unique + un QR code »* — présenté comme faisant partie du parcours de base |
| § 2.5 (exemple d'interface) | `▣ QR Code → Débloquer`, alors que Cadre / Photo / Vidéo sont déjà cochés en gratuit |
| § 7.3 (grille de modules) | QR Code figure explicitement parmi les modules premium |

C'est un vrai problème produit, pas seulement cosmétique : le QR code est le principal canal de diffusion terrain (affiche, flyer, banderole d'événement) pour une cible ONG / école / PME qui n'a pas toujours de lien cliquable à partager. Le retirer du gratuit revient à couper la jambe sur laquelle repose la viralité — l'indicateur même que le plan se fixe en § 11 (*« Viralité ≥ 0,5 »*).

---

## Amélioration minimaliste proposée

Un seul changement, aucun ajout de portée, aucun coût supplémentaire :

**Déplacer le QR code standard vers le socle gratuit.** Un QR noir/blanc classique, généré à la volée (`lib qrcode`, déjà dans la stack § 6.2), coûte quasi rien à produire. Garder en premium uniquement ce qui a une vraie valeur de différenciation : le **QR personnalisé** (couleur de marque, logo au centre), rattaché au module **Branding** qui fait déjà ce travail pour le watermark et le domaine.

### Changements concrets (deux lignes)

- **§ 7.2 (Free)** : ajouter la ligne *« QR Code (standard) — oui »*
- **§ 7.3 (Branding)** : préciser *« … + QR Code personnalisé (couleur, logo) »*

Aucune nouvelle phase de roadmap, aucun nouveau module — juste une reclassification qui aligne enfin la promesse (§ 1.2), l'interface (§ 2.5) et la tarification (§ 7.3), au service direct de l'objectif de viralité que le plan se donne lui-même.
