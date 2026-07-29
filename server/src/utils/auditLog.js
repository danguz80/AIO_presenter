async function writeAuditLog(db, {
  organizationId,
  userId,
  actionType,
  entityType,
  entityId = null,
  message = '',
  metadata = null,
}) {
  if (!organizationId || !userId || !actionType || !entityType) return;
  try {
    await db.query(
      `INSERT INTO audit_logs (
         organization_id, user_id, action_type, entity_type, entity_id, message, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        organizationId,
        userId,
        actionType,
        entityType,
        entityId,
        message || null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
  } catch (err) {
    // No debe romper la operación principal por un fallo de auditoría.
    console.error('[Audit] writeAuditLog:', err.message);
  }
}

module.exports = { writeAuditLog };