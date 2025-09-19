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
}

export default function Sidebar({ unreadCount = 0 }: SidebarProps) {
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
    { path: "/compose", icon: Send, label: "Compose" },
    { path: "/keys", icon: Key, label: "Key Dashboard" },
    { path: "/settings", icon: Settings, label: "Settings" },
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
    <div className="w-64 bg-card border-r border-border flex flex-col h-screen">
      {/* Logo and Title */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">QuMail</h1>
            <p className="text-xs text-muted-foreground">Quantum Secure Email</p>
          </div>
        </div>
      </div>

      {/* User Info */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center space-x-3 mb-3">
          <Avatar>
            <AvatarFallback className="bg-primary text-primary-foreground">
              {user.username?.charAt(0).toUpperCase() || user.email.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate" data-testid="text-username">
              {user.username || user.email.split('@')[0]}
            </p>
            <p className="text-xs text-muted-foreground truncate" data-testid="text-email">
              {user.email}
            </p>
          </div>
        </div>

        {/* Security Status */}
        <div className="p-2 bg-green-50 dark:bg-green-950 rounded-md border border-green-200 dark:border-green-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-green-800 dark:text-green-200">
              Security Status
            </span>
            <span className="text-xs text-green-600 dark:text-green-400" data-testid="text-security-status">
              {securityStatus.level}
            </span>
          </div>
          <div className="w-full bg-green-200 dark:bg-green-900 rounded-full h-1.5">
            <div 
              className={`${securityStatus.color} h-1.5 rounded-full transition-all`}
              style={{ width: `${100 - (keyPoolStats?.utilizationPercent || 0)}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
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

        <div className="pt-4">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setLocation("/audit");
            }}
            data-testid="nav-security-audit"
          >
            <ShieldCheck className="h-4 w-4 mr-3" />
            <span className="text-sm font-medium">Security Audit</span>
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-destructive hover:text-destructive"
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