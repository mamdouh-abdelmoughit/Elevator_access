// App.js

import React, { useState } from 'react';
import { StyleSheet, Text, View, TextInput, Button, Alert } from 'react-native';

// IMPORTANT: Replace this with your computer's IP address on the hotspot network
const API_URL = 'http://172.20.10.2:3000'; // Example: 'http://

export default function App() {
  // 'useState' is a React Hook to manage component state
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // --- FUNCTION to handle user signup ---
  const handleSignup = async () => {
    if (!name || !email) {
      Alert.alert('Error', 'Please enter both name and email.');
      return;
    }

    try {
      // Use the 'fetch' API to make a network request to your backend
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name,
          email: email,
        }),
      });

      const jsonResponse = await response.json();

      if (response.ok) {
        // 'response.ok' is true if the HTTP status is 2xx
        Alert.alert('Success', `User "${jsonResponse.name}" created with ID: ${jsonResponse.id}`);
      } else {
        // Show the error message from our backend
        Alert.alert('Error', jsonResponse.error || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('Network Error', 'Could not connect to the server.');
    }
  };

  // --- TODO: Add a handleLogin function later ---

  // 'return (...)' defines what the component looks like on screen
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Elevator Access Control</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Enter your name"
        value={name}
        onChangeText={setName} // Updates the 'name' state as you type
      />
      
      <TextInput
        style={styles.input}
        placeholder="Enter your email"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      <Button title="Sign Up" onPress={handleSignup} />
      
      {/* We will add a login button later */}
    </View>
  );
}

// 'StyleSheet' is React Native's way of styling components (like CSS)
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 40,
    borderColor: 'gray',
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
});