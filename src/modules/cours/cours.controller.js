// src/modules/cours/cours.controller.js

const { Cours, UE, Utilisateur, Filiere } = require('../../models');
const { Op }             = require('sequelize');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const path               = require('path');

// ──────────────────────────────────────────────────────────────────
//  GET /cours
//  Accessible aux étudiants : filtrés automatiquement par filière + niveau
//  Query params: ue_id, type, annee, page, limit, search
// ──────────────────────────────────────────────────────────────────
const listerCours = async (req, res, next) => {
  try {
    const { ue_id, type, annee, search, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    // Construire le WHERE selon le rôle
    const where = { statut: 'publie' };

    if (ue_id)  where.ue_id = ue_id;
    if (type)   where.type  = type;
    if (annee)  where.anneAcademique = annee;
    if (search) where.titre = { [Op.like]: `%${search}%` };

    // Pour un étudiant : restreindre aux cours de sa filière/niveau
    const includeUE = {
      model:      UE,
      as:         'ue',
      attributes: ['id', 'code', 'intitule', 'niveau', 'semestre'],
      include: [{
        model:      Filiere,
        as:         'filiere',
        attributes: ['id', 'nom', 'code'],
      }],
    };

    if (req.user.role === 'etudiant') {
      includeUE.where = {
        filiere_id: req.user.filiere_id,
        niveau:     req.user.niveau,
      };
    }

    const { count, rows } = await Cours.findAndCountAll({
      where,
      include: [
        includeUE,
        {
          model:      Utilisateur,
          as:         'enseignant',
          attributes: ['id', 'nom', 'prenom', 'matricule'],
        },
      ],
      attributes: { exclude: ['cheminFichier'] }, // Ne pas exposer le chemin réel
      order:  [['createdAt', 'DESC']],
      limit:  parseInt(limit),
      offset: parseInt(offset),
      distinct: true, // Nécessaire avec findAndCountAll + include
    });

    return paginated(res, rows, count, page, limit);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /cours/:id
// ──────────────────────────────────────────────────────────────────
const getCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id, {
      include: [
        { model: UE, as: 'ue', include: [{ model: Filiere, as: 'filiere' }] },
        { model: Utilisateur, as: 'enseignant', attributes: ['id', 'nom', 'prenom'] },
      ],
      attributes: { exclude: ['cheminFichier'] },
});

    if (!cours) return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie' && req.user.role === 'etudiant') {
      return error(res, 'Ce cours n\'est pas disponible.', 403);
    }

    // Incrémenter le compteur de vues (sans bloquer la réponse)
    cours.increment('vues').catch(() => {});

    return success(res, cours);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  GET /cours/:id/telecharger
//  Renvoie le fichier avec un nom propre + incrémente compteur
// ──────────────────────────────────────────────────────────────────
const telechargerCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id, {
      attributes: ['id', 'titre', 'cheminFichier', 'nomFichierOriginal', 'statut'],
    });

    if (!cours)                      return error(res, 'Cours introuvable.', 404);
    if (cours.statut !== 'publie') {
      return error(res, 'Cours non disponible.', 403);
    }

    const filePath = path.resolve(cours.cheminFichier);
    cours.increment('telechargemements').catch(() => {});

  const ext = path.extname(cours.cheminFichier) || '.pdf'
  const fallback = `cours_${cours.id}${ext}`

  return res.download(filePath, cours.nomFichierOriginal || fallback)

  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  POST /cours — Enseignant ou Admin seulement
// ──────────────────────────────────────────────────────────────────
const creerCours = async (req, res, next) => {
  try {
    if (!req.file) return error(res, 'Aucun fichier fourni.', 400);

    const { titre, description, type, ue_id, anneAcademique } = req.body;

    // Vérifier que l'UE existe et appartient bien à la bonne filière
    const ue = await UE.findByPk(ue_id);
    if (!ue) return error(res, 'Unité d\'enseignement introuvable.', 404);

    // Un enseignant ne peut déposer que dans sa filière
    if (req.user.role === 'enseignant') {
      const enseignant = await Utilisateur.findByPk(req.user.id, { attributes: ['filiere_id'] });
      if (ue.filiere_id !== enseignant.filiere_id) {
        return error(res, 'Vous ne pouvez déposer des cours que dans votre filière.', 403);
      }
    }

    const cours = await Cours.create({
      titre,
      description,
      type:              type || 'pdf',
      ue_id,
      enseignant_id:     req.user.id,
      cheminFichier:     req.file.path,
      nomFichierOriginal: req.file.originalname,
      tailleFichier:     req.file.size,
      anneAcademique:    anneAcademique || new Date().getFullYear() + '-' + (new Date().getFullYear() + 1),
      // Admin publie directement, enseignant passe en validation
      statut: req.user.role === 'admin' ? 'publie' : 'en_attente',
    });

    return created(res, cours, 'Cours déposé avec succès. En attente de validation.');
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  PATCH /cours/:id/statut — Admin seulement (valider / archiver)
// ──────────────────────────────────────────────────────────────────
const changerStatut = async (req, res, next) => {
  try {
    const { statut } = req.body;
    const cours = await Cours.findByPk(req.params.id);
    if (!cours) return error(res, 'Cours introuvable.', 404);

    await cours.update({ statut });
    return success(res, cours, `Cours ${statut} avec succès.`);
  } catch (err) {
    next(err);
  }
};

// ──────────────────────────────────────────────────────────────────
//  DELETE /cours/:id — Admin seulement
// ──────────────────────────────────────────────────────────────────
const supprimerCours = async (req, res, next) => {
  try {
    const cours = await Cours.findByPk(req.params.id);
    if (!cours) return error(res, 'Cours introuvable.', 404);

    // Option: supprimer aussi le fichier physique
    // const fs = require('fs');
    // if (fs.existsSync(cours.cheminFichier)) fs.unlinkSync(cours.cheminFichier);

    await cours.destroy();
    return success(res, {}, 'Cours supprimé.');
  } catch (err) {
    next(err);
  }
};

module.exports = { listerCours, getCours, telechargerCours, creerCours, changerStatut, supprimerCours };
