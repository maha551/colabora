const { v4: uuidv4 } = require('uuid');
const { generateToken, verifyPassword } = require('../../middleware/auth');
const { logger } = require('../../middleware/logger');
const { ApiError } = require('../../middleware/errorHandler');
const TransactionManager = require('../../database/services/TransactionManager');
const { addMemberToOrganizationDocuments } = require('../../modules/document-collaborator-sync');
const { safeAuthAttempt, safeRecordAuthEvent } = require('../auth/authTelemetry');
const { buildUserInsertWithLegalConsent } = require('../../utils/legalConsent');

async function resolvePendingOrganizationInvitationByEmail(db, email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  const invitation = await TransactionManager.query(db,
    `SELECT
      id, organization_id, email, invitation_type, status, expires_at
    FROM organization_invitations
    WHERE LOWER(email) = LOWER(?) AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1`,
    [email.trim()]
  );
  if (!invitation) {
    return null;
  }
  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    await TransactionManager.execute(db,
      'UPDATE organization_invitations SET status = ? WHERE id = ?',
      ['expired', invitation.id]
    );
    return null;
  }
  return invitation;
}

async function resolveInvitationContext(db, invitationToken, email) {
  if (!invitationToken) {
    const invitation = await resolvePendingOrganizationInvitationByEmail(db, email);
    if (invitation) {
      return {
        invitation,
        documentInvitation: null,
        organizationId: invitation.organization_id,
        invitationType: invitation.invitation_type,
        documentId: null
      };
    }
    return {
      invitation: null,
      documentInvitation: null,
      organizationId: null,
      invitationType: null,
      documentId: null
    };
  }

  let invitation = await TransactionManager.query(db,
    `SELECT
      id, organization_id, email, invitation_type, status, expires_at
    FROM organization_invitations
    WHERE invitation_token = ?`,
    [invitationToken]
  );

  let documentInvitation = null;
  let organizationId = null;
  let invitationType = null;
  let documentId = null;

  if (!invitation) {
    documentInvitation = await TransactionManager.query(db,
      `SELECT
        id, document_id, email, status, expires_at
      FROM document_invitations
      WHERE invitation_token = ?`,
      [invitationToken]
    );

    if (!documentInvitation) {
      throw ApiError.validation('Invalid invitation token', null, 'INVALID_INVITATION_TOKEN');
    }
  }

  const now = new Date();
  let expiresAt;

  if (invitation) {
    expiresAt = new Date(invitation.expires_at);
    if (now > expiresAt) {
      await TransactionManager.execute(db,
        'UPDATE organization_invitations SET status = ? WHERE id = ?',
        ['expired', invitation.id]
      );
      throw ApiError.validation('Invitation has expired', null, 'INVITATION_EXPIRED');
    }
    if (invitation.status !== 'pending') {
      throw ApiError.validation(`Invitation has been ${invitation.status}`, null, 'INVITATION_ALREADY_PROCESSED');
    }
    if (email.toLowerCase() !== invitation.email.toLowerCase()) {
      throw ApiError.validation('Email address does not match the invitation. Please use the email address that was invited.', null, 'EMAIL_MISMATCH');
    }
    organizationId = invitation.organization_id;
    invitationType = invitation.invitation_type;
  } else if (documentInvitation) {
    expiresAt = new Date(documentInvitation.expires_at);
    if (now > expiresAt) {
      await TransactionManager.execute(db,
        'UPDATE document_invitations SET status = ? WHERE id = ?',
        ['expired', documentInvitation.id]
      );
      throw ApiError.validation('Invitation has expired', null, 'INVITATION_EXPIRED');
    }
    if (documentInvitation.status !== 'pending') {
      throw ApiError.validation(`Invitation has been ${documentInvitation.status}`, null, 'INVITATION_ALREADY_PROCESSED');
    }
    if (email.toLowerCase() !== documentInvitation.email.toLowerCase()) {
      throw ApiError.validation('Email address does not match the invitation. Please use the email address that was invited.', null, 'EMAIL_MISMATCH');
    }
    documentId = documentInvitation.document_id;
  }

  return {
    invitation,
    documentInvitation,
    organizationId,
    invitationType,
    documentId
  };
}

