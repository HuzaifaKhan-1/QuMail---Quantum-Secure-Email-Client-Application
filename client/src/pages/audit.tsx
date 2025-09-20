import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Shield, 
  Activity, 
  User, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  Eye,
  Lock
} from "lucide-react";
import { format } from "date-fns";

export default function Audit() {
  const { data: auditLogs, isLoading } = useQuery({
    queryKey: ["/api/audit"],
    queryFn: () => api.getAuditLogs(100),
    refetchInterval: 10000 // Refresh every 10 seconds
  });

  const getActionIcon = (action: string) => {
    switch (action.toLowerCase()) {
      case 'login':
      case 'authentication':
        return <User className="h-4 w-4" />;
      case 'key_generation':
      case 'key_request':
        return <Lock className="h-4 w-4" />;
      case 'email_send':
      case 'email_receive':
        return <Activity className="h-4 w-4" />;
      case 'access':
      case 'view':
        return <Eye className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const getActionVariant = (action: string) => {
    switch (action.toLowerCase()) {
      case 'login':
      case 'email_send':
      case 'key_generation':
        return 'default';
      case 'logout':
      case 'failed_login':
        return 'destructive';
      case 'access':
      case 'view':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 overflow-auto">
        <div className="container mx-auto p-6">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold">Security Audit</h1>
              <p className="text-muted-foreground">Monitor system security events and user activities</p>
            </div>
          </div>

          <div className="grid gap-6">
            {/* Security Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-8 w-8 text-green-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Security Status</p>
                      <p className="text-xl font-semibold text-green-600">Secure</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Activity className="h-8 w-8 text-blue-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Active Sessions</p>
                      <p className="text-xl font-semibold">1</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-8 w-8 text-yellow-500" />
                    <div>
                      <p className="text-sm text-muted-foreground">Security Events</p>
                      <p className="text-xl font-semibold">{auditLogs?.length || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Audit Logs */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5" />
                  Security Event Log
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : auditLogs && auditLogs.length > 0 ? (
                  <div className="space-y-4">
                    {auditLogs.map((log, index) => (
                      <div key={log.id || index}>
                        <div className="flex items-start gap-4 p-4 rounded-lg border bg-card">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-primary/10">
                            {getActionIcon(log.action)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={getActionVariant(log.action) as any}>
                                {log.action}
                              </Badge>
                              <span className="text-sm text-muted-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {format(new Date(log.timestamp), 'MMM d, yyyy HH:mm:ss')}
                              </span>
                            </div>
                            
                            <div className="text-sm space-y-1">
                              {log.userId && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">User ID:</span> {log.userId}
                                </p>
                              )}
                              {log.ipAddress && (
                                <p className="text-muted-foreground">
                                  <span className="font-medium">IP Address:</span> {log.ipAddress}
                                </p>
                              )}
                              {log.details && typeof log.details === 'object' && (
                                <div className="mt-2">
                                  <p className="font-medium text-foreground mb-1">Details:</p>
                                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        {index < auditLogs.length - 1 && <Separator className="my-2" />}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <Shield className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Security Events</h3>
                    <p className="text-muted-foreground">
                      No security audit logs found. This is normal for new accounts.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}