const express = require('express');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const { Readable } = require('stream');
const { isTrustedFileUrl } = require('../utils/fileUrl');
const { contentDisposition, cleanFileName } = require('../utils/fileName');

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

const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB) || 100;

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

const uploadToVercelBlob = async (file) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const baseName = path.basename(file.originalname, ext)
    .replace(/[^a-z0-9]/gi, '_')
    .toLowerCase()
    .slice(0, 50);
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const blobName = `${baseName}_${unique}${ext}`;

  const result = await put(blobName, file.buffer, {
    access: process.env.BLOB_ACCESS_MODE || 'public',
    token: process.env.BLOB_READ_WRITE_TOKEN,
    contentType: file.mimetype,
    addRandomSuffix: false,
  });

  file.path = result.url;
  file.filename = result.pathname || blobName;
  file.storage = 'vercel-blob';
  file.size = result.size || file.size;
};

const handleUploadError = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: `Fichier trop volumineux. Maximum : ${maxSizeMB}MB` });
      }
      return res.status(400).json({ error: `Erreur upload : ${err.message}` });
    }
    if (err) return res.status(400).json({ error: err.message });

    if (isVercelBlobEnabled) {
      try {
        const filesToUpload = [];

        if (req.file && req.file.buffer) {
          filesToUpload.push(req.file);
        }

        if (req.files) {
          if (Array.isArray(req.files)) {
            filesToUpload.push(...req.files.filter(file => file && file.buffer));
          } else {
            Object.values(req.files).forEach((fileGroup) => {
              if (Array.isArray(fileGroup)) {
                filesToUpload.push(...fileGroup.filter(file => file && file.buffer));
              }
            });
          }
        }

        await Promise.all(filesToUpload.map(uploadToVercelBlob));
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
    // Anti-SSRF : on ne relit jamais une URL hors Vercel Blob (CE-01)
    if (!isTrustedFileUrl(storagePath)) {
      return res.status(502).json({ error: 'Source de fichier non autorisée.' });
    }

    // CE-18 : par défaut on redirige (302) vers le CDN Blob, aucun octet ne transite par la fonction.
    // DOWNLOAD_MODE=proxy rétablit le relais du fichier (retour arrière).
    if ((process.env.DOWNLOAD_MODE || 'redirect') !== 'proxy') {
      const cible = new URL(storagePath);
      cible.searchParams.set('download', '1'); // Vercel Blob : Content-Disposition: attachment
      // La réponse dépend du comptage et du limiteur : jamais mise en cache
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('Referrer-Policy', 'no-referrer');
      return res.redirect(302, cible.toString());
    }

    let remoteResponse;
    try {
      remoteResponse = await fetch(storagePath, { redirect: 'error' });
    } catch (err) {
      return res.status(502).json({ error: 'Impossible de joindre le stockage distant.' });
    }

    if (!remoteResponse.ok || !remoteResponse.body) {
      return res.status(502).json({ error: 'Impossible de télécharger le fichier depuis le stockage distant.' });
    }

    const contentType = remoteResponse.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', contentDisposition(fileName));

    return Readable.fromWeb(remoteResponse.body).pipe(res);
  }

  // Chemin local : uniquement à l'intérieur du dossier d'uploads
  const uploadRoot = path.resolve(process.env.UPLOAD_DIR || './uploads');
  const resolved   = path.resolve(storagePath);
  if (resolved !== uploadRoot && !resolved.startsWith(uploadRoot + path.sep)) {
    return res.status(404).json({ error: 'Aucun fichier disponible.' });
  }

  return res.download(resolved, cleanFileName(fileName) || 'document');
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

const { del } = require('@vercel/blob');

const deleteStoredFile = async (storagePath) => {
  if (!storagePath) return;

  if (/^https?:\/\//i.test(storagePath)) {
    if (!isTrustedFileUrl(storagePath)) return;
    await del(storagePath, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => {});
    return;
  }

  const fs = require('fs');
  if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
};

module.exports = { upload, handleUploadError, downloadStoredFile, deleteStoredFile, uploadRouter: router };