async function acceptInvitationForExistingUser({
  db,
  existingUser,
  email,
  password,
  invitation,
  documentInvitation,
  req,
  ip,
  userAgent
}) {
  const passwordMatch = await verifyPassword(password, existingUser.password_hash);
  if (!passwordMatch) {
    throw ApiError.validation(
      'An account with this email already exists. Please log in with your existing password to accept the invitation.',
      {
        code: 'USER_EXISTS_WITH_INVITATION',
        shouldLogin: true
      },
      'USER_EXISTS_WITH_INVITATION'
    );
  }

  try {
    await TransactionManager.executeInTransaction(db, async (trx) => {
      if (invitation) {
        const existingMember = await TransactionManager.query(trx,
          'SELECT id, status FROM organization_members WHERE organization_id = ? AND user_id = ?',
          [invitation.organization_id, existingUser.id]
        );

        if (!existingMember) {
          const memberId = uuidv4();
          try {
            await TransactionManager.execute(trx,
              `INSERT INTO organization_members (id, organization_id, user_id, status, joined_at)
               VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
              [memberId, invitation.organization_id, existingUser.id]
            );
          } catch (memberErr) {
            if (memberErr.message && memberErr.message.includes('UNIQUE constraint')) {
              logger.info('User already added as member (race condition)', {
                organizationId: invitation.organization_id,
                userId: existingUser.id
              });
            } else {
              throw memberErr;
            }
          }
        } else {
          logger.info('User already a member, accepting invitation anyway', {
            organizationId: invitation.organization_id,
            userId: existingUser.id
          });
        }

        if (invitation.invitation_type === 'representative') {
          const existingRep = await TransactionManager.query(trx,
            'SELECT 1 FROM organization_representatives WHERE organization_id = ? AND user_id = ? AND status = ?',
            [invitation.organization_id, existingUser.id, 'active']
          );
          if (!existingRep) {
            const repTableId = uuidv4();
            try {
              await TransactionManager.execute(trx,
                `INSERT INTO organization_representatives (id, organization_id, user_id, status, added_at)
                 VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
                [repTableId, invitation.organization_id, existingUser.id]
              );
            } catch (repErr) {
              if (repErr.message && repErr.message.includes('UNIQUE constraint')) {
                logger.info('User already added as representative (race condition)', {
                  organizationId: invitation.organization_id,
                  userId: existingUser.id
                });
              } else {
                throw repErr;
              }
            }
          }
        }

        await TransactionManager.execute(trx,
          `UPDATE organization_invitations
           SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
           WHERE id = ?`,
          ['accepted', existingUser.id, invitation.id]
        );
      } else if (documentInvitation) {
        const existingCollaborator = await TransactionManager.query(trx,
          'SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?',
          [documentInvitation.document_id, existingUser.id]
        );

        const document = await TransactionManager.query(trx,
          'SELECT owner_id FROM documents WHERE id = ?',
          [documentInvitation.document_id]
        );

        if (document && document.owner_id === existingUser.id) {
          await TransactionManager.execute(trx,
            `UPDATE document_invitations
             SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
             WHERE id = ?`,
            ['accepted', existingUser.id, documentInvitation.id]
          );
        } else if (!existingCollaborator) {
          const collaboratorId = uuidv4();
          await TransactionManager.execute(trx,
            'INSERT INTO document_collaborators (id, document_id, user_id) VALUES (?, ?, ?)',
            [collaboratorId, documentInvitation.document_id, existingUser.id]
          );

          await TransactionManager.execute(trx,
            'UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [documentInvitation.document_id]
          );
        }

        await TransactionManager.execute(trx,
          `UPDATE document_invitations
           SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
           WHERE id = ?`,
          ['accepted', existingUser.id, documentInvitation.id]
        );
      }
    });

    if (invitation) {
      try {
        const documentsAffected = await addMemberToOrganizationDocuments(db, invitation.organization_id, existingUser.id);
        logger.debug('Added member to organizational documents via registration with invitation', {
          organizationId: invitation.organization_id,
          userId: existingUser.id,
          documentsAffected
        });
      } catch (syncErr) {
        logger.error('Error adding member to documents during registration with invitation', {
          error: syncErr.message,
          organizationId: invitation.organization_id,
          userId: existingUser.id
        });
      }
      const responseCache = req.app.locals.responseCache;
      if (responseCache) await responseCache.del(`orgs:user:${existingUser.id}`);
    }

    const token = generateToken({
      id: existingUser.id,
      name: existingUser.name,
      email
    });

    safeAuthAttempt(email, true, ip, userAgent);
    safeRecordAuthEvent('invitation_accepted', true, { userId: existingUser.id });

    return {
      statusCode: 200,
      body: {
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email
        },
        token,
        message: 'Invitation accepted successfully',
        organizationId: invitation ? invitation.organization_id : undefined,
        documentId: documentInvitation ? documentInvitation.document_id : undefined,
        invitationAccepted: true
      }
    };
  } catch (invitationErr) {
    logger.error('Error accepting invitation for existing user', {
      error: invitationErr.message,
      stack: invitationErr.stack,
      userId: existingUser.id,
      invitationId: invitation ? invitation.id : documentInvitation ? documentInvitation.id : null
    });
    throw ApiError.database(
      'Failed to process invitation. Please try logging in and accepting the invitation from your account.',
      { originalError: invitationErr.message },
      'INVITATION_PROCESSING_FAILED'
    );
  }
}

