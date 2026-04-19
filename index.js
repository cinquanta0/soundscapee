try {
  const TrackPlayer = require('react-native-track-player').default;
  const { PlaybackService } = require('./services/trackPlayerService');
  TrackPlayer.registerPlaybackService(() => PlaybackService);
} catch (e) {
  console.warn('TrackPlayer init failed', e);
}

require('expo-router/entry');
