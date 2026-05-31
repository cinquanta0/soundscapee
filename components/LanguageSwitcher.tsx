import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, FlatList, Pressable,
} from 'react-native';
import { useTranslation } from 'react-i18next';
import { changeLanguage } from '../i18n';
import { useTheme } from '../context/ThemeContext';

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
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const current = LANGUAGES.find((l) => l.code === i18n.language) || LANGUAGES[0];
  const dynStyles = React.useMemo(() => createStyles(colors), [colors]);

  const select = async (code: string) => {
    await changeLanguage(code);
    setVisible(false);
  };

  return (
    <>
      <TouchableOpacity style={dynStyles.trigger} onPress={() => setVisible(true)}>
        <Text style={dynStyles.flag}>{current.flag}</Text>
        <Text style={dynStyles.triggerLabel}>{current.label}</Text>
        <Text style={dynStyles.chevron}>›</Text>
      </TouchableOpacity>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <Pressable style={dynStyles.backdrop} onPress={() => setVisible(false)}>
          <View style={dynStyles.sheet}>
            <Text style={dynStyles.sheetTitle}>{t('language.select')}</Text>
            <FlatList
              data={LANGUAGES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[dynStyles.option, item.code === i18n.language && dynStyles.optionSelected]}
                  onPress={() => select(item.code)}
                >
                  <Text style={dynStyles.optionFlag}>{item.flag}</Text>
                  <Text style={[dynStyles.optionLabel, item.code === i18n.language && dynStyles.optionLabelSelected]}>
                    {item.label}
                  </Text>
                  {item.code === i18n.language && <Text style={dynStyles.check}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  flag: { fontSize: 20 },
  triggerLabel: { flex: 1, color: colors.text, fontSize: 15 },
  chevron: { color: colors.textSecondary, fontSize: 18 },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: 40,
    paddingHorizontal: 16,
  },
  sheetTitle: {
    color: colors.textSecondary,
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
  optionSelected: { backgroundColor: colors.textAccent + '20' },
  optionFlag: { fontSize: 22 },
  optionLabel: { flex: 1, color: colors.text, fontSize: 16 },
  optionLabelSelected: { color: colors.textAccent, fontWeight: '600' },
  check: { color: colors.textAccent, fontSize: 16, fontWeight: '700' },
});
