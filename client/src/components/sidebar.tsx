import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  Inbox,
  Send,
  Key,
  Trash,
  Settings,
  ShieldCheck,
  LogOut
} from "lucide-react";

interface SidebarProps {
  unreadCount?: number;
  isMobile?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ unreadCount = 0, isMobile = false, onNavigate }: SidebarProps) {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();

  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe()
  });

  const { data: keyPoolStats } = useQuery({
    queryKey: ["/api/keys/pool"],
    queryFn: () => api.getKeyPool(),
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      // Clear all queries and reset query client
      queryClient.clear();
      queryClient.resetQueries();
      // Force redirect to login
      window.location.href = "/login";
    },
    onError: () => {
      // Even if logout fails on server, clear client state
      queryClient.clear();
      queryClient.resetQueries();
      window.location.href = "/login";
    }
  });

  const navItems = [
    {
      path: "/inbox",
      icon: Inbox,
      label: "Inbox",
      badge: unreadCount > 0 ? unreadCount.toString() : undefined
    },
    { path: "/sent", icon: Send, label: "Sent" },
    { path: "/compose", icon: Send, label: "Compose" },
    { path: "/keys", icon: Key, label: "Key Dashboard" },
  ];

  const getSecurityStatus = () => {
    if (!keyPoolStats) return { level: "Unknown", color: "bg-gray-500" };

    if (keyPoolStats.utilizationPercent < 50) {
      return { level: "Quantum Active", color: "bg-green-500" };
    } else if (keyPoolStats.utilizationPercent < 80) {
      return { level: "Quantum Low", color: "bg-yellow-500" };
    } else {
      return { level: "Quantum Critical", color: "bg-red-500" };
    }
  };

  const securityStatus = getSecurityStatus();

  if (!userInfo?.user) {
    return null;
  }

  const user = userInfo.user;

  return (
    <div className={`${isMobile ? 'flex flex-1' : 'hidden md:flex w-64 shrink-0'} bg-card border-r border-border flex-col h-screen overflow-y-auto`}>
      {/* Logo and Title */}
      <div className="p-6 border-b border-border bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 bg-gradient-to-tr from-primary to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 ring-1 ring-white/20">
            <Shield className="h-6 w-6 text-white shadow-sm" />
          </div>
          <div>
            <h1 className="text-xl font-black text-foreground tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
              QuMail
            </h1>
            <p className="text-[10px] text-primary uppercase font-bold tracking-[0.2em] opacity-80">
              Quantum Secure
            </p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-5 border-b border-border bg-muted/30">
        <div className="flex items-center space-x-3 mb-4">
          <Avatar className="h-10 w-10 border-2 border-primary/20 shadow-sm">
            <AvatarFallback className="bg-gradient-to-br from-primary to-purple-600 text-white text-xs font-black">
              {user.username?.charAt(0).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-foreground truncate leading-none mb-1" data-testid="text-username">
              {user.username}
            </p>
            <p className="text-[10px] text-primary font-mono truncate font-black uppercase tracking-wider" data-testid="text-secure-email">
              {user.userSecureEmail}
            </p>
            <p className="text-[9px] text-muted-foreground truncate opacity-60 font-medium" data-testid="text-google-email">
              {user.googleEmail}
            </p>
          </div>
        </div>

        {/* Security Status */}
        <div className="p-3 bg-card rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
              Security
            </span>
            <span className="text-[10px] font-black text-green-500 uppercase tracking-widest flex items-center" data-testid="text-security-status">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 animate-pulse" />
              {securityStatus.level}
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
            <div
              className={`${securityStatus.color} h-1.5 rounded-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(34,197,94,0.4)]`}
              style={{ width: `${100 - (keyPoolStats?.utilizationPercent || 0)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 flex flex-col space-y-2">
        <div className="flex-1 space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.path;

            return (
              <Button
                key={item.path}
                variant={isActive ? "default" : "ghost"}
                className={`w-full justify-start ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLocation(item.path);
                  if (onNavigate) onNavigate();
                }}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
              >
                <Icon className="h-4 w-4 mr-3" />
                <span className="text-sm font-medium">{item.label}</span>
                {item.badge && (
                  <Badge
                    variant={isActive ? "secondary" : "default"}
                    className="ml-auto"
                    data-testid="badge-unread-count"
                  >
                    {item.badge}
                  </Badge>
                )}
              </Button>
            );
          })}
        </div>

        <div className="pt-4 mt-auto border-t border-border">
          <Button
            variant="ghost"
            className={`w-full justify-start ${location === "/settings" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation("/settings");
              if (onNavigate) onNavigate();
            }}
            data-testid="nav-settings"
          >
            <Settings className="h-4 w-4 mr-3" />
            <span className="text-sm font-medium">Settings</span>
          </Button>

          <Button
            variant="ghost"
            className={`w-full justify-start ${location === "/audit" ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation("/audit");
              if (onNavigate) onNavigate();
            }}
            data-testid="nav-security-audit"
          >
            <ShieldCheck className="h-4 w-4 mr-3" />
            <span className="text-sm font-medium">Security Audit</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive mt-2"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              logoutMutation.mutate();
            }}
            data-testid="button-logout"
          >
            <LogOut className="h-4 w-4 mr-3" />
            <span className="text-sm font-medium">
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </span>
          </Button>
        </div>
      </nav>

      {/* Key Usage Status */}
      <div className="p-4 border-t border-border">
        <div className="bg-muted rounded-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-muted-foreground">Quantum Keys</span>
            <span className="text-xs text-foreground" data-testid="text-key-capacity">
              {keyPoolStats ? `${keyPoolStats.remainingMB} MB` : "Loading..."}
            </span>
          </div>
          <Progress
            value={keyPoolStats ? 100 - keyPoolStats.utilizationPercent : 0}
            className="h-2"
            data-testid="progress-key-usage"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {keyPoolStats ? `${100 - keyPoolStats.utilizationPercent}% capacity remaining` : "Loading..."}
          </p>
        </div>
      </div>
    </div>
  );
}