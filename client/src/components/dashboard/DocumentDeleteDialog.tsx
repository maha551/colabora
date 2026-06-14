import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';

export interface DocumentDeleteDialogProps {
  documentToDelete: { id: string; title: string } | null;
  isDeletingDocument: boolean;
  onConfirm: () => void | Promise<void>;
  onOpenChange: (open: boolean) => void;
  /** Description text (e.g. translated "Are you sure you want to delete \"{title}\"?) */
  confirmMessage?: string;
  /** Alias for confirmMessage for compatibility */
  descriptionText?: string;
}

export function DocumentDeleteDialog({
  documentToDelete,
  isDeletingDocument,
  onConfirm,
  onOpenChange,
  confirmMessage,
  descriptionText,
}: DocumentDeleteDialogProps) {
  const message = confirmMessage ?? descriptionText ?? '';
  return (
    <AlertDialog open={!!documentToDelete} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete document?</AlertDialogTitle>
          <AlertDialogDescription>{message}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeletingDocument}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isDeletingDocument}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeletingDocument ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
