// src/modules/upload/upload.controller.js
// Émission de jetons d'upload client Vercel Blob.
//

const { handleUpload } = require('@vercel/blob/client');
const { error, success } = require('../../utils/apiResponse');
const { chercherDoublons, normaliserSha } = require('../../utils/doublons');

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'video/mp4', 'video/webm',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

// ──────────────────────────────────────────────────────────────────
//  POST /api/upload/client-token
//  Authentifié (enseignant ou admin) — appelé par le SDK
//  @vercel/blob/client (fonction upload()) côté navigateur, PAS
//  directement par l'utilisateur.
// ──────────────────────────────────────────────────────────────────
const genererJetonClient = async (req, res) => {
  try {
    const jsonResponse = await handleUpload({
      body: req.body,
      request: req,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        // req.user est déjà garanti par verifyToken/authorize en amont
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          addRandomSuffix: true,
          maximumSizeInBytes: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 100) * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: req.user.id,
            clientPayload: clientPayload || null,
          }),
        };
      }
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    return error(res, err.message || 'Échec de la génération du jeton d\'upload.', 400);
  }
};

module.exports = { genererJetonClient };


// POST /upload/verifier-doublon — { sha256 } ou { sha256s: [...] } (20 max)
// À appeler AVANT l'envoi vers Blob : évite de téléverser un fichier déjà présent.
const verifierDoublon = async (req, res, next) => {
  try {
    const demandes = req.body.sha256s || [req.body.sha256];
    const resultat = await chercherDoublons(demandes);
    const resultats = demandes.map(normaliserSha).map((sha) => ({
      sha256: sha,
      existe: resultat[sha].length > 0,
      correspondances: resultat[sha],
    }));
    return success(res, { existe: resultats.some((r) => r.existe), resultats });
  } catch (err) { next(err); }
};

module.exports.verifierDoublon = verifierDoublon;
