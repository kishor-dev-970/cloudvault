import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken, type User } from "../api/client";

const TOKEN_KEY = "cloudvault_token";
const USER_KEY = "cloudvault_user";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  signup: (email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  completeGoogleSignIn: (token: string, email: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await SecureStore.getItemAsync(TOKEN_KEY);
        const savedUserRaw = await SecureStore.getItemAsync(USER_KEY);
        if (savedToken && savedUserRaw) {
          setToken(savedToken);
          setTokenState(savedToken);
          setUser(JSON.parse(savedUserRaw));
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const persist = async (t: string, u: User) => {
    await SecureStore.setItemAsync(TOKEN_KEY, t);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(u));
  };

  const signup = async (email: string, password: string) => {
    const res = await api.signup(email, password);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    await persist(res.token, res.user);
  };

  const login = async (email: string, password: string) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setTokenState(res.token);
    setUser(res.user);
    await persist(res.token, res.user);
  };

  const completeGoogleSignIn = async (t: string, email: string) => {
    const u: User = { id: "google", email };
    setToken(t);
    setTokenState(t);
    setUser(u);
    await persist(t, u);
  };

  const logout = async () => {
    setToken(null);
    setTokenState(null);
    setUser(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_KEY);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, completeGoogleSignIn, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
