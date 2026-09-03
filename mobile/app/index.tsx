import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    // Navigate to an explicit tab: the bare "/(tabs)" group path does not resolve
    // in this setup, but "/(tabs)/library" does.
    if (user) router.replace("/(tabs)/library");
    else router.replace("/login");
  }, [user, loading]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0f" }}>
      <ActivityIndicator size="large" color="#e5353b" />
    </View>
  );
}
