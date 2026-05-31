import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getComments, addComment } from '../services/firebaseService';
import { useTheme } from '../context/ThemeContext';

export const CommentsModal = ({ visible, soundId, onClose }) => {
  const { colors } = useTheme();
  const dynStyles = React.useMemo(() => createStyles(colors), [colors]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (visible && soundId) {
      loadComments();
    }
  }, [visible, soundId]);

  const loadComments = async () => {
    try {
      setLoading(true);
      const data = await getComments(soundId);
      setComments(data);
    } catch (error) {
      console.error('Error loading comments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!newComment.trim()) return;

    try {
      setSending(true);
      await addComment(soundId, newComment);
      setNewComment('');
      loadComments();
    } catch (error) {
      Alert.alert('Errore', 'Impossibile inviare il commento');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={dynStyles.container}
      >
        <View style={dynStyles.modalContent}>
          <View style={dynStyles.header}>
            <Text style={dynStyles.headerTitle}>💬 Commenti</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={dynStyles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={dynStyles.loadingContainer}>
              <ActivityIndicator color={colors.accent || "#00FF9C"} />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={dynStyles.commentsList}
              renderItem={({ item }) => (
                <View style={dynStyles.commentItem}>
                  <View style={dynStyles.commentHeader}>
                    <Text style={dynStyles.commentAvatar}>{item.userAvatar}</Text>
                    <View style={dynStyles.commentInfo}>
                      <Text style={dynStyles.commentUsername}>{item.username}</Text>
                      <Text style={dynStyles.commentTime}>
                        {item.createdAt.toLocaleString()}
                      </Text>
                    </View>
                  </View>
                  <Text style={dynStyles.commentText}>{item.text}</Text>
                </View>
              )}
              ListEmptyComponent={
                <View style={dynStyles.emptyState}>
                  <Text style={dynStyles.emptyText}>Nessun commento ancora</Text>
                  <Text style={dynStyles.emptySubtext}>Sii il primo a commentare!</Text>
                </View>
              }
            />
          )}

          <View style={dynStyles.inputContainer}>
            <TextInput
              style={dynStyles.input}
              placeholder="Scrivi un commento..."
              placeholderTextColor={colors.textSecondary || "#94a3b8"}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
            />
            <TouchableOpacity
              style={[dynStyles.sendButton, sending && dynStyles.sendButtonDisabled]}
              onPress={handleSend}
              disabled={sending || !newComment.trim()}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.bg} />
              ) : (
                <Text style={dynStyles.sendButtonText}>➤</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (colors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '80%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  closeButton: {
    fontSize: 24,
    color: colors.textSecondary,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentsList: {
    padding: 16,
  },
  commentItem: {
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  commentAvatar: {
    fontSize: 24,
    marginRight: 8,
  },
  commentInfo: {
    flex: 1,
  },
  commentUsername: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  commentTime: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  commentText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 16,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderRadius: 12,
    padding: 12,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    maxHeight: 100,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    fontSize: 20,
    color: colors.bg,
  },
});
