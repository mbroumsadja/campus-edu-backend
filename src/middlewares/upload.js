const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// 1. CONFIGURATION DE MULTER POUR VERCEL BLOB
// ─────────────────────────────────────────────────────────────────────────────

const isVercelBlobEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;

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
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

const handleUploadError = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Fichier trop volumineux. Maximum : ${maxSizeMB}MB` });
      }
      return res.status(400).json({ error: `Erreur upload : ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });

    if (isVercelBlobEnabled && req.file && req.file.buffer) {
      try {
        const ext = path.extname(req.file.originalname).toLowerCase();
        const baseName = path.basename(req.file.originalname, ext)
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase()
          .slice(0, 50);
        const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const blobName = `${baseName}_${unique}${ext}`;

        const result = await put(blobName, req.file.buffer, {
          access: process.env.BLOB_ACCESS_MODE || 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
          contentType: req.file.mimetype,
          addRandomSuffix: false,
        });

        req.file.path = result.url;
        req.file.filename = result.pathname || blobName;
        req.file.storage = 'vercel-blob';
        req.file.size = result.size || req.file.size;
      } catch (uploadErr) {
        return res.status(500).json({
          error: 'Échec du téléversement vers Vercel Blob.',
          details: uploadErr.message,
        });
      }
    }

    next();
  });
};

const downloadStoredFile = async (res, storagePath, fileName) => {
  if (!storagePath) {
    return res.status(404).json({ error: 'Aucun fichier disponible.' });
  }

  if (/^https?:\/\//i.test(storagePath)) {
    const remoteResponse = await fetch(storagePath);
    if (!remoteResponse.ok) {
      return res.status(502).json({ error: 'Impossible de télécharger le fichier depuis le stockage distant.' });
    }

    const contentType = remoteResponse.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName || 'document')}"`);
    return remoteResponse.body.pipe(res);
  }

  return res.download(path.resolve(storagePath), fileName);
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. ROUTE DE TÉLÉVERSEMENT VERCEL BLOB
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  '/upload',
  handleUploadError(upload.single('document')),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier fourni.' });
    }

    try {
      if (!isVercelBlobEnabled) {
        return res.status(500).json({
          error: 'Vercel Blob n\'est pas configuré. Définissez BLOB_READ_WRITE_TOKEN.',
        });
      }

      return res.status(201).json({
        success: true,
        message: 'Fichier sauvegardé avec succès sur Vercel Blob.',
        key: req.file.filename,
        url: req.file.path,
      });
    } catch (err) {
      return res.status(500).json({
        error: 'Échec du téléversement vers Vercel Blob.',
        details: err.message,
      });
    }
  }
);

module.exports = { upload, handleUploadError, downloadStoredFile, uploadRouter: router };