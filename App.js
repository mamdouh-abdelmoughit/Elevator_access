// App.js
import React, { useState, useEffect } from 'react';
import { View, Text, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as Updates from 'expo-updates';
import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import './i18n';

import MapScreen from './screens/MapScreen';
import AddElevatorScreen from './screens/AddElevatorScreen';
import ElevatorDetailScreen from './screens/ElevatorDetailScreen';
import AdminInboxScreen from './screens/AdminInboxScreen';
import AssignManagerScreen from './screens/AssignManagerScreen';
import BuildingAccessScreen from './screens/BuildingAccessScreen';
import CreateEmployeeScreen from './screens/CreateEmployeeScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import SignupScreen from './screens/SignupScreen';

const LOCATION_TASK_NAME = 'background-location-task';
const API_URL = process.env.EXPO_PUBLIC_API_URL;

// ── Background location task (must be defined at module level, before any component) ──
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) { console.error('Background Task Error:', error); return; }
  if (!data || !data.locations || data.locations.length === 0) return;

  const location = data.locations[0];
  if (!location?.coords) return;

  try {
    const userJSON = await SecureStore.getItemAsync('currentUser');
    const token    = await SecureStore.getItemAsync('authToken');

    if (!userJSON) {
      try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch {}
      return;
    }
    const user = JSON.parse(userJSON);
    if (!token) {
      try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch {}
      return;
    }

    if (user?.id && user.role === 'EMPLOYEE') {
      await fetch(`${API_URL}/users/${user.id}/location`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ latitude: location.coords.latitude, longitude: location.coords.longitude }),
      });
    }
  } catch {}
});

// ── OTA update check (JS-only changes via EAS Update) ─────────────────────────
async function checkOTAUpdate() {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const result = await Updates.checkForUpdateAsync();
    if (result.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // app restarts here with new JS
    }
  } catch {}
}

// ── Native APK update check (for changes that need a new build) ───────────────
async function checkNativeUpdate() {
  if (!API_URL) return;
  try {
    const res = await fetch(`${API_URL}/app/version`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;

    const { versionCode, versionName, apkUrl, mandatory } = await res.json();
    const installed = parseInt(Application.nativeBuildVersion, 10);

    if (!apkUrl || versionCode <= installed) return;

    return new Promise((resolve) => {
      const buttons = mandatory
        ? [{ text: 'Mettre à jour', onPress: () => resolve(downloadAndInstall(apkUrl)) }]
        : [
            { text: 'Plus tard', style: 'cancel', onPress: resolve },
            { text: 'Mettre à jour', onPress: () => resolve(downloadAndInstall(apkUrl)) },
          ];

      Alert.alert(
        'Mise à jour disponible',
        `Version ${versionName} disponible${mandatory ? ' (obligatoire)' : ''}.\n\nVotre version : ${Application.nativeApplicationVersion}`,
        buttons,
        { cancelable: !mandatory },
      );
    });
  } catch {}
}

async function downloadAndInstall(apkUrl) {
  try {
    const dest = FileSystem.cacheDirectory + 'elevator-update.apk';
    await FileSystem.downloadAsync(apkUrl, dest);
    await Sharing.shareAsync(dest, {
      mimeType: 'application/vnd.android.package-archive',
      UTI: 'com.android.package-archive',
    });
  } catch {
    Alert.alert('Erreur', 'Impossible de télécharger la mise à jour. Réessayez plus tard.');
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
const Stack = createNativeStackNavigator();

export default function App() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      await checkOTAUpdate();     // may restart the app — if it does, code below never runs
      await checkNativeUpdate();  // shows alert if native build is outdated
      setIsReady(true);
    }
    init();
  }, []);

  if (!isReady) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashTitle}>BioSwitch</Text>
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 24 }} />
        <Text style={styles.splashSub}>Vérification des mises à jour…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerStyle: { backgroundColor: '#1E293B' },
          headerTintColor: '#F8FAFC',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#0F172A' },
        }}
      >
        <Stack.Screen name="Map"            component={MapScreen}            options={{ title: 'Technician Map' }} />
        <Stack.Screen name="Login"          component={LoginScreen}          options={{ headerShown: false }} />
        <Stack.Screen name="Signup"         component={SignupScreen}         options={{ title: 'Create Account', headerStyle: { backgroundColor: '#0F172A' } }} />
        <Stack.Screen name="Home"           component={HomeScreen}           options={{ title: 'Genestor Dashboard' }} />
        <Stack.Screen name="AddElevator"    component={AddElevatorScreen}    options={{ title: 'Install New Elevator' }} />
        <Stack.Screen name="ElevatorDetail" component={ElevatorDetailScreen} options={{ title: 'Elevator Detail' }} />
        <Stack.Screen name="AdminInbox"     component={AdminInboxScreen}     options={{ title: 'Service Requests' }} />
        <Stack.Screen name="AssignManager"  component={AssignManagerScreen}  options={{ title: 'Assign Manager' }} />
        <Stack.Screen name="BuildingAccess" component={BuildingAccessScreen} options={{ title: 'Building Access' }} />
        <Stack.Screen name="CreateEmployee" component={CreateEmployeeScreen} options={{ title: 'Créer un technicien', headerStyle: { backgroundColor: '#0F172A' } }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashTitle: {
    color: '#F8FAFC',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 2,
  },
  splashSub: {
    color: '#64748B',
    fontSize: 13,
    marginTop: 12,
  },
});
