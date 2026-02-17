import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import EmailList from "@/components/email-list";
import EmailPreview from "@/components/email-preview";
import ComposeModal from "@/components/compose-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import type { Message } from "@/lib/types";

export default function Inbox() {
  const { toast } = useToast();
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [replyData, setReplyData] = useState<{
    type: 'reply' | 'reply-all' | 'forward' | null;
    message: Message | null;
  }>({ type: null, message: null });

  // Get current folder from URL path
  const [location] = useLocation();
  const currentFolder = location === "/sent" ? "sent" : "inbox";

  const { data: messages, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/emails", currentFolder],
    queryFn: () => api.getEmails(currentFolder),
    refetchInterval: 5000 // Faster refresh for real-time updates
  });

  // Update selected message when messages data changes
  React.useEffect(() => {
    if (selectedMessage && messages) {
      const updatedMessage = messages.find(msg => msg.id === selectedMessage.id);
      if (updatedMessage) {
        const hasContentChanged = updatedMessage.body !== selectedMessage.body ||
          updatedMessage.encryptedBody !== selectedMessage.encryptedBody;
        const hasTimeChanged = updatedMessage.editedAt !== selectedMessage.editedAt;
        const hasStateChanged = updatedMessage.isDecrypted !== selectedMessage.isDecrypted;

        if (hasContentChanged || hasTimeChanged || hasStateChanged) {
          setSelectedMessage({ ...updatedMessage });
        }
      }
    }
  }, [messages, selectedMessage]);

  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe()
  });

  // WebSocket for instant updates
  React.useEffect(() => {
    if (!userInfo?.user?.id) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'auth', userId: userInfo.user.id }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('WS message received:', data);
        if (data.type === 'EMAIL_UPDATED') {
          console.log('Email updated notification for:', data.messageId);
          queryClient.invalidateQueries({ queryKey: ["/api/emails", data.folder] });
          queryClient.invalidateQueries({ queryKey: ["/api/emails", "inbox"] });
          queryClient.invalidateQueries({ queryKey: ["/api/emails", "sent"] });

          if (selectedMessage && selectedMessage.id === data.messageId) {
            console.log('Refetching selected message content');
            // Force refetch the specific email if it's selected
            api.getEmail(data.messageId).then(updated => {
              console.log('Updated message content received');
              setSelectedMessage({ ...updated }); // Force state update
            });
          }
        }
      } catch (e) {
        console.error('WS error:', e);
      }
    };

    return () => ws.close();
  }, [userInfo?.user?.id, selectedMessage?.id]);

  const fetchEmailsMutation = useMutation({
    mutationFn: () => api.fetchEmails(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Emails updated",
        description: "Successfully fetched latest emails from your provider.",
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync failed",
        description: error.message || "Failed to fetch emails from your provider.",
        variant: "destructive",
      });
    }
  });

  const handleSelectMessage = async (message: Message) => {
    // If it's a view-once message that we're navigating away from, we should clear it
    if (selectedMessage?.securityLevel === 'level1') {
      // Small delay to allow UI to transition if needed
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      }, 100);
    }
    setSelectedMessage(message);

    try {
      // Fetch full message details to trigger view-once logic or get metadata
      const fullMessage = await api.getEmail(message.id);
      setSelectedMessage(fullMessage);
    } catch (error) {
      console.error("Failed to fetch message details:", error);
      // Keep the list version if fetch fails
    }
  };

  const handleRefresh = () => {
    fetchEmailsMutation.mutate();
  };

  const getUnreadCount = () => {
    if (!messages) return 0;
    return messages.filter(msg => !msg.isDecrypted).length; // Using isDecrypted as read indicator
  };

  const getLastSyncTime = () => {
    return "2 minutes ago"; // This would come from actual sync metadata
  };

  const handleReply = (message: Message) => {
    setReplyData({ type: 'reply', message });
    setIsComposeOpen(true);
  };

  const handleReplyAll = (message: Message) => {
    setReplyData({ type: 'reply-all', message });
    setIsComposeOpen(true);
  };

  const handleForward = (message: Message) => {
    setReplyData({ type: 'forward', message });
    setIsComposeOpen(true);
  };

  if (!userInfo?.user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar unreadCount={getUnreadCount()} />

      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3">
                <h2 className="text-2xl font-semibold text-foreground" data-testid="page-title">
                  {currentFolder.charAt(0).toUpperCase() + currentFolder.slice(1)}
                </h2>
                {isLoading && (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
                )}
                {error && (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    Error
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {messages ? (
                  <>
                    {getUnreadCount()} unread messages • Last sync: {getLastSyncTime()}
                  </>
                ) : (
                  "Loading messages..."
                )}
              </p>
            </div>

            <div className="flex items-center space-x-4">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  type="text"
                  placeholder="Search messages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 w-64 text-sm"
                  data-testid="input-search"
                />
              </div>

              {/* Actions */}
              <Button
                onClick={() => setIsComposeOpen(true)}
                className="flex items-center space-x-2"
                data-testid="button-compose"
              >
                <Plus className="h-4 w-4" />
                <span>Compose</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={fetchEmailsMutation.isPending}
                data-testid="button-refresh"
              >
                <RefreshCw className={`h-4 w-4 ${fetchEmailsMutation.isPending ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Email List */}
          <div className="w-1/2 border-r border-border">
            <EmailList
              folder={currentFolder}
              selectedMessageId={selectedMessage?.id}
              onSelectMessage={handleSelectMessage}
              searchQuery={searchQuery}
            />
          </div>

          {/* Email Preview */}
          <div className="w-1/2">
            <EmailPreview
              message={selectedMessage}
              onReply={handleReply}
              onReplyAll={handleReplyAll}
              onForward={handleForward}
            />
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => {
          setIsComposeOpen(false);
          setReplyData({ type: null, message: null });
        }}
        replyData={replyData}
      />
    </div>
  );
}