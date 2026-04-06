import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, Loader2, RotateCcw, Scale } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface AiGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (subject: string, body: string) => void;
}

const TONES = ["Formal", "Casual", "Professional", "Friendly", "Apology", "Urgent"];

export default function AiGeneratorModal({ isOpen, onClose, onGenerate }: AiGeneratorModalProps) {
  const { toast } = useToast();
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("Professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<{ subject: string; body: string } | null>(null);

  const handleGenerate = async (modifier?: string) => {
    if (!context && !modifier) {
      toast({ title: "Context required", description: "Please provide some context.", variant: "destructive" });
      return;
    }

    setIsGenerating(true);
    let finalContext = context;
    if (modifier === "shorter" && lastGenerated) {
       finalContext = `Make this email shorter: ${lastGenerated.body}`;
    }

    try {
      const response = await fetch("/api/ai/generate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ context: finalContext, tone, details: "" }),
      });

      if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(errorBody.message || "Failed to generate email content");
      }

      const data = await response.json();
      setLastGenerated(data);
      onGenerate(data.subject, data.body);
      
      toast({ title: "Email Generated", description: "AI has successfully generated your draft." });
    } catch (error: any) {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md z-[100]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span>AI Email Generator</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="ai-context">What is this email about?</Label>
            <Textarea
              id="ai-context"
              placeholder="e.g., requesting a project update..."
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div className="space-y-2">
            <Label>Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select tone" />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[150] w-[--radix-select-trigger-width]">
                {TONES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-2 space-y-2">
            <Button 
              onClick={() => handleGenerate()} 
              disabled={isGenerating}
              className="w-full bg-primary hover:bg-primary/90 text-white"
            >
              {isGenerating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              {isGenerating ? "Generating..." : "Generate Email"}
            </Button>

            {lastGenerated && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => handleGenerate()} disabled={isGenerating}>
                  <RotateCcw className="mr-2 h-3 w-3" /> Regenerate
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleGenerate("shorter")} disabled={isGenerating}>
                  <Scale className="mr-2 h-3 w-3" /> Make Shorter
                </Button>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
