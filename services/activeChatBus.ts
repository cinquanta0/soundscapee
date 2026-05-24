let _activeUserId: string | null = null;

export const activeChatBus = {
  setActive: (userId: string | null) => { _activeUserId = userId; },
  getActive: () => _activeUserId,
};
