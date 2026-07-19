// src/modules/filieres/filieres.controller.js

const { Filiere, UE, Utilisateur } = require('../../models');
const { success, created, error }  = require('../../utils/apiResponse');

// GET /filieres
const listerFilieres = async (req, res, next) => {
  try {
    const filieres = await Filiere.findAll({
      where:   { actif: true },
      order:   [['nom', 'ASC']],
    });
    return success(res, filieres);
  } catch (err) { next(err); }
};

// GET /filieres/:id
const getFiliere = async (req, res, next) => {
  try {
    const filiere = await Filiere.findByPk(req.params.id, {
      include: [{
        model:      UE,
        as:         'ues',
        where:      { actif: true },
        required:   false,
        order:      [['niveau', 'ASC'], ['semestre', 'ASC']],
      }],
    });
    if (!filiere) return error(res, 'Filière introuvable.', 404);
    return success(res, filiere);
  } catch (err) { next(err); }
};

// POST /filieres — Admin
const creerFiliere = async (req, res, next) => {
  try {
    const { code, nom, departement } = req.body;
    const filiere = await Filiere.create({ code: code.toUpperCase(), nom, departement });
    return created(res, filiere, 'Filière créée.');
  } catch (err) { next(err); }
};

// PUT /filieres/:id — Admin
const modifierFiliere = async (req, res, next) => {
  try {
    const filiere = await Filiere.findByPk(req.params.id);
    if (!filiere) return error(res, 'Filière introuvable.', 404);
    await filiere.update(req.body);
    return success(res, filiere, 'Filière mise à jour.');
  } catch (err) { next(err); }
};

// ── UEs d'une filière ─────────────────────────────────────────────

// GET /filieres/:id/ues
const listerUEs = async (req, res, next) => {
  try {
    const { niveau } = req.query;
    const where = { filiere_id: req.params.id, actif: true };
    if (niveau) where.niveau = niveau;
    const ues = await UE.findAll({ where, order: [['niveau','ASC'],['semestre','ASC']] });
    return success(res, ues);
  } catch (err) { next(err); }
};

// POST /filieres/:id/ues — Admin
const creerUE = async (req, res, next) => {
  try {
    const { code, intitule, niveau, semestre, credits } = req.body;
    const ue = await UE.create({
      code: code.toUpperCase(),
      intitule, niveau, semestre,
      credits:    credits || 3,
      filiere_id: req.params.id,
    });
    return created(res, ue, 'UE créée.');
  } catch (err) { next(err); }
};

module.exports = { listerFilieres, getFiliere, creerFiliere, modifierFiliere, listerUEs, creerUE };
