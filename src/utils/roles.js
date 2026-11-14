// src/utils/roles.js
// Rôles administrateurs : le super_admin a tous les droits d'un admin, et seul lui
// valide (active) les comptes administrateurs et peut les suspendre ou les supprimer.

const estSuperAdmin = (user) => user?.role === 'super_admin';
const estAdmin = (user) => user?.role === 'admin' || user?.role === 'super_admin';
const estCompteAdmin = (user) => estAdmin(user);

module.exports = { estSuperAdmin, estAdmin, estCompteAdmin };
