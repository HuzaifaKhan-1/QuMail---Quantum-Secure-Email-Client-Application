
import { cryptoEngine } from "./server/services/cryptoEngine";
import { SecurityLevel } from "./shared/schema";

async function testPQC() {
    try {
        const originalText = "Hello Quantum World!";
        console.log("Original Text:", originalText);

        // Encrypt
        const encryptedResult = await cryptoEngine.encrypt(originalText, SecurityLevel.LEVEL3_PQC, "test@example.com");
        console.log("Encryption Result Metadata:", encryptedResult.metadata);

        // Decrypt
        const decryptedResult = await cryptoEngine.decrypt(encryptedResult.encryptedData, encryptedResult.metadata);
        console.log("Decryption Result Status:", decryptedResult.verified);
        console.log("Decrypted Text:", decryptedResult.decryptedData);

        if (originalText === decryptedResult.decryptedData && decryptedResult.verified) {
            console.log("PQC SUCCESS!");
        } else {
            console.log("PQC FAILURE!");
        }
    } catch (error) {
        console.error("Test Error:", error);
    }
}

testPQC();
