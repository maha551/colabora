'use strict';

const TransactionManager = require('../database/services/TransactionManager');
const { ApiError } = require('../middleware/errorHandler');

async function countAdmins(db) {
  const row = await TransactionManager.query(
    db,
    "SELECT COUNT(*) as count FROM users WHERE role = 'admin'",
    []
  );
  return parseInt(row?.count || 0, 10);
}

function assertNotSelf(adminUserId, targetUserId, message = 'You cannot perform this action on your own account') {
  if (adminUserId === targetUserId) {
    throw ApiError.validation(message, null, 'CANNOT_MODIFY_SELF');
  }
}

async function assertNotLastAdmin(db, targetUserId, message = 'Cannot remove the last admin user') {
  const user = await TransactionManager.query(
    db,
    'SELECT id, role FROM users WHERE id = ?',
    [targetUserId]
  );
  if (user?.role === 'admin') {
    const adminCount = await countAdmins(db);
    if (adminCount <= 1) {
      throw ApiError.validation(message, null, 'LAST_ADMIN');
    }
  }
}

module.exports = {
  countAdmins,
  assertNotSelf,
  assertNotLastAdmin,
};
