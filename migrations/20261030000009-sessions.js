'use strict';
// CE-12 — Sessions multi-appareils : table `sessions` (refresh tokens hachés SHA-256).
// Reprise des sessions existantes : chaque utilisateurs.refresh_token en clair devient une session
// (hachée) puis la colonne est vidée — personne n'est déconnecté, plus aucun token n'est stocké en clair.
// La colonne utilisateurs.refresh_token est conservée (vide) jusqu'à la phase « contracter ».

module.exports = {
  async up(q, Sequelize) {
    const { DataTypes } = Sequelize;
    await q.sequelize.transaction(async (t) => {
      await q.createTable('sessions', {
        id: { type: DataTypes.UUID, primaryKey: true },
        utilisateur_id: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'utilisateurs', key: 'id' }, onDelete: 'CASCADE', onUpdate: 'CASCADE' },
        famille_id: { type: DataTypes.UUID, allowNull: false },
        token_hash: { type: DataTypes.CHAR(64), allowNull: false, unique: true },
        appareil: { type: DataTypes.STRING(120) },
        expires_at: { type: DataTypes.DATE, allowNull: false },
        last_used_at: { type: DataTypes.DATE },
        revoked_at: { type: DataTypes.DATE },
        motif_revocation: { type: DataTypes.ENUM('logout', 'rotation', 'rejeu', 'mot_de_passe', 'suspension', 'limite', 'admin') },
        created_at: { type: DataTypes.DATE, allowNull: false },
        updated_at: { type: DataTypes.DATE, allowNull: false },
      }, { transaction: t });
      await q.addIndex('sessions', ['utilisateur_id', 'revoked_at'], { name: 'sessions_utilisateur_id_revoked_at', transaction: t });
      await q.addIndex('sessions', ['famille_id'], { name: 'sessions_famille_id', transaction: t });
      await q.addIndex('sessions', ['expires_at'], { name: 'sessions_expires_at', transaction: t });

      const run = (sql) => q.sequelize.query(sql, { transaction: t });
      await run(`
        INSERT INTO sessions (id, utilisateur_id, famille_id, token_hash, appareil, expires_at, last_used_at, created_at, updated_at)
        SELECT gen_random_uuid(), id, gen_random_uuid(), encode(sha256(convert_to(refresh_token, 'UTF8')), 'hex'),
               'Appareil existant', now() + interval '7 days', COALESCE(derniere_connexion, now()), now(), now()
          FROM utilisateurs WHERE refresh_token IS NOT NULL AND refresh_token <> ''
        ON CONFLICT (token_hash) DO NOTHING`);
      await run(`UPDATE utilisateurs SET refresh_token = NULL WHERE refresh_token IS NOT NULL`);
    });
  },

  async down(q) {
    // Les tokens étant hachés, on ne peut pas les restaurer : les utilisateurs devront se reconnecter.
    await q.dropTable('sessions');
    await q.sequelize.query('DROP TYPE IF EXISTS enum_sessions_motif_revocation');
  },
};
