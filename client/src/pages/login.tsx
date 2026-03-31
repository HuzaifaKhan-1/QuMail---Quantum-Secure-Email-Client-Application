import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GoogleLogin } from '@react-oauth/google';
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Shield, Lock, Mail, ArrowRight, Info, UserPlus, LogIn, CheckCircle2, AlertTriangle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";

// Quantum Particle Animation Component
const QuantumBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particles: any[] = [];

    class Particle {
      x: number;
      y: number;
      size: number;
      speedX: number;
      speedY: number;
      color: string;

      constructor() {
        this.x = Math.random() * window.innerWidth;
        this.y = Math.random() * window.innerHeight;
        this.size = Math.random() * 2 + 0.5;
        this.speedX = Math.random() * 1 - 0.5;
        this.speedY = Math.random() * 1 - 0.5;
        this.color = `rgba(147, 51, 234, ${Math.random() * 0.5 + 0.2})`; // Purple
      }

      update() {
        this.x += this.speedX;
        this.y += this.speedY;

        if (this.x > window.innerWidth) this.x = 0;
        if (this.x < 0) this.x = window.innerWidth;
        if (this.y > window.innerHeight) this.y = 0;
        if (this.y < 0) this.y = window.innerHeight;
      }

      draw() {
        if (!ctx) return;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const init = () => {
      particles = [];
      for (let i = 0; i < 100; i++) {
        particles.push(new Particle());
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        particle.update();
        particle.draw();
      });

      // Draw connections
      ctx.strokeStyle = "rgba(147, 51, 234, 0.1)";
      ctx.lineWidth = 0.5;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 100) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      animationFrameId = requestAnimationFrame(animate);
    };

    const handleResize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{ background: "radial-gradient(circle at center, #0f172a 0%, #020617 100%)" }}
    />
  );
};