async function registerNewUserWithInvitation({
  db,
  userId,
  name,
  email,
  passwordHash,
  invitation,
  organizationId,
  documentInvitation,
  documentId,
  sendWelcomeEmail
}) {
  const userInsert = buildUserInsertWithLegalConsent({
    userId,
    name,
    email,
    passwordHash,
    role: 'user',
  });
  if (invitation && organizationId) {
    try {
      await TransactionManager.executeInTransaction(db, async (trx) => {
        await TransactionManager.execute(trx, userInsert.sql, userInsert.params);

        const existingMember = await TransactionManager.query(trx,
          'SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?',
          [organizationId, userId]
        );

        if (!existingMember) {
          const memberId = uuidv4();
          try {
            await TransactionManager.execute(trx,
              `INSERT INTO organization_members (id, organization_id, user_id, status, joined_at)
               VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`,
              [memberId, organizationId, userId]
            );
          } catch (memberErr) {
            if (memberErr.message && memberErr.message.includes('UNIQUE constraint')) {
              logger.info('User already added as member (race condition)', {
                organizationId,
                userId
              });
            } else {
              throw memberErr;
            }
          }
        } else {
          logger.info('User already a member during registration, skipping duplicate membership', {
            organizationId,
            userId,
            invitationId: invitation.id
          });
        }

        if (invitation.invitation_type === 'representative') {
          const repCheckRow = await TransactionManager.query(trx,
            'SELECT 1 FROM organization_representatives WHERE organization_id = ? AND user_id = ? AND status = ?',
            [organizationId, userId, 'active']
          );

          if (!repCheckRow) {
            const repTableId = uuidv4();
            try {
              await TransactionManager.execute(trx, `INSERT INTO organization_representatives (
                id, organization_id, user_id, status, added_at
              ) VALUES (?, ?, ?, 'active', CURRENT_TIMESTAMP)`, [repTableId, organizationId, userId]);

              logger.info('User added as representative during registration', { organizationId, userId });
            } catch (repErr) {
              if (repErr.message && repErr.message.includes('UNIQUE constraint')) {
                logger.info('User already added as representative (race condition)', {
                  organizationId,
                  userId
                });
              } else {
                throw repErr;
              }
            }
          }
        }

        await TransactionManager.execute(trx,
          `UPDATE organization_invitations
           SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
           WHERE id = ?`,
          ['accepted', userId, invitation.id]
        );
      });

      try {
        const documentsAffected = await addMemberToOrganizationDocuments(db, organizationId, userId);
        logger.debug('Added member to organizational documents via registration', {
          organizationId,
          userId,
          documentsAffected
        });
      } catch (syncErr) {
        logger.error('Error adding member to documents during registration', {
          error: syncErr.message,
          organizationId,
          userId
        });
      }

      try {
        const orgNameRow = await TransactionManager.query(db,
          'SELECT name, branding_color, branding_logo_url, branding_title FROM organizations WHERE id = ?',
          [organizationId]
        );
        if (orgNameRow) {
          sendWelcomeEmail(email, name, orgNameRow.name, {
            organizationId,
            org: {
              name: orgNameRow.name,
              brandingColor: orgNameRow.branding_color,
              brandingLogoUrl: orgNameRow.branding_logo_url,
              brandingTitle: orgNameRow.branding_title,
            },
          }).catch((err) => {
            logger.warn('Failed to send welcome email', { error: err.message });
          });
        }
      } catch (orgNameErr) {
        logger.warn('Failed to fetch organization name for welcome email', { error: orgNameErr.message });
      }
    } catch (invitationErr) {
      logger.error('Error processing invitation during registration', {
        error: invitationErr.message,
        stack: invitationErr.stack,
        invitationId: invitation ? invitation.id : null,
        organizationId,
        userId
      });
      throw ApiError.database(
        'Failed to process invitation. Registration could not be completed.',
        { originalError: invitationErr.message },
        'INVITATION_PROCESSING_FAILED'
      );
    }

    return { organizationId, documentId: null };
  }

  if (documentInvitation && documentId) {
    try {
      await TransactionManager.executeInTransaction(db, async (trx) => {
        await TransactionManager.execute(trx, userInsert.sql, userInsert.params);

        const existingCollaborator = await TransactionManager.query(trx,
          'SELECT id FROM document_collaborators WHERE document_id = ? AND user_id = ?',
          [documentId, userId]
        );

        const document = await TransactionManager.query(trx,
          'SELECT owner_id FROM documents WHERE id = ?',
          [documentId]
        );

        if (document && document.owner_id === userId) {
          await TransactionManager.execute(trx,
            `UPDATE document_invitations
             SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
             WHERE id = ?`,
            ['accepted', userId, documentInvitation.id]
          );
        } else if (!existingCollaborator) {
          const collaboratorId = uuidv4();
          await TransactionManager.execute(trx,
            'INSERT INTO document_collaborators (id, document_id, user_id) VALUES (?, ?, ?)',
            [collaboratorId, documentId, userId]
          );

          await TransactionManager.execute(trx,
            'UPDATE documents SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
            [documentId]
          );
        }

        await TransactionManager.execute(trx,
          `UPDATE document_invitations
           SET status = ?, accepted_at = CURRENT_TIMESTAMP, accepted_by_user_id = ?
           WHERE id = ?`,
          ['accepted', userId, documentInvitation.id]
        );
      });
    } catch (invitationErr) {
      logger.error('Error processing document invitation during registration', {
        error: invitationErr.message,
        stack: invitationErr.stack,
        invitationId: documentInvitation ? documentInvitation.id : null,
        documentId,
        userId
      });
      throw ApiError.database(
        'Failed to process invitation. Registration could not be completed.',
        { originalError: invitationErr.message },
        'INVITATION_PROCESSING_FAILED'
      );
    }

    return { organizationId: null, documentId };
  }

  return { organizationId: null, documentId: null };
}

module.exports = {
  resolveInvitationContext,
  acceptInvitationForExistingUser,
  registerNewUserWithInvitation
};
