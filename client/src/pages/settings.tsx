import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import SecurityBadge from "@/components/security-badge";
import { 
  Settings as SettingsIcon, 
  User, 
  Shield, 
  Mail, 
  Key,
  Save,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Info
} from "lucide-react";
import { SecurityLevel } from "@/lib/types";

export default function Settings() {
  const { toast } = useToast();
  const [defaultSecurityLevel, setDefaultSecurityLevel] = useState<SecurityLevel>(SecurityLevel.LEVEL1_OTP);
  const [autoKeyRequest, setAutoKeyRequest] = useState(true);
  const [keyPoolThreshold, setKeyPoolThreshold] = useState(10);
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [auditLogging, setAuditLogging] = useState(true);

  const { data: userInfo, isFetching: userFetching } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe(),
    refetchInterval: 5000 // Refresh every 5 seconds for live updates
  });

  const { data: auditLogs, isLoading: auditLoading, isFetching: auditFetching } = useQuery({
    queryKey: ["/api/audit"],
    queryFn: () => api.getAuditLogs(10),
    refetchInterval: 2000 // Refresh every 2 seconds for live activity updates
  });

  const updateSettingsMutation = useMutation({
    mutationFn: (settings: Record<string, any>) => api.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({
        title: "Settings saved",
        description: "Your preferences have been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save settings",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleSaveSettings = (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    
    updateSettingsMutation.mutate({
      defaultSecurityLevel,
      // Note: Other settings would be implemented based on backend schema
    });
  };

  const getProviderInfo = (provider: string) => {
    switch (provider.toLowerCase()) {
      case "gmail":
        return { name: "Gmail", color: "bg-red-100 text-red-800", icon: "📧" };
      case "outlook":
        return { name: "Outlook", color: "bg-blue-100 text-blue-800", icon: "📨" };
      case "yahoo":
        return { name: "Yahoo Mail", color: "bg-purple-100 text-purple-800", icon: "📬" };
      default:
        return { name: provider, color: "bg-gray-100 text-gray-800", icon: "📧" };
    }
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

  const user = userInfo.user;
  const providerInfo = getProviderInfo(user.emailProvider || "unknown");

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground flex items-center space-x-2">
                <SettingsIcon className="h-6 w-6" />
                <span>Settings</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your account preferences and quantum security settings
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              {(userFetching || auditFetching) && (
                <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                  <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                  <span>Live updating...</span>
                </div>
              )}
              
              <Button
                onClick={handleSaveSettings}
                disabled={updateSettingsMutation.isPending}
                data-testid="button-save"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateSettingsMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-4xl mx-auto space-y-6">
            {/* User Profile */}
            <Card className={userFetching ? "ring-2 ring-primary/20 transition-all duration-300" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <User className="h-5 w-5" />
                  <span>User Profile</span>
                  {userFetching && <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      value={user.username}
                      disabled
                      data-testid="input-username"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={user.email}
                      disabled
                      data-testid="input-email"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label>Email Provider</Label>
                    {userFetching && <div className="w-1 h-1 bg-primary rounded-full animate-pulse"></div>}
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge className={providerInfo.color}>
                      {providerInfo.icon} {providerInfo.name}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Connected and authenticated
                    </span>
                    <CheckCircle className={`h-4 w-4 text-green-600 ${userFetching ? 'animate-pulse' : ''}`} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Security Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-5 w-5" />
                  <span>Quantum Security</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-3">
                  <Label>Default Security Level</Label>
                  <Select 
                    value={defaultSecurityLevel} 
                    onValueChange={(value: SecurityLevel) => setDefaultSecurityLevel(value)}
                  >
                    <SelectTrigger data-testid="select-default-security">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SecurityLevel.LEVEL1_OTP}>Level 1 - Quantum OTP (Highest Security)</SelectItem>
                      <SelectItem value={SecurityLevel.LEVEL2_AES}>Level 2 - Quantum-seeded AES-GCM</SelectItem>
                      <SelectItem value={SecurityLevel.LEVEL3_PQC}>Level 3 - PQC Hybrid (Simulated)</SelectItem>
                      <SelectItem value={SecurityLevel.LEVEL4_PLAIN}>Level 4 - Plain Text</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center space-x-2">
                    <SecurityBadge level={defaultSecurityLevel} size="sm" />
                    <span className="text-xs text-muted-foreground">
                      This will be pre-selected when composing new emails
                    </span>
                  </div>
                </div>

                <Separator />

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label>Automatic Key Management</Label>
                      <p className="text-sm text-muted-foreground">
                        Automatically request new quantum keys when pool is low
                      </p>
                    </div>
                    <Switch 
                      checked={autoKeyRequest} 
                      onCheckedChange={setAutoKeyRequest}
                      data-testid="switch-auto-key"
                    />
                  </div>
                  
                  {autoKeyRequest && (
                    <div className="ml-4 space-y-2">
                      <Label>Key Pool Threshold (MB)</Label>
                      <Input
                        type="number"
                        value={keyPoolThreshold}
                        onChange={(e) => setKeyPoolThreshold(Number(e.target.value))}
                        min="1"
                        max="100"
                        className="w-24"
                        data-testid="input-threshold"
                      />
                      <p className="text-xs text-muted-foreground">
                        Request new keys when available capacity drops below this amount
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Enhanced Audit Logging</Label>
                    <p className="text-sm text-muted-foreground">
                      Log detailed security events and key usage patterns
                    </p>
                  </div>
                  <Switch 
                    checked={auditLogging} 
                    onCheckedChange={setAuditLogging}
                    data-testid="switch-audit-logging"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Email Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Mail className="h-5 w-5" />
                  <span>Email Preferences</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <Label>Security Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Receive email alerts for security events and key pool status
                    </p>
                  </div>
                  <Switch 
                    checked={emailNotifications} 
                    onCheckedChange={setEmailNotifications}
                    data-testid="switch-notifications"
                  />
                </div>

                <Separator />

                <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <Info className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Email Provider Connection
                    </span>
                  </div>
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    Your {providerInfo.name} account is connected and configured for quantum-secure messaging. 
                    SMTP and IMAP settings are automatically managed.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Security Audit */}
            <Card className={auditFetching ? "ring-2 ring-primary/20 transition-all duration-300" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Key className="h-5 w-5" />
                    <span>Recent Security Activity</span>
                    {auditFetching && <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>}
                  </div>
                  <Button
                    variant="ghost" 
                    size="sm"
                    onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/audit"] })}
                    data-testid="button-refresh-audit"
                    className={auditFetching ? "animate-spin" : ""}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {auditLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-muted rounded-full"></div>
                        <div className="flex-1">
                          <div className="h-3 bg-muted rounded w-3/4 mb-1"></div>
                          <div className="h-2 bg-muted rounded w-1/2"></div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : auditLogs && auditLogs.length > 0 ? (
                  <div className="space-y-3">
                    {auditLogs.slice(0, 8).map((log, index) => (
                      <div 
                        key={log.id} 
                        className={`flex items-start space-x-3 p-3 rounded-lg border border-border transition-all duration-500 ${auditFetching && index === 0 ? 'ring-2 ring-primary/30 bg-primary/5' : 'hover:bg-muted/50'}`}
                        data-testid={`audit-log-${log.id}`}
                      >
                        <div className={`w-2 h-2 bg-primary rounded-full mt-2 flex-shrink-0 ${auditFetching && index === 0 ? 'animate-pulse' : ''}`}></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-medium text-foreground capitalize">
                              {log.action.replace(/_/g, ' ')}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.timestamp).toLocaleString()}
                            </span>
                          </div>
                          {log.details && Object.keys(log.details).length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {JSON.stringify(log.details, null, 0).slice(0, 100)}...
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No activity logs</h3>
                    <p className="text-sm text-muted-foreground">
                      Security events will appear here as you use QuMail.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
