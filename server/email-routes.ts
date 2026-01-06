import { Router } from "express";
import { Email, OTPKey } from "./models";

const router = Router();

// Save email based on security level
router.post("/api/emails", async (req, res) => {
  try {
    const { 
      senderId, 
      receiverId, 
      subject, 
      encryptedPayload, 
      securityLevel, 
      metadata,
      otpKey // Optional, only for Level 1
    } = req.body;

    // Basic validation
    if (!senderId || !receiverId || !subject || !encryptedPayload || !securityLevel) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Security Level Rules Check
    const isEncrypted = securityLevel !== 4;

    const email = new Email({
      senderId,
      receiverId,
      subject,
      encryptedPayload,
      securityLevel,
      metadata,
      isEncrypted,
      isRead: false
    });

    await email.save();

    // Level 1: Quantum OTP - Store temporary key
    if (securityLevel === 1 && otpKey) {
      const expiresAt = metadata.keyExpiryTime || new Date(Date.now() + 3600000); // Default 1 hour
      const temporaryKey = new OTPKey({
        emailId: email._id,
        otpKey,
        expiresAt
      });
      await temporaryKey.save();
    }

    res.status(201).json(email);
  } catch (error) {
    console.error("Error saving email:", error);
    res.status(500).json({ error: "Failed to save email" });
  }
});

// Read email and handle Level 1 deletion
router.get("/api/emails/:id", async (req, res) => {
  try {
    const email = await Email.findById(req.params.id);
    if (!email) {
      return res.status(404).json({ error: "Email not found" });
    }

    let otpKeyData = null;

    // Level 1: One-time read logic
    if (email.securityLevel === 1) {
      const keyRecord = await OTPKey.findOne({ emailId: email._id });
      if (keyRecord) {
        otpKeyData = keyRecord.otpKey;
        // Delete OTP key immediately after first read
        await OTPKey.deleteOne({ _id: keyRecord._id });
      }
      
      // Mark as read
      email.isRead = true;
      await email.save();
    }

    res.json({ email, otpKey: otpKeyData });
  } catch (error) {
    console.error("Error fetching email:", error);
    res.status(500).json({ error: "Failed to fetch email" });
  }
});

export default router;
