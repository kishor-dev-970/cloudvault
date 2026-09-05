import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "../api/client";
import * as yt from "../services/youtube";

const USER_KEY = "cloudvault_user";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  connectYouTube: () => Promise<{ url: string; codeVerifier: string; state: string }>;
  completeOAuth: (code: string, codeVerifier: string) => Promise<void>;
  logout: () => Promise<void>;
  isYouTubeConnected: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isYouTubeConnected, setIsYouTubeConnected] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const savedUserRaw = await SecureStore.getItemAsync(USER_KEY);
        if (savedUserRaw) {
          setUser(JSON.parse(savedUserRaw));
        }
        // Check YouTube connection
        const connected = await yt.isConnected();
        setIsYouTubeConnected(connected);

        // If connected, try to look up channel ID if missing
        if (connected) {
          const channelId = await yt.getChannelId();
          if (!channelId) {
            try {
              const id = await yt.fetchChannelId();
              await yt.storeChannelId(id);
              const saved = await SecureStore.getItemAsync(USER_KEY);
              if (saved) {
                const u = JSON.parse(saved) as User;
                u.id = id;
                setUser(u);
                await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
              }
            } catch {
              /* channel lookup failed — not fatal */
            }
          }
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const connectYouTube = async () => {
    return yt.getAuthUrl();
  };

  const completeOAuth = async (code: string, codeVerifier: string) => {
    const { accessToken, refreshToken } = await yt.exchangeCode(code, codeVerifier);
    await yt.storeTokens(accessToken, refreshToken);

    // Look up channel ID
    let channelId = "";
    try {
      channelId = await yt.fetchChannelId();
      await yt.storeChannelId(channelId);
    } catch {
      /* not fatal */
    }

    // Store user
    const u: User = { id: channelId || "youtube", email: "YouTube User" };
    setUser(u);
    setIsYouTubeConnected(true);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
  };

  const logout = async () => {
    setUser(null);
    setIsYouTubeConnected(false);
    await SecureStore.deleteItemAsync(USER_KEY);
    await yt.clearTokens();
  };

  return (
    <AuthContext.Provider value={{ user, loading, connectYouTube, completeOAuth, logout, isYouTubeConnected }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
