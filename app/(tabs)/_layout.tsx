import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Nasconde la tab bar di Expo Router — la navigazione è gestita
        // dal componente BottomNavBar custom in index.tsx
        tabBarStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="explore" />
      <Tabs.Screen name="communities" />
      <Tabs.Screen name="ChallengesScreen" />
      <Tabs.Screen name="MapScreen" />
      <Tabs.Screen name="TimeMachine" />
      <Tabs.Screen name="map" />
    </Tabs>
  );
}
