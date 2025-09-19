import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import SecurityBadge from "./security-badge";
import { useToast } from "@/hooks/use-toast";
import { 
  Reply, 
  ReplyAll, 
  Forward, 
  MoreVertical, 
  Shield, 
  Download,
  Unlock,
  CheckCircle
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/types";

interface EmailPreviewProps {
  message: Message | null;
}

export default function EmailPreview({ message }: EmailPreviewProps) {
  const { toast } = useToast();

  const decryptMutation = useMutation({
    mutationFn: (messageId: string) => api.decryptEmail(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Email decrypted",
        description: "The email has been successfully decrypted.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Decryption failed",
        description: error.message || "Failed to decrypt the email.",
        variant: "destructive",
      });
    }
  });

  if (!message) {
    return (
      <div className="h-full flex items-center justify-center text-center p-8">
        <div>
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-muted-foreground"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 7.89a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-foreground mb-2">Select an email</h3>
          <p className="text-sm text-muted-foreground">
            Choose an email from the list to view its contents.
          </p>
        </div>
      </div>
    );
  }

  const getFromName = (email: string) => {
    const match = email.match(/^(.+?)\s*<.*>$/);
    return match ? match[1].trim() : email.split('@')[0];
  };

  const getFromEmail = (email: string) => {
    const match = email.match(/<(.+)>/);
    return match ? match[1] : email;
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getSecurityInfo = (message: Message) => {
    if (!message.isEncrypted) return null;

    switch (message.securityLevel) {
      case "level1":
        return {
          title: "Level 1 OTP Encrypted",
          details: [
            "Encryption: One-Time Pad (OTP) using quantum keys",
            `Key ID: ${message.keyId || 'Unknown'}`,
            "Authentication: HMAC-SHA256 verified ✓"
          ]
        };
      case "level2":
        return {
          title: "Level 2 Quantum AES",
          details: [
            "Encryption: AES-256-GCM with quantum-seeded keys",
            `Key ID: ${message.keyId || 'Unknown'}`,
            "Authentication: GCM authenticated encryption"
          ]
        };
      case "level3":
        return {
          title: "Level 3 PQC Hybrid",
          details: [
            "Encryption: Post-Quantum Cryptography hybrid",
            `Key ID: ${message.keyId || 'Unknown'}`,
            "Future-proof against quantum computers"
          ]
        };
      default:
        return {
          title: "Encrypted",
          details: ["Unknown encryption method"]
        };
    }
  };

  const fromName = getFromName(message.from);
  const fromEmail = getFromEmail(message.from);
  const securityInfo = getSecurityInfo(message);
  const canDecrypt = message.isEncrypted && !message.isDecrypted;

  return (
    <div className="h-full flex flex-col">
      {/* Email Header */}
      <div className="border-b border-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-start space-x-3">
            <Avatar className="w-12 h-12">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {getInitials(fromName)}
              </AvatarFallback>
            </Avatar>
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-1" data-testid="text-subject">
                {message.subject}
              </h3>
              <p className="text-sm text-muted-foreground">
                From: <span className="text-foreground" data-testid="text-from">{fromName} &lt;{fromEmail}&gt;</span>
              </p>
              <p className="text-sm text-muted-foreground">
                To: <span className="text-foreground" data-testid="text-to">{message.to}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-1" data-testid="text-timestamp">
                {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <SecurityBadge level={message.securityLevel} />
            <Button variant="ghost" size="sm">
              <Reply className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Security Info */}
        {securityInfo && (
          <div className={`p-3 rounded-lg border ${
            message.isDecrypted 
              ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800'
              : 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800'
          }`}>
            <div className="flex items-center space-x-2 mb-2">
              <Shield className={`h-4 w-4 ${
                message.isDecrypted ? 'text-green-600' : 'text-amber-600'
              }`} />
              <span className={`text-sm font-medium ${
                message.isDecrypted ? 'text-green-800 dark:text-green-200' : 'text-amber-800 dark:text-amber-200'
              }`}>
                {message.isDecrypted ? 'Quantum Security Active' : 'Encrypted Message'}
              </span>
              {message.isDecrypted && (
                <CheckCircle className="h-4 w-4 text-green-600" />
              )}
            </div>
            <div className={`text-xs space-y-1 ${
              message.isDecrypted ? 'text-green-700 dark:text-green-300' : 'text-amber-700 dark:text-amber-300'
            }`}>
              {securityInfo.details.map((detail, index) => (
                <p key={index}>{detail}</p>
              ))}
            </div>
            {canDecrypt && (
              <Button
                size="sm"
                className="mt-2"
                onClick={() => decryptMutation.mutate(message.id)}
                disabled={decryptMutation.isPending}
                data-testid="button-decrypt"
              >
                <Unlock className="h-3 w-3 mr-1" />
                {decryptMutation.isPending ? "Decrypting..." : "Decrypt Now"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Email Content */}
      <div className="flex-1 p-6 overflow-y-auto">
        {message.isDecrypted && message.body ? (
          <div className="prose max-w-none text-foreground" data-testid="email-content">
            <div className="whitespace-pre-wrap">
              {message.body}
            </div>
          </div>
        ) : message.isEncrypted ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">Message Encrypted</h3>
            <p className="text-sm text-muted-foreground mb-4">
              This message is encrypted with quantum security. Decrypt it to view the contents.
            </p>
            {canDecrypt && (
              <Button
                onClick={() => decryptMutation.mutate(message.id)}
                disabled={decryptMutation.isPending}
                data-testid="button-decrypt-main"
              >
                <Unlock className="h-4 w-4 mr-2" />
                {decryptMutation.isPending ? "Decrypting..." : "Decrypt Message"}
              </Button>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <p className="text-muted-foreground">No content available</p>
          </div>
        )}

        {/* Attachments */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h4 className="text-sm font-medium text-foreground mb-3 flex items-center">
              <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
              Attachments ({message.attachments.length})
            </h4>
            <div className="space-y-2">
              {message.attachments.map((attachment, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-card border border-border rounded-md">
                  <div className="flex items-center space-x-3">
                    <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                      <svg className="h-4 w-4 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{attachment.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {(attachment.size / 1024).toFixed(1)} KB • {attachment.contentType}
                      </p>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" data-testid={`button-download-${index}`}>
                    <Download className="h-3 w-3 mr-1" />
                    Download
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reply Actions */}
      <div className="border-t border-border p-4 bg-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Button size="sm" data-testid="button-reply">
              <Reply className="h-4 w-4 mr-2" />
              Reply
            </Button>
            <Button size="sm" variant="outline" data-testid="button-reply-all">
              <ReplyAll className="h-4 w-4 mr-2" />
              Reply All
            </Button>
            <Button size="sm" variant="outline" data-testid="button-forward">
              <Forward className="h-4 w-4 mr-2" />
              Forward
            </Button>
          </div>
          <div className="flex items-center space-x-2">
            <select className="px-3 py-1 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring">
              <option value="level1">Level 1 - Quantum OTP</option>
              <option value="level2">Level 2 - Quantum AES</option>
              <option value="level3">Level 3 - PQC Hybrid</option>
              <option value="level4">Level 4 - Plain Text</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