const Login: React.FC = () => {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const { toast } = useToast();

  const showAlert = (title: string, message: string, type: "success" | "error" = "success") => {
    toast({
      title,
      description: message,
      variant: type === "error" ? "destructive" : "default",
    });
  };

  // Redirect if already logged in
  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe(),
    retry: false,
  });

  useEffect(() => {
    if (userInfo?.user) {
      setLocation("/inbox");
    }
  }, [userInfo, setLocation]);

  const googleLoginMutation = useMutation({
    mutationFn: (credential: string) => api.googleLogin(credential),
    onSuccess: (data) => {
      if (data.user?.needsPassword) {
        setPendingUser(data.user);
        setShowSetPassword(true);
      } else {
        queryClient.setQueryData(["/api/auth/me"], { user: data.user });
        showAlert("Identity Verified", `Access granted for ${data.user.userSecureEmail}. Redirecting to secure inbox.`, "success");
        setTimeout(() => setLocation("/inbox"), 2000);
      }
    },
    onError: (error: any) => {
      showAlert("Authentication Failed", error.message || "Could not verify Google identity.", "error");
    },
  });

  const passwordLoginMutation = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], { user: data.user });
      showAlert("Access Unlocked", `Welcome back, ${data.user.username}. Quantum session established.`, "success");
      setTimeout(() => setLocation("/inbox"), 1500);
    },
    onError: (error: any) => {
      let message = error.message;
      if (message && (message.includes("validation") || message.includes("userSecureEmail"))) {
        message = "Required format: username@qumail.secure. If you're new, use the 'New Setup' tab.";
      }
      showAlert("Login Denied", message || "Invalid credentials.", "error");
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: () => api.setPassword(newPassword),
    onSuccess: () => {
      showAlert("Security Active", "Internal password set successfully. You can now use this for daily logins.", "success");
      setShowSetPassword(false);
      if (pendingUser) {
        queryClient.setQueryData(["/api/auth/me"], { user: pendingUser });
      }
      setTimeout(() => setLocation("/inbox"), 2000);
    },
    onError: (error: any) => {
      showAlert("Setup Failed", error.message || "Could not initialize password.", "error");
    },
  });

  const handlePasswordLogin = () => {
    if (!email.toLowerCase().endsWith("@qumail.secure")) {
      showAlert("Wrong Email Format", "Daily login is only for @qumail.secure addresses. New users should use the 'New Setup' tab.", "error");
      return;
    }
    passwordLoginMutation.mutate();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      <QuantumBackground />

      <div className="w-full max-w-md z-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4 border border-primary/20 backdrop-blur-sm animate-pulse">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-400 to-cyan-400">
            QuMail
          </h1>
          <p className="text-slate-400 font-medium tracking-[0.2em] uppercase text-[10px]">
            Quantum-Secure Identity Infrastructure
          </p>
        </div>

        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/80 border border-slate-800 p-1 rounded-xl backdrop-blur-md">
            <TabsTrigger value="daily" className="rounded-lg py-2.5 data-[state=active]:bg-primary/20 data-[state=active]:text-primary transition-all flex items-center gap-2">
              <LogIn className="h-4 w-4" />
              <span>Login</span>
            </TabsTrigger>
            <TabsTrigger value="verification" className="rounded-lg py-2.5 data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-400 transition-all flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              <span>New Setup</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="border-primary/20 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-50 transition-opacity pointer-events-none" />
              <CardHeader>
                <div className="flex items-center gap-2 text-primary mb-1 animate-pulse">
                  <LogIn className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">Returning User</span>
                </div>
                <CardTitle className="text-slate-200">Daily Login</CardTitle>
                <CardDescription className="text-slate-500 text-xs">Unlock your secure mailbox with your @qumail.secure ID</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="secureEmail" className="text-xs text-slate-400 uppercase tracking-widest font-bold">Secure ID</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="secureEmail"
                      placeholder="name@qumail.secure"
                      className={`pl-10 h-12 bg-slate-950/50 border-slate-800 text-slate-200 focus:border-primary/50 ${email && !email.toLowerCase().endsWith("@qumail.secure") ? "border-red-500/50" : ""}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass" className="text-xs text-slate-400 uppercase tracking-widest font-bold">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="pass"
                      type="password"
                      placeholder="••••••••"
                      className="pl-10 h-12 bg-slate-950/50 border-slate-800 text-slate-200 focus:border-primary/50"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold transition-all duration-300 shadow-[0_0_20px_rgba(147,51,234,0.3)]"
                  onClick={handlePasswordLogin}
                  disabled={passwordLoginMutation.isPending}
                >
                  {passwordLoginMutation.isPending ? "Decrypting..." : "Unlock Primary Mailbox"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <p className="text-[10px] text-slate-500 text-center">
                  Only for accounts ending in <strong>@qumail.secure</strong>
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verification" className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Card className="border-cyan-500/20 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-primary/5 opacity-50 transition-opacity pointer-events-none" />
              <CardHeader>
                <div className="flex items-center gap-2 text-cyan-400 mb-1">
                  <UserPlus className="h-4 w-4" />
                  <span className="text-[10px] font-bold uppercase tracking-widest">New Setup</span>
                </div>
                <CardTitle className="text-slate-200">Identity Initialization</CardTitle>
                <CardDescription className="text-slate-500 text-[11px]">Link your Google account to activate your Quantum ID</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 flex flex-col items-center">
                <div className="bg-slate-800/20 p-6 rounded-xl border border-slate-700/50 w-full space-y-4">
                  <div className="flex items-center gap-3 text-cyan-400">
                    <div className="p-2 bg-cyan-500/10 rounded-lg">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-tight">Identity Linking</p>
                      <p className="text-[10px] text-slate-500">Links your real ID to a Quantum ID</p>
                    </div>
                  </div>
                  <div className="flex justify-center p-3 bg-white rounded-lg shadow-inner">
                    <GoogleLogin
                      onSuccess={(credentialResponse) => {
                        if (credentialResponse.credential) {
                          googleLoginMutation.mutate(credentialResponse.credential);
                        }
                      }}
                      onError={() => showAlert("Google Error", "The authentication popup failed to initialize.", "error")}
                      useOneTap
                      theme="outline"
                      shape="pill"
                    />
                  </div>
                </div>
                <div className="space-y-2 text-center">
                  <p className="text-[10px] text-slate-400 font-medium">Use this if:</p>
                  <ul className="text-[9px] text-slate-500 space-y-1">
                    <li>• This is your first time using QuMail</li>
                    <li>• You need to recover your account via Google</li>
                    <li>• You haven't linked your Google account yet</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Dynamic Security Metrics */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "OTP", color: "from-primary to-purple-600" },
            { label: "AES-Q", color: "from-blue-500 to-indigo-600" },
            { label: "PQC", color: "from-cyan-400 to-blue-500" }
          ].map((item) => (
            <div key={item.label} className="bg-slate-900/40 p-2 rounded-lg border border-slate-800/50 flex flex-col items-center gap-2">
              <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full bg-gradient-to-r ${item.color} w-full animate-pulse`} />
              </div>
              <span className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Set Password Dialog */}
      <Dialog open={showSetPassword} onOpenChange={setShowSetPassword}>
        <DialogContent className="bg-slate-950 border-slate-800 text-slate-200 max-w-sm rounded-2xl">
          <DialogHeader>
            <div className="mx-auto p-3 bg-primary/10 rounded-full mb-4">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-2xl font-bold text-center">Finalize Setup</DialogTitle>
            <DialogDescription className="text-slate-400 text-center px-4">
              Identity verified. Now create your internal access password.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 bg-primary/5 border border-primary/20 rounded-xl space-y-1">
              <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Your Private Secure ID</p>
              <div className="flex items-center justify-between">
                <p className="text-sm font-mono text-primary font-bold">{pendingUser?.userSecureEmail}</p>
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pass" className="text-xs text-slate-400 font-bold uppercase">New Password</Label>
              <Input
                id="new-pass"
                type="password"
                className="bg-slate-900 border-slate-800 h-12"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pass" className="text-xs text-slate-400 font-bold uppercase">Confirm</Label>
              <Input
                id="confirm-pass"
                type="password"
                className="bg-slate-900 border-slate-800 h-12"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Match your password"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-bold"
              onClick={() => setPasswordMutation.mutate()}
              disabled={newPassword !== confirmPassword || newPassword.length < 8 || setPasswordMutation.isPending}
            >
              {setPasswordMutation.isPending ? "Generating..." : "Establish Hub Access"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;