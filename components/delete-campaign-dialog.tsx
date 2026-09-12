"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";

interface DeleteCampaignDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignName?: string | null;
  onConfirm: () => Promise<void> | void;
  isDeleting?: boolean;
}

export function DeleteCampaignDialog({
  open,
  onOpenChange,
  campaignName,
  onConfirm,
  isDeleting = false,
}: DeleteCampaignDialogProps) {
  const handleOpenChange = (nextOpen: boolean) => {
    // Prevent closing via escape or outside click while actively deleting
    if (isDeleting) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px] p-6 gap-5">
        <div className="flex items-start gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive dark:bg-destructive/20 mt-0.5">
            <Trash2 className="size-5" />
          </div>
          <div className="space-y-1.5 pt-0.5 flex-1 min-w-0">
            <DialogTitle className="text-base font-semibold text-foreground tracking-tight">
              Delete campaign?
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              This action cannot be undone.{" "}
              {campaignName ? (
                <>
                  The campaign <span className="font-medium text-foreground">&ldquo;{campaignName}&rdquo;</span> and its associated data will be permanently deleted.
                </>
              ) : (
                "The campaign and its associated data will be permanently deleted."
              )}
            </DialogDescription>
          </div>
        </div>

        <DialogFooter className="mt-2 -mx-6 -mb-6 px-6 py-3.5 bg-muted/30 border-t border-border/60 flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
            className="w-full sm:w-auto text-xs sm:text-sm font-medium"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="w-full sm:w-auto bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30 text-xs sm:text-sm font-medium gap-1.5 shadow-2xs"
          >
            {isDeleting ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>Deleting...</span>
              </>
            ) : (
              <>
                <Trash2 className="size-3.5" />
                <span>Delete campaign</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
