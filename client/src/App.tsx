import { Route, Switch, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import Login from "@/pages/login";
import Inbox from "@/pages/inbox";
import Compose from "@/pages/compose";
import KeyDashboard from "@/pages/key-dashboard";
import Settings from "@/pages/settings";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Login} />
      <Route path="/login" component={Login} />
      <Route path="/inbox" component={Inbox} />
      <Route path="/compose" component={Compose} />
      <Route path="/keys" component={KeyDashboard} />
      <Route path="/settings" component={Settings} />
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