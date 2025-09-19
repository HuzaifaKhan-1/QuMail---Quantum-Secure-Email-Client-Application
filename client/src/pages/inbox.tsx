import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  const [currentFolder, setCurrentFolder] = useState("inbox");

  const { data: messages, isLoading, error, refetch } = useQuery({
    queryKey: ["/api/emails", currentFolder],
    queryFn: () => api.getEmails(currentFolder),
    refetchInterval: 30000 // Auto-refresh every 30 seconds
  });

  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe()
  });

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

  const handleSelectMessage = (message: Message) => {
    setSelectedMessage(message);
  };

  const handleRefresh = () => {
    fetchEmailsMutation.mutate();
  };

  const getUnreadCount = () => {
    if (!messages) return 0;
    return messages.filter(msg => !msg.isRead).length;
  };

  const getLastSyncTime = () => {
    return "2 minutes ago"; // This would come from actual sync metadata
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
            />
          </div>

          {/* Email Preview */}
          <div className="w-1/2">
            <EmailPreview message={selectedMessage} />
          </div>
        </div>
      </div>

      {/* Compose Modal */}
      <ComposeModal
        isOpen={isComposeOpen}
        onClose={() => setIsComposeOpen(false)}
      />
    </div>
  );
}
