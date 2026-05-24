type Handler = () => void;
let _handler: Handler | null = null;

export const notificationBannerBus = {
  register: (fn: Handler) => {
    _handler = fn;
    return () => { _handler = null; };
  },
  open: () => { _handler?.(); },
};
