/**
 * Remaining i18n strings for 100% governance/proposal UI coverage (en, de Du, es).
 * Merged by merge-governance-dialog-i18n.js
 */

function L(isDe, isEs, en, de, es) {
  return isDe ? de : isEs ? es : en;
}

function governancePatch(locale) {
  const isDe = locale === 'de';
  const isEs = locale === 'es';
  const Lc = (en, de, es) => L(isDe, isEs, en, de, es);

  return {
    failedToRecordVote: Lc('Failed to record vote', 'Stimme konnte nicht erfasst werden', 'No se pudo registrar el voto'),
    ruleMetadata: {
      currentValue: Lc('Current Value', 'Aktueller Wert', 'Valor actual'),
      proposedValue: Lc('Proposed Value', 'Vorgeschlagener Wert', 'Valor propuesto'),
    },
    ruleProposalVoting: {
      approveThisChange: Lc('Approve this change', 'Diese Änderung genehmigen', 'Aprobar este cambio'),
      rejectThisChange: Lc('Reject this change', 'Diese Änderung ablehnen', 'Rechazar este cambio'),
      abstainFromVoting: Lc('Abstain from voting', 'Enthalten', 'Abstenerse de votar'),
      voteRecorded: Lc('Vote Recorded', 'Stimme erfasst', 'Voto registrado'),
      title: Lc('Vote on Rule Change', 'Über Regeländerung abstimmen', 'Votar cambio de regla'),
      subtitle: Lc('{{name}} governance proposal', 'Governance-Vorschlag von {{name}}', 'Propuesta de gobernanza de {{name}}'),
      proposedBy: Lc('Proposed by {{name}} on {{date}}', 'Vorgeschlagen von {{name}} am {{date}}', 'Propuesto por {{name}} el {{date}}'),
      ruleBeingChanged: Lc('Rule Being Changed', 'Geänderte Regel', 'Regla que se modifica'),
      ruleLabel: Lc('Rule:', 'Regel:', 'Regla:'),
      proposedValueLabel: Lc('Proposed Value:', 'Vorgeschlagener Wert:', 'Valor propuesto:'),
      votingDeadline: Lc('Voting deadline: {{date}}', 'Abstimmungsfrist: {{date}}', 'Plazo de votación: {{date}}'),
      castYourVote: Lc('Cast Your Vote', 'Stimme abgeben', 'Emitir tu voto'),
      alreadyVoted: Lc('You have already voted on this proposal', 'Du hast bereits über diesen Vorschlag abgestimmt', 'Ya votaste esta propuesta'),
      voteDetermines: Lc('Your vote will determine if this rule change is approved', 'Deine Stimme entscheidet, ob diese Regeländerung angenommen wird', 'Tu voto determinará si se aprueba este cambio de regla'),
      selectOption: Lc('Select your preferred option:', 'Wähle deine bevorzugte Option:', 'Selecciona tu opción preferida:'),
      yourDecision: Lc('Your decision:', 'Deine Entscheidung:', 'Tu decisión:'),
      recordingVote: Lc('Recording Vote...', 'Stimme wird erfasst…', 'Registrando voto…'),
      submitVote: Lc('Submit Vote', 'Stimme abgeben', 'Enviar voto'),
      currentResults: Lc('Current Results', 'Aktuelle Ergebnisse', 'Resultados actuales'),
      voteCount: Lc('{{count}} votes', '{{count}} Stimmen', '{{count}} votos'),
      totalVotes: Lc('Total votes: {{count}}', 'Stimmen gesamt: {{count}}', 'Votos totales: {{count}}'),
    },
    ruleHistory: {
      title: Lc('Rule Change History', 'Verlauf der Regeländerungen', 'Historial de cambios de reglas'),
      description: Lc('View the history of all governance rule changes for this organization', 'Verlauf aller Governance-Regeländerungen dieser Organisation', 'Historial de todos los cambios de reglas de gobernanza de esta organización'),
      filterPlaceholder: Lc('Filter by rule', 'Nach Regel filtern', 'Filtrar por regla'),
      allRules: Lc('All Rules', 'Alle Regeln', 'Todas las reglas'),
      empty: Lc('No rule changes have been made yet. Rule changes will appear here once proposals are approved.', 'Es wurden noch keine Regeländerungen vorgenommen. Änderungen erscheinen hier, sobald Vorschläge angenommen wurden.', 'Aún no hay cambios de reglas. Aparecerán aquí cuando se aprueben propuestas.'),
      previousValue: Lc('Previous Value:', 'Vorheriger Wert:', 'Valor anterior:'),
      newValue: Lc('New Value:', 'Neuer Wert:', 'Nuevo valor:'),
      changedBy: Lc('Changed by {{name}}', 'Geändert von {{name}}', 'Cambiado por {{name}}'),
      viaProposal: Lc('(via proposal)', '(über Vorschlag)', '(mediante propuesta)'),
      pagination: Lc('Showing {{from}} to {{to}} of {{total}} entries', 'Zeige {{from}} bis {{to}} von {{total}} Einträgen', 'Mostrando {{from}} a {{to}} de {{total}} entradas'),
    },
    rulesPanel: {
      allCategories: Lc('All Categories', 'Alle Kategorien', 'Todas las categorías'),
      tabOverview: Lc('Overview', 'Übersicht', 'Resumen'),
      tabAllRules: Lc('All Rules', 'Alle Regeln', 'Todas las reglas'),
      tabProposals: Lc('Proposals', 'Vorschläge', 'Propuestas'),
      overviewAlert: Lc('Click on any rule to propose a change or vote on active proposals. Changes require member approval to take effect.', 'Klicke auf eine Regel, um eine Änderung vorzuschlagen oder über aktive Vorschläge abzustimmen. Änderungen erfordern die Zustimmung der Mitglieder.', 'Haz clic en cualquier regla para proponer un cambio o votar propuestas activas. Los cambios requieren la aprobación de los miembros.'),
      rulesNeedingAttention: Lc('Rules Needing Attention', 'Regeln mit Handlungsbedarf', 'Reglas que requieren atención'),
      activeAndPendingCount: Lc('{{active}} active and {{pending}} pending proposals', '{{active}} aktive und {{pending}} ausstehende Vorschläge', '{{active}} propuestas activas y {{pending}} pendientes'),
      pendingApproval: Lc('Pending Approval', 'Genehmigung ausstehend', 'Aprobación pendiente'),
      proposedBy: Lc('Proposed by {{name}}', 'Vorgeschlagen von {{name}}', 'Propuesto por {{name}}'),
      starting: Lc('Starting...', 'Wird gestartet…', 'Iniciando…'),
      startVoting: Lc('Start Voting', 'Abstimmung starten', 'Iniciar votación'),
      decline: Lc('Decline', 'Ablehnen', 'Rechazar'),
      importantRules: Lc('Important Rules', 'Wichtige Regeln', 'Reglas importantes'),
      importantRulesDesc: Lc('Critical and frequently-used governance settings', 'Kritische und häufig genutzte Governance-Einstellungen', 'Configuraciones de gobernanza críticas y de uso frecuente'),
      noRulesMatch: Lc('No rules match your search criteria. Try adjusting your filters.', 'Keine Regeln entsprechen deinen Suchkriterien. Passe die Filter an.', 'Ninguna regla coincide con tu búsqueda. Prueba a ajustar los filtros.'),
      noRulesFound: Lc('No governance rules found.', 'Keine Governance-Regeln gefunden.', 'No se encontraron reglas de gobernanza.'),
      activeProposals: Lc('Active Proposals ({{count}})', 'Aktive Vorschläge ({{count}})', 'Propuestas activas ({{count}})'),
      activeProposalsDesc: Lc('Rule changes currently being voted on by members', 'Regeländerungen, über die Mitglieder gerade abstimmen', 'Cambios de reglas en votación por los miembros'),
      votingEnds: Lc('Voting ends {{date}}', 'Abstimmung endet {{date}}', 'La votación termina {{date}}'),
      pendingProposals: Lc('Pending Proposals ({{count}})', 'Ausstehende Vorschläge ({{count}})', 'Propuestas pendientes ({{count}})'),
      pendingProposalsDescRep: Lc('Rule change proposals awaiting your approval to start voting', 'Regeländerungsvorschläge, die auf deine Freigabe zur Abstimmung warten', 'Propuestas de cambio de reglas que esperan tu aprobación para iniciar la votación'),
      pendingProposalsDescMember: Lc('Rule change proposals awaiting representative approval', 'Regeländerungsvorschläge, die auf die Freigabe durch Vertreter warten', 'Propuestas de cambio de reglas en espera de aprobación del representante'),
      myProposals: Lc('My Proposals ({{count}})', 'Meine Vorschläge ({{count}})', 'Mis propuestas ({{count}})'),
      myProposalsDesc: Lc('Proposals you have created', 'Vorschläge, die du erstellt hast', 'Propuestas que has creado'),
      awaitingApproval: Lc('Awaiting representative approval to start voting', 'Wartet auf Vertreterfreigabe zum Start der Abstimmung', 'Esperando aprobación del representante para iniciar la votación'),
      withdrawing: Lc('Withdrawing...', 'Wird zurückgezogen…', 'Retirando…'),
      withdraw: Lc('Withdraw', 'Zurückziehen', 'Retirar'),
      viewVote: Lc('View/Vote', 'Ansehen/Abstimmen', 'Ver/Votar'),
      emptyProposals: Lc('No proposals found. Create a proposal by clicking on a rule in the "All Rules" tab.', 'Keine Vorschläge gefunden. Erstelle einen Vorschlag, indem du in der Registerkarte „Alle Regeln“ auf eine Regel klickst.', 'No se encontraron propuestas. Crea una haciendo clic en una regla en la pestaña «Todas las reglas».'),
      rulesNotConfigured: Lc('Governance rules have not been configured for this organization yet.', 'Für diese Organisation wurden noch keine Governance-Regeln konfiguriert.', 'Aún no se han configurado reglas de gobernanza para esta organización.'),
      statusPermissionsTitle: Lc('Your Status & Permissions', 'Dein Status & Berechtigungen', 'Tu estado y permisos'),
      representative: Lc('Representative', 'Vertreter', 'Representante'),
      activeMember: Lc('Active Member', 'Aktives Mitglied', 'Miembro activo'),
      limitedAccess: Lc('Limited Access', 'Eingeschränkter Zugriff', 'Acceso limitado'),
      canProposeRules: Lc('Can propose rule changes', 'Kann Regeländerungen vorschlagen', 'Puede proponer cambios de reglas'),
      canManageProposals: Lc('Can manage rule proposals', 'Kann Regelvorschläge verwalten', 'Puede gestionar propuestas de reglas'),
      needActiveMember: Lc('You need to be an active member to propose rules.', 'Du musst aktives Mitglied sein, um Regeln vorzuschlagen.', 'Debes ser miembro activo para proponer reglas.'),
      onlyRepresentatives: Lc('Only representatives can propose rules in this organization.', 'In dieser Organisation können nur Vertreter Regeln vorschlagen.', 'Solo los representantes pueden proponer reglas en esta organización.'),
      critical: Lc('Critical', 'Kritisch', 'Crítico'),
      currentValue: Lc('Current: {{value}}', 'Aktuell: {{value}}', 'Actual: {{value}}'),
      voteNow: Lc('Vote Now', 'Jetzt abstimmen', 'Votar ahora'),
      propose: Lc('Propose', 'Vorschlagen', 'Proponer'),
      categories: {
        Elections: Lc('Elections', 'Wahlen', 'Elecciones'),
        Voting: Lc('Voting', 'Abstimmung', 'Votación'),
        Permissions: Lc('Permissions', 'Berechtigungen', 'Permisos'),
        Security: Lc('Security', 'Sicherheit', 'Seguridad'),
        Safeguards: Lc('Safeguards', 'Schutzmaßnahmen', 'Salvaguardas'),
      },
      categoryDescriptions: {
        Elections: Lc('Configure how representatives are elected and serve', 'Lege fest, wie Vertreter gewählt werden und wie lange sie dienen', 'Configura cómo se eligen los representantes y cuánto tiempo sirven'),
        Voting: Lc('Default settings for all organization votes and decisions', 'Standardeinstellungen für alle Abstimmungen und Entscheidungen', 'Configuración predeterminada para todas las votaciones y decisiones'),
        Permissions: Lc('What actions representatives can perform', 'Welche Aktionen Vertreter ausführen dürfen', 'Qué acciones pueden realizar los representantes'),
        Security: Lc('Security and compliance settings', 'Sicherheits- und Compliance-Einstellungen', 'Configuración de seguridad y cumplimiento'),
        Safeguards: Lc('Organization-configurable floors for quorum, approval, and voting duration', 'Organisationsweit konfigurierbare Mindestwerte für Quorum, Annahme und Abstimmungsdauer', 'Límites configurables de quórum, aprobación y duración de votación'),
      },
    },
    proposalDetailsDialog: {
      types: {
        rule: Lc('Rule Proposal', 'Regelvorschlag', 'Propuesta de regla'),
        structure: Lc('Structure Proposal', 'Strukturvorschlag', 'Propuesta de estructura'),
        tree: Lc('Tree Proposal', 'Baumvorschlag', 'Propuesta de árbol'),
        deletion: Lc('Deletion Proposal', 'Löschvorschlag', 'Propuesta de eliminación'),
      },
      fallbackTitle: Lc('Proposal #{{id}}', 'Vorschlag #{{id}}', 'Propuesta #{{id}}'),
      tabOverview: Lc('Overview', 'Übersicht', 'Resumen'),
      tabVotes: Lc('Votes ({{count}})', 'Stimmen ({{count}})', 'Votos ({{count}})'),
      tabDetails: Lc('Details', 'Details', 'Detalles'),
      statusProgress: Lc('Status & Progress', 'Status & Fortschritt', 'Estado y progreso'),
      approvalRate: Lc('Approval Rate', 'Annahmequote', 'Tasa de aprobación'),
      quorum: Lc('Quorum', 'Quorum', 'Quórum'),
      quorumMet: Lc('Met', 'Erreicht', 'Alcanzado'),
      quorumPending: Lc('Pending', 'Ausstehend', 'Pendiente'),
      timeline: Lc('Timeline', 'Zeitverlauf', 'Cronología'),
      created: Lc('Created:', 'Erstellt:', 'Creado:'),
      deadline: Lc('Deadline:', 'Frist:', 'Plazo:'),
      createdBy: Lc('Created by:', 'Erstellt von:', 'Creado por:'),
      expired: Lc('Expired', 'Abgelaufen', 'Caducado'),
      ruleChange: Lc('Rule Change', 'Regeländerung', 'Cambio de regla'),
      field: Lc('Field:', 'Feld:', 'Campo:'),
      current: Lc('Current:', 'Aktuell:', 'Actual:'),
      proposed: Lc('Proposed:', 'Vorgeschlagen:', 'Propuesto:'),
      options: Lc('Options:', 'Optionen:', 'Opciones:'),
      votesCount: Lc('({{count}} votes)', '({{count}} Stimmen)', '({{count}} votos)'),
      structureOperations: Lc('Structure Operations', 'Strukturoperationen', 'Operaciones de estructura'),
      target: Lc('Target: {{id}}', 'Ziel: {{id}}', 'Objetivo: {{id}}'),
      treeOperation: Lc('Tree Operation', 'Baumoperation', 'Operación de árbol'),
      operation: Lc('Operation:', 'Operation:', 'Operación:'),
      reason: Lc('Reason:', 'Grund:', 'Motivo:'),
      documentInfo: Lc('Document Information', 'Dokumentinformationen', 'Información del documento'),
      document: Lc('Document:', 'Dokument:', 'Documento:'),
      description: Lc('Description:', 'Beschreibung:', 'Descripción:'),
      allVotes: Lc('All Votes', 'Alle Stimmen', 'Todos los votos'),
      anonymous: Lc('Anonymous', 'Anonym', 'Anónimo'),
      noVotesYet: Lc('No votes yet', 'Noch keine Stimmen', 'Aún no hay votos'),
      additionalDetails: Lc('Additional Details', 'Weitere Details', 'Detalles adicionales'),
      proposalId: Lc('Proposal ID:', 'Vorschlags-ID:', 'ID de propuesta:'),
      documentId: Lc('Document ID:', 'Dokument-ID:', 'ID de documento:'),
      organizationId: Lc('Organization ID:', 'Organisations-ID:', 'ID de organización:'),
      status: Lc('Status:', 'Status:', 'Estado:'),
    },
  };
}

