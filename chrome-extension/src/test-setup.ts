// Test setup - Chrome extension mocks
(global as any).chrome = {
  runtime: {
    sendMessage: () => {},
    onMessage: {
      addListener: () => {}
    }
  },
  storage: {
    local: {
      get: () => {},
      set: () => {}
    }
  }
};
