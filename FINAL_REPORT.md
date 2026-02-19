# QuMail – Quantum & Post-Quantum Secure Email Client
### *Future-Proofing Communication with Information-Theoretic and Computational Security*

---

## 1. Abstract
Current email encryption standards (PGP, S/MIME) rely on classical public-key cryptography (RSA, ECC), which is vulnerable to the "Store Now, Decrypt Later" strategy and the imminent threat of large-scale quantum computers. **QuMail** is a revolutionary secure email platform that implements a tiered security model combining **Quantum Key Distribution (QKD)** simulation and **Post-Quantum Cryptography (PQC)**. 

The project introduces a **Key Management Entity (KME)** following ETSI standards to manage quantum keys. By enforcing a "Zero Plaintext at Rest" policy for secure tiers and implementing a self-destructive, read-once mechanism for its highest security level (One-Time Pad), QuMail provides a practical demonstration of how next-generation cryptographic primitives can be integrated into modern web architectures to ensure long-term data confidentiality and integrity against both classical and quantum adversaries.

---

## 2. Introduction
### Motivation
In an era where digital sovereignty is paramount, the security of email—the backbone of professional communication—remains tethered to aging cryptographic foundations. The motivation behind QuMail is to bridge the gap between theoretical quantum physics and practical software engineering.

### Necessity of Quantum-Safe Communication
1. **Harvest Now, Decrypt Later**: Multi-national adversaries are currently harvesting encrypted traffic with the intent of decrypting it once quantum computers reach sufficient qubit counts.
2. **National Security**: Government and corporate secrets require "forward-looking security" that remains uncrackable for 30-50 years.
3. **Implications of Shor’s Algorithm**: A sufficiently powerful quantum computer can factor large integers and solve discrete logarithms in polynomial time, rendering RSA and ECC obsolete.

### Real-World Relevance
As the world transitions to a "Quantum Decade," standardizing the transition from classical to quantum-safe protocols is a matter of critical infrastructure protection.

---

## 3. Problem Statement
### Risks of Classical Encryption
Traditional encryption relies on the mathematical complexity of factoring large primes (RSA) or elliptical curve points (ECC). These are "computationally secure" against classical hardware but "quantum-fragile."

### The Quantum Threat
*   **Shor's Algorithm**: Specifically targets public-key infrastructure (PKI), allowing for the derivation of private keys from public keys.
*   **Grover's Algorithm**: Reduces the effective security of symmetric keys (like AES-128) by half, necessitating a transition to AES-256 or better.

### The Need for QKD & PQC
To achieve true security, we need:
1.  **QKD**: To distribute keys with physics-based security that detects eavesdropping.
2.  **PQC**: To use mathematical problems that remain hard even for quantum computers.

---

## 4. System Architecture
QuMail utilizes a modular full-stack architecture designed to handle high-entropy quantum data alongside standard web traffic.

### High-Level Workflow
1.  **Client-Side Preparation**: The React-based frontend handles user input and provides a streamlined UI for security level selection.
2.  **KME Integration**: The backend Express server communicates with the **Key Management Entity (KME)** to request high-entropy keys.
3.  **Encryption-at-Rest Enforcement**: For levels 1-3, the system strictly enforces that the `body` field in the database remains `NULL`. Only the `encrypted_body` and associated `metadata` are persisted.
4.  **Database Layer**: A PostgreSQL instance stores message metadata, audit logs, and encrypted payloads.

### Level-Based Encryption Flow
The system dynamically selects the encryption engine based on the user-selected security level, ensuring that keys are derived, used, and disposed of according to the specific protocol requirements.

---

## 5. Security Levels Explanation

### LEVEL 1 – Quantum OTP (Information-Theoretic Security)
*   **Logic**: Uses a simulated **BB84 protocol** to distribute a key equal in length to the message.
*   **XOR Operation**: Employs the One-Time Pad algorithm. $C = M \oplus K$, where $M$ is the message and $K$ is the unique quantum key.
*   **Destructive Mechanism**: Upon a single successful decryption attempt, the KME destroys the key material globally, and the database purges the `encrypted_body`.
*   **Security Foundation**: It is the only encryption method mathematically proven to be unbreakable, provided the key is truly random, used once, and kept secret.

### LEVEL 2 – Quantum-Seeded AES
*   **Key Derivation**: Uses a quantum key to seed a high-entropy **HKDF (HMAC-based Key Derivation Function)**.
*   **AES-256-GCM**: Provides authenticated encryption with associated data. It ensures both confidentiality and integrity.
*   **IV Handling**: A 96-bit unique Initialization Vector (IV) is generated for every message to prevent replay attacks and ensure distinct ciphertexts for identical plaintexts.

### LEVEL 3 – Post-Quantum Mode
*   **CRYSTALS-Kyber**: Implements a Key Encapsulation Mechanism (KEM) resistant to quantum factoring. 
*   **Hybrid Approach**: Combines the mathematical hardness of lattice-based problems with quantum key seeds to provide defense-in-depth.
*   **Future-Proof**: Designed to meet the standards currently being finalized by NIST for the PQC transition.

### LEVEL 4 – Plain Text Mode
*   **Use Case**: For non-sensitive, public communication where overhead is unnecessary. 
*   **Storage**: Stored in secondary plaintext fields for compatibility with legacy systems.

