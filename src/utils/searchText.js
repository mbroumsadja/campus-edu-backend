// src/utils/searchText.js
// Recherche insensible à la casse ET aux accents (CE-16) : « systeme » trouve « Système ».
// Côté SQL on compare f_unaccent(lower(colonne)) au terme normalisé de la même façon côté JS.

const { Op, fn, col, where: whereFn } = require('sequelize');

// Même normalisation que f_unaccent(lower(x)) : minuscules, sans diacritiques, œ→oe, æ→ae
const normalizeSearch = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o').replace(/đ/g, 'd')
    .replace(/\s+/g, ' ')
    .trim();

// Échappe % _ \ pour qu'ils soient cherchés littéralement et non comme jokers
const escapeLike = (value) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

// Condition Sequelize : colonne qualifiée ("Cours.titre", "ue.code"…) contient le terme
const containsText = (qualifiedColumn, term) => {
  const needle = escapeLike(normalizeSearch(term));
  return whereFn(fn('f_unaccent', fn('lower', col(qualifiedColumn))), { [Op.like]: `%${needle}%` });
};

module.exports = { normalizeSearch, escapeLike, containsText };
