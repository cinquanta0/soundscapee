import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../firebaseConfig';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

export default function LoginScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isForgot, setIsForgot] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleEmailAuth = async () => {
    const emailTrimmed = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailTrimmed || !emailRegex.test(emailTrimmed)) {
      Alert.alert('Errore', 'Inserisci un indirizzo email valido');
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    try {
      if (isForgot) {
        await sendPasswordResetEmail(auth, emailTrimmed);
        setSuccessMsg('Email di recupero inviata! Controlla la tua casella di posta.');
        setLoading(false);
        return;
      }

      if (!password) {
        Alert.alert('Errore', 'Inserisci la password');
        setLoading(false);
        return;
      }
      if (isSignUp && password.length < 8) {
        Alert.alert('Errore', 'La password deve essere di almeno 8 caratteri');
        setLoading(false);
        return;
      }

      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, emailTrimmed, password);
        await sendEmailVerification(cred.user);
        setSuccessMsg('Account creato! Controlla la tua email e clicca il link di verifica.');
        setLoading(false);
        return;
      } else {
        await signInWithEmailAndPassword(auth, emailTrimmed, password);
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      const code = error?.code || '';
      if (code === 'auth/email-already-in-use') Alert.alert('Errore', 'Email già registrata. Prova ad accedere.');
      else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') Alert.alert('Errore', 'Email o password errati.');
      else if (code === 'auth/wrong-password') Alert.alert('Errore', 'Password errata.');
      else if (code === 'auth/too-many-requests') Alert.alert('Errore', 'Troppi tentativi. Riprova tra qualche minuto.');
      else Alert.alert('Errore', error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAnonymous = async () => {
    setLoading(true);
    try {
      await signInAnonymously(auth);
      router.replace('/(tabs)');
    } catch (error) {
      console.error('Anonymous error:', error);
      Alert.alert('Errore', error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#0f172a', '#1e293b', '#0f172a']} style={StyleSheet.absoluteFill} />
      
      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>🎧</Text>
          <Text style={styles.title}>SoundScape</Text>
          <Text style={styles.subtitle}>Cattura i suoni del tuo mondo</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          {isForgot && (
            <Text style={styles.forgotDesc}>
              Inserisci la tua email e ti mandiamo un link per reimpostare la password.
            </Text>
          )}

          {successMsg ? (
            <View style={styles.successBox}>
              <Text style={styles.successText}>{successMsg}</Text>
            </View>
          ) : null}

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#94a3b8"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            editable={!loading}
          />

          {!isForgot && (
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#94a3b8"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />
          )}

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={handleEmailAuth}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isForgot ? 'Invia email di recupero' : isSignUp ? '📝 Registrati' : '🔑 Accedi'}
              </Text>
            )}
          </TouchableOpacity>

          {!isForgot && !isSignUp && (
            <TouchableOpacity
              onPress={() => { setIsForgot(true); setSuccessMsg(''); }}
              disabled={loading}
            >
              <Text style={styles.forgotLink}>Password dimenticata?</Text>
            </TouchableOpacity>
          )}

          {isForgot ? (
            <TouchableOpacity onPress={() => { setIsForgot(false); setSuccessMsg(''); }} disabled={loading}>
              <Text style={styles.switchText}>← Torna al login</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => { setIsSignUp(!isSignUp); setSuccessMsg(''); }}
              disabled={loading}
            >
              <Text style={styles.switchText}>
                {isSignUp ? 'Hai già un account? Accedi' : 'Non hai un account? Registrati'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {!isForgot && (
          <>
            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>OPPURE</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Anonymous */}
            <TouchableOpacity
              style={styles.anonymousButton}
              onPress={handleAnonymous}
              disabled={loading}
            >
              <Text style={styles.anonymousButtonText}>👤 Continua come ospite</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Info */}
        <Text style={styles.infoText}>
          Accedendo accetti i nostri Termini di Servizio e Privacy Policy
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 80,
    marginBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#94a3b8',
    textAlign: 'center',
  },
  form: {
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  primaryButton: {
    backgroundColor: '#0891b2',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  switchText: {
    color: '#06b6d4',
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 12,
    paddingHorizontal: 16,
    fontWeight: '600',
  },
  anonymousButton: {
    backgroundColor: '#334155',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  anonymousButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoText: {
    color: '#64748b',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },
  forgotLink: {
    color: '#06b6d4',
    fontSize: 13,
    textAlign: 'right',
    marginTop: 4,
    marginBottom: 8,
  },
  forgotDesc: {
    color: '#94a3b8',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  successText: {
    color: '#4ade80',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});