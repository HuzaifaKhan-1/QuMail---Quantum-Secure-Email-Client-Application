import React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import SecurityBadge from "./security-badge";
import { 
  Reply, 
  ReplyAll, 
  Forward, 
  Unlock, 
  Download,
  Paperclip,
  AlertCircle,
  Edit2,
  Check,
  X
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/types";

interface EmailPreviewProps {
  message: Message | null;
  onReply?: (message: Message) => void;
  onReplyAll?: (message: Message) => void;
  onForward?: (message: Message) => void;
}

export default function EmailPreview({ 
  message, 
  onReply, 
  onReplyAll, 
  onForward 
}: EmailPreviewProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editValue, setEditValue] = React.useState("");

  const editMutation = useMutation({
    mutationFn: (body: string) => api.editEmail(message!.id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      setIsEditing(false);
      toast({ title: "Message edited" });
    },
    onError: (error: any) => {
      toast({ title: "Edit failed", description: error.message, variant: "destructive" });
    }
  });

  const decryptMutation = useMutation({
    mutationFn: (messageId: string) => api.decryptEmail(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Message decrypted",
        description: "The message has been successfully decrypted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Decryption failed",
        description: error.message || "Failed to decrypt the message.",
        variant: "destructive",
      });
    }
  });

  const handleDecrypt = () => {
    if (message) {
      decryptMutation.mutate(message.id);
    }
  };

  const startEditing = () => {
    setEditValue(message?.body || "");
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
  };

  const saveEdit = () => {
    editMutation.mutate(editValue);
  };

  const isContentDeleted = message ? (message.securityLevel === "level1" && message.isDecrypted && !message.body) : false;

  // Notification for Level 1 Security
  React.useEffect(() => {
    if (message && message.securityLevel === "level1" && !message.isDecrypted) {
      toast({
        title: "Security Alert",
        description: "This is a Level 1 security message. Due to high security, it will be visible only once. Refreshing or switching away will delete the content.",
        variant: "default",
      });
    }
  }, [message?.id, message?.securityLevel, message?.isDecrypted, toast]);

  // Cleanup Level 1 content when unmounting or switching
  React.useEffect(() => {
    if (message && message.securityLevel === "level1" && message.isDecrypted && message.body) {
      const cleanup = () => {
        api.deleteEmailContent(message.id).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
        });
      };

      // Tab visibility change
      const handleVisibilityChange = () => {
        if (document.hidden) {
          cleanup();
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);
      
      return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        cleanup();
      };
    }
  }, [message?.id, message?.securityLevel, message?.isDecrypted, message?.body]);

  // Handle page refresh/unload
  React.useEffect(() => {
    if (message && message.securityLevel === "level1" && message.isDecrypted && message.body) {
      const handleUnload = () => {
        const url = `/api/emails/${message.id}/delete-content`;
        navigator.sendBeacon(url);
      };

      window.addEventListener('beforeunload', handleUnload);
      return () => {
        window.removeEventListener('beforeunload', handleUnload);
      };
    }
  }, [message?.id, message?.securityLevel, message?.isDecrypted, message?.body]);

  const canEdit = (() => {
    if (message && message.receivedAt) {
      const receivedDate = new Date(message.receivedAt);
      return message.folder === "sent" && (Date.now() - receivedDate.getTime() < 15 * 60 * 1000);
    }
    return false;
  })();

  const handleDownloadAttachment = async (attachmentIndex: number) => {
    if (!message) return;

    try {
      const { blob, filename, contentType } = await api.downloadAttachment(message.id, attachmentIndex);
      const properBlob = new Blob([blob], { type: contentType });
      const url = URL.createObjectURL(properBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Download failed:', error);
    }
  };

  if (!message) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="text-6xl mb-4 text-foreground">📧</div>
            <p className="text-lg">Select a message to view</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 border-b border-border p-6 bg-card">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2" data-testid="text-subject">
              {message.subject}
            </h3>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>From: <span className="font-medium text-foreground">{message.from}</span></span>
              <span>To: <span className="font-medium text-foreground">{message.to}</span></span>
              <span>{message.receivedAt ? formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true }) : ''}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <SecurityBadge level={message.securityLevel as any} size="sm" />
            {message.isEncrypted && !message.isDecrypted && (
              <Button
                size="sm"
                onClick={handleDecrypt}
                disabled={decryptMutation.isPending}
                data-testid="button-decrypt"
              >
                <Unlock className="h-4 w-4 mr-1" />
                {decryptMutation.isPending ? "Decrypting..." : "Decrypt"}
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReply?.(message)}
            disabled={message.securityLevel === "level1"}
            data-testid="button-reply"
          >
            <Reply className="h-4 w-4 mr-1" />
            Reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReplyAll?.(message)}
            disabled={message.securityLevel === "level1"}
            data-testid="button-reply-all"
          >
            <ReplyAll className="h-4 w-4 mr-1" />
            Reply All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onForward?.(message)}
            disabled={message.securityLevel === "level1"}
            data-testid="button-forward"
          >
            <Forward className="h-4 w-4 mr-1" />
            Forward
          </Button>
          {canEdit && (
            <Button
              size="sm"
              variant="outline"
              onClick={startEditing}
              disabled={isEditing}
              data-testid="button-edit"
            >
              <Edit2 className="h-4 w-4 mr-1" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 p-6 overflow-y-auto">
        <div className="prose max-w-none mb-6">
          {isContentDeleted ? (
            <div className="text-center p-8 border border-dashed border-destructive/50 rounded-lg bg-destructive/5">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium mb-2">Message Content Deleted</p>
              <p className="text-muted-foreground text-sm">
                This was a Level 1 security message. It has been deleted after the first view as per "view once" policy.
              </p>
            </div>
          ) : isEditing ? (
            <div className="space-y-4">
              <textarea
                className="w-full h-64 p-4 border rounded-md bg-background text-foreground"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                data-testid="input-edit-body"
              />
              <div className="flex space-x-2">
                <Button size="sm" onClick={saveEdit} disabled={editMutation.isPending}>
                  <Check className="h-4 w-4 mr-1" /> Save
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEditing}>
                  <X className="h-4 w-4 mr-1" /> Cancel
                </Button>
              </div>
            </div>
          ) : message.isDecrypted ? (
            <div className="space-y-2">
              <div className="whitespace-pre-wrap text-foreground" data-testid="text-body">
                {(message.body as string) || "No content available"}
              </div>
              {message.editedAt && (
                <p className="text-xs text-muted-foreground italic">
                  Edited {formatDistanceToNow(new Date(message.editedAt), { addSuffix: true })}
                </p>
              )}
            </div>
          ) : message.isEncrypted ? (
            <div className="text-center p-8 border border-dashed border-border rounded-lg">
              <Unlock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">This message is encrypted</p>
              <Button
                onClick={handleDecrypt}
                disabled={decryptMutation.isPending}
                data-testid="button-decrypt-inline"
              >
                <Unlock className="h-4 w-4 mr-2" />
                {decryptMutation.isPending ? "Decrypting..." : "Decrypt Message"}
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="whitespace-pre-wrap text-foreground" data-testid="text-body">
                {(message.body as string) || "No content available"}
              </div>
              {message.editedAt && (
                <p className="text-xs text-muted-foreground italic">
                  Edited {formatDistanceToNow(new Date(message.editedAt), { addSuffix: true })}
                </p>
              )}
            </div>
          )}
        </div>

        {Array.isArray(message.attachments) && (message.attachments as any[]).length > 0 && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
              <Paperclip className="h-4 w-4 mr-2" />
              Attachments ({(message.attachments as any[]).length})
            </h4>
            <div className="space-y-2">
              {(message.attachments as any[]).map((attachment: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-card border border-border rounded-md">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                      <Paperclip className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{attachment.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {(attachment.size / 1024).toFixed(1)} KB • {attachment.contentType}
                      </p>
                    </div>
                  </div>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => handleDownloadAttachment(index)}
                    data-testid={`button-download-${index}`}
                  >
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
