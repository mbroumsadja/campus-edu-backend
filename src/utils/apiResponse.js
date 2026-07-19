// src/utils/apiResponse.js
// Helpers pour des réponses API cohérentes dans toute l'application

const success = (res, data = {}, message = 'Succès', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const created = (res, data = {}, message = 'Ressource créée') => {
  return success(res, data, message, 201);
};

const error = (res, message = 'Erreur serveur', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const paginated = (res, rows, count, page, limit) => {
  return res.status(200).json({
    success: true,
    data: rows,
    pagination: {
      total:       count,
      page:        parseInt(page),
      limit:       parseInt(limit),
      totalPages:  Math.ceil(count / limit),
      hasNext:     page * limit < count,
      hasPrev:     page > 1,
    },
  });
};

module.exports = { success, created, error, paginated };
