# Correction de la création de filière avec `ecole_id`

## Contexte
Lors de la création d'une filière, `ecole_id` était reçu dans le corps de la requête mais n'était pas systématiquement validé ni explicitement requis.

## Correctifs appliqués
1. `src/models/index.js`
   - Ajout de l'attribut `ecole_id` au modèle `Filiere`.
   - `ecole_id` est défini comme `INTEGER` et `allowNull: false`.

2. `src/modules/filieres/filieres.routes.js`
   - Ajout de la validation `body('ecole_id').notEmpty().withMessage('Ecole obligatoire').bail().isInt().withMessage('Ecole invalide')` sur la route POST `/api/filieres`.
   - Ajout de validation optionnelle `body('ecole_id').optional().isInt().withMessage('Ecole invalide')` sur la route PUT `/api/filieres/:id`.

3. `src/modules/filieres/filieres.controller.js`
   - Lecture de `ecole_id` depuis `req.body` lors de la création.
   - Vérification que l'école existe avant de créer la filière.
   - Vérification que l'école existe aussi avant modification lorsqu'un `ecole_id` est envoyé.

4. `tests/endpoints/filieres.test.js`
   - Mise à jour du test de création de filière pour envoyer `ecole_id`.
   - Vérification que la réponse contient bien `ecole_id`.

## Instructions d'utilisation
- Endpoint : `POST /api/filieres`
- Corps attendu :
  ```json
  {
    "code": "MAT",
    "nom": "Mathématiques",
    "departement": "Sciences",
    "ecole_id": 1
  }
  ```
- `ecole_id` doit être un identifiant d'école existant dans la table `ecoles`.

## Notes
- Si `ecole_id` est absent ou invalide, la route retourne une erreur de validation 400.
- Si l'école référencée n'existe pas, la route retourne également une erreur 400.
