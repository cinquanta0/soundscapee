import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { auth } from '../firebaseConfig';
import { Conversazione, listenConversazioni, convId } from '../services/messaggiService';
import ChatScreen from './ChatScreen';

interface OtherUser {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
}

function timeAgo(d: Date) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'ora';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}g`;
}

// ─── Conversation row ──────────────────────────────────────────────────────────
function ConvRow({ conv, onPress }: { conv: Conversazione; onPress: () => void }) {
  const isMe = conv.lastSenderId === auth.currentUser?.uid;
  const initial = conv.otherUserName[0]?.toUpperCase() || '?';
  return (
    <TouchableOpacity style={cr.row} onPress={onPress} activeOpacity={0.8}>
      <View style={cr.avatar}>
        <Text style={cr.avatarTxt}>{initial}</Text>
        {conv.unread > 0 && (
          <View style={cr.badge}>
            <Text style={cr.badgeTxt}>{conv.unread > 9 ? '9+' : conv.unread}</Text>
          </View>
        )}
      </View>
      <View style={cr.info}>
        <View style={cr.top}>
          <Text style={cr.name}>{conv.otherUserName}</Text>
          <Text style={cr.time}>{timeAgo(conv.lastTimestamp)}</Text>
        </View>
        <View style={cr.bottom}>
          <Text style={cr.preview}>
            {isMe ? '▶ ' : '🎤 '}{conv.lastDuration}s
          </Text>
          {isMe && (
            <Text style={[cr.check, { color: conv.lastMessageAscoltato ? '#00FF9C' : '#858585' }]}>
              {conv.lastMessageAscoltato ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── New conversation search ───────────────────────────────────────────────────
function NewConvModal({ onSelect, onClose }: { onSelect: (user: OtherUser) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [query_text, setQueryText] = useState('');
  const [results, setResults] = useState<OtherUser[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async (text: string) => {
    setQueryText(text);
    if (text.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const q = query(
        collection(db, 'users'),
        where('username', '>=', text.toLowerCase()),
        where('username', '<=', text.toLowerCase() + '\uf8ff'),
        limit(10),
      );
      const snap = await getDocs(q);
      const me = auth.currentUser?.uid;
      setResults(
        snap.docs
          .filter((d) => d.id !== me)
          .map((d) => ({
            id: d.id,
            displayName: d.data().displayName || d.data().username || t('messages.defaultUser'),
            username: d.data().username || '',
            avatar: d.data().avatar || '🎵',
          })),
      );
    } catch { /* silenzioso */ }
    finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView
      style={nm.overlay}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      <View style={nm.sheet}>
        <LinearGradient colors={['#0D0D11', '#141420']} style={[StyleSheet.absoluteFill, { borderRadius: 20 }]} />
        <View style={nm.handle} />
        <Text style={nm.title}>{t('messages.newConversation')}</Text>
        <TextInput
          style={nm.input}
          placeholder={t('messages.searchPlaceholder')}
          placeholderTextColor="#4A4D56"
          value={query_text}
          onChangeText={search}
          autoFocus
        />
        {loading && <ActivityIndicator color="#00FF9C" style={{ marginTop: 10 }} />}
        {results.map((u) => (
          <TouchableOpacity key={u.id} style={nm.resultRow} onPress={() => onSelect(u)}>
            <View style={nm.resultAvatar}>
              <Text style={nm.resultAvatarTxt}>{u.displayName[0]?.toUpperCase()}</Text>
            </View>
            <View>
              <Text style={nm.resultName}>{u.displayName}</Text>
              <Text style={nm.resultUser}>@{u.username}</Text>
            </View>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={nm.cancelBtn} onPress={onClose}>
          <Text style={nm.cancelTxt}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
interface Props {
  initialChat?: { userId: string; userName: string; userAvatar: string } | null;
  onViewProfile?: (userId: string) => void;
}

export default function MessagesScreen({ initialChat, onViewProfile }: Props) {
  const { t } = useTranslation();
  const [conversations, setConversations] = useState<Conversazione[]>([]);
  const [activeChat, setActiveChat] = useState<{ userId: string; userName: string; userAvatar: string } | null>(initialChat ?? null);
  const [showNewConv, setShowNewConv] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const me = auth.currentUser;

  useEffect(() => {
    if (!me) return;
    const unsub = listenConversazioni(me.uid, (convs) => {
      setConversations(convs);
      setTotalUnread(convs.reduce((acc, c) => acc + c.unread, 0));
    });
    return unsub;
  }, [me?.uid]);

  // Apri chat diretta se viene passato initialChat
  useEffect(() => {
    if (initialChat) setActiveChat(initialChat);
  }, [initialChat]);

  if (activeChat) {
    return (
      <ChatScreen
        conversationId={convId(me!.uid, activeChat.userId)}
        otherUserId={activeChat.userId}
        otherUserName={activeChat.userName}
        otherUserAvatar={activeChat.userAvatar}
        onBack={() => setActiveChat(null)}
        onViewProfile={onViewProfile}
      />
    );
  }

  return (
    <View style={ms.container}>
      <LinearGradient colors={['#050508', '#0D0D1A']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={ms.header}>
        <Text style={ms.headerTitle}>{t('nav.messages')}</Text>
        <TouchableOpacity style={ms.newBtn} onPress={() => setShowNewConv(true)}>
          <Text style={ms.newBtnTxt}>{t('messages.newBtn')}</Text>
        </TouchableOpacity>
      </View>

      {conversations.length === 0 ? (
        <View style={ms.empty}>
          <Text style={{ fontSize: 48, marginBottom: 12 }}>🎤</Text>
          <Text style={ms.emptyTitle}>{t('messages.emptyTitle')}</Text>
          <Text style={ms.emptyDesc}>{t('messages.emptyDesc')}</Text>
          <TouchableOpacity style={ms.emptyBtn} onPress={() => setShowNewConv(true)}>
            <Text style={ms.emptyBtnTxt}>{t('messages.newConvBtn')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ConvRow
              conv={item}
              onPress={() => setActiveChat({ userId: item.otherUserId, userName: item.otherUserName, userAvatar: item.otherUserAvatar })}
            />
          )}
          contentContainerStyle={{ paddingTop: 8 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {showNewConv && (
        <NewConvModal
          onSelect={(u) => {
            setShowNewConv(false);
            setActiveChat({ userId: u.id, userName: u.displayName, userAvatar: u.avatar });
          }}
          onClose={() => setShowNewConv(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const cr = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,156,0.05)' },
  avatar: { position: 'relative', width: 46, height: 46, borderRadius: 23, backgroundColor: '#161616', borderWidth: 2, borderColor: '#00FF9C', alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#00FF9C', fontSize: 18, fontWeight: '700' },
  badge: { position: 'absolute', top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: '#00FF9C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeTxt: { color: '#001A0D', fontSize: 9, fontWeight: '800' },
  info: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  name: { color: '#F5F5F5', fontSize: 14, fontWeight: '700', letterSpacing: -0.1 },
  time: { color: '#9A9A9A', fontSize: 11, fontVariant: ['tabular-nums'] as any },
  bottom: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  preview: { color: '#9A9A9A', fontSize: 12 },
  check: { fontSize: 11 },
});

const nm = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end', zIndex: 100 },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, overflow: 'hidden', minHeight: 300 },
  handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'center', marginBottom: 18 },
  title: { color: '#F5F5F5', fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 14 },
  input: { backgroundColor: '#161616', borderRadius: 28, paddingHorizontal: 16, paddingVertical: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', marginBottom: 10 },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  resultAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#161616', borderWidth: 2, borderColor: '#00FF9C', alignItems: 'center', justifyContent: 'center' },
  resultAvatarTxt: { color: '#00FF9C', fontSize: 16, fontWeight: '700' },
  resultName: { color: '#F5F5F5', fontSize: 14, fontWeight: '600', letterSpacing: -0.1 },
  resultUser: { color: '#9A9A9A', fontSize: 11 },
  cancelBtn: { marginTop: 14, padding: 13, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', alignItems: 'center' },
  cancelTxt: { color: '#9A9A9A', fontSize: 14, fontWeight: '500' },
});

const ms = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050508' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,255,156,0.08)' },
  headerTitle: { color: '#fff', fontSize: 26, fontStyle: 'normal', fontWeight: '700', letterSpacing: 0.5 },
  newBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: 'rgba(0,255,156,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.3)' },
  newBtnTxt: { color: '#00FF9C', fontSize: 12, fontVariant: ['tabular-nums'] as any },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { color: '#fff', fontSize: 20, fontStyle: 'normal', marginBottom: 6 },
  emptyDesc: { color: '#858585', fontSize: 13, fontVariant: ['tabular-nums'] as any, marginBottom: 24 },
  emptyBtn: { paddingHorizontal: 20, paddingVertical: 11, borderRadius: 24, backgroundColor: 'rgba(0,255,156,0.1)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.3)' },
  emptyBtnTxt: { color: '#00FF9C', fontSize: 13, fontVariant: ['tabular-nums'] as any },
});
