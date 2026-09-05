// src/modules/filieres/filieres.controller.js

const { Filiere, UE, Utilisateur, Ecole } = require('../../models');
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
    const { code, nom, departement, ecole_id } = req.body;
    const ecole = await Ecole.findByPk(ecole_id);
    if (!ecole) return error(res, 'École introuvable.', 400);

    const filiere = await Filiere.create({ code: code.toUpperCase(), nom, departement, ecole_id });
    return created(res, filiere, 'Filière créée.');
  } catch (err) { next(err); }
};

// PUT /filieres/:id — Admin
const modifierFiliere = async (req, res, next) => {
  try {
    const filiere = await Filiere.findByPk(req.params.id);
    if (!filiere) return error(res, 'Filière introuvable.', 404);

    const { code, nom, departement, ecole_id } = req.body;
    const updates = {};

    if (typeof code !== 'undefined') {
      const cleanedCode = String(code).trim();
      if (!cleanedCode) return error(res, 'Code obligatoire.', 400);
      updates.code = cleanedCode.toUpperCase();
    }
    if (typeof nom !== 'undefined') {
      const cleanedNom = String(nom).trim();
      if (!cleanedNom) return error(res, 'Nom obligatoire.', 400);
      updates.nom = cleanedNom;
    }
    if (typeof departement !== 'undefined') updates.departement = departement ? String(departement).trim() : null;
    if (typeof ecole_id !== 'undefined') {
      const ecole = await Ecole.findByPk(ecole_id);
      if (!ecole) return error(res, 'École introuvable.', 400);
      updates.ecole_id = ecole_id;
    }

    await filiere.update(updates);
    return success(res, filiere, 'Filière mise à jour.');
  } catch (err) { next(err); }
};

const supprimerFiliere = async (req, res, next) => {
  try {
    const filiere = await Filiere.findByPk(req.params.id);
    if (!filiere) return error(res, 'Filière introuvable.', 404);

    await filiere.update({ actif: false });
    await UE.update({ actif: false }, { where: { filiere_id: filiere.id } });

    return success(res, {}, 'Filière supprimée.');
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

const modifierUE = async (req, res, next) => {
  try {
    const filiere = await Filiere.findByPk(req.params.id);
    if (!filiere) return error(res, 'Filière introuvable.', 404);

    const ue = await UE.findOne({ where: { id: req.params.ueId, filiere_id: req.params.id } });
    if (!ue) return error(res, 'UE introuvable.', 404);

    const { code, intitule, niveau, semestre, credits } = req.body;
    const updates = {};

    if (typeof code !== 'undefined') updates.code = String(code).trim().toUpperCase();
    if (typeof intitule !== 'undefined') updates.intitule = String(intitule).trim();
    if (typeof niveau !== 'undefined') updates.niveau = niveau;
    if (typeof semestre !== 'undefined') updates.semestre = semestre;
    if (typeof credits !== 'undefined') updates.credits = parseInt(credits, 10) || 3;

    await ue.update(updates);
    return success(res, ue, 'UE mise à jour.');
  } catch (err) { next(err); }
};

const supprimerUE = async (req, res, next) => {
  try {
    const filiere = await Filiere.findByPk(req.params.id);
    if (!filiere) return error(res, 'Filière introuvable.', 404);

    const ue = await UE.findOne({ where: { id: req.params.ueId, filiere_id: req.params.id } });
    if (!ue) return error(res, 'UE introuvable.', 404);

    await ue.update({ actif: false });
    return success(res, {}, 'UE supprimée.');
  } catch (err) { next(err); }
};

module.exports = {
  listerFilieres,
  getFiliere,
  creerFiliere,
  modifierFiliere,
  supprimerFiliere,
  listerUEs,
  creerUE,
  modifierUE,
  supprimerUE,
};
