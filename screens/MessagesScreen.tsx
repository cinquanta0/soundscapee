import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { collection, query, where, getDocs, limit, getDoc, doc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { auth } from '../firebaseConfig';
import { Conversazione, listenConversazioni, convId } from '../services/messaggiService';
import { listenBlockedUsers } from '../services/blockService';
import ChatScreen from './ChatScreen';
import CallHistoryScreen from './CallHistoryScreen';
import GroupCallSetupModal from './GroupCallSetupModal';
import { useCall } from '../context/CallContext';
import { activeChatBus } from '../services/activeChatBus';
import { useTheme } from '../context/ThemeContext';
import { ThemeColors } from '../constants/themes';

interface OtherUser {
  id: string;
  displayName: string;
  username: string;
  avatar: string;
}

function timeAgo(d: Date, t: (key: string, opts?: object) => string) {
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return t('messages.timeNow');
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}${t('messages.timeDaysAbbr')}`;
}

function ConvRow({ conv, onPress }: { conv: Conversazione; onPress: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createConvRowStyles(colors), [colors]);
  const isMe = conv.lastSenderId === auth.currentUser?.uid;
  const initial = conv.otherUserName[0]?.toUpperCase() || '?';
  const preview = conv.lastType === 'text'
    ? `${isMe ? `${t('messages.you')}: ` : ''}${conv.lastText || t('messages.text')}`
    : `${isMe ? t('messages.you') : t('messages.audio')} · ${conv.lastDuration}s`;
  return (
    <TouchableOpacity style={s.row} onPress={onPress} activeOpacity={0.86}>
      <View style={s.avatarWrap}>
        {conv.otherUserPhoto ? (
          <Image source={{ uri: conv.otherUserPhoto }} style={s.avatarImg} />
        ) : /^[a-z][a-z-]*$/.test(conv.otherUserAvatar) ? (
          <View style={s.avatar}>
            <Feather name={conv.otherUserAvatar as any} size={22} color={colors.textAccent} />
          </View>
        ) : conv.otherUserAvatar ? (
          <View style={s.avatar}>
            <Text style={s.avatarEmojiTxt}>{conv.otherUserAvatar}</Text>
          </View>
        ) : (
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{initial}</Text>
          </View>
        )}
        {conv.unread > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeTxt}>{conv.unread > 9 ? '9+' : conv.unread}</Text>
          </View>
        )}
      </View>

      <View style={s.info}>
        <View style={s.top}>
          <Text style={s.name}>{conv.otherUserName}</Text>
          <Text style={s.time}>{timeAgo(conv.lastTimestamp, t)}</Text>
        </View>
        <View style={s.bottom}>
          <Text style={s.preview} numberOfLines={1}>{preview}</Text>
          {isMe && (
            <Text style={[s.check, { color: conv.lastMessageAscoltato ? '#67E8F9' : '#687392' }]}>
              {conv.lastMessageAscoltato ? '✓✓' : '✓'}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function NewConvModal({ onSelect, onClose }: { onSelect: (user: OtherUser) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const s = useMemo(() => createNewConvModalStyles(colors), [colors]);
  const [queryText, setQueryText] = useState('');
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
        where('username', '<=', text.toLowerCase() + ''),
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
            profilePicture: d.data().profilePicture || null,
          })),
      );
    } finally { setLoading(false); }
  };

  return (
    <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={s.sheet}>
        <LinearGradient colors={colors.gradientCard} style={[StyleSheet.absoluteFill, { borderRadius: 28 }]} />
        <View style={s.handle} />
        <Text style={s.eyebrow}>{t('messages.newConvEyebrow')}</Text>
        <Text style={s.title}>{t('messages.newConversation')}</Text>
        <TextInput
          style={s.input}
          placeholder={t('messages.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={queryText}
          onChangeText={search}
          autoFocus
          returnKeyType="search"
          blurOnSubmit
        />
        {loading && <ActivityIndicator color={colors.textAccent} style={{ marginTop: 12 }} />}
        {results.map((u) => (
          <TouchableOpacity key={u.id} style={s.resultRow} onPress={() => onSelect(u)}>
            <View style={[s.resultAvatar, u.profilePicture ? { overflow: 'hidden', padding: 0 } : null]}>
              {u.profilePicture
                ? <Image source={{ uri: u.profilePicture }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                : /^[a-z][a-z-]*$/.test(u.avatar)
                  ? <Feather name={u.avatar as any} size={20} color={colors.textAccent} />
                  : u.avatar
                    ? <Text style={s.resultAvatarEmojiTxt}>{u.avatar}</Text>
                    : <Text style={s.resultAvatarTxt}>{u.displayName[0]?.toUpperCase()}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.resultName}>{u.displayName}</Text>
              <Text style={s.resultUser}>@{u.username}</Text>
            </View>
            <Feather name="arrow-up-right" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
          <Text style={s.cancelTxt}>{t('common.cancel')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

interface Props {
  initialChat?: { userId: string; userName: string; userAvatar: string } | null;
  onViewProfile?: (userId: string) => void;
}

export default function MessagesScreen({ initialChat, onViewProfile }: Props) {
  const { t } = useTranslation();
  const { canRejoin } = useCall();
  const { colors } = useTheme();
  const s = useMemo(() => createMessagesScreenStyles(colors), [colors]);
  const [conversations, setConversations] = useState<Conversazione[]>([]);
  const [activeChat, setActiveChat] = useState<{ userId: string; userName: string; userAvatar: string; userPhoto?: string } | null>(initialChat ?? null);
  const [activeChatPhoto, setActiveChatPhoto] = useState<string | undefined>(undefined);
  const [showNewConv, setShowNewConv] = useState(false);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [showGroupCall, setShowGroupCall] = useState(false);
  const [totalUnread, setTotalUnread] = useState(0);
  const [blockedIds, setBlockedIds] = useState<string[]>([]);
  const me = auth.currentUser;
  const fetchedPhotosRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!me) return;
    const unsub = listenBlockedUsers(me.uid, setBlockedIds);
    return unsub;
  }, [me?.uid]);

  useEffect(() => {
    if (!me) return;
    const unsub = listenConversazioni(me.uid, (convs) => {
      setConversations(convs);
      setTotalUnread(convs.reduce((acc, c) => acc + c.unread, 0));
    }, blockedIds);
    return unsub;
  }, [me?.uid, blockedIds]);

  useEffect(() => {
    const missing = conversations.filter(
      c => !c.otherUserPhoto && !fetchedPhotosRef.current.has(c.otherUserId),
    );
    if (missing.length === 0) return;
    missing.forEach(c => fetchedPhotosRef.current.add(c.otherUserId));
    Promise.all(missing.map(c => getDoc(doc(db, 'users', c.otherUserId))))
      .then(snaps => {
        const photoMap: Record<string, string> = {};
        snaps.forEach((snap, i) => {
          const photo = snap.data()?.profilePicture;
          if (photo) photoMap[missing[i].otherUserId] = photo;
        });
        if (Object.keys(photoMap).length === 0) return;
        setConversations(prev =>
          prev.map(c => photoMap[c.otherUserId] ? { ...c, otherUserPhoto: photoMap[c.otherUserId] } : c),
        );
      })
      .catch(() => {});
  }, [conversations]);

  useEffect(() => {
    if (initialChat) setActiveChat(initialChat);
  }, [initialChat]);

  useEffect(() => {
    activeChatBus.setActive(activeChat?.userId ?? null);
    return () => activeChatBus.setActive(null);
  }, [activeChat?.userId]);

  useEffect(() => {
    if (!activeChat?.userId) { setActiveChatPhoto(undefined); return; }
    getDoc(doc(db, 'users', activeChat.userId))
      .then(snap => setActiveChatPhoto(snap.data()?.profilePicture || undefined))
      .catch(() => {});
  }, [activeChat?.userId]);

  if (activeChat) {
    return (
      <ChatScreen
        conversationId={convId(me!.uid, activeChat.userId)}
        otherUserId={activeChat.userId}
        otherUserName={activeChat.userName}
        otherUserAvatar={activeChat.userAvatar}
        otherUserPhoto={activeChatPhoto ?? activeChat.userPhoto}
        onBack={() => setActiveChat(null)}
        onViewProfile={onViewProfile}
      />
    );
  }

  if (showCallHistory) {
    return (
      <CallHistoryScreen
        userId={me!.uid}
        onClose={() => setShowCallHistory(false)}
      />
    );
  }

  return (
    <View style={s.container}>
      <LinearGradient colors={colors.gradientBg} style={StyleSheet.absoluteFill} />
      <View style={s.ambientA} />
      <View style={s.ambientB} />

      <LinearGradient colors={colors.gradientCard} style={s.hero}>
        <View style={s.heroGlow} />
        <Text style={s.eyebrow}>{t('messages.voiceInbox')}</Text>
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>{t('nav.messages')}</Text>
            <Text style={s.headerSub}>{t('messages.inboxSubtitle')}</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity style={[s.newBtn, { backgroundColor: 'rgba(0,255,156,0.12)', borderWidth: 1, borderColor: 'rgba(0,255,156,0.25)' }]} onPress={() => setShowGroupCall(true)}>
              <Feather name="users" size={15} color={colors.greenText} />
            </TouchableOpacity>
            <TouchableOpacity style={[s.newBtn, { backgroundColor: 'rgba(103,232,249,0.10)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.25)' }]} onPress={() => setShowCallHistory(true)}>
              <Feather name="phone" size={15} color={colors.textAccent} />
              {canRejoin && (
                <View style={s.callBadge}>
                  <Text style={s.callBadgeTxt}>1</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.newBtn} onPress={() => setShowNewConv(true)}>
              <Feather name="plus" size={15} color="#060913" />
            </TouchableOpacity>
          </View>
        </View>
      </LinearGradient>

      <View style={s.sectionHead}>
        <Text style={s.sectionCaption}>{t('messages.conversations')}</Text>
        <View style={s.sectionBadge}>
          <Text style={s.sectionBadgeText}>{totalUnread}</Text>
        </View>
      </View>

      {conversations.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyOrb}>
            <Text style={{ fontSize: 28 }}>{'📨'}</Text>
          </View>
          <Text style={s.emptyTitle}>{t('messages.emptyTitle')}</Text>
          <Text style={s.emptyDesc}>{t('messages.emptyDesc')}</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowNewConv(true)}>
            <Text style={s.emptyBtnTxt}>{t('messages.newConvBtn')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => c.id}
          renderItem={({ item }) => (
            <ConvRow
              conv={item}
              onPress={() => setActiveChat({ userId: item.otherUserId, userName: item.otherUserName, userAvatar: item.otherUserAvatar, userPhoto: item.otherUserPhoto })}
            />
          )}
          contentContainerStyle={{ paddingBottom: 120 }}
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

      <GroupCallSetupModal visible={showGroupCall} onClose={() => setShowGroupCall(false)} />
    </View>
  );
}

function createConvRowStyles(colors: ThemeColors) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 22,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceLight,
    },
    avatarWrap: {
      position: 'relative',
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: 'rgba(103,232,249,0.22)',
    },
    avatarTxt: {
      color: colors.textAccent,
      fontSize: 18,
      fontWeight: '800',
    },
    avatarEmojiTxt: {
      fontSize: 22,
    },
    avatarImg: {
      width: 52,
      height: 52,
      borderRadius: 26,
    },
    badge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.purple,
    },
    badgeTxt: {
      color: colors.text,
      fontSize: 9,
      fontWeight: '800',
    },
    info: { flex: 1 },
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    name: { color: colors.text, fontSize: 15, fontWeight: '800' },
    time: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    bottom: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    preview: { color: colors.textSecondary, fontSize: 12, flex: 1 },
    check: { fontSize: 11, fontWeight: '700' },
  });
}

function createNewConvModalStyles(colors: ThemeColors) {
  return StyleSheet.create({
    overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end', zIndex: 100 },
    sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20, paddingBottom: 40, overflow: 'hidden', minHeight: 320 },
    handle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.borderSubtle, alignSelf: 'center', marginBottom: 18 },
    eyebrow: { color: colors.textAccent, fontSize: 11, fontWeight: '800', letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: 8 },
    title: { color: colors.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.6, marginBottom: 14 },
    input: { backgroundColor: colors.bgInput, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 14, color: colors.text, fontSize: 14, borderWidth: 1, borderColor: colors.border, marginBottom: 10 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
    resultAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: 'rgba(103,232,249,0.22)', alignItems: 'center', justifyContent: 'center' },
    resultAvatarTxt: { color: colors.textAccent, fontSize: 16, fontWeight: '800' },
    resultAvatarEmojiTxt: { fontSize: 22 },
    resultName: { color: colors.text, fontSize: 14, fontWeight: '700' },
    resultUser: { color: colors.textSecondary, fontSize: 11 },
    cancelBtn: { marginTop: 16, padding: 14, borderRadius: 16, backgroundColor: colors.surfaceLight, borderWidth: 1, borderColor: colors.borderSubtle, alignItems: 'center' },
    cancelTxt: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  });
}

function createMessagesScreenStyles(colors: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    ambientA: { position: 'absolute', right: -80, top: 70, width: 240, height: 240, borderRadius: 120, backgroundColor: 'rgba(103,232,249,0.08)' },
    ambientB: { position: 'absolute', left: -70, top: 260, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(139,92,255,0.08)' },
    hero: { marginHorizontal: 16, marginTop: 4, marginBottom: 14, borderRadius: 26, borderWidth: 1, borderColor: colors.border, padding: 18, overflow: 'hidden' },
    heroGlow: { position: 'absolute', right: -20, top: -24, width: 150, height: 150, borderRadius: 999, backgroundColor: 'rgba(139,92,255,0.12)' },
    eyebrow: { color: colors.textAccent, fontSize: 11, fontWeight: '800', letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8 },
    header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
    headerTitle: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
    headerSub: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: '90%' },
    newBtn: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(103,232,249,0.14)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.28)' },
    callBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#FF3B30', alignItems: 'center', justifyContent: 'center' },
    callBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '800' },
    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, marginBottom: 10 },
    sectionCaption: { color: colors.textAccent, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
    sectionBadge: { minWidth: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bgInput, borderWidth: 1, borderColor: 'rgba(79,124,255,0.22)' },
    sectionBadgeText: { color: '#4F7CFF', fontSize: 14, fontWeight: '800' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyOrb: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(103,232,249,0.08)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.2)', marginBottom: 16 },
    emptyTitle: { color: colors.text, fontSize: 22, fontWeight: '800', marginBottom: 8 },
    emptyDesc: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
    emptyBtn: { paddingHorizontal: 18, paddingVertical: 12, borderRadius: 20, backgroundColor: 'rgba(103,232,249,0.12)', borderWidth: 1, borderColor: 'rgba(103,232,249,0.24)' },
    emptyBtnTxt: { color: colors.textAccent, fontSize: 13, fontWeight: '700' },
  });
}
