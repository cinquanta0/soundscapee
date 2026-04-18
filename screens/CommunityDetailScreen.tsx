import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform, Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { auth } from '../firebaseConfig';
import {
  Community, CommunityMessage, CommunityMember, JoinRequest,
  listenToChat, listenToMembers, listenToJoinRequests,
  sendVoiceMessage, deleteMessage, toggleReaction, pinMessage,
  approveJoinRequest, rejectJoinRequest,
  setMemberRole, kickMember,
  leaveCommunity,
} from '../services/communityService';
import { deleteCommunity } from '../services/firebaseService';

const REACTION_EMOJIS = ['❤️', '🔥', '🎵', '👏', '😂', '🎤'];

function fmtDuration(s: number): string {
  return `${Math.floor(s / 60)}:${String(Math.floor(s) % 60).padStart(2, '0')}`;
}

function timeAgo(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diff < 60) return 'ora';
  if (diff < 3600) return `${Math.floor(diff / 60)}min fa`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h fa`;
  return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
}

// ─── Componente singolo messaggio vocale ──────────────────────────────────────
interface MessageBubbleProps {
  msg: CommunityMessage;
  isMe: boolean;
  isAdmin: boolean;
  onReact: (emoji: string) => void;
  onPin: () => void;
  onDelete: () => void;
}

function MessageBubble({ msg, isMe, isAdmin, onReact, onPin, onDelete }: MessageBubbleProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [showReactions, setShowReactions] = useState(false);
  const soundRef = useRef<Audio.Sound | null>(null);

  const totalReactions = Object.values(msg.reactions).reduce((acc, users) => acc + users.length, 0);
  const myUid = auth.currentUser?.uid ?? '';

  useEffect(() => {
    return () => {
      soundRef.current?.stopAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const togglePlay = async () => {
    if (isPlaying) {
      await soundRef.current?.pauseAsync();
      setIsPlaying(false);
      return;
    }
    if (soundRef.current) {
      await soundRef.current.playAsync();
      setIsPlaying(true);
      return;
    }
    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const { sound } = await Audio.Sound.createAsync({ uri: msg.audioUrl }, { shouldPlay: true });
      sound.setOnPlaybackStatusUpdate((s) => {
        if (!s.isLoaded) return;
        setIsPlaying(s.isPlaying);
        setPosition(s.positionMillis / 1000);
        if (s.didJustFinish) {
          setIsPlaying(false);
          setPosition(0);
          soundRef.current = null;
          sound.unloadAsync().catch(() => {});
        }
      });
      soundRef.current = sound;
      setIsPlaying(true);
    } catch {
      Alert.alert('Errore', 'Impossibile riprodurre il messaggio');
    }
  };

  const progress = msg.audioDuration > 0 ? Math.min(1, position / msg.audioDuration) : 0;

  return (
    <View style={[s.bubbleRow, isMe && s.bubbleRowMe]}>
      {!isMe && <Text style={s.bubbleAvatar}>{msg.senderAvatar}</Text>}
      <View style={[s.bubble, isMe && s.bubbleMe]}>
        {!isMe && <Text style={s.bubbleSender}>{msg.senderName}</Text>}

        {/* Player audio */}
        <Pressable
          style={s.player}
          onLongPress={() => setShowReactions((v) => !v)}
        >
          <TouchableOpacity style={s.playBtn} onPress={togglePlay}>
            <Text style={s.playIcon}>{isPlaying ? '⏸' : '▶'}</Text>
          </TouchableOpacity>
          <View style={s.waveBar}>
            <View style={[s.waveProgress, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={s.durationTxt}>
            {isPlaying ? fmtDuration(position) : fmtDuration(msg.audioDuration)}
          </Text>
        </Pressable>

        {msg.caption ? <Text style={s.caption}>{msg.caption}</Text> : null}

        {/* Reazioni esistenti */}
        {totalReactions > 0 && (
          <View style={s.reactionsRow}>
            {Object.entries(msg.reactions).filter(([, users]) => users.length > 0).map(([emoji, users]) => (
              <TouchableOpacity
                key={emoji}
                style={[s.reactionChip, users.includes(myUid) && s.reactionChipActive]}
                onPress={() => onReact(emoji)}
              >
                <Text style={s.reactionChipTxt}>{emoji} {users.length}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={s.bubbleTime}>{timeAgo(msg.createdAt)}</Text>
      </View>

      {/* Menu reazioni + azioni */}
      {showReactions && (
        <View style={[s.reactionMenu, isMe && s.reactionMenuMe]}>
          <View style={s.reactionMenuEmojis}>
            {REACTION_EMOJIS.map((emoji) => (
              <TouchableOpacity key={emoji} style={s.reactionMenuEmoji} onPress={() => { onReact(emoji); setShowReactions(false); }}>
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {(isMe || isAdmin) && (
            <View style={s.reactionMenuActions}>
              {isAdmin && (
                <TouchableOpacity style={s.actionBtn} onPress={() => { onPin(); setShowReactions(false); }}>
                  <Text style={s.actionBtnTxt}>{msg.isPinned ? '📌 Rimuovi pin' : '📌 Pinna'}</Text>
                </TouchableOpacity>
              )}
              {(isMe || isAdmin) && (
                <TouchableOpacity style={[s.actionBtn, s.actionBtnRed]} onPress={() => { onDelete(); setShowReactions(false); }}>
                  <Text style={[s.actionBtnTxt, { color: '#FF3B30' }]}>🗑 Elimina</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Schermata principale ─────────────────────────────────────────────────────
interface Props {
  community: Community;
  onClose: () => void;
  onCommunityDeleted?: () => void;
}

export default function CommunityDetailScreen({ community, onClose, onCommunityDeleted }: Props) {
  const [activeTab, setActiveTab] = useState<'chat' | 'members' | 'requests'>('chat');
  const [messages, setMessages] = useState<CommunityMessage[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [myRole, setMyRole] = useState<'admin' | 'moderator' | 'member' | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState<CommunityMember | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatListRef = useRef<FlatList<CommunityMessage>>(null);
  const myUid = auth.currentUser?.uid ?? '';

  const isAdmin = myRole === 'admin' || myRole === 'moderator';
  const pinnedMsg = messages.find((m) => m.isPinned);
  const [com, setCom] = useState(community);

  useEffect(() => {
    // Determina ruolo
    const memberSnap = members.find((m) => m.userId === myUid);
    setMyRole(memberSnap?.role ?? null);
  }, [members, myUid]);

  useEffect(() => {
    const unsubChat = listenToChat(community.id, (msgs) => {
      setMessages(msgs);
      setLoading(false);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 80);
    });
    const unsubMembers = listenToMembers(community.id, setMembers);
    const unsubRequests = listenToJoinRequests(community.id, setJoinRequests);

    return () => {
      unsubChat();
      unsubMembers();
      unsubRequests();
      stopRecording(true);
    };
  }, [community.id]);

  const stopRecording = useCallback(async (discard = false) => {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; }
    if (!recordingRef.current) return null;
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecording(false);
    setRecordSeconds(0);
    try {
      await rec.stopAndUnloadAsync();
      if (discard) return null;
      return rec.getURI();
    } catch { return null; }
  }, []);

  const startRecording = async () => {
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { Alert.alert('Permesso microfono necessario'); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true, staysActiveInBackground: false, shouldDuckAndroid: false });
      const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds((s) => s + 1), 1000);
    } catch {
      Alert.alert('Errore', 'Impossibile avviare la registrazione');
    }
  };

  const handleSend = async () => {
    if (sending) return;
    const uri = await stopRecording(false);
    if (!uri) return;
    setSending(true);
    try {
      await sendVoiceMessage(community.id, uri, recordSeconds, caption);
      setCaption('');
    } catch {
      Alert.alert('Errore', 'Impossibile inviare il messaggio');
    } finally {
      setSending(false);
    }
  };

  const handleReact = async (msgId: string, emoji: string) => {
    try { await toggleReaction(community.id, msgId, emoji); } catch {}
  };

  const handlePin = async (msg: CommunityMessage) => {
    try { await pinMessage(community.id, msg.id, !msg.isPinned); } catch {}
  };

  const handleDeleteMessage = (msg: CommunityMessage) => {
    Alert.alert('Elimina messaggio', 'Vuoi eliminare questo messaggio?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => {
        try { await deleteMessage(community.id, msg.id, msg.audioUrl); } catch {}
      }},
    ]);
  };

  const handleApprove = async (req: JoinRequest) => {
    try { await approveJoinRequest(community.id, req.userId, req.userName, req.userAvatar); }
    catch { Alert.alert('Errore', 'Impossibile approvare'); }
  };

  const handleReject = async (req: JoinRequest) => {
    try { await rejectJoinRequest(community.id, req.userId); }
    catch {}
  };

  const handleMemberAction = (member: CommunityMember) => {
    setSelectedMember(member);
  };

  const handleAdminActions = (member: CommunityMember) => {
    if (!isAdmin || member.userId === myUid) return;
    const isCurrentAdmin = myRole === 'admin';
    const options: { text: string; onPress: () => void; style?: 'destructive' | 'cancel' }[] = [];
    if (isCurrentAdmin) {
      if (member.role === 'member') {
        options.push({ text: '⭐ Promuovi a Moderatore', onPress: () => setMemberRole(community.id, member.userId, 'moderator').catch(() => {}) });
      } else if (member.role === 'moderator') {
        options.push({ text: '↓ Retrocedi a Membro', onPress: () => setMemberRole(community.id, member.userId, 'member').catch(() => {}) });
      }
    }
    options.push({ text: '🚫 Rimuovi dalla community', style: 'destructive', onPress: () => kickMember(community.id, member.userId).catch(() => {}) });
    options.push({ text: 'Annulla', style: 'cancel', onPress: () => {} });
    Alert.alert(member.userName, 'Azioni admin', options);
  };

  const handleDeleteCommunity = () => {
    Alert.alert('Elimina community', `Vuoi eliminare "${community.name}"? Questa azione è irreversibile.`, [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Elimina', style: 'destructive', onPress: async () => {
        try {
          await deleteCommunity(community.id);
          onCommunityDeleted?.();
          onClose();
        } catch (e: any) {
          Alert.alert('Errore', e.message);
        }
      }},
    ]);
  };

  const handleLeave = () => {
    if (myRole === 'admin') {
      Alert.alert('Non puoi uscire', 'Sei l\'admin. Promuovi un altro membro come admin prima di uscire.');
      return;
    }
    Alert.alert('Esci dalla community', 'Sei sicuro di voler uscire?', [
      { text: 'Annulla', style: 'cancel' },
      { text: 'Esci', style: 'destructive', onPress: async () => {
        try { await leaveCommunity(community.id); onClose(); }
        catch { Alert.alert('Errore', 'Impossibile uscire dalla community'); }
      }},
    ]);
  };

  const isMember = myRole !== null;
  const requestsBadge = joinRequests.length;

  return (
    <View style={s.container}>
      <LinearGradient colors={['#0f172a', '#1e293b']} style={StyleSheet.absoluteFill} />

      {/* Modal profilo membro */}
      {selectedMember && (
        <Pressable style={s.profileOverlay} onPress={() => setSelectedMember(null)}>
          <Pressable style={s.profileCard} onPress={() => {}}>
            <Text style={{ fontSize: 48, textAlign: 'center', marginBottom: 8 }}>{selectedMember.userAvatar}</Text>
            <Text style={s.profileName}>{selectedMember.userName}</Text>
            <View style={[s.roleBadge, selectedMember.role === 'admin' && s.roleBadgeAdmin, selectedMember.role === 'moderator' && s.roleBadgeMod, { alignSelf: 'center', marginBottom: 16 }]}>
              <Text style={s.roleTxt}>{selectedMember.role === 'admin' ? '👑 Admin' : selectedMember.role === 'moderator' ? '🛡 Mod' : '🎵 Membro'}</Text>
            </View>
            {isAdmin && selectedMember.userId !== myUid && (
              <TouchableOpacity style={s.adminActionsBtn} onPress={() => { setSelectedMember(null); handleAdminActions(selectedMember); }}>
                <Text style={s.adminActionsTxt}>⚙️ Azioni admin</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.leaveBtn} onPress={() => setSelectedMember(null)}>
              <Text style={s.leaveTxt}>Chiudi</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      )}

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={onClose}>
          <Text style={s.backTxt}>←</Text>
        </TouchableOpacity>
        <View style={s.headerInfo}>
          <Text style={s.headerAvatar}>{com.avatar}</Text>
          <View>
            <Text style={s.headerName} numberOfLines={1}>{com.name}</Text>
            <Text style={s.headerMeta}>{com.membersCount} membri · {com.isPublic ? '🌍 Pubblica' : '🔒 Privata'}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isMember && myRole !== 'admin' && (
            <TouchableOpacity style={s.leaveBtn} onPress={handleLeave}>
              <Text style={s.leaveTxt}>Esci</Text>
            </TouchableOpacity>
          )}
          {myRole === 'admin' && community.creatorId === myUid && (
            <TouchableOpacity style={s.leaveBtn} onPress={handleDeleteCommunity}>
              <Text style={[s.leaveTxt, { color: '#ef4444' }]}>🗑</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {(['chat', 'members', ...(isAdmin ? ['requests'] : [])] as const).map((tab) => {
          const label = tab === 'chat' ? '💬 Chat' : tab === 'members' ? '👥 Membri' : `🔔 Richieste`;
          const badge = tab === 'requests' ? requestsBadge : 0;
          return (
            <TouchableOpacity key={tab} style={[s.tab, activeTab === tab && s.tabActive]} onPress={() => setActiveTab(tab)}>
              <Text style={[s.tabTxt, activeTab === tab && s.tabTxtActive]}>{label}</Text>
              {badge > 0 && <View style={s.tabBadge}><Text style={s.tabBadgeTxt}>{badge}</Text></View>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── TAB: CHAT ── */}
      {activeTab === 'chat' && (
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0}>
          {/* Messaggio pinnato */}
          {pinnedMsg && (
            <View style={s.pinnedBar}>
              <Text style={s.pinnedLabel}>📌 {pinnedMsg.senderName}</Text>
              <Text style={s.pinnedCaption} numberOfLines={1}>{pinnedMsg.caption || `Vocale ${fmtDuration(pinnedMsg.audioDuration)}`}</Text>
            </View>
          )}

          {loading ? (
            <View style={s.center}><ActivityIndicator color="#06b6d4" /></View>
          ) : (
            <FlatList
              ref={chatListRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={({ item }) => (
                <MessageBubble
                  msg={item}
                  isMe={item.senderId === myUid}
                  isAdmin={isAdmin}
                  onReact={(emoji) => handleReact(item.id, emoji)}
                  onPin={() => handlePin(item)}
                  onDelete={() => handleDeleteMessage(item)}
                />
              )}
              contentContainerStyle={{ padding: 12, paddingBottom: 8 }}
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={s.center}>
                  <Text style={{ fontSize: 48, marginBottom: 12 }}>🎤</Text>
                  <Text style={s.emptyTxt}>Nessun messaggio ancora</Text>
                  <Text style={s.emptySubTxt}>Sii il primo a mandare un vocale!</Text>
                </View>
              }
            />
          )}

          {/* Input recorder */}
          {isMember && (
            <View style={s.inputBar}>
              <TextInput
                style={s.captionInput}
                placeholder="Aggiungi una caption..."
                placeholderTextColor="rgba(255,255,255,0.3)"
                value={caption}
                onChangeText={setCaption}
                editable={!isRecording}
              />
              <View style={s.recorderRow}>
                {isRecording ? (
                  <>
                    <View style={s.recIndicator}>
                      <Text style={s.recDot}>●</Text>
                      <Text style={s.recTime}>{fmtDuration(recordSeconds)}</Text>
                    </View>
                    <TouchableOpacity style={s.discardBtn} onPress={() => stopRecording(true)}>
                      <Text style={s.discardTxt}>✕ Annulla</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[s.sendBtn, sending && s.sendBtnDisabled]} onPress={handleSend} disabled={sending}>
                      {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.sendTxt}>➤ Invia</Text>}
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity style={s.micBtn} onPress={startRecording}>
                    <Text style={s.micIcon}>🎤 Tieni premuto per registrare</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {!isMember && (
            <View style={s.notMemberBar}>
              <Text style={s.notMemberTxt}>Unisciti alla community per partecipare alla chat</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      )}

      {/* ── TAB: MEMBRI ── */}
      {activeTab === 'members' && (
        <FlatList
          data={members}
          keyExtractor={(m) => m.userId}
          contentContainerStyle={{ padding: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity style={s.memberRow} onPress={() => handleMemberAction(item)}>
              <Text style={s.memberAvatar}>{item.userAvatar}</Text>
              <View style={s.memberInfo}>
                <Text style={s.memberName}>{item.userName}{item.userId === myUid ? ' (tu)' : ''}</Text>
                <Text style={s.memberJoined}>Iscritto {timeAgo(item.joinedAt)}</Text>
              </View>
              <View style={[s.roleBadge, item.role === 'admin' && s.roleBadgeAdmin, item.role === 'moderator' && s.roleBadgeMod]}>
                <Text style={s.roleTxt}>{item.role === 'admin' ? '👑 Admin' : item.role === 'moderator' ? '🛡 Mod' : '🎵 Membro'}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── TAB: RICHIESTE ── */}
      {activeTab === 'requests' && isAdmin && (
        <FlatList
          data={joinRequests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 12 }}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={{ fontSize: 48, marginBottom: 12 }}>✅</Text>
              <Text style={s.emptyTxt}>Nessuna richiesta in attesa</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={s.requestRow}>
              <Text style={s.memberAvatar}>{item.userAvatar}</Text>
              <View style={s.memberInfo}>
                <Text style={s.memberName}>{item.userName}</Text>
                <Text style={s.memberJoined}>Richiesta {timeAgo(item.requestedAt)}</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(item)}>
                  <Text style={s.approveTxt}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rejectBtn} onPress={() => handleReject(item)}>
                  <Text style={s.rejectTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

// ─── Stili ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
  emptyTxt: { color: 'rgba(255,255,255,0.4)', fontSize: 15, fontWeight: '600' },
  emptySubTxt: { color: 'rgba(255,255,255,0.25)', fontSize: 12, marginTop: 4 },

  // Header
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, paddingTop: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  backBtn: { padding: 8, marginRight: 4 },
  backTxt: { color: '#fff', fontSize: 22, fontWeight: '300' },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerAvatar: { fontSize: 28 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  headerMeta: { color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 },
  leaveBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,59,48,0.4)' },
  leaveTxt: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },

  // Tabs
  tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#06b6d4' },
  tabTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '600' },
  tabTxtActive: { color: '#06b6d4' },
  tabBadge: { backgroundColor: '#FF3B30', borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '700' },

  // Pinned
  pinnedBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: 'rgba(6,182,212,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(6,182,212,0.2)', gap: 8 },
  pinnedLabel: { color: '#06b6d4', fontSize: 11, fontWeight: '700' },
  pinnedCaption: { flex: 1, color: 'rgba(255,255,255,0.5)', fontSize: 11 },

  // Bubbles
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 10, gap: 6 },
  bubbleRowMe: { flexDirection: 'row-reverse' },
  bubbleAvatar: { fontSize: 22, marginBottom: 4 },
  bubble: { maxWidth: '78%', backgroundColor: 'rgba(255,255,255,0.07)', borderRadius: 16, borderBottomLeftRadius: 4, padding: 10 },
  bubbleMe: { backgroundColor: 'rgba(6,182,212,0.18)', borderBottomLeftRadius: 16, borderBottomRightRadius: 4 },
  bubbleSender: { color: '#06b6d4', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  bubbleTime: { color: 'rgba(255,255,255,0.25)', fontSize: 9, marginTop: 4, textAlign: 'right' },
  caption: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 },

  // Player
  player: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 160 },
  playBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(6,182,212,0.25)', alignItems: 'center', justifyContent: 'center' },
  playIcon: { fontSize: 14 },
  waveBar: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 2, overflow: 'hidden' },
  waveProgress: { height: 4, backgroundColor: '#06b6d4', borderRadius: 2 },
  durationTxt: { color: 'rgba(255,255,255,0.45)', fontSize: 10, minWidth: 30, textAlign: 'right' },

  // Reactions
  reactionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  reactionChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: 'transparent' },
  reactionChipActive: { borderColor: '#06b6d4', backgroundColor: 'rgba(6,182,212,0.15)' },
  reactionChipTxt: { fontSize: 11, color: '#fff' },

  // Reaction menu
  reactionMenu: { position: 'absolute', bottom: '100%', left: 44, backgroundColor: '#1e293b', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, elevation: 8, zIndex: 99 },
  reactionMenuMe: { left: undefined, right: 0 },
  reactionMenuEmojis: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  reactionMenuEmoji: { padding: 4 },
  reactionMenuActions: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)', paddingTop: 8, gap: 4 },
  actionBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  actionBtnRed: {},
  actionBtnTxt: { color: '#fff', fontSize: 12 },

  // Input bar
  inputBar: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)', padding: 12, gap: 8, backgroundColor: '#0f172a' },
  captionInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 13 },
  recorderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  micBtn: { flex: 1, backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' },
  micIcon: { color: '#06b6d4', fontSize: 14, fontWeight: '600' },
  recIndicator: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  recDot: { color: '#FF3B30', fontSize: 16 },
  recTime: { color: '#fff', fontSize: 14, fontWeight: '600', fontFamily: 'monospace' },
  discardBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: 'rgba(255,59,48,0.15)', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' },
  discardTxt: { color: '#FF3B30', fontSize: 12, fontWeight: '600' },
  sendBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: '#06b6d4' },
  sendBtnDisabled: { opacity: 0.5 },
  sendTxt: { color: '#fff', fontSize: 13, fontWeight: '700' },
  notMemberBar: { padding: 14, alignItems: 'center', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.07)' },
  notMemberTxt: { color: 'rgba(255,255,255,0.35)', fontSize: 12 },

  // Members
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  memberAvatar: { fontSize: 26 },
  memberInfo: { flex: 1 },
  memberName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  memberJoined: { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginTop: 1 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.07)' },
  roleBadgeAdmin: { backgroundColor: 'rgba(255,215,0,0.15)' },
  roleBadgeMod: { backgroundColor: 'rgba(6,182,212,0.15)' },
  roleTxt: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },

  // Member profile modal
  profileOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  profileCard: { backgroundColor: '#1e293b', borderRadius: 20, padding: 24, width: '80%', alignItems: 'stretch', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  profileName: { fontSize: 20, fontWeight: '700', color: '#f8fafc', textAlign: 'center', marginBottom: 8 },
  adminActionsBtn: { backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 8, borderWidth: 1, borderColor: 'rgba(6,182,212,0.3)' },
  adminActionsTxt: { color: '#06b6d4', fontWeight: '600' },

  // Requests
  requestRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  approveBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(52,199,89,0.2)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(52,199,89,0.4)' },
  approveTxt: { color: '#34C759', fontSize: 16, fontWeight: '700' },
  rejectBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,59,48,0.15)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,59,48,0.3)' },
  rejectTxt: { color: '#FF3B30', fontSize: 14, fontWeight: '700' },
});
