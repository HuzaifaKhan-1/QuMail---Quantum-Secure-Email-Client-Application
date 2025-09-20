import { Route, Switch, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { api } from "@/lib/api";
import Login from "@/pages/login";
import Inbox from "@/pages/inbox";
import Compose from "@/pages/compose";
import KeyDashboard from "@/pages/key-dashboard";
import Settings from "@/pages/settings";
import Audit from "@/pages/audit";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  const { data: userInfo, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe(),
    retry: false,
    staleTime: 0
  });

  useEffect(() => {
    if (!isLoading && (!userInfo?.user || error)) {
      setLocation("/login");
    }
  }, [userInfo, isLoading, error, setLocation]);

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>;
  }

  if (!userInfo?.user || error) {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/inbox">
        <ProtectedRoute component={Inbox} />
      </Route>
      <Route path="/compose">
        <ProtectedRoute component={Compose} />
      </Route>
      <Route path="/keys">
        <ProtectedRoute component={KeyDashboard} />
      </Route>
      <Route path="/settings">
        <ProtectedRoute component={Settings} />
      </Route>
      <Route path="/audit">
        <ProtectedRoute component={Audit} />
      </Route>
      <Route path="/sent">
        <ProtectedRoute component={Inbox} />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [location, setLocation] = useLocation();

  useEffect(() => {
    // Redirect to login if on root path
    if (location === "/") {
      setLocation("/login");
    }
  }, [location, setLocation]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background">
        <Switch>
          <Route path="/login" component={Login} />
          <Route path="/inbox" component={Inbox} />
          <Route path="/compose" component={Compose} />
          <Route path="/keys" component={KeyDashboard} />
          <Route path="/settings" component={Settings} />
          <Route path="/audit" component={Audit} />
          <Route path="/sent" component={Inbox} />
          <Route path="/" component={Login} />
          <Route component={NotFound} />
        </Switch>
        <Toaster />
      </div>
    </QueryClientProvider>
  );
}

export default App;