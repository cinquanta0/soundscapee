import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';

const LANGUAGES = [
  { code: 'it', label: 'Italiano', flag: '🇮🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'pt', label: 'Português', flag: '🇵🇹' },
];

export default function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];

  const select = async (code: string) => {
    await changeLanguage(code);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity style={styles.trigger} onPress={() => setVisible(true)}>
        <Text style={styles.flag}>{current.flag}</Text>
        <Text style={styles.triggerLabel}>{current.label}</Text>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('language.select')}</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.code === i18n.language && styles.optionSelected]}
                  onPress={() => select(item.code)}
                >
                  <Text style={styles.optionFlag}>{item.flag}</Text>
                  <Text style={[styles.optionLabel, item.code === i18n.language && styles.optionLabelSelected]}>
                    {item.label}
                  </Text>
                  {item.code === i18n.language && <Text style={styles.check}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  flag: { fontSize: 20 },
  triggerLabel: { flex: 1, color: '#f1f5f9', fontSize: 15 },
  chevron: { color: '#64748b', fontSize: 18 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    gap: 12,
    marginBottom: 4,
  },
  optionSelected: { backgroundColor: 'rgba(6, 182, 212, 0.12)' },
  optionFlag: { fontSize: 22 },
  optionLabel: { flex: 1, color: '#e2e8f0', fontSize: 16 },
  optionLabelSelected: { color: '#06b6d4', fontWeight: '600' },
  check: { color: '#06b6d4', fontSize: 16, fontWeight: '700' },
});
