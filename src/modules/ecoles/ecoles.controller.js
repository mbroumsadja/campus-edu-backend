const { Ecole, Filiere } = require('../../models');
const { Op } = require('sequelize');
const { success, created, error } = require('../../utils/apiResponse');

// GET /ecoles
const listerEcoles = async (req, res, next) => {
  try {
    const { search } = req.query;
    const where = {};
    if (search) {
      where.ecole = { [Op.like]: `%${search}%` };
    }

    const ecoles = await Ecole.findAll({ where, order: [['ecole', 'ASC']] });
    return success(res, ecoles);
  } catch (err) {
    next(err);
  }
};

// GET /ecoles/:id
const getEcole = async (req, res, next) => {
  try {
    const ecole = await Ecole.findByPk(req.params.id, {
      include: [{ model: Filiere, as: 'filiere', required: false }],
    });
    if (!ecole) return error(res, 'École introuvable.', 404);
    return success(res, ecole);
  } catch (err) {
    next(err);
  }
};

// POST /ecoles
const creerEcole = async (req, res, next) => {
  try {
    const { ecole } = req.body;
    const nouvelleEcole = await Ecole.create({ ecole: ecole.trim() });
    return created(res, nouvelleEcole, 'École créée.');
  } catch (err) {
    next(err);
  }
};

// PUT /ecoles/:id
const modifierEcole = async (req, res, next) => {
  try {
    const ecole = await Ecole.findByPk(req.params.id);
    if (!ecole) return error(res, 'École introuvable.', 404);

    const { ecole: ecoleNom } = req.body;
    await ecole.update({ ecole: ecoleNom.trim() });
    return success(res, ecole, 'École mise à jour.');
  } catch (err) {
    next(err);
  }
};

// DELETE /ecoles/:id
const supprimerEcole = async (req, res, next) => {
  try {
    const ecole = await Ecole.findByPk(req.params.id);
    if (!ecole) return error(res, 'École introuvable.', 404);

    const filieres = await Filiere.count({ where: { ecole_id: ecole.id } });
    if (filieres > 0) {
      return error(res, 'Impossible de supprimer cette école tant qu\'elle contient des filières.', 400);
    }

    await ecole.destroy();
    return success(res, {}, 'École supprimée.');
  } catch (err) {
    next(err);
  }
};

module.exports = { listerEcoles, getEcole, creerEcole, modifierEcole, supprimerEcole };
