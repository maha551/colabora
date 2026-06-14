import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
import { Icon } from './ui/Icon';
import { toast } from 'sonner';

import { Document, User } from '../types';
import { documentsApi } from '../lib/api';
import { logger } from '../lib/logger';
import { useTimezone } from '../hooks/useTimezone';
import { COLORS, RADIUS } from '../lib/designSystem';
import { cn } from './ui/utils';

interface DocumentInviteSystemProps {
  document: Document;
  currentUser: User;
  onUpdate: () => void;
}

export function DocumentInviteSystem({ document, currentUser, onUpdate }: DocumentInviteSystemProps) {
  const { formatDate } = useTimezone();
  const [emails, setEmails] = useState('');
  const [inviting, setInviting] = useState(false);
  const [invitations, setInvitations] = useState<Array<{
    id: string;
    email: string;
    status: 'pending' | 'accepted' | 'expired' | 'cancelled';
    expiresAt: string;
    acceptedAt: string | null;
    createdAt: string;
    inviterName: string | null;
    acceptedByName: string | null;
    isExpired: boolean;
  }>>([]);
  const [loadingInvitations, setLoadingInvitations] = useState(false);
  const [failedInvitationLinks, setFailedInvitationLinks] = useState<Array<{ email: string; link: string }>>([]);

  const isOwner = document.ownershipType !== 'organizational' && currentUser?.id === document.owner.id;

  const loadInvitations = async () => {
    setLoadingInvitations(true);
    try {
      const response = await documentsApi.getInvitations(document.id);
      setInvitations(response.invitations || []);
    } catch (error) {
      logger.error('Failed to load invitations:', error);
    } finally {
      setLoadingInvitations(false);
    }
  };

  // Load invitation history
  useEffect(() => {
    if (currentUser && isOwner) {
      loadInvitations();
    }
  }, [document.id, isOwner, currentUser]);

  // Add null check for currentUser
  if (!currentUser) {
    return (
      <Alert>
        <Icon name="AlertTriangle" className="h-4 w-4" />
        <AlertDescription>
          User information is not available. Please refresh the page.
        </AlertDescription>
      </Alert>
    );
  }

  const handleSendInvites = async () => {
    if (!emails.trim()) {
      toast.error('Please enter email addresses');
      return;
    }

    // Parse and validate emails
    const emailList = emails
      .split(/[\n,;]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    if (emailList.length === 0) {
      toast.error('Please enter valid email addresses');
      return;
    }

    // Basic email validation
    const invalidEmails = emailList.filter(email => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
    if (invalidEmails.length > 0) {
      toast.error(`Invalid email addresses: ${invalidEmails.join(', ')}`);
      return;
    }

    try {
      setInviting(true);
      const response = await documentsApi.inviteCollaborators(document.id, emailList);

      // Check if there were any failures
      if (response.failed && response.failed > 0) {
        const failedDetails = response.failedEmails?.map(f => `${f.email}: ${f.error}`).join('\n') || '';
        const errorMessage = response.failedEmails?.[0]?.error || 'Unknown error';
        
        // Store invitation links for manual sharing
        const links: Array<{ email: string; link: string }> = [];
        response.failedEmails?.forEach(f => {
          if (f.invitationLink) {
            links.push({ email: f.email, link: f.invitationLink });
          }
        });
        // Also check invitationLinks array
        if (response.invitationLinks) {
          response.invitationLinks.forEach(link => {
            if (!links.find(l => l.email === link.email)) {
              links.push(link);
            }
          });
        }
        setFailedInvitationLinks(links);
        
        // Check if it's a Resend configuration issue
        if (errorMessage.includes('RESEND_API_KEY') || errorMessage.includes('Resend is not configured')) {
          toast.error('Email service not configured. Invitation links are available below for manual sharing.', {
            duration: 15000,
          });
        } else if (errorMessage.includes('Testing Mode') || errorMessage.includes('verify a domain')) {
          toast.error('Resend Testing Mode: You can only send to your own email. Verify a domain to send to others.', {
            duration: 15000,
          });
        } else {
          toast.error(
            `Only ${response.invitations - response.failed} of ${emailList.length} emails sent. ${response.failed} failed. Invitation links available below.`,
            {
              description: failedDetails || errorMessage,
              duration: 15000,
            }
          );
        }
      } else {
        toast.success(`Invitations sent to ${response.invitations} email address${response.invitations !== 1 ? 'es' : ''}`);
        setFailedInvitationLinks([]); // Clear any previous failed links
      }
      
      setEmails('');
      // Reload invitation history
      await loadInvitations();
      onUpdate();
    } catch (error) {
      logger.error('Failed to send invitations:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to send invitations';
      toast.error(errorMessage, {
        duration: 10000,
      });
    } finally {
      setInviting(false);
    }
  };

  const emailPreview = emails
    .split(/[\n,;]/)
    .map(email => email.trim())
    .filter(email => email.length > 0);

  if (!isOwner) {
    return (
      <Alert>
        <Icon name="AlertTriangle" className="h-4 w-4" />
        <AlertDescription>
          Only the document owner can send invitations.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Mail" className="h-5 w-5" />
            Invite Collaborators
          </CardTitle>
          <CardDescription>
            Invite new collaborators to this document via email
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="emails">Email Addresses</Label>
            <Textarea
              id="emails"
              placeholder={`Enter email addresses, one per line or separated by commas:

john@example.com
jane@example.com, bob@example.com`}
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              rows={6}
              className="mt-1"
            />
            <p className="text-sm text-muted-foreground mt-1">
              Enter multiple emails separated by new lines, commas, or semicolons
            </p>
          </div>

          {emailPreview.length > 0 && (
            <div>
              <Label>Preview ({emailPreview.length} emails)</Label>
              <div className="mt-2 p-3 bg-muted rounded border max-h-32 overflow-y-auto">
                <div className="flex flex-wrap gap-1">
                  {emailPreview.map((email, index) => (
                    <Badge key={index} variant="secondary" className="text-xs">
                      {email}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSendInvites}
              disabled={!emails.trim() || inviting}
              className="flex-1 gap-2"
            >
              {inviting ? (
                <>
                  <div className={cn("animate-spin h-4 w-4 border-b-2 border-white", RADIUS.pill)}></div>
                  Sending Invitations...
                </>
              ) : (
                <>
                  <Icon name="Send" className="h-4 w-4" />
                  Send Invitations ({emailPreview.length})
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Failed Invitation Links - Show when email fails */}
      {failedInvitationLinks.length > 0 && (
        <Card className={`border-[var(--status-proposed-border)] ${COLORS.statusBg.active}`}>
          <CardHeader>
            <CardTitle className={`flex items-center gap-2 ${COLORS.status.active}`}>
              <Icon name="AlertTriangle" className="h-5 w-5" />
              Invitation Links (Email Failed - Share Manually)
            </CardTitle>
            <CardDescription className={COLORS.status.active}>
              Email service is not configured. Use these links to manually invite collaborators:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {failedInvitationLinks.map((item, index) => (
              <div key={index} className="flex items-center gap-2 p-3 bg-card rounded border border-orange-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{item.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="text"
                      readOnly
                      value={item.link}
                      className="flex-1 text-xs p-2 bg-muted border rounded font-mono text-foreground"
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        navigator.clipboard.writeText(item.link);
                        toast.success('Invitation link copied to clipboard');
                      }}
                      className="shrink-0"
                    >
                      <Icon name="Copy" className="h-4 w-4 mr-1" />
                      Copy
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => window.open(item.link, '_blank')}
                      className="shrink-0"
                    >
                      <Icon name="ExternalLink" className="h-4 w-4 mr-1" />
                      Open
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            <Alert className="mt-4">
              <Icon name="AlertTriangle" className="h-4 w-4" />
              <AlertDescription>
                <strong>To fix email sending:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1 text-sm">
                  <li>If you see "Testing Mode" error: Verify a domain at <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer" className={`${COLORS.status.info} underline`}>resend.com/domains</a></li>
                  <li>Set <code className="bg-muted px-1 rounded">RESEND_FROM_EMAIL=noreply@yourdomain.com</code> (using your verified domain)</li>
                  <li>If <code className="bg-muted px-1 rounded">RESEND_API_KEY</code> is missing, set it in Fly.io secrets</li>
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">See <code className="bg-muted px-1 rounded">SET_SECRETS_GUIDE.md</code> for detailed instructions.</p>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Invitation History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Icon name="Mail" className="h-5 w-5" />
            Invitation History
          </CardTitle>
          <CardDescription>
            View all invitations sent for this document
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingInvitations ? (
            <div className="text-center py-4">
              <div className={cn("animate-spin h-6 w-6 border-b-2 border-[var(--status-active-solid)] mx-auto", RADIUS.pill)}></div>
              <p className="text-sm text-muted-foreground mt-2">Loading invitations...</p>
            </div>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No invitations sent yet</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead>Accepted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invitations.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {inv.status === 'pending' && (
                            <>
                              <Icon name="Clock" className={cn('h-4 w-4', COLORS.status.warning)} />
                              <span className={COLORS.status.warning}>Pending</span>
                            </>
                          )}
                          {inv.status === 'accepted' && (
                            <>
                              <Icon name="CheckCircle" className={cn('h-4 w-4', COLORS.status.success)} />
                              <span className={COLORS.status.success}>Accepted</span>
                            </>
                          )}
                          {(inv.status === 'expired' || inv.isExpired) && (
                            <>
                              <Icon name="XCircle" className={cn('h-4 w-4', COLORS.status.error)} />
                              <span className={COLORS.status.error}>Expired</span>
                            </>
                          )}
                          {inv.status === 'cancelled' && (
                            <>
                              <Icon name="XCircle" className="h-4 w-4 text-muted-foreground" />
                              <span className="text-muted-foreground">Cancelled</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(inv.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(inv.expiresAt)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {inv.acceptedAt ? (
                          <div>
                            <div>{formatDate(inv.acceptedAt)}</div>
                            {inv.acceptedByName && (
                              <div className="text-xs text-muted-foreground">by {inv.acceptedByName}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
