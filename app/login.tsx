import React, { useState } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, functions } from '../firebaseConfig';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
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
      Alert.alert(t('auth.errors.invalidEmail'));
      return;
    }

    setLoading(true);
    setSuccessMsg('');
    try {
      if (isForgot) {
        await sendPasswordResetEmail(auth, emailTrimmed);
        setSuccessMsg(t('auth.resetSent'));
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
      if (code === 'auth/email-already-in-use') Alert.alert(em, t('auth.errors.emailInUse'));
      else if (code === 'auth/invalid-credential' || code === 'auth/user-not-found') Alert.alert(em, t('auth.errors.invalidCredential'));
      else if (code === 'auth/wrong-password') Alert.alert(em, t('auth.errors.wrongPassword'));
      else if (code === 'auth/too-many-requests') Alert.alert(em, t('auth.errors.tooManyRequests'));
      else Alert.alert(em, error.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setIsForgot(false); setIsSignUp(false); setSuccessMsg(''); };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient colors={['#050816', '#0b1230', '#180828']} style={StyleSheet.absoluteFill} />

      {/* Ambient orbs */}
      <View style={s.orbA} />
      <View style={s.orbB} />
      <View style={s.orbC} />

      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={s.logoWrap}>
          <Image source={require('../assets/images/icon.png')} style={s.logoImg} />
          <Text style={s.tagline}>{t('auth.subtitle')}</Text>
        </View>

        {/* Card */}
        <View style={s.card}>
          {/* Card header */}
          <Text style={s.cardTitle}>
            {isForgot ? t('auth.forgotPassword') : isSignUp ? t('auth.signUp') : t('auth.signIn')}
          </Text>

          {isForgot && (
            <Text style={s.cardDesc}>{t('auth.forgotDesc')}</Text>
          )}

          {/* Success message */}
          {!!successMsg && (
            <View style={s.successBox}>
              <Text style={s.successTxt}>{successMsg}</Text>
            </View>
          )}

          {/* Email */}
          <View style={s.inputWrap}>
            <Text style={s.inputLabel}>EMAIL</Text>
            <TextInput
              style={s.input}
              placeholder="you@example.com"
              placeholderTextColor="rgba(255,255,255,0.25)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!loading}
            />
          </View>

          {/* Password */}
          {!isForgot && (
            <View style={s.inputWrap}>
              <Text style={s.inputLabel}>PASSWORD</Text>
              <TextInput
                style={s.input}
                placeholder="••••••••"
                placeholderTextColor="rgba(255,255,255,0.25)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                editable={!loading}
              />
            </View>
          )}

          {/* Forgot link */}
          {!isForgot && !isSignUp && (
            <TouchableOpacity
              onPress={() => { setIsForgot(true); setSuccessMsg(''); }}
              disabled={loading}
              style={s.forgotWrap}
            >
              <Text style={s.forgotTxt}>{t('auth.forgotPassword')}</Text>
            </TouchableOpacity>
          )}

          {/* Primary button */}
          <TouchableOpacity
            style={[s.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={handleEmailAuth}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#67E8F9', '#4FC8E0']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.primaryBtnGrad}
            >
              {loading
                ? <ActivityIndicator color="#050816" />
                : <Text style={s.primaryBtnTxt}>
                    {isForgot ? t('common.send') : isSignUp ? t('auth.signUp') : t('auth.signIn')}
                  </Text>
              }
            </LinearGradient>
          </TouchableOpacity>

          {/* Switch mode */}
          <View style={s.switchRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerTxt}>{t('common.or')}</Text>
            <View style={s.dividerLine} />
          </View>

          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={isForgot ? reset : () => { setIsSignUp(!isSignUp); setSuccessMsg(''); }}
            disabled={loading}
            activeOpacity={0.8}
          >
            <Text style={s.secondaryBtnTxt}>
              {isForgot
                ? t('auth.alreadyHaveAccount')
                : isSignUp
                  ? t('auth.alreadyHaveAccount')
                  : t('auth.noAccount')}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={s.terms}>{t('auth.termsInfo')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050816',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },

  // Orbs
  orbA: {
    position: 'absolute',
    top: -60,
    right: -80,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(103,232,249,0.07)',
  },
  orbB: {
    position: 'absolute',
    bottom: 80,
    left: -100,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(139,92,255,0.08)',
  },
  orbC: {
    position: 'absolute',
    top: '40%',
    right: -60,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(217,255,90,0.05)',
  },

  // Logo
  logoWrap: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImg: {
    width: 140,
    height: 140,
    borderRadius: 28,
    marginBottom: 16,
  },
  eyebrow: {
    color: '#67E8F9',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 4,
    marginBottom: 10,
  },
  tagline: {
    color: '#97A4C7',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 260,
  },

  // Card
  card: {
    backgroundColor: 'rgba(9,12,28,0.82)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.14)',
    padding: 28,
    marginBottom: 24,
  },
  cardTitle: {
    color: '#F7F8FF',
    fontSize: 22,
    fontWeight: '800',
    fontStyle: 'italic',
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  cardDesc: {
    color: '#97A4C7',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },

  // Success
  successBox: {
    backgroundColor: 'rgba(103,232,249,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.25)',
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  successTxt: {
    color: '#67E8F9',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },

  // Inputs
  inputWrap: {
    marginBottom: 16,
  },
  inputLabel: {
    color: '#67E8F9',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.18)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    color: '#F7F8FF',
    fontSize: 15,
  },

  // Forgot
  forgotWrap: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -4,
  },
  forgotTxt: {
    color: '#67E8F9',
    fontSize: 12,
    fontWeight: '600',
  },

  // Primary button
  primaryBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 8,
    shadowColor: '#67E8F9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  primaryBtnGrad: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnTxt: {
    color: '#050816',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Divider
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(163,177,255,0.12)',
  },
  dividerTxt: {
    color: '#4A5270',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // Secondary button
  secondaryBtn: {
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(163,177,255,0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
  },
  secondaryBtnTxt: {
    color: '#97A4C7',
    fontSize: 14,
    fontWeight: '600',
  },

  // Terms
  terms: {
    color: '#3A4260',
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 17,
  },
});
