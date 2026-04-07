import { useState } from "react";
import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import SecurityBadge from "./security-badge";
import AiGeneratorModal from "./ai-generator-modal";
import {
  Send,
  Shield,
  Paperclip,
  Save,
  X,
  Upload,
  AlertCircle,
  Sparkles
} from "lucide-react";
import { SecurityLevel, type SendEmailRequest, type Message } from "@/lib/types";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyData?: {
    type: 'reply' | 'reply-all' | 'forward' | 'edit-draft' | null;
    message: Message | null;
  };
}

interface AttachmentFile {
  file: File;
  id: string;
}

export default function ComposeModal({ isOpen, onClose, replyData }: ComposeModalProps) {
  const { toast } = useToast();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [securityLevel, setSecurityLevel] = useState<SecurityLevel>(SecurityLevel.LEVEL1_OTP);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);

  // Effect to populate fields based on reply data
  React.useEffect(() => {
    if (replyData?.type && replyData?.message) {
      const { type, message } = replyData;

      switch (type) {
        case 'reply':
          setTo(message.from);
          setSubject(message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`);
          setBody(`\n\n--- Original Message ---\nFrom: ${message.from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.body}`);
          break;

        case 'reply-all':
          // For reply-all, we'd need to include CC recipients if they exist
          setTo(message.from);
          setSubject(message.subject.startsWith('Re: ') ? message.subject : `Re: ${message.subject}`);
          setBody(`\n\n--- Original Message ---\nFrom: ${message.from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.body}`);
          break;

        case 'forward':
          setTo("");
          setSubject(message.subject.startsWith('Fwd: ') ? message.subject : `Fwd: ${message.subject}`);
          setBody(`\n\n--- Forwarded Message ---\nFrom: ${message.from}\nTo: ${message.to}\nSubject: ${message.subject}\nDate: ${new Date(message.receivedAt).toLocaleString()}\n\n${message.body}`);
          break;

        case 'edit-draft':
          setTo(message.to);
          setSubject(message.subject);
          setBody(message.body || "");
          setSecurityLevel(message.securityLevel as SecurityLevel);
          // If the draft has attachments, we'd ideally load them here too
          break;
      }
    }
  }, [replyData]);

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
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send email",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  });

  const saveDraftMutation = useMutation({
    mutationFn: (emailData: Partial<SendEmailRequest>) => api.saveDraft(emailData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/emails", "drafts"] });
      toast({
        title: "Draft saved",
        description: "Your draft has been saved to the Drafts folder.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save draft",
        description: error.message || "Please try again.",
        variant: "destructive",
      });
    }
  });

  const handleClose = () => {
    setTo("");
    setSubject("");
    setBody("");
    setSecurityLevel(SecurityLevel.LEVEL1_OTP);
    setAttachments([]);
    onClose();
  };

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

  const handleSaveDraft = async () => {
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

    const emailData: Partial<SendEmailRequest> = {
      to: to.toLowerCase(),
      subject,
      body,
      securityLevel,
      attachments: attachmentData.length > 0 ? attachmentData : undefined
    };

    saveDraftMutation.mutate(emailData);
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
      to: to.toLowerCase(),
      subject,
      body,
      securityLevel,
      attachments: attachmentData.length > 0 ? attachmentData : undefined
    };

    sendEmailMutation.mutate(emailData);
  };

  const handleAiGenerate = (generatedSubject: string, generatedBody: string) => {
    setSubject(generatedSubject);
    setBody(generatedBody);
  };

  const getSecurityLevelInfo = (level: SecurityLevel) => {
    switch (level) {
      case SecurityLevel.LEVEL1_OTP:
        return {
          name: "Level 1 - Top Secret (Read Once)",
          description: "One-Time Pad encryption using quantum keys (Highest Security)",
          warning: keyPoolStats && keyPoolStats.remainingMB < 10 ? "Low key pool - may fallback to Level 2" : null
        };
      case SecurityLevel.LEVEL2_AES:
        return {
          name: "Level 2 - Secure Communication",
          description: "AES-256-GCM with quantum-derived keys",
          warning: null
        };
      case SecurityLevel.LEVEL3_PQC:
        return {
          name: "Level 3 - Future-Proof Security",
          description: "Post-Quantum Cryptography with CRYSTALS-Kyber KEM",
          warning: null
        };
      case SecurityLevel.LEVEL4_PLAIN:
        return {
          name: "Level 4 - Standard Communication",
          description: "Standard unencrypted communication",
          warning: null
        };
      default:
        return {
          name: "Security Level",
          description: "Select a security level",
          warning: null
        };
    }
  };

  const securityInfo = getSecurityLevelInfo(securityLevel);

  return (
    <>
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-4xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] overflow-hidden flex flex-col p-0 gap-0 rounded-none sm:rounded-lg">
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border">
          <DialogTitle className="flex items-center space-x-2">
            <Shield className="h-5 w-5" />
            <span>
              {replyData?.type === 'reply' ? 'Reply to Message' :
                replyData?.type === 'reply-all' ? 'Reply All to Message' :
                  replyData?.type === 'forward' ? 'Forward Message' :
                    'Compose Secure Email'}
            </span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSend} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Recipients */}
            <div className="flex flex-col space-y-2">
              <Label htmlFor="modal-to" className="text-sm font-medium">
                To:
              </Label>
              <Input
                id="modal-to"
                type="text"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@qumail.secure"
                className="font-mono uppercase text-xs h-10"
                required
                data-testid="modal-input-to"
              />
              {!to.toLowerCase().endsWith('@qumail.secure') && to.length > 0 && (
                <div className="text-[10px] text-destructive font-bold uppercase mt-1">
                  Recipient Must Be a @qumail.secure Identity
                </div>
              )}
            </div>

            {/* Subject */}
            <div className="flex flex-col space-y-2">
              <Label htmlFor="modal-subject" className="text-sm font-medium">
                Subject:
              </Label>
              <Input
                id="modal-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="h-10"
                required
                data-testid="modal-input-subject"
              />
            </div>

            {/* Security Level */}
            <div className="flex flex-col space-y-2">
              <Label className="text-sm font-medium">
                Security:
              </Label>
              <div className="space-y-2">
                <Select
                  value={securityLevel}
                  onValueChange={(value: SecurityLevel) => setSecurityLevel(value)}
                >
                  <SelectTrigger data-testid="modal-select-security" className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SecurityLevel.LEVEL1_OTP}>Level 1 - Top Secret (Read Once)</SelectItem>
                    <SelectItem value={SecurityLevel.LEVEL2_AES}>Level 2 - Secure Communication</SelectItem>
                    <SelectItem value={SecurityLevel.LEVEL3_PQC}>Level 3 - Future-Proof Security</SelectItem>
                    <SelectItem value={SecurityLevel.LEVEL4_PLAIN}>Level 4 - Standard Communication</SelectItem>
                  </SelectContent>
                </Select>

                <div className="text-[11px] text-muted-foreground opacity-80 italic">
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

                {keyPoolStats && (
                  <div className="text-xs text-muted-foreground">
                    Current key pool: {keyPoolStats.remainingMB} MB available
                  </div>
                )}
              </div>
            </div>

            {/* Message Body */}
            <div className="flex flex-col space-y-2">
              <Label htmlFor="modal-body" className="text-sm font-medium">
                Message:
              </Label>
              <Textarea
                id="modal-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Compose your secure message..."
                className="min-h-[180px] resize-none"
                required
                data-testid="modal-textarea-body"
              />
            </div>

            {/* Attachments */}
            <div className="flex flex-col space-y-2">
              <Label className="text-sm font-medium">
                Attachments:
              </Label>
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-border rounded-lg p-4 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => document.querySelector<HTMLInputElement>('[data-testid="modal-input-file"]')?.click()}
                >
                  <div className="space-y-2 pointer-events-none">
                    <Upload className="h-6 w-6 text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">Drag files here or click to browse</p>
                    <p className="text-xs text-muted-foreground">Max file size: 10MB</p>
                  </div>
                </div>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                  data-testid="modal-input-file"
                />

                {/* Attachment List */}
                {attachments.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md border border-border"
                      >
                        <div className="flex items-center space-x-2 overflow-hidden">
                          <div className="flex-shrink-0 w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                            <Paperclip className="h-4 w-4 text-primary" />
                          </div>
                          <div className="overflow-hidden">
                            <p className="text-sm font-medium truncate max-w-[150px]">{attachment.file.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {(attachment.file.size / 1024).toFixed(1)} KB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => removeAttachment(attachment.id)}
                          data-testid={`modal-button-remove-${attachment.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 border-t border-border bg-muted/30 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Desktop/Wider View: Left side actions */}
              <div className="hidden sm:flex items-center space-x-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => document.querySelector<HTMLInputElement>('[data-testid="modal-input-file"]')?.click()}
                >
                  <Paperclip className="h-4 w-4 mr-2 text-primary" />
                  Attach Files
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  data-testid="modal-button-save-draft"
                  onClick={handleSaveDraft}
                  disabled={saveDraftMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveDraftMutation.isPending ? "Saving..." : "Save Draft"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAiModalOpen(true)}
                  className="text-primary font-semibold hover:bg-primary/10 hover:text-primary transition-colors"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate with AI
                </Button>
              </div>

              {/* Mobile View: Quick Actions Row */}
              <div className="flex sm:hidden items-center justify-between border-b pb-3 border-border/50">
                 <div className="flex items-center space-x-1">
                   <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-primary hover:bg-primary/10"
                    onClick={() => document.querySelector<HTMLInputElement>('[data-testid="modal-input-file"]')?.click()}
                    title="Attach Files"
                  >
                    <Paperclip className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 hover:bg-muted"
                    title="Save Draft"
                    onClick={handleSaveDraft}
                    disabled={saveDraftMutation.isPending}
                  >
                    <Save className="h-5 w-5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 text-primary hover:bg-primary/10"
                    onClick={() => setIsAiModalOpen(true)}
                    title="Generate with AI"
                  >
                    <Sparkles className="h-5 w-5" />
                  </Button>
                 </div>
                 <SecurityBadge level={securityLevel} size="sm" />
              </div>

              {/* Primary Actions */}
              <div className="flex items-center space-x-3 w-full sm:w-auto">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 sm:flex-none h-12 sm:h-10 font-medium"
                  onClick={handleClose}
                  data-testid="modal-button-cancel"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={sendEmailMutation.isPending}
                  className="flex-[2] sm:flex-none flex items-center justify-center space-x-2 bg-primary hover:bg-primary/90 h-12 sm:h-10 px-8 text-white shadow-lg active:scale-95 transition-all"
                  data-testid="modal-button-send"
                >
                  <Shield className="h-5 w-5" />
                  <span className="font-bold tracking-wide">
                    {sendEmailMutation.isPending ? "Sending..." : "Send Securely"}
                  </span>
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
    <AiGeneratorModal 
      isOpen={isAiModalOpen} 
      onClose={() => setIsAiModalOpen(false)} 
      onGenerate={handleAiGenerate}
    />
  </>
  );
}
