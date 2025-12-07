// screens/SignupScreen.js
import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, TouchableOpacity, SafeAreaView} from 'react-native';
import { useTranslation } from 'react-i18next';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function SignupScreen({ navigation }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState(''); // <-- ADD password state

  const handleSignup = async () => {
    if (!name || !phone || !password) {
      Alert.alert(t('errorTitle'), t('fillAllFields'));
      return;
    }

    const userData = { name, phone, password, role: 'EMPLOYEE' }; 

    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });

      const jsonResponse = await response.json();

      if (response.ok) {
        Alert.alert(
          t('successTitle'),
          `User "${jsonResponse.name}" created as a(n) ${jsonResponse.role}. You can now log in.`
        );
        navigation.navigate('Login');
      } else {
        Alert.alert(t('errorTitle'), jsonResponse.error || 'Something went wrong.');
      }
    } catch (error) {
      console.error(error);
      Alert.alert(t('errorTitle'), t('networkError'));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
        <View style={styles.innerContainer}>
      <Text style={styles.title}>{t('createAccount')}</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Enter phone number"
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />
      <TextInput
        style={styles.input}
        placeholder={t('enterName')}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder="Enter password" // <-- ADD password field
        value={password}
        onChangeText={setPassword}
        secureTextEntry={true} // Hides the password characters
      />

      <Button title={t('signUp')} onPress={handleSignup} />

      <TouchableOpacity onPress={() => navigation.navigate('Login')}>
        <Text style={styles.linkText}>{t('alreadyHaveAccount')}</Text>
      </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1,
    backgroundColor: '#fff',
  },
  innerContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20
  },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  input: { width: '100%', height: 40, borderColor: 'gray', borderWidth: 1, borderRadius: 5, marginBottom: 15, paddingHorizontal: 10 },
  linkText: { color: 'blue', textAlign: 'center', marginTop: 20 },
});