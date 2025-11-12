import { useState, useEffect, useMemo } from "react";
import { Document, User } from "../types";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import {
  Plus,
  Search,
  FileText,
  Users,
  Calendar,
  MoreHorizontal,
  Trash2,
  Share,
  Edit3,
  Clock,
  Filter,
  ArrowUpDown,
  LogOut,
  UserCircle,
  Activity
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Welcome } from "./Welcome";
import { toast } from "sonner";

// Demo users for contributor selection
const demoUsers = [
  { id: 'cmgxlfj9z0000orjgnfy3revt', name: 'Alice Johnson', email: 'alice@example.com' },
  { id: 'cmgxlfj9z0000orjgnfy3revu', name: 'Bob Smith', email: 'bob@example.com' },
  { id: 'cmgxlfj9z0000orjgnfy3revv', name: 'Charlie Brown', email: 'charlie@example.com' },
  { id: 'cmgxlfj9z0000orjgnfy3revw', name: 'Diana Prince', email: 'diana@example.com' },
];

interface DocumentDashboardProps {
  documents: Document[];
  currentUser: User;
  onSelectDocument: (document: Document) => void;
  onCreateDocument: (
    title: string,
    description?: string,
    contributors?: string[],
    options?: {
      acceptanceThreshold?: number;
      votingAnonymous?: boolean;
      votingAnonymityLocked?: boolean;
      voteChangeAllowed?: boolean;
      structureProposalsEnabled?: boolean;
    },
    ownershipType?: 'personal' | 'shared' | 'organizational',
    organizationId?: string
  ) => void;
  onDeleteDocument: (documentId: string) => void;
  loading?: boolean;
  isCreateDialogOpen?: boolean;
  onSetCreateDialogOpen?: (open: boolean) => void;
  // New props for organizational context
  organizations?: any[];
  currentOrganizationId?: string;
}

