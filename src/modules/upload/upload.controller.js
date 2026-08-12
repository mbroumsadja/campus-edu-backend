// src/modules/upload/upload.controller.js
// Émission de jetons d'upload client Vercel Blob.
//
// Contexte : Vercel Functions plafonne le corps de requête à 4,5 Mo.
// Envoyer plusieurs fichiers via multipart/form-data vers notre API
// (server upload) dépasse vite cette limite et provoque un 413.
// On bascule donc sur le pattern "client upload" officiel de Vercel
// Blob : le navigateur envoie les fichiers DIRECTEMENT à Vercel Blob,
// notre backend ne fait que délivrer un jeton signé de courte durée
// après avoir vérifié l'authentification/rôle et le type de fichier.
// Voir : https://vercel.com/docs/vercel-blob/client-upload

const { handleUpload } = require('@vercel/blob/client');
const { error } = require('../../utils/apiResponse');

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
          maximumSizeInBytes: (parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 50) * 1024 * 1024,
          tokenPayload: JSON.stringify({
            userId: req.user.id,
            clientPayload: clientPayload || null,
          }),
        };
      },
      // Pas de onUploadCompleted : le front nous notifie explicitement
      // via POST /api/cours ou /api/sujets une fois tous les fichiers
      // uploadés, avec les métadonnées (url, nom, taille) des blobs.
      // Ça évite de dépendre du webhook Vercel (signature, callback
      // URL joignable) pour une opération qu'on peut faire de façon
      // synchrone et plus simple à tester.
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    return error(res, err.message || 'Échec de la génération du jeton d\'upload.', 400);
  }
};

module.exports = { genererJetonClient };
