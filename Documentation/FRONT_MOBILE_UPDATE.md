# Mise à jour Front & Mobile

## Objectif
Ce document récapitule les nouvelles évolutions apportées au backend pour supporter les interfaces front-end et mobile, notamment la recherche globale de documents et le suivi des téléchargements.

## Fonctionnalités ajoutées

### Recherche globale améliorée
- Endpoint principal : `GET /api/search/documents`
- Nouvelle prise en charge des filtres :
  - `nom` ou `q` : recherche texte globale
  - `niveau` : `L1`, `L2`, `L3`, `M1`, `M2`
  - `filiere` : code de filière (`INFO`, `MATH`, etc.)
  - `filiere_id` : identifiant de filière
  - `ecole` : nom de l'école
  - `ecole_id` : identifiant de l'école
  - `annee` : année académique (`2025-2026`) ou année de sujet (`2025`)
  - `type` : type de document (`pdf`, `video`, `slide`, `autre`, `partiel`, `rattrapage`, `terminal`, `tp`, `td`)

### Informations retournées pour chaque document
- `id`
- `type_contenu` : `cours` ou `sujet_examen`
- `nom`
- `type`
- `lien_telechargement`
- `taille_octets`
- `taille_lisible`
- `niveau`
- `filiere_code`
- `filiere_nom`
- `ecole_nom`
- `code_ue`
- `intitule_ue`
- `annee_academique` (pour les cours)
- `annee` (pour les sujets)
- `telechargements` : compteur total de téléchargements
- `disponible` : présence du document dans la recherche (toujours `true` lorsque le document est publié)
- `deja_telecharge` : indique si l’utilisateur courant a déjà téléchargé ce cours

### Comportement du statut téléchargé
- La disponibilité globale d’un cours n’est pas modifiée par l’historique de téléchargement.
- Un cours reste visible dans la recherche, même si un autre utilisateur l’a déjà téléchargé.
- Le flag `deja_telecharge` est calculé pour l’utilisateur actuellement connecté via JWT.
- La recherche publique fonctionne également sans authentification, mais le flag `deja_telecharge` n’est rempli que si l’utilisateur est connecté.

## Impact pour le front-end
- Afficher clairement la distinction entre :
  - cours disponible
  - déjà téléchargé par l’utilisateur
- Afficher le compteur `telechargements` comme mesure de popularité.
- Proposer des filtres de recherche plus riches par `école`, `filière`, `niveau`, `type` et année.
- Utiliser l’endpoint `GET /api/search/documents` pour les vues catalogue et résultats de recherche.

## Impact pour le mobile
- L’application mobile peut utiliser les mêmes filtres et la même API que le front web.
- Mettre en avant le statut local `deja_telecharge` sur les cartes de cours.
- Proposer un bouton de téléchargement qui appelle `lien_telechargement`.
- Veiller à ce que l’absence de JWT n’empêche pas l’affichage des documents, seulement la mention `déjà téléchargé`.

## Recommandations UI
- Ajouter un label ou un badge `Téléchargé` pour les cours déjà récupérés.
- Ajouter un indicateur `Disponible` pour clarifier que l’accès global n’est pas restreint.
- Adapter le tri ou la présentation pour conserver les résultats les plus pertinents même si un cours est déjà téléchargé.

## Notes techniques
- Le backend a maintenant un modèle `Telechargement` (`telechargements`) qui conserve l’historique des téléchargements de cours par utilisateur.
- Le compteur de téléchargements reste basé sur le champ `Cours.telechargements`.
- Les téléchargements sont enregistrés lorsque l’utilisateur authentifié appelle le même endpoint de téléchargement.
