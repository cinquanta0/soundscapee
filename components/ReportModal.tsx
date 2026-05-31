import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Alert,
  StyleSheet
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db as firestoreDb, auth } from '../firebaseConfig';
import { useTheme } from '../context/ThemeContext';

interface ReportModalProps {
  visible: boolean;
  onClose: () => void;
  targetId: string;
  targetType: 'audio' | 'user' | 'map' | 'profile';
  onReportSuccess?: () => void;
}

export default function ReportModal({ visible, onClose, targetId, targetType, onReportSuccess }: ReportModalProps) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const dynStyles = React.useMemo(() => createStyles(colors), [colors]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason('');
      setNote('');
      setSent(false);
      setLoading(false);
    }
  }, [visible]);

  const handleSendReport = async () => {
    if (!reason || !auth.currentUser) return;
    setLoading(true);
    try {
      const myUid = auth.currentUser.uid;
      
      const q = query(
        collection(firestoreDb, 'reports'),
        where('userId', '==', myUid),
        where('targetId', '==', targetId)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        Alert.alert(t('common.info', 'Info'), t('report.alreadyReported', 'Hai già inviato una segnalazione per questo contenuto.'));
        onClose();
        return;
      }

      await addDoc(collection(firestoreDb, 'reports'), {
        userId: myUid,
        targetId,
        targetType,
        reason,
        note: note.trim(),
        timestamp: serverTimestamp(),
        status: 'pending'
      });
      
      setSent(true);
      if (onReportSuccess) onReportSuccess();
    } catch (err) {
      console.error('Report error:', err);
      Alert.alert(t('common.error', 'Errore'), t('report.errors.cannotSend', 'Impossibile inviare la segnalazione.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={() => { Keyboard.dismiss(); onClose(); }}
    >
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); onClose(); }}>
        <View style={dynStyles.modalOverlay}>
          <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <View style={dynStyles.modalContent}>
              {sent ? (
                <View style={dynStyles.sentContainer}>
                  <View style={dynStyles.checkIconWrapper}>
                    <Feather name="check" size={22} color={colors.success || "#10b981"} />
                  </View>
                  <Text style={dynStyles.sentText}>{t('report.sent', 'Segnalazione inviata.')}</Text>
                  <TouchableOpacity style={dynStyles.closeButton} onPress={onClose}>
                    <Text style={{ color: colors.text }}>{t('common.close', 'Chiudi')}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <View style={dynStyles.modalHeader}>
                    <Text style={dynStyles.modalTitle}>{t('report.title', 'Segnala')}</Text>
                    <TouchableOpacity onPress={onClose}>
                      <Feather name="x" size={22} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </View>
                  <Text style={dynStyles.subtitle}>{t('report.selectReason', 'Seleziona un motivo per la segnalazione:')}</Text>
                  <View style={dynStyles.reasonsContainer}>
                    {[
                      { key: 'Spam', label: t('report.spam', 'Spam') },
                      { key: 'Molestie', label: t('report.harassment', 'Molestie / Bullismo') },
                      { key: 'Inappropriato', label: t('report.inappropriate', 'Inappropriato') },
                      { key: 'Odio', label: t('report.hate', 'Incitamento all\'Odio') },
                      { key: 'Altro', label: t('report.other', 'Altro') },
                    ].map(({ key, label }) => (
                      <TouchableOpacity
                        key={key}
                        style={[
                          dynStyles.reasonBtn,
                          reason === key && dynStyles.reasonBtnActive
                        ]}
                        onPress={() => setReason(key)}
                      >
                        <Text style={[dynStyles.reasonText, reason === key && dynStyles.reasonTextActive]}>
                          {label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={dynStyles.input}
                    placeholder={t('report.notesPlaceholder', 'Aggiungi un commento opzionale...')}
                    placeholderTextColor={colors.textSecondary}
                    multiline
                    value={note}
                    onChangeText={setNote}
                  />
                  <TouchableOpacity
                    style={[dynStyles.submitBtn, (!reason || loading) && dynStyles.submitBtnDisabled]}
                    onPress={handleSendReport}
                    disabled={!reason || loading}
                  >
                    {loading ? (
                      <ActivityIndicator color={colors.bg} />
                    ) : (
                      <Text style={dynStyles.submitBtnText}>{t('report.submit', 'Invia Segnalazione')}</Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: { color: colors.textSecondary, fontSize: 13, marginBottom: 14 },
  reasonsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  reasonBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  reasonBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + '20',
  },
  reasonText: { color: colors.textSecondary, fontSize: 13 },
  reasonTextActive: { color: colors.accent, fontWeight: '600' },
  input: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    color: colors.text,
    fontSize: 13,
    marginBottom: 16,
    minHeight: 80,
    textAlignVertical: 'top'
  },
  submitBtn: {
    backgroundColor: colors.accent,
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    backgroundColor: colors.accent + '50',
  },
  submitBtnText: { color: colors.bg, fontWeight: '700', fontSize: 15 },
  sentContainer: { alignItems: 'center', padding: 20, gap: 12 },
  checkIconWrapper: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(16,185,129,0.15)',
    borderWidth: 1, borderColor: 'rgba(16,185,129,0.35)',
    alignItems: 'center', justifyContent: 'center'
  },
  sentText: { color: colors.text, fontSize: 16, fontWeight: '600' },
  closeButton: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
    backgroundColor: colors.border,
    borderRadius: 10
  }
});
