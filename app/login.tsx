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
import { functions } from '../firebaseConfig';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { useRouter } from 'expo-router';
import { C, T, S, R } from '../constants/design';
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
      Alert.alert(t('auth.errors.invalidEmail'));
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
        Alert.alert(t('common.error'), t('auth.errors.emptyPassword'));
        setLoading(false);
        return;
      }
      if (isSignUp && password.length < 8) {
        Alert.alert(t('common.error'), t('auth.errors.passwordTooShort'));
        setLoading(false);
        return;
      }

      if (isSignUp) {
        const cred = await createUserWithEmailAndPassword(auth, emailTrimmed, password);
        await httpsCallable(functions, 'upsertSchoolProfile')({}).catch(() => {});
        await sendEmailVerification(cred.user);
        setSuccessMsg(t('auth.success.accountCreated'));
        setLoading(false);
        return;
      } else {
        await signInWithEmailAndPassword(auth, emailTrimmed, password);
        httpsCallable(functions, 'upsertSchoolProfile')({}).catch(() => {});
        router.replace('/(tabs)');
      }
    } catch (error: any) {
      const code = error?.code || '';
      const em = t('common.error');
      if (code === 'auth/email-already-in-use') Alert.alert(em, 'Email già registrata. Prova ad accedere.');
      else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') Alert.alert(em, 'Email o password errati.');
      else if (code === 'auth/wrong-password') Alert.alert(em, 'Password errata.');
      else if (code === 'auth/too-many-requests') Alert.alert(em, 'Troppi tentativi. Riprova tra qualche minuto.');
      else Alert.alert(em, error.message);
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
      Alert.alert(t('common.error'), error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={[C.bg, C.bgElevated, C.bg]} style={StyleSheet.absoluteFill} />

      <View style={styles.content}>
        {/* Logo */}
        <View style={styles.logoContainer}>
          <Text style={styles.logo}>🎧</Text>
          <Text style={styles.title}>SoundScape</Text>
          <Text style={styles.subtitle}>{t('auth.subtitle')}</Text>
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
                {isForgot ? t('common.send') : isSignUp ? t('auth.signUp') : t('auth.signIn')}
              </Text>
            )}
          </TouchableOpacity>

          {!isForgot && !isSignUp && (
            <TouchableOpacity
              onPress={() => { setIsForgot(true); setSuccessMsg(''); }}
              disabled={loading}
            >
              <Text style={styles.forgotLink}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>
          )}

          {isForgot ? (
            <TouchableOpacity onPress={() => { setIsForgot(false); setSuccessMsg(''); }} disabled={loading}>
              <Text style={styles.switchText}>{t('auth.alreadyHaveAccount')}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              onPress={() => { setIsSignUp(!isSignUp); setSuccessMsg(''); }}
              disabled={loading}
            >
              <Text style={styles.switchText}>
                {isSignUp ? t('auth.alreadyHaveAccount') : t('auth.noAccount')}
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
              <Text style={styles.anonymousButtonText}>{t('auth.continueAsGuest')}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Info */}
        <Text style={styles.infoText}>{t('auth.termsInfo')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  content: {
    flex: 1,
    padding: S.xxl,
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: S.huge,
  },
  logo: {
    fontSize: 80,
    marginBottom: S.lg,
  },
  title: {
    ...T.displayL,
    color: C.textPrimary,
    marginBottom: S.sm,
    textAlign: 'center',
  },
  subtitle: {
    ...T.bodyL,
    color: C.textSecondary,
    textAlign: 'center',
  },
  form: {
    marginBottom: S.xxl,
  },
  input: {
    backgroundColor: C.bgInput,
    borderRadius: R.sm,
    paddingHorizontal: S.lg,
    paddingVertical: 14,
    color: C.textPrimary,
    fontSize: 16,
    marginBottom: S.md,
    borderWidth: 1,
    borderColor: C.border,
  },
  primaryButton: {
    backgroundColor: C.accent,
    borderRadius: R.sm,
    paddingVertical: S.lg,
    alignItems: 'center',
    marginTop: S.sm,
    shadowColor: C.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryButtonText: {
    ...T.body,
    color: C.textOnAccent,
    fontWeight: '700',
  },
  switchText: {
    ...T.body,
    color: C.accent,
    textAlign: 'center',
    marginTop: S.lg,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: S.xxl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerText: {
    ...T.label,
    color: C.textMuted,
    paddingHorizontal: S.lg,
    fontWeight: '600',
  },
  anonymousButton: {
    backgroundColor: C.glass,
    borderRadius: R.sm,
    paddingVertical: S.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.borderStrong,
  },
  anonymousButtonText: {
    ...T.body,
    color: C.textPrimary,
    fontWeight: '600',
  },
  infoText: {
    ...T.label,
    color: C.textMuted,
    textAlign: 'center',
    marginTop: S.xxl,
    lineHeight: 18,
  },
  forgotLink: {
    ...T.bodyS,
    color: C.accent,
    textAlign: 'right',
    marginTop: S.xs,
    marginBottom: S.sm,
  },
  forgotDesc: {
    ...T.body,
    color: C.textSecondary,
    marginBottom: S.lg,
    textAlign: 'center',
  },
  successBox: {
    backgroundColor: C.accentDim,
    borderWidth: 1,
    borderColor: C.borderAccent,
    borderRadius: R.sm,
    padding: S.md,
    marginBottom: S.lg,
  },
  successText: {
    ...T.body,
    color: C.accent,
    textAlign: 'center',
  },
});