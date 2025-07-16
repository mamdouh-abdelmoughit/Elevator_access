// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MapScreen from './screens/MapScreen'; 
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store'; // <-- IMPORT

const LOCATION_TASK_NAME = 'background-location-task';
const API_URL = 'http://172.20.10.2:3000';

// This is the background task definition.
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background Task Error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    const location = locations[0];

    if (location) {
      console.log('Background location received:', location.coords);

      // --- THIS IS THE REAL IMPLEMENTATION ---
      // 1. Read the saved user data from secure storage.
      const userJSON = await SecureStore.getItemAsync('currentUser');
      if (!userJSON) {
        console.error('Background Task: Could not find user in storage. Stopping task.');
        Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        return;
      }

      const user = JSON.parse(userJSON);
      
      // 2. We only send updates for employees.
      if (user && user.id && user.role === 'EMPLOYEE') {
        try {
          // 3. Send the location to the backend with the correct user ID.
          await fetch(`${API_URL}/users/${user.id}/location`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
            }),
          });
          console.log(`Background location for user ${user.id} sent to server.`);
        } catch (e) {
          console.error('Background Task: Failed to send location:', e);
        }
      } else {
        console.log("Background Task: User is not an employee, or no user data found. No location sent.");
      }
    }
  }
});

// Import our i18n configuration
import './i18n';

// Import all screens
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import SignupScreen from './screens/SignupScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      {/* Make MapScreen the first screen for easy testing */}
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen name="Map" component={MapScreen} options={{ title: 'Technician Map' }} />
        <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Signup" component={SignupScreen} options={{ title: 'Create Account' }} />
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Elevator Dashboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}