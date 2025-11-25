// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store'; // <-- IMPORT
import './i18n';

// screens
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import SignupScreen from './screens/SignupScreen';
import DashboardScreen from './screens/DashboardScreen'; // Was SyndicScreen

//const LOCATION_TASK_NAME = 'background-location-task';
// Use your backend address (same as other screens). If you run backend on device/emulator, adjust accordingly.
//const API_URL = 'http://192.168.11.251:3000';

// Background task definition.
// This task runs even when the app is backgrounded (Expo taskManager + location set up required).
/*TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background Task Error:', error);
    return;
  }


  if (!data || !data.locations || data.locations.length === 0) {
    // Nothing to do
    return;
  }

  const location = data.locations[0];
  if (!location || !location.coords) return;

  console.log('Background location received:', location.coords);

  try {
    // 1. Read the saved user data from secure storage.
    const userJSON = await SecureStore.getItemAsync('currentUser');
    const token = await SecureStore.getItemAsync('authToken');

    if (!userJSON) {
      console.error('Background Task: Could not find user in storage. Stopping location updates.');
      // stop location updates to avoid continuing to run unnecessarily
      try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (e) {}
      return;
    }
    const user = JSON.parse(userJSON);

    if (!token) {
      console.error('Background Task: No auth token found. Stopping location updates.');
      try { await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch (e) {}
      return;
    }

    // 2. We only send updates for employees.
    if (user && user.id && user.role === 'EMPLOYEE') {
      try {
        // 3. Send the location to the backend with the correct user ID.
        const resp = await fetch(`${API_URL}/users/${user.id}/location`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          }),
        });

        if (!resp.ok) {
          // Log non-200 responses for debugging
          const text = await resp.text().catch(() => '');
          console.error(`Background Task: Failed to send location. Status: ${resp.status} - ${text}`);
        } else {
          console.log(`Background location for user ${user.id} sent to server.`);
        }
      } catch (e) {
        console.error('Background Task: Failed to send location:', e);
      }
    } else {
      console.log('Background Task: User is not an employee, or no user data found. No location sent.');
    }
  } catch (e) {
    console.error('Background Task: Unexpected error', e);
  }
});
*/
// Navigation stack
const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create Account' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Elevator Dashboard' }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'My Residence' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