---

## 6. Algorithms & Techniques Used

### BB84 Protocol Simulation
1.  A and B agree on polarized bases.
2.  A sends a stream of qubits. B measures them.
3.  Publicly compare a portion of the bases to detect eavesdropping.
4.  Error correction and privacy amplification result in a secure shared key.

### CRYSTALS-Kyber (KEM)
Kyber's security is based on the hardness of the **Module Learning With Errors (MLWE)** problem. It uses a small public key and ciphertext while maintaining extremely high security margins.

### Encryption-Before-Storage
QuMail architecture ensures that for any secure level, the raw message never touches the persistent storage disk. Encryption happens in memory at the application layer before the `INSERT` command is issued to the PostgreSQL database.

---

## 7. Database Design & Security Model
### Schema Logic
The `messages` table is protected by a database-level constraint:
`CHECK (security_level = 'level4' OR body IS NULL)`
This ensures that software bugs cannot accidentally persist plaintext data for secure communications.

### The "No Plaintext at Rest" Principle
All communications for Levels 1-3 are stored as high-entropy base64 strings in `encrypted_body`. Associated cryptographic metadata (IVs, Auth Tags, Key IDs) are stored in a dedicated `jsonb` metadata field.

---

## 8. Key Management Entity (KME)
The KME is the "Heart" of QuMail’s security.
*   **Key Pool**: Maintains a rotating pool of high-entropy keys.
*   **Standard Compliance**: Follows the **ETSI GS QKD-014** REST API specification for key requests and delivery.
*   **Lifecycle**: Auto-expires unused keys after 24 hours.
*   **Destruction**: Implements "Key Shredding" where the server memory is explicitly cleared of a key after its intended single use (Level 1).

---

## 9. Attachment Encryption
Attachments in QuMail are treated with the same rigor as messages:
1.  **On-the-fly Encryption**: Files are read into memory buffers, encrypted using the message's security level, and stored in a separate `encrypted_attachments` field.
2.  **Decryption Flow**: When a user clicks "Download," the server retrieves the encrypted blob, pulls the specific attachment metadata, decrypts it in memory, and streams the raw bytes back to the user's browser.

---

## 10. Security Analysis
| Threat | Mitigation Strategy |
| :--- | :--- |
| **Shor’s Algorithm** | Use of Kyber-768 (Level 3) and High-Entropy Seeds. |
| **Man-in-the-Middle (MITM)** | HMAC-SHA256 authenticated encryption in all tiers. |
| **Database Compromise** | Zero Plaintext at Rest; compromised DB yields only high-entropy noise. |
| **Replay Attack** | Unique IVs and timestamped key usage acknowledgments. |
| **Brute Force** | AES-256 bit depth (requires $2^{255}$ attempts classically). |

---

## 11. Comparison Table
| Feature | Classical Email | QuMail Level 1 | QuMail Level 2 | QuMail Level 3 |
| :--- | :--- | :--- | :--- | :--- |
| **Protocol** | TLS / PGP | Quantum OTP | Q-AES GCM | Kyber PQC |
| **Security Proof** | Computational | Information-Theoretic | Computational | Post-Quantum |
| **Storage** | Plaintext / RSA | Encrypted + Purge | Encrypted | Encrypted |
| **Quantum Safe** | No | **Yes (Perfect)** | Partial | **Yes** |
| **Read Once** | No | **Yes** | No | No |

---

## 12. Advantages of QuMail
*   **Quantum-Ready**: Built for the post-RSA era.
*   **Zero-Knowledge Implementation**: Server administrators cannot read secure messages even with full database access.
*   **Granular Security**: Users can choose security levels based on specific needs.
*   **Information-Theoretic Security**: Level 1 offers a guarantee that no amount of computing power can break the encryption.

---

## 13. Limitations
*   **Simulation vs Hardware**: Current implementation uses a high-entropy software generator rather than an HV-based Quantum Random Number Generator (QRNG).
*   **Performance Overhead**: Level 1 (OTP) requires significant bandwidth if messages contain large attachments.
*   **Network Dependency**: Requires a stable connection to the KME for key retrieval.

---

## 14. Future Enhancements
*   **QKD-as-a-Service**: Integrating with providers like Toshiba or ID Quantique for real fiber-link keys.
*   **Mobile Quantum Security**: Implementing PQC on mobile devices via hardware-backed security enclaves.
*   **Decentralized KME**: A distributed key management system to eliminate the KME as a single point of failure.

---

## 15. Conclusion
QuMail represents a significant step forward in secure communication. By integrating the absolute security of the **One-Time Pad** with the modern resilience of **Post-Quantum Cryptography**, it provides a robust defense against current and future cryptographic threats. As quantum computing advances from theory to reality, platforms like QuMail will be essential in protecting our global digital infrastructure.

---

## 16. References
1.  C. H. Bennett and G. Brassard. "Quantum cryptography: Public key distribution and coin tossing". 1984.
2.  NIST. "Post-Quantum Cryptography Standardization". 2024.
3.  Schneier, B. "Applied Cryptography". (AES-256-GCM standards).
4.  ETSI. "Quantum Key Distribution (QKD); Control Interface for key delivery". GS QKD 014.
5.  Alagic et al. "Status Report on the Third Round of the NIST PQC Standardization Process".
