import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import SecurityBadge from "./security-badge";
import { Paperclip, CheckCircle, Lock, AlertCircle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Message } from "@/lib/types";

interface EmailListProps {
  folder?: string;
  selectedMessageId?: string;
  onSelectMessage: (message: Message) => void;
}

export default function EmailList({ 
  folder = "inbox", 
  selectedMessageId, 
  onSelectMessage 
}: EmailListProps) {
  const { data: messages, isLoading, error } = useQuery({
    queryKey: ["/api/emails", folder],
    queryFn: () => api.getEmails(folder),
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start space-x-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-medium text-foreground mb-2">Failed to load emails</h3>
        <p className="text-sm text-muted-foreground">Please try again later.</p>
      </div>
    );
  }

  if (!messages || messages.length === 0) {
    return (
      <div className="p-8 text-center">
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
        <h3 className="text-lg font-medium text-foreground mb-2">No messages</h3>
        <p className="text-sm text-muted-foreground">
          {folder === "inbox" ? "Your inbox is empty." : `No messages in ${folder}.`}
        </p>
      </div>
    );
  }

  const getFromName = (email: string) => {
    const match = email.match(/^(.+?)\s*<.*>$/);
    return match ? match[1].trim() : email.split('@')[0];
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getEncryptionStatus = (message: Message) => {
    if (!message.isEncrypted) return null;
    
    if (message.isDecrypted) {
      return {
        icon: CheckCircle,
        text: "Decrypted",
        color: "text-green-600"
      };
    } else {
      return {
        icon: Lock,
        text: "Awaiting decryption", 
        color: "text-amber-600"
      };
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      {messages.map((message) => {
        const fromName = getFromName(message.from);
        const encryptionStatus = getEncryptionStatus(message);
        const isSelected = selectedMessageId === message.id;
        
        return (
          <div
            key={message.id}
            className={`border-b border-border p-4 cursor-pointer transition-colors hover:bg-muted ${
              isSelected ? 'bg-blue-50 dark:bg-blue-950/50' : ''
            }`}
            onClick={() => onSelectMessage(message)}
            data-testid={`email-item-${message.id}`}
          >
            <div className="flex items-start space-x-3">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm">
                  {getInitials(fromName)}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold text-foreground truncate" data-testid="text-sender">
                    {fromName}
                  </p>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <SecurityBadge level={message.securityLevel} size="sm" />
                    <span className="text-xs text-muted-foreground" data-testid="text-time">
                      {formatDistanceToNow(new Date(message.receivedAt), { addSuffix: true })}
                    </span>
                  </div>
                </div>
                
                <p className="text-sm text-foreground mb-1 truncate" data-testid="text-subject">
                  {message.subject}
                </p>
                
                <p className="text-sm text-muted-foreground mb-2 truncate" data-testid="text-preview">
                  {message.isDecrypted ? 
                    (message.body ? message.body.substring(0, 100) + "..." : "No preview available") :
                    message.isEncrypted ? "Encrypted message - decrypt to view" : "No preview available"
                  }
                </p>
                
                <div className="flex items-center space-x-3 text-xs">
                  {message.attachments && message.attachments.length > 0 && (
                    <span className="inline-flex items-center text-muted-foreground">
                      <Paperclip className="mr-1 h-3 w-3" />
                      {message.attachments.length} attachment{message.attachments.length > 1 ? 's' : ''}
                    </span>
                  )}
                  
                  {encryptionStatus && (
                    <span className={`inline-flex items-center ${encryptionStatus.color}`}>
                      <encryptionStatus.icon className="mr-1 h-3 w-3" />
                      {encryptionStatus.text}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
