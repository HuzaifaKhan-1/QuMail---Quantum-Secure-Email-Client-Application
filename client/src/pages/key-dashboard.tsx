import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Key, 
  Shield, 
  Plus, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Database,
  TrendingUp,
  Activity
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { QuantumKey, KeyPoolStats } from "@/lib/types";

export default function KeyDashboard() {
  const { toast } = useToast();

  const { data: keyPoolStats, isLoading: statsLoading } = useQuery({
    queryKey: ["/api/keys/pool"],
    queryFn: () => api.getKeyPool(),
    refetchInterval: 15000 // Refresh every 15 seconds
  });

  const { data: keys, isLoading: keysLoading } = useQuery({
    queryKey: ["/api/keys"],
    queryFn: () => api.getKeys(),
    refetchInterval: 30000 // Refresh every 30 seconds
  });

  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe()
  });

  const requestKeyMutation = useMutation({
    mutationFn: ({ keyLength, recipient }: { keyLength: number; recipient?: string }) => 
      api.requestKey(keyLength, recipient),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/keys/pool"] });
      toast({
        title: "Quantum key requested",
        description: "A new quantum key has been generated and added to your pool.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Key request failed",
        description: error.message || "Failed to request new quantum key.",
        variant: "destructive",
      });
    }
  });

  const handleRequestKey = (keyLength: number = 8192) => {
    requestKeyMutation.mutate({ keyLength });
  };

  const getKeyStatusColor = (key: QuantumKey) => {
    if (!key.isActive) return "bg-gray-100 text-gray-800";
    if (key.utilizationPercent >= 90) return "bg-red-100 text-red-800";
    if (key.utilizationPercent >= 70) return "bg-yellow-100 text-yellow-800";
    return "bg-green-100 text-green-800";
  };

  const getKeyStatusText = (key: QuantumKey) => {
    if (!key.isActive) return "Exhausted";
    if (key.utilizationPercent >= 90) return "Critical";
    if (key.utilizationPercent >= 70) return "Low";
    return "Active";
  };

  const getPoolHealthStatus = () => {
    if (!keyPoolStats) return { status: "Unknown", color: "text-gray-600", icon: Clock };
    
    if (keyPoolStats.utilizationPercent <= 30) {
      return { status: "Excellent", color: "text-green-600", icon: CheckCircle };
    } else if (keyPoolStats.utilizationPercent <= 60) {
      return { status: "Good", color: "text-blue-600", icon: TrendingUp };
    } else if (keyPoolStats.utilizationPercent <= 80) {
      return { status: "Warning", color: "text-yellow-600", icon: AlertTriangle };
    } else {
      return { status: "Critical", color: "text-red-600", icon: AlertTriangle };
    }
  };

  const poolHealth = getPoolHealthStatus();

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
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-foreground flex items-center space-x-2">
                <Key className="h-6 w-6" />
                <span>Quantum Key Dashboard</span>
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your quantum key pool and monitor security capacity
              </p>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button
                onClick={() => handleRequestKey(8192)}
                disabled={requestKeyMutation.isPending}
                data-testid="button-request-key"
              >
                <Plus className="h-4 w-4 mr-2" />
                {requestKeyMutation.isPending ? "Requesting..." : "Request New Key"}
              </Button>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  queryClient.invalidateQueries({ queryKey: ["/api/keys"] });
                  queryClient.invalidateQueries({ queryKey: ["/api/keys/pool"] });
                }}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <div className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {statsLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="p-6">
                      <Skeleton className="h-4 w-20 mb-2" />
                      <Skeleton className="h-8 w-16 mb-2" />
                      <Skeleton className="h-3 w-24" />
                    </CardContent>
                  </Card>
                ))
              ) : keyPoolStats ? (
                <>
                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Total Capacity</p>
                          <p className="text-2xl font-bold text-foreground" data-testid="text-total-capacity">
                            {keyPoolStats.totalCapacityMB} MB
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {keyPoolStats.totalKeys} keys
                          </p>
                        </div>
                        <Database className="h-8 w-8 text-primary" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Available</p>
                          <p className="text-2xl font-bold text-foreground" data-testid="text-available">
                            {keyPoolStats.remainingMB} MB
                          </p>
                          <p className="text-xs text-green-600">
                            {(100 - keyPoolStats.utilizationPercent).toFixed(1)}% free
                          </p>
                        </div>
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Consumed</p>
                          <p className="text-2xl font-bold text-foreground" data-testid="text-consumed">
                            {keyPoolStats.consumedMB} MB
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {keyPoolStats.utilizationPercent.toFixed(1)}% used
                          </p>
                        </div>
                        <Activity className="h-8 w-8 text-blue-600" />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardContent className="p-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Pool Health</p>
                          <p className={`text-2xl font-bold ${poolHealth.color}`} data-testid="text-pool-health">
                            {poolHealth.status}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Security status
                          </p>
                        </div>
                        <poolHealth.icon className={`h-8 w-8 ${poolHealth.color}`} />
                      </div>
                    </CardContent>
                  </Card>
                </>
              ) : null}
            </div>

            {/* Key Pool Usage */}
            {keyPoolStats && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <TrendingUp className="h-5 w-5" />
                    <span>Key Pool Usage</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">Utilization</span>
                      <span className="text-sm text-muted-foreground">
                        {keyPoolStats.consumedMB} / {keyPoolStats.totalCapacityMB} MB
                      </span>
                    </div>
                    <Progress 
                      value={keyPoolStats.utilizationPercent} 
                      className="h-3"
                      data-testid="progress-utilization"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>0%</span>
                      <span className="font-medium">{keyPoolStats.utilizationPercent.toFixed(1)}% used</span>
                      <span>100%</span>
                    </div>
                    
                    {keyPoolStats.utilizationPercent > 80 && (
                      <div className="flex items-center space-x-2 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                            Key pool running low
                          </p>
                          <p className="text-xs text-amber-700 dark:text-amber-300">
                            Consider requesting additional quantum keys to maintain security levels.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Individual Keys */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Shield className="h-5 w-5" />
                    <span>Quantum Keys</span>
                  </div>
                  {keys && (
                    <Badge variant="secondary" data-testid="badge-key-count">
                      {keys.length} keys
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {keysLoading ? (
                  <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="flex items-center space-x-4 p-4 border border-border rounded-lg">
                        <Skeleton className="w-12 h-12 rounded" />
                        <div className="flex-1 space-y-2">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-48" />
                        </div>
                        <Skeleton className="h-8 w-16" />
                      </div>
                    ))}
                  </div>
                ) : keys && keys.length > 0 ? (
                  <div className="space-y-4">
                    {keys.map((key) => (
                      <div
                        key={key.id}
                        className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                        data-testid={`key-item-${key.id}`}
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Key className="h-6 w-6 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium text-foreground" data-testid="text-key-id">
                              {key.keyId}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {(key.keyLength / 1024).toFixed(1)} KB • 
                              Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Expires {formatDistanceToNow(new Date(key.expiryTime), { addSuffix: true })}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-4">
                          <div className="text-right min-w-[100px]">
                            <p className="text-sm font-medium text-foreground">
                              {key.utilizationPercent}% used
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {key.consumedBytes} / {key.maxConsumptionBytes} bytes
                            </p>
                            <Progress 
                              value={key.utilizationPercent} 
                              className="h-1 w-20 mt-1"
                            />
                          </div>
                          
                          <Badge 
                            className={getKeyStatusColor(key)}
                            data-testid="badge-key-status"
                          >
                            {getKeyStatusText(key)}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Key className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-foreground mb-2">No quantum keys</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Request your first quantum key to start sending secure messages.
                    </p>
                    <Button onClick={() => handleRequestKey(8192)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Request First Key
                    </Button>
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