export function DocumentDashboard({
  documents,
  currentUser,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
  loading = false,
  isCreateDialogOpen: externalIsCreateDialogOpen,
  onSetCreateDialogOpen: externalSetCreateDialogOpen,
  organizations = [],
  currentOrganizationId,
}: DocumentDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [internalIsCreateDialogOpen, setInternalIsCreateDialogOpen] = useState(false);
  
  // Use external state if provided, otherwise use internal state
  const isCreateDialogOpen = externalIsCreateDialogOpen !== undefined ? externalIsCreateDialogOpen : internalIsCreateDialogOpen;
  const setIsCreateDialogOpen = externalSetCreateDialogOpen || setInternalIsCreateDialogOpen;
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [newDocumentDescription, setNewDocumentDescription] = useState("");
  const [selectedContributors, setSelectedContributors] = useState<string[]>([]);

  // New state for ownership type
  const [ownershipType, setOwnershipType] = useState<'personal' | 'shared' | 'organizational'>('personal');
  const [selectedOrganizationId, setSelectedOrganizationId] = useState<string>(currentOrganizationId || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("modified");
  
  // Document options state
  const [acceptanceThreshold, setAcceptanceThreshold] = useState(75);
  const [votingAnonymous, setVotingAnonymous] = useState(false);
  const [votingAnonymityLocked, setVotingAnonymityLocked] = useState(false);
  const [voteChangeAllowed, setVoteChangeAllowed] = useState(true);
  const [structureProposalsEnabled, setStructureProposalsEnabled] = useState(false);

  // Get available contributors (all demo users except current user)
  const availableContributors = demoUsers.filter(user => user.id !== currentUser.id);

  // Check if all contributors are selected
  const allSelected = availableContributors.length > 0 && selectedContributors.length === availableContributors.length;
  const someSelected = selectedContributors.length > 0 && selectedContributors.length < availableContributors.length;

  const [showWelcome, setShowWelcome] = useState(() => {
    // Show welcome for first-time users (no documents)
    return documents.length === 0 && !localStorage.getItem('welcomeDismissed');
  });

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let filtered = documents.filter(doc =>
      doc.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Apply role filter
    if (roleFilter !== "all") {
      filtered = filtered.filter(doc => {
        const isFacilitator = doc.ownerId === currentUser.id;
        const isCollaborator = doc.collaborators.some(collab => collab.userId === currentUser.id);

        if (roleFilter === "facilitator") return isFacilitator;
        if (roleFilter === "collaborator") return isCollaborator && !isFacilitator; // Exclude facilitator-owned docs from collaborator filter
        return true;
      });
    }

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "modified":
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        case "created":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "title":
          return a.title.localeCompare(b.title);
        case "suggestions":
          const aSuggestions = a.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);
          const bSuggestions = b.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);
          return bSuggestions - aSuggestions;
        default:
          return 0;
      }
    });

    return filtered;
  }, [documents, searchQuery, roleFilter, sortBy, currentUser.id]);

  const handleCreateDocument = async () => {
    if (!newDocumentTitle.trim()) {
      toast.error("Please enter a document title");
      return;
    }

    // Validate organizational ownership
    if (ownershipType === 'organizational' && !selectedOrganizationId) {
      toast.error("Please select an organization for organizational documents");
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreateDocument(
        newDocumentTitle.trim(),
        newDocumentDescription.trim() || undefined,
        selectedContributors.length > 0 ? selectedContributors : undefined,
        {
          acceptanceThreshold,
          votingAnonymous,
          votingAnonymityLocked,
          voteChangeAllowed,
          structureProposalsEnabled
        },
        ownershipType,
        ownershipType === 'organizational' ? selectedOrganizationId : undefined
      );
      setNewDocumentTitle("");
      setNewDocumentDescription("");
      setSelectedContributors([]);
      setAcceptanceThreshold(75);
      setVotingAnonymous(false);
      setVotingAnonymityLocked(false);
      setVoteChangeAllowed(true);
      setStructureProposalsEnabled(false);
      setOwnershipType('personal');
      setSelectedOrganizationId('');
      setIsCreateDialogOpen(false);
      toast.success("Document created successfully!");
    } catch (error) {
      toast.error("Failed to create document");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWelcomeCreateDocument = () => {
    setShowWelcome(false);
    setIsCreateDialogOpen(true);
  };

  const handleWelcomeDismiss = () => {
    setShowWelcome(false);
    localStorage.setItem('welcomeDismissed', 'true');
  };

  const handleDeleteDocument = async (documentId: string, documentTitle: string) => {
    if (window.confirm(`Are you sure you want to delete "${documentTitle}"? This action cannot be undone.`)) {
      try {
        await onDeleteDocument(documentId);
        toast.success("Document deleted successfully");
      } catch (error) {
        toast.error("Failed to delete document");
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your documents...</p>
        </div>
      </div>
    );
  }

  // Show welcome tour for new users
  if (showWelcome) {
    return (
      <Welcome
        currentUser={currentUser}
        onCreateDocument={handleWelcomeCreateDocument}
        onDismiss={handleWelcomeDismiss}
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Search and New Document Button */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
              />
            </div>
            <div className="text-sm text-gray-600 whitespace-nowrap">
              {filteredDocuments.length} document{filteredDocuments.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Filters and Sorting */}
          <div className="flex items-center gap-3 mb-4 bg-white rounded-lg px-3 py-2.5 border border-gray-200 shadow-sm">
            <div className="flex items-center gap-3 flex-1">
              <Filter className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Filter by role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Documents</SelectItem>
                  <SelectItem value="facilitator">My Documents</SelectItem>
                  <SelectItem value="collaborator">Collaborating On</SelectItem>
                </SelectContent>
              </Select>

              <ArrowUpDown className="h-4 w-4 text-gray-500 flex-shrink-0" />
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="modified">Recently Modified</SelectItem>
                  <SelectItem value="created">Recently Created</SelectItem>
                  <SelectItem value="title">Title (A-Z)</SelectItem>
                  <SelectItem value="suggestions">Most Suggestions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Create Document Button or Form */}
          {!isCreateDialogOpen ? (
            <div 
              className="w-full h-12 bg-black text-white flex items-center justify-center gap-2 rounded-lg cursor-pointer font-medium hover:bg-gray-900 transition-colors shadow-sm hover:shadow-md"
              onClick={() => setIsCreateDialogOpen(true)}
            >
              <Plus className="h-4 w-4" />
              New Document
            </div>
          ) : (
            <Card className="border-2 border-gray-300 bg-white animate-in slide-in-from-top-2 duration-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-gray-900">Create New Document</CardTitle>
                <CardDescription>Start a new collaborative document</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 max-h-96 overflow-y-auto">
                <div className="space-y-2">
                  <Label htmlFor="title">Document Title *</Label>
                  <Input
                    id="title"
                    placeholder="Enter document title"
                    value={newDocumentTitle}
                    onChange={(e) => setNewDocumentTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description (Optional)</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the document"
                    value={newDocumentDescription}
                    onChange={(e) => setNewDocumentDescription(e.target.value)}
                    rows={3}
                  />
                </div>

                {/* Ownership Type Selection */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span>🏢</span>
                    <span>Ownership Type</span>
                  </div>

                  <div className="space-y-2">
                    <Label>Document Ownership</Label>
                    <RadioGroup value={ownershipType} onValueChange={(value) => setOwnershipType(value as 'personal' | 'shared' | 'organizational')}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="personal" id="personal" />
                        <Label htmlFor="personal" className="font-normal cursor-pointer">
                          Personal - Owned by you individually
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="shared" id="shared" />
                        <Label htmlFor="shared" className="font-normal cursor-pointer">
                          Shared - Owned by multiple creators
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="organizational" id="organizational" />
                        <Label htmlFor="organizational" className="font-normal cursor-pointer">
                          Organizational - Owned by an organization
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Organization Selection (only show for organizational ownership) */}
                  {ownershipType === 'organizational' && (
                    <div className="space-y-2">
                      <Label>Select Organization</Label>
                      <Select value={selectedOrganizationId} onValueChange={setSelectedOrganizationId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose an organization..." />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations
                            .filter(org => org.representatives?.includes(currentUser.id))
                            .map((org) => (
                              <SelectItem key={org.id} value={org.id}>
                                <div className="flex items-center gap-2">
                                  <span>🏢</span>
                                  <span>{org.name}</span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      {organizations.filter(org => org.representatives?.includes(currentUser.id)).length === 0 && (
                        <p className="text-sm text-gray-500">
                          You are not a representative of any organizations. Only representatives can create organizational documents.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Document Options */}
                <div className="space-y-4 border-t pt-4">
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span>⚠️</span>
                    <span>Document Options</span>
                  </div>
                  <p className="text-xs text-gray-600 -mt-2">
                    These settings cannot be changed after document creation
                  </p>

                  {/* Acceptance Threshold */}
                  <div className="space-y-2">
                    <Label>Acceptance Threshold</Label>
                    <RadioGroup 
                      value={acceptanceThreshold.toString()} 
                      onValueChange={(value) => setAcceptanceThreshold(parseInt(value))}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="50" id="threshold-50" />
                        <Label htmlFor="threshold-50" className="font-normal cursor-pointer">
                          50% - Simple majority
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="75" id="threshold-75" />
                        <Label htmlFor="threshold-75" className="font-normal cursor-pointer">
                          75% - Strong consensus (default)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="90" id="threshold-90" />
                        <Label htmlFor="threshold-90" className="font-normal cursor-pointer">
                          90% - Near-unanimous
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="100" id="threshold-100" />
                        <Label htmlFor="threshold-100" className="font-normal cursor-pointer">
                          100% - Unanimous approval required
                        </Label>
                      </div>
                    </RadioGroup>
                    <p className="text-xs text-gray-500">
                      Percentage of collaborators who must vote PRO for automatic acceptance
                    </p>
                  </div>

                  {/* Voting Anonymity */}
                  <div className="space-y-2">
                    <Label>Voting Anonymity</Label>
                    <RadioGroup value={votingAnonymous ? "anonymous" : "public"} onValueChange={(value) => setVotingAnonymous(value === "anonymous")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="public" id="public" />
                        <Label htmlFor="public" className="font-normal cursor-pointer">
                          Public (Open) - Votes are visible
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="anonymous" id="anonymous" />
                        <Label htmlFor="anonymous" className="font-normal cursor-pointer">
                          Anonymous (Closed) - Votes are hidden
                        </Label>
                      </div>
                    </RadioGroup>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="lock-anonymity"
                        checked={votingAnonymityLocked}
                        onCheckedChange={(checked) => setVotingAnonymityLocked(checked === true)}
                      />
                      <Label htmlFor="lock-anonymity" className="text-xs font-normal cursor-pointer">
                        Lock anonymity setting (cannot be changed)
                      </Label>
                    </div>
                  </div>

                  {/* Vote Flexibility */}
                  <div className="space-y-2">
                    <Label>Vote Flexibility</Label>
                    <RadioGroup value={voteChangeAllowed ? "flexible" : "locked"} onValueChange={(value) => setVoteChangeAllowed(value === "flexible")}>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="flexible" id="flexible" />
                        <Label htmlFor="flexible" className="font-normal cursor-pointer">
                          Flexible - Can change vote after casting
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="locked" id="locked" />
                        <Label htmlFor="locked" className="font-normal cursor-pointer">
                          Locked - Vote cannot be changed after first vote
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Structure Proposals */}
                  <div className="space-y-2">
                    <Label>Structure Proposals</Label>
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="structure-proposals"
                        checked={structureProposalsEnabled}
                        onCheckedChange={(checked) => setStructureProposalsEnabled(checked === true)}
                      />
                      <Label htmlFor="structure-proposals" className="font-normal cursor-pointer">
                        Enable structure proposals - Allow collaborators to propose major document reorganizations
                      </Label>
                    </div>
                    <p className="text-xs text-gray-500">
                      When enabled, users can propose moving, merging, deleting, or restructuring document sections.
                      All proposals require voting and approval before being applied.
                    </p>
                  </div>
                </div>

                {/* Contributors Selection */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Add Contributors (Optional)</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (allSelected) {
                          setSelectedContributors([]);
                        } else {
                          setSelectedContributors(availableContributors.map(user => user.id));
                        }
                      }}
                      className="text-xs"
                    >
                      {allSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-32 overflow-y-auto border rounded-md p-3 bg-gray-50">
                    {/* Select All checkbox */}
                    <div className="flex items-center space-x-2 pb-2 border-b">
                      <Checkbox
                        id="select-all-contributors"
                        checked={allSelected}
                        indeterminate={someSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedContributors(availableContributors.map(user => user.id));
                          } else {
                            setSelectedContributors([]);
                          }
                        }}
                      />
                      <Label htmlFor="select-all-contributors" className="text-sm font-medium">
                        Select All Contributors
                      </Label>
                    </div>
                    {availableContributors.map((user) => (
                      <div key={user.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={`contributor-${user.id}`}
                          checked={selectedContributors.includes(user.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedContributors(prev => [...prev, user.id]);
                            } else {
                              setSelectedContributors(prev => prev.filter(id => id !== user.id));
                            }
                          }}
                        />
                        <Label
                          htmlFor={`contributor-${user.id}`}
                          className="text-sm flex items-center gap-2 cursor-pointer"
                        >
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs">
                              {user.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span>{user.name}</span>
                          <span className="text-muted-foreground">({user.email})</span>
                        </Label>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedContributors.length} of {availableContributors.length} contributors selected
                  </p>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateDialogOpen(false);
                      setNewDocumentTitle("");
                      setNewDocumentDescription("");
                      setSelectedContributors([]);
                      setAcceptanceThreshold(75);
                      setVotingAnonymous(false);
                      setVotingAnonymityLocked(false);
                      setVoteChangeAllowed(true);
                    }}
                    disabled={isSubmitting}
                    style={{ flex: 1, height: '40px', backgroundColor: '#fff', color: '#000', border: '1px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateDocument}
                    disabled={isSubmitting || !newDocumentTitle.trim()}
                    style={{ flex: 1, height: '40px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', cursor: isSubmitting || !newDocumentTitle.trim() ? 'not-allowed' : 'pointer', fontWeight: '500', opacity: isSubmitting || !newDocumentTitle.trim() ? 0.5 : 1 }}
                  >
                    {isSubmitting ? "Creating..." : "Create Document"}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Documents List */}
        {filteredDocuments.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery ? "No documents found" : "No documents yet"}
            </h3>
            <p className="text-gray-600 mb-6">
              {searchQuery
                ? "Try adjusting your search terms or create a new document."
                : "Get started by creating your first collaborative document."
              }
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Create Your First Document
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {console.log('Rendering documents:', filteredDocuments.length)}
            {filteredDocuments.map((doc) => {
              const totalCollaborators = doc.collaborators.length;
              const totalSuggestions = doc.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);

              return (
                <div
                  key={doc.id}
                  className="bg-white border border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 hover:shadow-sm transition-all cursor-pointer group relative"
                  onClick={() => {
                    console.log('Button clicked for document:', doc.title);
                    onSelectDocument(doc);
                  }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-transparent group-hover:bg-gray-300 rounded-l-lg transition-colors"></div>
                  <div className="flex items-center justify-between px-4 py-2.5 gap-4">
                    {/* Left side - Title and metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-base font-semibold text-gray-900 truncate group-hover:text-gray-950">
                          {doc.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap leading-relaxed">
                        {/* Created By */}
                        <div className="flex items-center gap-1.5">
                          <Avatar className="h-4 w-4">
                            <AvatarFallback className="text-[10px] bg-gray-200 text-gray-700">
                              {doc.owner.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span>{doc.owner.name}</span>
                        </div>

                        {/* Separator */}
                        <span className="text-gray-300">•</span>

                        {/* Collaborators */}
                        {totalCollaborators > 0 && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <Users className="h-3 w-3 text-gray-400" />
                              <span>{totalCollaborators} collab{totalCollaborators !== 1 ? 's' : ''}</span>
                            </div>
                            <span className="text-gray-300">•</span>
                          </>
                        )}

                        {/* Modified Date */}
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3 w-3 text-gray-400" />
                          <span>Modified {formatDate(doc.updatedAt)}</span>
                        </div>

                        <span className="text-gray-300">•</span>

                        {/* Sections and Suggestions */}
                        <div className="flex items-center gap-1.5">
                          <FileText className="h-3 w-3 text-gray-400" />
                          <span>{doc.paragraphs.length} sections</span>
                          {totalSuggestions > 0 && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span>{totalSuggestions} suggestions</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right side - Action button */}
                    <div className="flex-shrink-0">
                      <div
                        className="px-4 py-1.5 bg-black text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors whitespace-nowrap shadow-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDocument(doc);
                        }}
                      >
                        Open
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