function documentsPatch(locale) {
  const isDe = locale === 'de';
  const isEs = locale === 'es';
  const Lc = (en, de, es) => L(isDe, isEs, en, de, es);

  return {
    diffView: {
      reviewSuggestion: Lc('Review Suggestion', 'Vorschlag prüfen', 'Revisar sugerencia'),
      userProposal: Lc("{{name}}'s proposal", 'Vorschlag von {{name}}', 'Propuesta de {{name}}'),
      showFocused: Lc('Show Focused', 'Fokus anzeigen', 'Mostrar enfoque'),
      showFullContext: Lc('Show Full Context', 'Vollständigen Kontext anzeigen', 'Mostrar contexto completo'),
      currentSuggestionBadge: Lc('Current Suggestion Under Review', 'Aktueller Vorschlag in Prüfung', 'Sugerencia actual en revisión'),
      acceptedContent: Lc('Accepted Content', 'Angenommener Inhalt', 'Contenido aceptado'),
      originalContent: Lc('Original Content', 'Originalinhalt', 'Contenido original'),
      documentContext: Lc('Document Context', 'Dokumentkontext', 'Contexto del documento'),
      fullView: Lc('Full View', 'Vollansicht', 'Vista completa'),
      loading: Lc('Loading...', 'Wird geladen…', 'Cargando…'),
      loadMoreAbove: Lc('Load More Above', 'Mehr darüber laden', 'Cargar más arriba'),
      loadMoreBelow: Lc('Load More Below', 'Mehr darunter laden', 'Cargar más abajo'),
      discussionVoting: Lc('Discussion & Voting', 'Diskussion & Abstimmung', 'Discusión y votación'),
    },
  };
}

module.exports = {
  governance: {
    en: governancePatch('en'),
    de: governancePatch('de'),
    es: governancePatch('es'),
  },
  documents: {
    en: documentsPatch('en'),
    de: documentsPatch('de'),
    es: documentsPatch('es'),
  },
};
