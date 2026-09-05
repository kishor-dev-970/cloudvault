import { useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { user, isYouTubeConnected, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (isYouTubeConnected && user) router.replace("/(tabs)/library");
    else router.replace("/login");
  }, [user, isYouTubeConnected, loading]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0b0b0f" }}>
      <ActivityIndicator size="large" color="#e5353b" />
    </View>
  );
}
