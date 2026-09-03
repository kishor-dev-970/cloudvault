import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useAuth } from "../src/context/AuthContext";
import { api } from "../src/api/client";

export default function GoogleCallback() {
  const { completeGoogleSignIn } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  useEffect(() => {
    if (state !== "idle") return;
    setState("done");
    const finish = async () => {
      try {
        const session = await api.pendingGoogleSession();
        if (session?.token && session.email) {
          await completeGoogleSignIn(session.token, session.email);
          router.replace("/(tabs)/library");
        } else {
          setState("error");
        }
      } catch {
        setState("error");
      }
    };
    finish();
    // Run once on mount only; completeGoogleSignIn/router may be unstable references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showSpinner = state === "done";
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0f" }}>
      {showSpinner ? (
        <>
          <Text style={{ color: "#fff", fontSize: 16, marginBottom: 12 }}>Completing Google sign-in...</Text>
          <ActivityIndicator size="large" color="#e5353b" />
        </>
      ) : (
        <Text style={{ color: "#fff", fontSize: 16 }}>Sign-in failed (no pending session). Go back and try again.</Text>
      )}
    </View>
  );
}
