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
  AlertCircle
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

  const handleDownloadAttachment = async (attachmentIndex: number) => {
    if (!message) return;

    try {
      const { blob, filename, contentType } = await api.downloadAttachment(message.id, attachmentIndex);

      // Create a proper blob with the correct MIME type
      const properBlob = new Blob([blob], { type: contentType });
      const url = URL.createObjectURL(properBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';

      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // Clean up the URL
      setTimeout(() => URL.revokeObjectURL(url), 100);

      console.log(`Downloaded: ${filename} (${contentType})`);
    } catch (error) {
      console.error('Download failed:', error);
      // Handle error (show toast, etc.)
    }
  };

  if (!message) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="text-6xl mb-4">📧</div>
            <p className="text-lg">Select a message to view</p>
          </div>
        </div>
      </div>
    );
  }

  // Check if message content was deleted (Level 1 view once)
  const isContentDeleted = message.securityLevel === "level1" && message.isDecrypted && !message.body;

  // Cleanup Level 1 content when unmounting or switching
  React.useEffect(() => {
    return () => {
      if (message && message.securityLevel === "level1" && message.isDecrypted && message.body) {
        api.deleteEmailContent(message.id).then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
        });
      }
    };
  }, [message?.id, message?.isDecrypted, message?.body]);

  // Handle page refresh/unload
  React.useEffect(() => {
    const handleUnload = () => {
      if (message && message.securityLevel === "level1" && message.isDecrypted && message.body) {
        // Use sendBeacon for reliable delivery during unload
        const url = `/api/emails/${message.id}/delete-content`;
        navigator.sendBeacon(url);
      }
    };

    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('blur', handleUnload); // Also cleanup when changing tabs/apps for extra security
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('blur', handleUnload);
    };
  }, [message?.id, message?.isDecrypted, message?.body]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border p-6 bg-card">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <h3 className="text-xl font-semibold text-foreground mb-2" data-testid="text-subject">
              {message.subject}
            </h3>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <span>From: <span className="font-medium text-foreground">{message.from}</span></span>
              <span>To: <span className="font-medium text-foreground">{message.to}</span></span>
              <span>{formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}</span>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <SecurityBadge level={message.securityLevel} size="sm" />
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

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReply?.(message)}
            disabled={isContentDeleted}
            data-testid="button-reply"
          >
            <Reply className="h-4 w-4 mr-1" />
            Reply
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReplyAll?.(message)}
            disabled={isContentDeleted}
            data-testid="button-reply-all"
          >
            <ReplyAll className="h-4 w-4 mr-1" />
            Reply All
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onForward?.(message)}
            disabled={isContentDeleted}
            data-testid="button-forward"
          >
            <Forward className="h-4 w-4 mr-1" />
            Forward
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {/* Message Body */}
        <div className="prose max-w-none mb-6">
          {isContentDeleted ? (
            <div className="text-center p-8 border border-dashed border-destructive/50 rounded-lg bg-destructive/5">
              <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <p className="text-destructive font-medium mb-2">Message Content Deleted</p>
              <p className="text-muted-foreground text-sm">
                This was a Level 1 security message. It has been deleted after the first view as per "view once" policy.
              </p>
            </div>
          ) : message.isDecrypted ? (
            <div className="whitespace-pre-wrap text-foreground" data-testid="text-body">
              {message.body || "No content available"}
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
            <div className="whitespace-pre-wrap text-foreground" data-testid="text-body">
              {message.body || "No content available"}
            </div>
          )}
        </div>

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
              <Paperclip className="h-4 w-4 mr-2" />
              Attachments ({message.attachments.length})
            </h4>
            <div className="space-y-2">
              {message.attachments.map((attachment, index) => (
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