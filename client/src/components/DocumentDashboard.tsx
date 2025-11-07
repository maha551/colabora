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
  onCreateDocument: (title: string, description?: string, contributors?: string[]) => void;
  onDeleteDocument: (documentId: string) => void;
  loading?: boolean;
}

export function DocumentDashboard({
  documents,
  currentUser,
  onSelectDocument,
  onCreateDocument,
  onDeleteDocument,
  loading = false
}: DocumentDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newDocumentTitle, setNewDocumentTitle] = useState("");
  const [newDocumentDescription, setNewDocumentDescription] = useState("");
  const [selectedContributors, setSelectedContributors] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("modified");

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

    setIsSubmitting(true);
    try {
      await onCreateDocument(
        newDocumentTitle.trim(),
        newDocumentDescription.trim() || undefined,
        selectedContributors.length > 0 ? selectedContributors : undefined
      );
      setNewDocumentTitle("");
      setNewDocumentDescription("");
      setSelectedContributors([]);
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
      <div className="max-w-4xl mx-auto px-4 py-8">
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
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-2 flex-1">
              <Filter className="h-4 w-4 text-gray-500" />
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

              <ArrowUpDown className="h-4 w-4 text-gray-500 ml-2" />
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
            <div style={{ width: '100%', height: '48px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }} onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="h-4 w-4" />
              New Document
            </div>
          ) : (
            <Card className="border-2 border-gray-300 bg-white animate-in slide-in-from-top-2 duration-200">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg font-bold text-gray-900">Create New Document</CardTitle>
                <CardDescription>Start a new collaborative document</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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

        {/* Documents Grid */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {console.log('Rendering documents:', filteredDocuments.length)}
            {filteredDocuments.map((doc) => {
              const totalCollaborators = doc.collaborators.length;
              const totalSuggestions = doc.paragraphs.reduce((acc, p) => acc + p.proposals.length, 0);

              return (
                <Card key={doc.id} className="hover:shadow-lg transition-shadow border border-gray-200">
                  <CardHeader className="pb-0">
                    <CardTitle className="text-lg font-bold text-gray-900 mb-1">
                      {doc.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {/* Single line meta information */}
                    <div className="flex items-center justify-between gap-4 text-sm flex-wrap">
                      {/* Left side: Creator and Collaborators */}
                      <div className="flex items-center gap-3 flex-wrap">
                        {/* Created By */}
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Created by</span>
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                              {doc.owner.name.split(' ').map(n => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-gray-900">{doc.owner.name}</span>
                        </div>

                        {/* Collaborators */}
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-gray-500" />
                          <div className="flex items-center -space-x-2">
                            {doc.collaborators.slice(0, 2).map((collaborator) => (
                              <Avatar key={collaborator.id} className="h-8 w-8 border-2 border-white">
                                <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                                  {collaborator.user.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                            ))}
                            {totalCollaborators > 2 && (
                              <Avatar className="h-8 w-8 border-2 border-white">
                                <AvatarFallback className="text-xs bg-gray-200 text-gray-700">
                                  +{totalCollaborators - 2}
                                </AvatarFallback>
                              </Avatar>
                            )}
                          </div>
                          <span className="text-gray-700">
                            {totalCollaborators} collaborator{totalCollaborators !== 1 ? 's' : ''}
                          </span>
                        </div>
                      </div>

                      {/* Right side: Modified Date and Stats */}
                      <div className="flex items-center gap-4 ml-auto">
                        {/* Modified Date */}
                        <div className="flex items-center gap-2 text-gray-700">
                          <Clock className="h-4 w-4 text-gray-500" />
                          <span>Modified {formatDate(doc.updatedAt)}</span>
                        </div>

                        {/* Sections and Suggestions */}
                        <div className="flex items-center gap-2 text-gray-700">
                          <FileText className="h-4 w-4 text-gray-500" />
                          <span>{doc.paragraphs.length} sections/{totalSuggestions} Suggestions</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>

                  {/* Open Button - Outside CardContent */}
                  <div className="px-6 pb-6">
                    <div
                      style={{ width: '100%', height: '48px', backgroundColor: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: '500' }}
                      onClick={() => {
                        console.log('Button clicked for document:', doc.title);
                        onSelectDocument(doc);
                      }}
                    >
                      Open Document
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
