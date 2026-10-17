// App.js — Syndic Portal
import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import './i18n';

import { getSession, clearSession, setUnauthorizedHandler } from './src/api';
import { ToastProvider } from './src/components/ui';
import { C } from './src/theme';

import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import BuildingsScreen from './screens/BuildingsScreen';
import BuildingSetupScreen from './screens/BuildingSetupScreen';
import BuildingScreen from './screens/BuildingScreen';
import ResidentFormScreen from './screens/ResidentFormScreen';
import ResidentDetailScreen from './screens/ResidentDetailScreen';
import RequestsScreen from './screens/RequestsScreen';

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

export default function App() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    // Already logged in as a Syndic -> straight to the buildings.
    getSession().then(({ token, user }) => {
      setInitialRoute(token && user?.role === 'MANAGER' ? 'Buildings' : 'Login');
    });
    setUnauthorizedHandler(async () => {
      await clearSession();
      if (navigationRef.isReady()) navigationRef.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
  }, []);

  if (!initialRoute) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashTitle}>Espace Syndic</Text>
        <ActivityIndicator color="#fff" style={{ marginTop: 20 }} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ToastProvider>
        <NavigationContainer ref={navigationRef}>
          <Stack.Navigator
            initialRouteName={initialRoute}
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg }, animation: 'slide_from_right' }}
          >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Signup" component={SignupScreen} options={{ headerShown: true, title: 'Créer un compte' }} />
            <Stack.Screen name="Buildings" component={BuildingsScreen} />
            <Stack.Screen name="BuildingSetup" component={BuildingSetupScreen} />
            <Stack.Screen name="Building" component={BuildingScreen} />
            <Stack.Screen name="ResidentForm" component={ResidentFormScreen} options={{ animation: 'slide_from_bottom' }} />
            <Stack.Screen name="ResidentDetail" component={ResidentDetailScreen} />
            <Stack.Screen name="Requests" component={RequestsScreen} />
          </Stack.Navigator>
        </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, backgroundColor: C.brand, justifyContent: 'center', alignItems: 'center' },
  splashTitle: { color: '#fff', fontSize: 26, fontWeight: '800' },
});
