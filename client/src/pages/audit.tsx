import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import Sidebar from "@/components/sidebar";
import MobileHeader from "@/components/mobile-header";
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
    <div className="flex flex-col md:flex-row h-screen bg-background overflow-hidden">
      <MobileHeader />
      <Sidebar />
      
      <main className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-5xl mx-auto p-3 md:p-8 space-y-6">
          <div className="flex items-center gap-3 mb-2 px-1">
            <div className="w-10 h-10 md:w-12 md:h-12 bg-primary/10 rounded-lg flex items-center justify-center shrink-0">
              <Shield className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            </div>
            <div>
              <h1 className="text-xl md:text-3xl font-black tracking-tight text-foreground">Security Audit</h1>
              <p className="text-[10px] md:text-sm text-muted-foreground uppercase tracking-wider font-bold opacity-70">Monitor system integrity</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {/* Security Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Card className="bg-green-50/30 dark:bg-green-900/10 border-green-200/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="h-6 w-6 text-green-500" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Status</p>
                      <p className="text-lg font-black text-green-700 dark:text-green-400">Secure</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-blue-50/30 dark:bg-blue-900/10 border-blue-200/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Activity className="h-6 w-6 text-blue-500" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Sessions</p>
                      <p className="text-lg font-black text-blue-700 dark:text-blue-400">1</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card className="bg-amber-50/30 dark:bg-amber-900/10 border-amber-200/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Events</p>
                      <p className="text-lg font-black text-amber-700 dark:text-amber-400">{auditLogs?.length || 0}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Audit Logs */}
            <Card className="border-border/50 shadow-sm">
              <CardHeader className="pb-3 border-b border-border/50">
                <CardTitle className="flex items-center gap-2 text-lg font-black tracking-tight">
                  <Activity className="h-5 w-5 text-primary" />
                  Security Event Log
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : auditLogs && auditLogs.length > 0 ? (
                  <div className="divide-y divide-border/50">
                    {auditLogs.map((log, index) => (
                      <div key={log.id || index} className="p-4 hover:bg-muted/30 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 shrink-0 mt-0.5">
                            {getActionIcon(log.action)}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1.5">
                              <Badge variant={getActionVariant(log.action) as any} className="text-[9px] h-4.5 px-1.5 font-black uppercase">
                                {log.action.replace(/_/g, ' ')}
                              </Badge>
                              <div className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                                <Calendar className="h-3 w-3 shrink-0" />
                                {format(new Date(log.timestamp), 'MMM d, HH:mm:ss')}
                              </div>
                            </div>
                            
                            <div className="space-y-1.5 text-xs">
                              {log.userId && (
                                <p className="text-muted-foreground break-all">
                                  <span className="font-bold text-foreground">UID</span> <span className="opacity-70 font-mono text-[11px]">{log.userId}</span>
                                </p>
                              )}
                              
                              {log.details && typeof log.details === 'object' && (
                                <div className="mt-3 bg-muted/20 rounded-md border border-border/30 overflow-hidden">
                                  <div className="bg-muted p-1.5 px-2 border-b border-border/30">
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-70">JSON Details</p>
                                  </div>
                                  <pre className="text-[10px] p-2.5 overflow-x-auto font-mono scrollbar-hide">
                                    {JSON.stringify(log.details, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <Shield className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
                    <h3 className="text-lg font-bold mb-2">No Security Events</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      No security audit logs found. System activities will appear here in real-time.
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