// src/modules/demandes/demandes.controller.js
// CE-20 : demandes publiques (sujet manquant, signalement) — anti-spam : limite par IP, champ piège,
// tailles maximales, détection de doublon (même auteur, même cible, 24 h), IP jamais stockée.
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Demande, UE, Sujet, Utilisateur } = require('../../models');
const { success, created, error, paginated } = require('../../utils/apiResponse');
const { audit } = require('../../utils/audit');

const empreinte = (ip) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'dev').update(String(ip || '')).digest('hex');
const nbLiens = (t) => (String(t).match(/https?:\/\/|www\./gi) || []).length;

// POST /demandes — public (connexion facultative)
const creerDemande = async (req, res, next) => {
  try {
    // Champ piège : invisible pour un humain, rempli par les robots. On répond comme un succès sans rien stocker.
    if (req.body.site_web) return created(res, { id: null }, 'Demande reçue. Merci !');

    const { type, ue_id, sujet_id } = req.body;
    const nomCours = req.body.nom_cours ? String(req.body.nom_cours).trim() : null;
    const nomEtudiant = (req.body.nom_etudiant && String(req.body.nom_etudiant).trim())
      || (req.user ? `${req.user.prenom} ${req.user.nom}`.trim() : null);
    if (type === 'cours_demande' && !nomEtudiant) return error(res, 'Le nom de l\'étudiant est obligatoire.', 400);
    const message = req.body.message && String(req.body.message).trim()
      ? String(req.body.message).trim()
      : `Demande du cours « ${nomCours} » par ${nomEtudiant}.`;
    const contact = req.body.contact ? String(req.body.contact).trim() : null;

    if (nbLiens(message) > 1) return error(res, 'Les messages contenant plusieurs liens sont refusés.', 400);

    if (ue_id && !(await UE.findByPk(ue_id, { attributes: ['id'] }))) return error(res, 'UE introuvable.', 404);
    if (sujet_id && !(await Sujet.findByPk(sujet_id, { attributes: ['id'] }))) return error(res, 'Sujet introuvable.', 404);
    if (type === 'signalement' && !sujet_id) return error(res, 'Un signalement doit préciser le sujet concerné.', 400);
    if (type === 'sujet_manquant' && !ue_id) return error(res, 'Une demande de sujet doit préciser l\'UE concernée.', 400);

    const auteur = empreinte(req.ip);
    const doublon = await Demande.findOne({
      where: {
        empreinte_auteur: auteur, type,
        ue_id: ue_id || null, sujet_id: sujet_id || null,
        ...(type === 'cours_demande' && { nom_cours: nomCours }),
        created_at: { [Op.gt]: new Date(Date.now() - 24 * 3600 * 1000) },
      },
      attributes: ['id'],
    });
    if (doublon) return success(res, { id: doublon.id }, 'Demande déjà reçue. Merci !');

    const demande = await Demande.create({
      type, message, contact, nom_etudiant: nomEtudiant, nom_cours: nomCours, ue_id: ue_id || null, sujet_id: sujet_id || null,
      auteur_id: req.user?.id || null, empreinte_auteur: auteur,
    });
    return created(res, { id: demande.id }, 'Demande reçue. Merci !');
  } catch (err) { next(err); }
};

// GET /demandes — admin
const listerDemandes = async (req, res, next) => {
  try {
    const { statut, type, page = 1, limit = 20 } = req.query;
    const where = {};
    if (statut) where.statut = statut;
    if (type) where.type = type;
    const lim = Math.min(parseInt(limit, 10) || 20, 100);
    const pg = Math.max(parseInt(page, 10) || 1, 1);
    const { count, rows } = await Demande.findAndCountAll({
      where,
      attributes: { exclude: ['empreinte_auteur'] },
      include: [
        { model: UE, as: 'ue', attributes: ['id', 'code', 'intitule'] },
        { model: Sujet, as: 'sujet', attributes: ['id', 'titre'] },
        { model: Utilisateur, as: 'auteur', attributes: ['id', 'matricule', 'nom', 'prenom'] },
      ],
      order: [['created_at', 'DESC'], ['id', 'DESC']],
      limit: lim, offset: (pg - 1) * lim,
    });
    return paginated(res, rows, count, pg, lim);
  } catch (err) { next(err); }
};

// PATCH /demandes/:id/statut — admin
const changerStatut = async (req, res, next) => {
  try {
    const demande = await Demande.findByPk(req.params.id);
    if (!demande) return error(res, 'Demande introuvable.', 404);
    await demande.update({ statut: req.body.statut, traite_par: req.user.id });
    await audit({ action: 'UPDATE_DEMANDE', utilisateur_id: req.user.id, ipAddress: req.ip, details: { demande: demande.id, statut: req.body.statut } });
    return success(res, { id: demande.id, statut: demande.statut }, 'Statut mis à jour.');
  } catch (err) { next(err); }
};

module.exports = { creerDemande, listerDemandes, changerStatut };
