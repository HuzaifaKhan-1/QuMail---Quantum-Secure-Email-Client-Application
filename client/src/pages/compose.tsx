import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import Sidebar from "@/components/sidebar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import SecurityBadge from "@/components/security-badge";
import { 
  Send, 
  Shield, 
  Paperclip, 
  Save, 
  ArrowLeft,
  Upload,
  X,
  AlertCircle
} from "lucide-react";
import { SecurityLevel, type SendEmailRequest } from "@/lib/types";

interface AttachmentFile {
  file: File;
  id: string;
}

export default function Compose() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>(SecurityLevel.LEVEL1_OTP);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: userInfo } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: () => api.getMe()
  });

  const { data: keyPoolStats } = useQuery({
    queryKey: ["/api/keys/pool"],
    queryFn: () => api.getKeyPool(),
    refetchInterval: 30000
  });

  const sendEmailMutation = useMutation({
    mutationFn: (emailData: SendEmailRequest) => api.sendEmail(emailData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails"] });
      toast({
        title: "Email sent",
        description: "Your secure message has been sent successfully.",
      });
      setLocation("/inbox");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const newAttachments: AttachmentFile[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 10 * 1024 * 1024) { // 10MB limit
        toast({
          title: "File too large",
          description: `${file.name} is larger than 10MB limit.`,
          variant: "destructive",
        });
        continue;
      }
      newAttachments.push({
        file,
        id: `${Date.now()}-${i}`
      });
    }
    
    setAttachments(prev => [...prev, ...newAttachments]);
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(att => att.id !== id));
  };

  const handleSaveDraft = () => {
    // TODO: Implement save draft functionality
    toast({
      title: "Draft saved",
      description: "Your draft has been saved locally.",
    });
    console.log("Saving draft:", { to, subject, body, attachments: attachments.length });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!to || !subject || !body) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    // Convert attachments to base64
    const attachmentData = await Promise.all(
      attachments.map(async (att) => {
        const buffer = await att.file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        return {
          filename: att.file.name,
          content: base64,
          contentType: att.file.type
        };
      })
    );

    const emailData: SendEmailRequest = {
      to,
      subject,
      body,
      securityLevel,
      attachments: attachmentData.length > 0 ? attachmentData : undefined
    };

    sendEmailMutation.mutate(emailData);
  };

  const getSecurityLevelInfo = (level: SecurityLevel) => {
    switch (level) {
      case SecurityLevel.LEVEL1_OTP:
        return {
          name: "Level 1 - Quantum OTP",
          description: "One-Time Pad encryption using quantum keys (Highest Security)",
          warning: keyPoolStats && keyPoolStats.remainingMB < 10 ? "Low key pool - may fallback to Level 2" : null
        };
      case SecurityLevel.LEVEL2_AES:
        return {
          name: "Level 2 - Quantum-seeded AES-GCM",
          description: "AES-256-GCM with quantum-derived keys",
          warning: null
        };
      case SecurityLevel.LEVEL3_PQC:
        return {
          name: "Level 3 - CRYSTALS-Kyber PQC",
          description: "Post-Quantum Cryptography with CRYSTALS-Kyber KEM",
          warning: null
        };
      case SecurityLevel.LEVEL4_PLAIN:
        return {
          name: "Level 4 - Plain Text",
          description: "No encryption (not recommended)",
          warning: "This option provides no security protection"
        };
    }
  };

  const securityInfo = getSecurityLevelInfo(securityLevel);

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
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/inbox")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Inbox
              </Button>
              <div>
                <h2 className="text-2xl font-semibold text-foreground">Compose Secure Email</h2>
                <p className="text-sm text-muted-foreground">Send encrypted messages with quantum security</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <SecurityBadge level={securityLevel} />
              {keyPoolStats && (
                <div className="text-xs text-muted-foreground">
                  Key pool: {keyPoolStats.remainingMB} MB available
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Compose Form */}
        <div className="flex-1 p-6 overflow-y-auto">
          <Card className="max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>New Message</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSend} className="space-y-6">
                {/* Recipients */}
                <div className="grid grid-cols-12 gap-4">
                  <Label htmlFor="to" className="col-span-1 text-sm font-medium pt-2">
                    To:
                  </Label>
                  <Input
                    id="to"
                    type="email"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="recipient@example.com"
                    className="col-span-11"
                    required
                    data-testid="input-to"
                  />
                </div>

                {/* Subject */}
                <div className="grid grid-cols-12 gap-4">
                  <Label htmlFor="subject" className="col-span-1 text-sm font-medium pt-2">
                    Subject:
                  </Label>
                  <Input
                    id="subject"
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Email subject..."
                    className="col-span-11"
                    required
                    data-testid="input-subject"
                  />
                </div>

                {/* Security Level */}
                <div className="grid grid-cols-12 gap-4">
                  <Label className="col-span-1 text-sm font-medium pt-2">
                    Security:
                  </Label>
                  <div className="col-span-11 space-y-2">
                    <Select 
                      value={securityLevel} 
                      onValueChange={(value: SecurityLevel) => setSecurityLevel(value)}
                    >
                      <SelectTrigger data-testid="select-security-level">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={SecurityLevel.LEVEL1_OTP}>Level 1 - Quantum OTP (Highest Security)</SelectItem>
                        <SelectItem value={SecurityLevel.LEVEL2_AES}>Level 2 - Quantum-seeded AES-GCM</SelectItem>
                        <SelectItem value={SecurityLevel.LEVEL3_PQC}>Level 3 - CRYSTALS-Kyber PQC</SelectItem>
                        <SelectItem value={SecurityLevel.LEVEL4_PLAIN}>Level 4 - Plain Text</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <div className="text-xs text-muted-foreground">
                      {securityInfo.description}
                    </div>
                    
                    {securityInfo.warning && (
                      <div className="flex items-center space-x-2 p-2 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-md">
                        <AlertCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-xs text-amber-700 dark:text-amber-300">
                          {securityInfo.warning}
                        </span>
                      </div>
                    )}

                    {keyPoolStats && securityLevel === SecurityLevel.LEVEL1_OTP && (
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Available quantum keys:</span>
                          <span>{keyPoolStats.remainingMB} MB</span>
                        </div>
                        <Progress 
                          value={100 - keyPoolStats.utilizationPercent} 
                          className="h-1"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Message Body */}
                <div className="grid grid-cols-12 gap-4">
                  <Label htmlFor="body" className="col-span-1 text-sm font-medium pt-2">
                    Message:
                  </Label>
                  <Textarea
                    id="body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Compose your secure message..."
                    className="col-span-11 min-h-[200px] resize-none"
                    required
                    data-testid="textarea-body"
                  />
                </div>

                {/* Attachments */}
                <div className="grid grid-cols-12 gap-4">
                  <Label className="col-span-1 text-sm font-medium pt-2">
                    Attachments:
                  </Label>
                  <div className="col-span-11 space-y-4">
                    <div className="border-2 border-dashed border-border rounded-lg p-6 text-center relative">
                      <div className="space-y-2">
                        <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
                        <p className="text-sm text-muted-foreground">Drag files here or click to browse</p>
                        <p className="text-xs text-muted-foreground">Max file size: 10MB</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        onChange={handleFileUpload}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        data-testid="input-file"
                        style={{ pointerEvents: 'all' }}
                      />
                    </div>

                    {/* Attachment List */}
                    {attachments.length > 0 && (
                      <div className="space-y-2">
                        {attachments.map((attachment) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-3 bg-muted rounded-md"
                          >
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                                <Paperclip className="h-4 w-4 text-primary" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">{attachment.file.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {(attachment.file.size / 1024).toFixed(1)} KB
                                </p>
                              </div>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeAttachment(attachment.id)}
                              data-testid={`button-remove-attachment-${attachment.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-6 border-t border-border">
                  <div className="flex items-center space-x-4">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-attach-files"
                    >
                      <Paperclip className="h-4 w-4 mr-1" />
                      Attach Files
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleSaveDraft}
                      data-testid="button-save-draft"
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Save Draft
                    </Button>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLocation("/inbox")}
                      data-testid="button-cancel"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={sendEmailMutation.isPending}
                      className="flex items-center space-x-2"
                      data-testid="button-send"
                    >
                      <Shield className="h-4 w-4" />
                      <span>
                        {sendEmailMutation.isPending ? "Sending..." : "Send Securely"}
                      </span>
                    </Button>
                  </div>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
