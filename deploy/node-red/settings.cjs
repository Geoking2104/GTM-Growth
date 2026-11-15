/** Runtime-only Node-RED: the editor and inbound HTTP nodes are disabled. */
module.exports = {
  uiHost: "127.0.0.1",
  uiPort: 1880,
  httpAdminRoot: false,
  httpNodeRoot: false,
  disableEditor: true,
  flowFile: "/flows/local-seo.json",
  flowFilePretty: true,
  credentialSecret: process.env.NODE_RED_CREDENTIAL_SECRET,
  functionExternalModules: false,
  functionGlobalContext: {},
  externalModules: { autoInstall: false, palette: { allowInstall: false, allowUpload: false }, modules: { allowInstall: false } },
  editorTheme: { projects: { enabled: false }, palette: { editable: false } },
  logging: { console: { level: "warn", metrics: false, audit: false } },
};
