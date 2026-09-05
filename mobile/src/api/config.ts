// Google OAuth configuration for CloudVault (zero-server, runs fully on-device).
//
// UPDATE THIS WHEN YOU HAVE AN ANDROID OAuth CLIENT ID:
//   Create an Android OAuth client in Google Cloud Console
//   (APIs & Services > Credentials > Create Credentials > OAuth client ID > Android)
//   with package `com.cloudvault.app` and SHA-1 5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25,
//   then put its full `....apps.googleusercontent.com` id here.
//
//   The user currently gets "already in use"; the client exists but is hidden because the
//   OAuth consent screen was never configured. Finish the consent screen (APIs & Services >
//   OAuth consent screen > External, add a test user) and the client reappears under
//   Credentials. Then paste its ID below.
export const GOOGLE_CLIENT_ID =
  "700079911725-tirv21h6nfd9kquruodgh29rhdotakr4.apps.googleusercontent.com";

// For an Android OAuth client the deep-link redirect scheme is the *full* client ID in
// reverse-DNS form: `com.googleusercontent.apps.<full-client-id>` INCLUDING the hyphen
// suffix (e.g. com.googleusercontent.apps.1234567890-abcdefgh). Google validates it
// against the registered package + SHA-1 fingerprint, so no domain is needed. We derive
// it from the client ID automatically. Override below if yours differs.
export function oauthRedirectScheme(): string {
  const full = GOOGLE_CLIENT_ID.replace(/\.apps\.googleusercontent\.com$/, "");
  const match = GOOGLE_CLIENT_ID.match(/^(\d+)-/);
  return full && match ? `com.googleusercontent.apps.${full}` : "cloudvault";
}

export const OAUTH_PATH = "oauth2redirect";
