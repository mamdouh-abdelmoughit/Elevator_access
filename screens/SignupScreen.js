import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
  SafeAreaView, KeyboardAvoidingView, Platform,
  StatusBar, ActivityIndicator, StyleSheet, ScrollView,
} from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function SignupScreen({ navigation }) {
  const [name,         setName]         = useState('');
  const [phone,        setPhone]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);

  const handleSignup = async () => {
    if (!name || !phone || !password) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs.');
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password, role: 'MANAGER' }),
      });
      const data = await response.json();

      if (response.ok) {
        Alert.alert(
          'Compte créé',
          `Le compte de "${data.name}" a été créé. Vous pouvez maintenant vous connecter.`,
          [{ text: 'Se connecter', onPress: () => navigation.navigate('Login') }],
        );
      } else {
        Alert.alert('Erreur', data.error || 'Une erreur est survenue.');
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
        {/* Branding */}
        <View style={styles.brandArea}>
          <View style={styles.iconBox}>
            <Text style={styles.iconText}>🏢</Text>
          </View>
          <Text style={styles.brandTitle}>Espace Syndic</Text>
          <Text style={styles.brandSub}>Créer votre compte</Text>
        </View>

        {/* Form card */}
        <ScrollView
          style={styles.card}
          contentContainerStyle={styles.cardContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.cardTitle}>Inscription</Text>

          <Text style={styles.fieldLabel}>Nom complet</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex : Ahmed Benali"
            placeholderTextColor="#94A3B8"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />

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
            style={[styles.signupBtn, loading && styles.signupBtnDisabled]}
            onPress={handleSignup}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="white" />
              : <Text style={styles.signupBtnText}>Créer mon compte</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLink}>
            <Text style={styles.loginLinkText}>
              Déjà un compte ?{'  '}
              <Text style={styles.loginLinkBold}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#1B3A6B' },
  flex: { flex: 1 },

  brandArea: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingTop: 40,
    paddingBottom: 24,
  },
  iconBox: {
    width: 68,
    height: 68,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconText:  { fontSize: 34 },
  brandTitle: { color: 'white', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  brandSub:   { color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center', marginTop: 5 },

  card:        { backgroundColor: 'white', borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  cardContent: { padding: 28, paddingBottom: 40 },
  cardTitle:   { fontSize: 22, fontWeight: '800', color: '#1E293B', marginBottom: 24 },

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
  passwordRow:  { position: 'relative' },
  passwordInput: { paddingRight: 48, marginBottom: 24 },
  eyeBtn:       { position: 'absolute', right: 14, top: 14 },
  eyeIcon:      { fontSize: 18 },

  signupBtn: {
    backgroundColor: '#1B3A6B',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 6,
  },
  signupBtnDisabled: { opacity: 0.65 },
  signupBtnText:     { color: 'white', fontSize: 16, fontWeight: '700' },

  loginLink:     { marginTop: 18, alignItems: 'center' },
  loginLinkText: { color: '#64748B', fontSize: 14 },
  loginLinkBold: { color: '#1B3A6B', fontWeight: '700' },
});
