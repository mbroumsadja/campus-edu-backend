const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONFIGURATION DU DOSSIER TEMPORAIRE (MULTER) — inchangé
// ─────────────────────────────────────────────────────────────────────────────

const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dest = path.join(uploadDir, 'temp_b2');
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-z0-9]/gi, '_')
      .toLowerCase()
      .slice(0, 50);
    const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    cb(null, `${baseName}_${unique}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'application/pdf',
    'video/mp4', 'video/webm',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];

  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Formats acceptés : PDF, MP4, PPTX, DOCX'), false);
  }
};

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB) || 50;

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

const handleUploadError = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Fichier trop volumineux. Maximum : ${maxSizeMB}MB` });
      }
      return res.status(400).json({ error: `Erreur upload : ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });
    next();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. INITIALISATION DU CLIENT BACKBLAZE B2 (S3-compatible)
// ─────────────────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  endpoint: process.env.B2_ENDPOINT, // ex: https://s3.eu-central-003.backblazeb2.com
  region: process.env.B2_REGION,     // ex: eu-central-003
  credentials: {
    accessKeyId: process.env.B2_KEY_ID,
    secretAccessKey: process.env.B2_APP_KEY,
  },
});

const B2_BUCKET = process.env.B2_BUCKET_NAME;

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROUTE / LOGIQUE DE TÉLÉVERSEMENT ET NETTOYAGE
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/upload',
  handleUploadError(upload.single('document')),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni.' });
    }

    try {
      const fileStream = fs.createReadStream(req.file.path);
      const key = req.file.filename; // nom déjà nettoyé/uniqifié par Multer

      await s3.send(new PutObjectCommand({
        Bucket: B2_BUCKET,
        Key: key,
        Body: fileStream,
        ContentType: req.file.mimetype,
      }));

      // Génère une URL signée temporaire (bucket privé recommandé)
      const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: B2_BUCKET, Key: key }),
        { expiresIn: 3600 } // 1h — ajuste selon ton besoin
      );

      // Téléversement réussi : suppression du fichier temporaire local
      fs.unlink(req.file.path, (err) => {
        if (err) console.error(`[Alerte] Impossible de supprimer le fichier temporaire (${req.file.path}):`, err);
      });

      return res.status(201).json({
        success: true,
        message: 'Fichier sauvegardé avec succès sur Backblaze B2 !',
        key,
        url: signedUrl,
      });

    } catch (err) {
      console.error('Erreur API B2:', err);

      if (req.file && fs.existsSync(req.file.path)) {
        try {
          fs.unlinkSync(req.file.path);
        } catch (unlinkErr) {
          console.error('Erreur lors du nettoyage d\'échec:', unlinkErr);
        }
      }

      return res.status(500).json({
        error: 'Échec du téléversement vers Backblaze B2.',
        details: err.message
      });
    }
  }
);

module.exports = { upload, handleUploadError, uploadRouter: router };