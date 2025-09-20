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
import { 
  Send, 
  Shield, 
  Paperclip, 
  Save, 
  X,
  Upload,
  AlertCircle
} from "lucide-react";
import { SecurityLevel, type SendEmailRequest, type Message } from "@/lib/types";

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  replyData?: {
    type: 'reply' | 'reply-all' | 'forward' | null;
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

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
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
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
            {/* Recipients */}
            <div className="grid grid-cols-12 gap-4">
              <Label htmlFor="modal-to" className="col-span-1 text-sm font-medium pt-2">
                To:
              </Label>
              <Input
                id="modal-to"
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="recipient@example.com"
                className="col-span-11"
                required
                data-testid="modal-input-to"
              />
            </div>

            {/* Subject */}
            <div className="grid grid-cols-12 gap-4">
              <Label htmlFor="modal-subject" className="col-span-1 text-sm font-medium pt-2">
                Subject:
              </Label>
              <Input
                id="modal-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Email subject..."
                className="col-span-11"
                required
                data-testid="modal-input-subject"
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
                  <SelectTrigger data-testid="modal-select-security">
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

                {keyPoolStats && (
                  <div className="text-xs text-muted-foreground">
                    Current key pool: {keyPoolStats.remainingMB} MB available
                  </div>
                )}
              </div>
            </div>

            {/* Message Body */}
            <div className="grid grid-cols-12 gap-4">
              <Label htmlFor="modal-body" className="col-span-1 text-sm font-medium pt-2">
                Message:
              </Label>
              <Textarea
                id="modal-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Compose your secure message..."
                className="col-span-11 min-h-[150px] resize-none"
                required
                data-testid="modal-textarea-body"
              />
            </div>

            {/* Attachments */}
            <div className="grid grid-cols-12 gap-4">
              <Label className="col-span-1 text-sm font-medium pt-2">
                Attachments:
              </Label>
              <div className="col-span-11 space-y-4">
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
                  <div className="space-y-2">
                    {attachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="flex items-center justify-between p-2 bg-muted rounded-md"
                      >
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 bg-primary/10 rounded flex items-center justify-center">
                            <Paperclip className="h-3 w-3 text-primary" />
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
                          data-testid={`modal-button-remove-${attachment.id}`}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex-shrink-0 flex items-center justify-between p-6 border-t border-border bg-muted/30">
            <div className="flex items-center space-x-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => document.querySelector<HTMLInputElement>('[data-testid="modal-input-file"]')?.click()}
              >
                <Paperclip className="h-4 w-4 mr-1" />
                Attach Files
              </Button>
              <Button
                type="button"
                variant="ghost" 
                size="sm"
                data-testid="modal-button-save-draft"
              >
                <Save className="h-4 w-4 mr-1" />
                Save Draft
              </Button>
            </div>
            
            <div className="flex items-center space-x-3">
              <SecurityBadge level={securityLevel} size="sm" />
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                data-testid="modal-button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={sendEmailMutation.isPending}
                className="flex items-center space-x-2"
                data-testid="modal-button-send"
              >
                <Shield className="h-4 w-4" />
                <span>
                  {sendEmailMutation.isPending ? "Sending..." : "Send Securely"}
                </span>
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
