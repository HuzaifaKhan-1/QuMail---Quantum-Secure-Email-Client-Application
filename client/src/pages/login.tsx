import React, { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { GoogleLogin } from '@react-oauth/google';
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Shield, Lock } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// Quantum Particle Animation Component
const QuantumBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let particles: Particle[] = [];

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
      queryClient.setQueryData(["/api/auth/me"], { user: data.user });
      toast({
        title: "Welcome to QuMail",
        description: `Authenticated as ${data.user.secureEmail}`,
      });
      setLocation("/inbox");
    },
    onError: (error: any) => {
      toast({
        title: "Authentication Failed",
        description: error.message || "Could not sign in with Google",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-slate-950">
      <QuantumBackground />

      <div className="w-full max-w-md z-10 space-y-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center p-3 bg-primary/10 rounded-2xl mb-4 border border-primary/20 backdrop-blur-sm animate-pulse">
            <Shield className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-white bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-400">
            QuMail Portal
          </h1>
          <p className="text-slate-400 font-medium tracking-wide">
            Quantum-Secure Decoupled Identity Hub
          </p>
        </div>

        <Card className="border-primary/20 bg-slate-900/60 backdrop-blur-xl shadow-2xl relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-purple-500/5 opacity-50 group-hover:opacity-80 transition-opacity pointer-events-none" />

          <CardHeader className="text-center pb-2 relative">
            <CardTitle className="text-xl text-slate-200">Secure Access Terminal</CardTitle>
          </CardHeader>

          <CardContent className="space-y-6 pt-4 relative">
            <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50 space-y-4">
              <div className="flex items-center gap-3 text-slate-300 text-sm mb-2">
                <Lock className="h-4 w-4 text-primary" />
                <span>Verified Hybrid Identity Implementation</span>
              </div>

              <div className="flex flex-col items-center justify-center py-4 bg-slate-950/40 rounded-lg border border-primary/10 shadow-inner">
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
                  theme="filled_blue"
                  shape="pill"
                  text="continue_with"
                />
              </div>

              <div className="text-[10px] text-slate-500 text-center uppercase tracking-widest mt-4 font-bold">
                Protects against identity spoofing & MITM
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 py-2">
              <div className="flex flex-col items-center gap-1">
                <div className="w-full h-1 bg-primary/30 rounded-full overflow-hidden">
                  <div className="h-full bg-primary w-full animate-progress" />
                </div>
                <span className="text-[8px] text-slate-500 font-bold uppercase">BB84 OTP</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-full h-1 bg-purple-500/30 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 w-full animate-progress delay-75" />
                </div>
                <span className="text-[8px] text-slate-500 font-bold uppercase">AES-256-Q</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <div className="w-full h-1 bg-cyan-500/30 rounded-full overflow-hidden">
                  <div className="h-full bg-cyan-500 w-full animate-progress delay-150" />
                </div>
                <span className="text-[8px] text-slate-500 font-bold uppercase">Kyber PQC</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center text-slate-500 text-xs">
          <p>© 2025 QuMail Quantum Security Systems</p>
          <p className="mt-1">All encryption bound to internal verified secure identity.</p>
        </div>
      </div>
    </div>
  );
};

export default Login;