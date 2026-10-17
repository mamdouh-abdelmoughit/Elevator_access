import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  SafeAreaView, KeyboardAvoidingView, Platform,
  StatusBar, ActivityIndicator, StyleSheet,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    if (!phone || !password) {
      Alert.alert('Champs requis', 'Veuillez saisir votre numéro et mot de passe.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await response.json();

      if (response.ok) {
        await SecureStore.setItemAsync('authToken', data.token);
        await SecureStore.setItemAsync('currentUser', JSON.stringify(data.user));

        if (data.user.role === 'MANAGER') {
          navigation.replace('Buildings');
        } else {
          Alert.alert('Accès refusé', 'Cette application est réservée aux Syndics.');
        }
      } else {
        Alert.alert('Erreur de connexion', data.error || 'Identifiants incorrects.');
      }
    } catch {
      Alert.alert('Erreur réseau', 'Impossible de se connecter au serveur.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#1B3A6B" />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        {/* Branding area */}
        <View style={styles.brandArea}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>🏢</Text>
          </View>
          <Text style={styles.brandTitle}>Espace Syndic</Text>
          <Text style={styles.brandSub}>Gestion d'accès aux ascenseurs</Text>
        </View>

        {/* Form card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Connexion</Text>

          <Text style={styles.fieldLabel}>Numéro de téléphone</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : 0661418895"
            placeholderTextColor="#94A3B8"
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Mot de passe</Text>
          <View style={styles.passwordRow}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              placeholder="••••••••"
              placeholderTextColor="#94A3B8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(v => !v)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.eyeIcon}>{showPassword ? '🙈' : '👁️'}</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.loginBtnText}>Se connecter</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Signup')} style={styles.signupLink}>
            <Text style={styles.signupLinkText}>
              Pas encore de compte ?{'  '}
              <Text style={styles.signupLinkBold}>S'inscrire</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1B3A6B' },
  flex: { flex: 1 },

  brandArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  iconBox: {
    width: 76,
    height: 76,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: { fontSize: 38 },
  brandTitle: { color: 'white', fontSize: 28, fontWeight: '800', textAlign: 'center' },
  brandSub: { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginTop: 6 },

  card: {
    backgroundColor: 'white',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 40,
  },
  cardTitle: { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 24 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#1E293B', marginBottom: 8, marginTop: 4 },
  input: {
    backgroundColor: '#F0F4F8',
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: '#1E293B',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  passwordRow: { position: 'relative' },
  passwordInput: { paddingRight: 48, marginBottom: 24 },
  eyeBtn: { position: 'absolute', right: 14, top: 14 },
  eyeIcon: { fontSize: 18 },

  loginBtn: {
    backgroundColor: '#1B3A6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 6,
  },
  loginBtnDisabled: { opacity: 0.65 },
  loginBtnText: { color: 'white', fontSize: 16, fontWeight: '700' },

  signupLink: { marginTop: 18, alignItems: 'center' },
  signupLinkText: { color: '#64748B', fontSize: 14 },
  signupLinkBold: { color: '#1B3A6B', fontWeight: '700' },
});
