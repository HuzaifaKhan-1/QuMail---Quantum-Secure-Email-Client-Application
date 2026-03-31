import { Route, Switch, useLocation } from "wouter";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { GoogleOAuthProvider } from '@react-oauth/google';
import { api } from "@/lib/api";
import Login from "@/pages/login";
import Inbox from "@/pages/inbox";
import Compose from "@/pages/compose";
import KeyDashboard from "@/pages/key-dashboard";
import Settings from "@/pages/settings";
import Audit from "@/pages/audit";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient();

// Use a placeholder client ID if not provided in environment
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

if (!GOOGLE_CLIENT_ID) {
  console.warn("VITE_GOOGLE_CLIENT_ID is not defined in the environment. Google Login will fail.");
}

function QuantumLoading() {
  const [msg, setMsg] = useState("Initializing QKDP Node...");

  useEffect(() => {
    const statuses = [
      "Initializing QKDP Node...",
      "Calibrating Laser Polarization...",
      "Establishing Quantum Tunneling...",
      "Verifying Entangled Pair ID...",
      "Synchronizing PQC Keyframes...",
      "Awaiting BB84 Verification..."
    ];
    let i = 0;
    const interval = setInterval(() => {
      setMsg(statuses[++i % statuses.length]);
    }, 1200);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center relative overflow-hidden">
      {/* Dynamic Background */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(147,51,234,0.1)_0%,_transparent_70%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(rgba(147,51,234,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.05)_1px,transparent_1px)] bg-[size:100px_100px] [perspective:1000px] [transform:rotateX(60deg)_translateZ(-200px)] opacity-20" />

      <div className="z-10 flex flex-col items-center">
        {/* Holographic Core */}
        <div className="relative w-48 h-48 mb-8 scale-75 md:scale-100">
          <div className="absolute inset-0 border-4 border-primary/20 rounded-full animate-[spin_8s_linear_infinite]" />
          <div className="absolute inset-2 border-2 border-dashed border-cyan-500/30 rounded-full animate-[spin_12s_linear_infinite_reverse]" />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 bg-primary/40 rounded-full blur-2xl animate-pulse" />
            <div className="absolute w-12 h-12 border-2 border-primary rounded-lg animate-[spin_4s_ease-in-out_infinite]" />
            <div className="absolute w-8 h-8 border-2 border-cyan-400 rounded-lg animate-[spin_6s_ease-in-out_infinite_reverse]" />
          </div>
        </div>

        <div className="text-center space-y-4">
          <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-400 to-cyan-400 tracking-tighter uppercase italic">
            QuMail
          </h1>
          <div className="flex flex-col items-center gap-2">
            <div className="h-[2px] w-48 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-primary to-cyan-400 w-full animate-[progress_2s_ease-in-out_infinite]" />
            </div>
            <p className="text-[10px] font-mono text-primary uppercase tracking-[0.4em] animate-pulse h-4">
              {msg}
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  );
}

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [location, setLocation] = useLocation();
  const [showLoader, setShowLoader] = useState(false);

  const { data: userInfo, isLoading, error } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe(),
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache auth for 5 minutes
  });

  // Only show the heavy loader if loading takes more than 600ms
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading) {
      timer = setTimeout(() => setShowLoader(true), 600);
    } else {
      setShowLoader(false);
    }
    return () => clearTimeout(timer);
  }, [isLoading]);

  useEffect(() => {
    // Only redirect once we're sure the user isn't logged in
    if (!isLoading && (!userInfo?.user || error)) {
      setLocation("/login");
    }
  }, [userInfo, isLoading, error, setLocation]);

  if (isLoading && showLoader) {
    return <QuantumLoading />;
  }

  // If loading is fast, don't show the full screen loader, just wait a few ms for content
  if (isLoading) {
    return null;
  }

  if (!userInfo?.user || error) {
    return null;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
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
      <Route path="/">
        <RedirectToLogin />
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function RedirectToLogin() {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation("/login");
  }, [setLocation]);
  return null;
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-background">
          <Router />
          <Toaster />
        </div>
      </QueryClientProvider>
    </GoogleOAuthProvider>
  );
}

export default App;
