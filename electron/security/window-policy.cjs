const configuredSessions = new WeakSet();

function secureWebPreferences(preload) {
  return {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    webviewTag: false,
    navigateOnDragDrop: false,
    safeDialogs: true,
    spellcheck: false,
  };
}

function hardenWebContents(webContents) {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.on("will-frame-navigate", (event) => event.preventDefault());
  webContents.on("will-attach-webview", (event) => event.preventDefault());

  const session = webContents.session;
  if (session && !configuredSessions.has(session)) {
    configuredSessions.add(session);
    session.setPermissionCheckHandler(() => false);
    session.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
  }
}

module.exports = { hardenWebContents, secureWebPreferences };
