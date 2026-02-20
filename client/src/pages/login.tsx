import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GoogleLogin } from '@react-oauth/google';
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Shield, Lock, Mail, ArrowRight, Info } from "lucide-react";
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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [pendingUser, setPendingUser] = useState<any>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Redirect if already logged in
  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe(),
    retry: false,
  });

  useEffect(() => {
    if (userInfo?.user) {
      if (userInfo.user.needsPassword) {
        setPendingUser(userInfo.user);
        setShowSetPassword(true);
      } else {
        setLocation("/inbox");
      }
    }
  }, [userInfo, setLocation]);

  const googleLoginMutation = useMutation({
    mutationFn: (credential: string) => api.googleLogin(credential),
    onSuccess: (data) => {
      // Check if the user object inside the response says a password is required
      if (data.user?.needsPassword) {
        setPendingUser(data.user);
        setShowSetPassword(true);
      } else {
        queryClient.setQueryData(["/api/auth/me"], { user: data.user });
        toast({
          title: "Welcome to QuMail",
          description: `Authenticated as ${data.user.userSecureEmail}`,
        });
        setLocation("/inbox");
      }
    },
    onError: (error: any) => {
      toast({
        title: "Authentication Failed",
        description: error.message || "Could not sign in with Google",
        variant: "destructive",
      });
    },
  });

  const passwordLoginMutation = useMutation({
    mutationFn: () => api.login(email, password),
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], { user: data.user });
      toast({
        title: "Secure Access Granted",
        description: `Welcome back, ${data.user.username}`,
      });
      setLocation("/inbox");
    },
    onError: (error: any) => {
      // Handle Zod/Validation errors gracefully for UI
      let message = error.message;
      if (message && (message.includes("validation") || message.includes("userSecureEmail"))) {
        message = "Daily Login required a valid @qumail.secure address. Please use the Identity Check tab for Gmail/OAuth.";
      }

      toast({
        title: "Login Failed",
        description: message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const setPasswordMutation = useMutation({
    mutationFn: () => api.setPassword(newPassword),
    onSuccess: () => {
      toast({
        title: "Security Initialized",
        description: "Your secure password has been set. You can now use it for daily logins.",
      });
      setShowSetPassword(false);
      if (pendingUser) {
        queryClient.setQueryData(["/api/auth/me"], { user: pendingUser });
      }
      setLocation("/inbox");
    },
    onError: (error: any) => {
      toast({
        title: "Setup Failed",
        description: error.message || "Could not set password",
        variant: "destructive",
      });
    },
  });

  const handlePasswordLogin = () => {
    if (!email.toLowerCase().endsWith("@qumail.secure")) {
      toast({
        title: "Invalid Email Type",
        description: "Daily login is only for @qumail.secure addresses. Use the 'Identity Check' tab for Google login.",
        variant: "destructive",
      });
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
          <h1 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
            QuMail
          </h1>
          <p className="text-slate-400 font-medium tracking-wide">
            Quantum-Secure Hybrid Identity Hub
          </p>
        </div>

        <Tabs defaultValue="daily" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-900/50 border border-slate-800 backdrop-blur-sm">
            <TabsTrigger value="daily" className="data-[state=active]:bg-primary/20">Daily Login</TabsTrigger>
            <TabsTrigger value="verification" className="data-[state=active]:bg-primary/20">Identity Check</TabsTrigger>
          </TabsList>

          <TabsContent value="daily">
            <Card className="border-primary/20 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-50 transition-opacity pointer-events-none" />
              <CardHeader>
                <CardTitle className="text-slate-200">Secure Access Terminal</CardTitle>
                <CardDescription className="text-slate-500">Log in with your assigned @qumail.secure ID</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert className="bg-slate-950/50 border-primary/20 p-2 py-1 mb-2">
                  <Info className="h-3 w-3 text-primary" />
                  <AlertDescription className="text-[10px] text-slate-400">
                    Don't have a @qumail.secure ID? Use the <strong>Identity Check</strong> tab first.
                  </AlertDescription>
                </Alert>

                <div className="space-y-2">
                  <Label htmlFor="secureEmail" className="text-slate-400">Secure Email ID</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="secureEmail"
                      placeholder="username@qumail.secure"
                      className={`pl-10 bg-slate-950/50 border-slate-800 text-slate-200 focus:border-primary/50 ${email && !email.toLowerCase().endsWith("@qumail.secure") ? "border-red-500/50" : ""}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                  {email && !email.toLowerCase().endsWith("@qumail.secure") && (
                    <p className="text-[10px] text-red-400 font-medium animate-in fade-in slide-in-from-top-1">
                      Must end with @qumail.secure
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pass" className="text-slate-400">Secure Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                    <Input
                      id="pass"
                      type="password"
                      className="pl-10 bg-slate-950/50 border-slate-800 text-slate-200 focus:border-primary/50"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-white transition-all duration-300"
                  onClick={handlePasswordLogin}
                  disabled={passwordLoginMutation.isPending}
                >
                  {passwordLoginMutation.isPending ? "Decrypting Session..." : "Unlock Primary Mailbox"}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="verification">
            <Card className="border-primary/20 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-50 transition-opacity pointer-events-none" />
              <CardHeader>
                <CardTitle className="text-slate-200">Identity Verification</CardTitle>
                <CardDescription className="text-slate-500">Google OAuth verification for initialization or recovery</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6 flex flex-col items-center">
                <div className="bg-slate-800/20 p-4 rounded-lg border border-slate-700/50 w-full">
                  <p className="text-xs text-slate-400 mb-4 text-center"> Use your Google account to verify your primary identity and link your secure mailbox.</p>
                  <div className="flex justify-center p-2 bg-white rounded-md">
                    <GoogleLogin
                      onSuccess={(credentialResponse) => {
                        if (credentialResponse.credential) {
                          googleLoginMutation.mutate(credentialResponse.credential);
                        }
                      }}
                      onError={() => {
                        toast({
                          title: "Google Login Error",
                          description: "The Google authentication popup failed to initialize.",
                          variant: "destructive",
                        });
                      }}
                      useOneTap
                      theme="outline"
                      shape="pill"
                    />
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 text-center uppercase tracking-widest font-bold">
                  Recommended for initial setup & account linkage
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Security Info Grid */}
        <div className="grid grid-cols-3 gap-2 py-2">
          {[
            { label: "BB84 OTP", color: "bg-primary" },
            { label: "AES-256-Q", color: "bg-purple-500" },
            { label: "Kyber PQC", color: "bg-cyan-500" }
          ].map((item, i) => (
            <div key={item.label} className="flex flex-col items-center gap-1">
              <div className={`w-full h-1 ${item.color}/30 rounded-full overflow-hidden`}>
                <div className={`h-full ${item.color} w-full animate-progress`} style={{ animationDelay: `${i * 100}ms` }} />
              </div>
              <span className="text-[8px] text-slate-500 font-bold uppercase">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="text-center text-slate-500 text-xs">
          <p>© 2025 QuMail Quantum Security Systems</p>
          <p className="mt-1">All encryption bound to internal verified secure identity.</p>
        </div>
      </div>

      {/* Set Password Dialog */}
      <Dialog open={showSetPassword} onOpenChange={setShowSetPassword}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-200">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-primary">Initialize Access Key</DialogTitle>
            <DialogDescription className="text-slate-400">
              Your identity is verified. Now create a secure password for your internal QuMail mailbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
              <p className="text-xs text-slate-400">Your Secure ID is:</p>
              <p className="text-sm font-mono text-primary font-bold">{pendingUser?.userSecureEmail}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-pass" className="text-slate-400">New Secure Password</Label>
              <Input
                id="new-pass"
                type="password"
                className="bg-slate-950/50 border-slate-800"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-pass" className="text-slate-400">Confirm Password</Label>
              <Input
                id="confirm-pass"
                type="password"
                className="bg-slate-950/50 border-slate-800"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              className="w-full bg-primary"
              onClick={() => setPasswordMutation.mutate()}
              disabled={newPassword !== confirmPassword || newPassword.length < 8 || setPasswordMutation.isPending}
            >
              {setPasswordMutation.isPending ? "Generating Cryptographic Hub..." : "Complete Setup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Login;