import React, { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Mail } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

// Quantum Particle Animation Component
const QuantumParticles = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Particle class
    class QuantumParticle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      size: number;
      opacity: number;
      color: string;
      energy: number;
      phase: number;

      constructor() {
        this.x = Math.random() * canvas.width;
        this.y = Math.random() * canvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 3 + 1;
        this.opacity = Math.random() * 0.6 + 0.2;
        this.energy = Math.random() * 100;
        this.phase = Math.random() * Math.PI * 2;
        
        // Quantum-themed colors
        const colors = [
          'rgba(59, 130, 246, ', // Blue
          'rgba(139, 92, 246, ', // Purple  
          'rgba(6, 182, 212, ',  // Cyan
          'rgba(34, 197, 94, ',  // Green
          'rgba(168, 85, 247, ', // Violet
        ];
        this.color = colors[Math.floor(Math.random() * colors.length)];
      }

      update() {
        // Quantum tunneling effect - particles can suddenly change direction
        if (Math.random() < 0.001) {
          this.vx = (Math.random() - 0.5) * 0.8;
          this.vy = (Math.random() - 0.5) * 0.8;
        }

        // Wave function behavior
        this.phase += 0.02;
        this.x += this.vx + Math.sin(this.phase) * 0.1;
        this.y += this.vy + Math.cos(this.phase) * 0.1;

        // Energy fluctuation
        this.energy += (Math.random() - 0.5) * 2;
        this.energy = Math.max(0, Math.min(100, this.energy));
        
        // Opacity based on energy
        this.opacity = 0.2 + (this.energy / 100) * 0.6;

        // Wrap around edges
        if (this.x < 0) this.x = canvas.width;
        if (this.x > canvas.width) this.x = 0;
        if (this.y < 0) this.y = canvas.height;
        if (this.y > canvas.height) this.y = 0;
      }

      draw() {
        ctx.save();
        
        // Quantum glow effect
        const gradient = ctx.createRadialGradient(
          this.x, this.y, 0,
          this.x, this.y, this.size * 3
        );
        gradient.addColorStop(0, this.color + this.opacity + ')');
        gradient.addColorStop(0.5, this.color + (this.opacity * 0.5) + ')');
        gradient.addColorStop(1, this.color + '0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
        ctx.fill();

        // Core particle
        ctx.fillStyle = this.color + this.opacity + ')';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }
    }

    // Create particles
    const particles: QuantumParticle[] = [];
    const particleCount = Math.min(150, Math.floor((canvas.width * canvas.height) / 8000));
    
    for (let i = 0; i < particleCount; i++) {
      particles.push(new QuantumParticle());
    }

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < 120) {
            const opacity = (1 - distance / 120) * 0.1;
            ctx.strokeStyle = `rgba(59, 130, 246, ${opacity})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Update and draw particles
      particles.forEach(particle => {
        particle.update();
        particle.draw();
      });

      requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-0 pointer-events-none"
      style={{ background: 'transparent' }}
    />
  );
};

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isLogin, setIsLogin] = useState(true);

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");


  // Check if already logged in
  const { data: userInfo, isLoading } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe(),
    retry: false,
    staleTime: 0, // Always check for fresh data
    gcTime: 0 // Don't cache the result
  });

  // Use useEffect to handle redirection to avoid hooks order issues
  React.useEffect(() => {
    if (userInfo?.user && !isLoading) {
      setLocation("/inbox");
    }
  }, [userInfo, isLoading, setLocation]);

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.login(credentials),
    onSuccess: () => {
      toast({
        title: "Login successful",
        description: "Welcome to QuMail!",
      });
      setLocation("/inbox");
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    }
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: { username: string; email: string; password: string }) => {
      return api.register(userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation("/inbox");
      toast({
        title: "Account created",
        description: "Welcome to QuMail! Your secure internal email platform.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate(loginForm);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) {
      toast({
        title: "Missing fields",
        description: "Please fill in all fields.",
        variant: "destructive",
      });
      return;
    }
    registerMutation.mutate({ username, email, password });
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      {/* Quantum particle background */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-blue-950 to-purple-950 dark:from-slate-950 dark:via-blue-950 dark:to-purple-950"></div>
      <QuantumParticles />
      
      {/* Quantum grid overlay */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0" style={{
          backgroundImage: `
            linear-gradient(rgba(59, 130, 246, 0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(59, 130, 246, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px'
        }}></div>
      </div>

      {/* Animated quantum text */}
      <div className="absolute top-10 left-1/2 transform -translate-x-1/2 z-10">
        <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-purple-400 to-cyan-400 animate-pulse">
          QUANTUM
        </div>
        <div className="text-center text-sm text-blue-300/70 mt-2 tracking-widest">
          SECURE • ENCRYPTED • PROTECTED
        </div>
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/50 animate-pulse">
              <Shield className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-white">QuMail</h1>
              <p className="text-sm text-blue-300">Quantum Secure Email</p>
            </div>
          </div>
          <p className="text-sm text-blue-200/80">
            Secure your communications with quantum encryption
          </p>
        </div>

        <Card className="backdrop-blur-xl bg-black/20 border-blue-500/30 shadow-2xl shadow-blue-500/20">
          <CardHeader>
            <CardTitle className="text-center text-white">
              {isLogin ? "Sign In" : "Create Account"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={isLogin ? "login" : "register"} onValueChange={(value) => setIsLogin(value === "login")}>
              <TabsList className="grid w-full grid-cols-2 bg-black/30 border-blue-500/50">
                <TabsTrigger value="login" data-testid="tab-login" className="text-blue-200 data-[state=active]:bg-blue-600/50 data-[state=active]:text-white">Sign In</TabsTrigger>
                <TabsTrigger value="register" data-testid="tab-register" className="text-blue-200 data-[state=active]:bg-blue-600/50 data-[state=active]:text-white">Sign Up</TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-blue-200">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      placeholder="your.email@example.com"
                      required
                      data-testid="input-email"
                      className="bg-black/30 border-blue-500/50 text-white placeholder:text-blue-300/50 focus:border-blue-400 focus:ring-blue-400/30"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-blue-200">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      placeholder="••••••••"
                      required
                      data-testid="input-password"
                      className="bg-black/30 border-blue-500/50 text-white placeholder:text-blue-300/50 focus:border-blue-400 focus:ring-blue-400/30"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white border-0 shadow-lg shadow-blue-500/30"
                    disabled={loginMutation.isPending}
                    data-testid="button-login"
                  >
                    {loginMutation.isPending ? "Signing In..." : "Sign In"}
                    <Mail className="ml-2 h-4 w-4" />
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="register">
                  <form onSubmit={handleRegister} className="space-y-4">
                    <div>
                      <Label htmlFor="username" className="text-blue-200">Username</Label>
                      <Input
                        id="username"
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        required
                        data-testid="input-username"
                        className="bg-black/30 border-blue-500/50 text-white placeholder:text-blue-300/50 focus:border-blue-400 focus:ring-blue-400/30"
                      />
                    </div>
                    <div>
                      <Label htmlFor="register-email" className="text-blue-200">Email Address</Label>
                      <Input
                        id="register-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@qumail.com"
                        required
                        data-testid="input-register-email"
                        className="bg-black/30 border-blue-500/50 text-white placeholder:text-blue-300/50 focus:border-blue-400 focus:ring-blue-400/30"
                      />
                      <p className="text-xs text-blue-300/70 mt-1">
                        This will be your QuMail address for secure internal communication
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="register-password" className="text-blue-200">Password</Label>
                      <Input
                        id="register-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        data-testid="input-register-password"
                        className="bg-black/30 border-blue-500/50 text-white placeholder:text-blue-300/50 focus:border-blue-400 focus:ring-blue-400/30"
                      />
                    </div>
                    <Button
                      type="submit"
                      className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white border-0 shadow-lg shadow-purple-500/30"
                      disabled={registerMutation.isPending}
                      data-testid="button-register"
                    >
                      {registerMutation.isPending ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Creating Account...
                        </>
                      ) : (
                        "Create Account"
                      )}
                    </Button>
                  </form>
                </TabsContent>

            </Tabs>

            <div className="mt-6 p-4 bg-black/20 border border-blue-500/30 rounded-lg backdrop-blur-sm">
              <div className="flex items-center space-x-2 mb-2">
                <Shield className="h-4 w-4 text-blue-400" />
                <span className="text-sm font-medium text-blue-200">Quantum Security Features</span>
              </div>
              <ul className="text-xs text-blue-300/80 space-y-1">
                <li>• Quantum Key Distribution (QKD) simulation</li>
                <li>• One-Time Pad encryption for maximum security</li>
                <li>• Post-Quantum Cryptography readiness</li>
                <li>• End-to-end encrypted communication</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}