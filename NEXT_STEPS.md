# 🚀 Next Steps: Completing Your QuMail Auth Upgrade

To fully activate the new **Google OAuth 2.0** and **Hybrid Identity** system, please follow these configuration steps:

---

## 1. Configure Environment Variables (`.env`)

You need to update your `.env` file with the actual credentials from your Google Cloud Project.

1.  Open the `.env` file in the root directory.
2.  Add or update the following variables:

```env
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_actual_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_actual_client_secret_here

# Session & JWT Security
JWT_SECRET=generate_a_long_random_string_here
SESSION_SECRET=another_long_random_string_here
```

> **Pro Tip:** You can generate a strong `JWT_SECRET` by running:
> `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

---

## 2. Google Cloud Console Setup

The authentication flow will fail with a "Redirect URI mismatch" error unless you whitelist your local development URL.

1.  Go to the [Google Cloud Console](https://console.cloud.google.com/).
2.  Select your project and navigate to **APIs & Services > Credentials**.
3.  Click on your **OAuth 2.0 Client ID**.
4.  Under **Authorized JavaScript origins**, add:
    *   `http://localhost:5000`
5.  Under **Authorized redirect URIs**, add:
    *   `http://localhost:5000/api/auth/google/callback` (if applicable, though current implementation uses frontend credential handling)
    *   `http://localhost:5000`
6.  Save the changes.

---

## 3. Verify Your New Identity

Now that the system is decoupled, your old accounts are no longer valid.

1.  **Restart the Server:** Run `npm run dev` to ensure environment variables are loaded.
2.  **Login with Google:** Navigate to `http://localhost:5000/login` and click **"Continue with Google"**.
3.  **Check Sidebar:** You should now see:
    *   Your **Display Name** from Google.
    *   Your **QuMail Secure ID** (e.g., `agent_name@qumail.secure`).
    *   Your **Verified Google Email**.
4.  **Verify Keys:** Go to the **Key Dashboard**. You will see that new Quantum and PQC (Kyber) keys are being generated and bound specifically to your `@qumail.secure` identity.

---

## 🛠 Troubleshooting

*   **Login Popup Doesn't Open:** Check if your browser is blocking popups from `localhost`.
*   **"Missing Module" Errors:** Ensure you ran `npm install` for the new packages:
    *   `google-auth-library`
    *   `jsonwebtoken`
    *   `@react-oauth/google`
*   **Decryption Fails:** Ensure you are sending emails to users who have also logged in once to "Initialize" their identity in the database.

---
*Created on: 2026-02-19*
