// preload.js
// @01. 細かな修正 2024.10.28 traettal.systems
// @02 zoom Meeting IDの廃止 2025.07.31 traetal.systems
const { contextBridge, ipcRenderer } = require('electron');

// ipcRenderer をレンダラープロセスに安全に公開
contextBridge.exposeInMainWorld('electronAPI', {
    createAndSendPDF: (pdfContent, sessionDateTime, password, recipientEmail, senderName, recipientName) => ipcRenderer.invoke('create-and-send-pdf', pdfContent, sessionDateTime, password, recipientEmail, senderName, recipientName),
    // createPDF: (data) => ipcRenderer.send('create-pdf', data),
    // onPdfCreated: (callback) => ipcRenderer.on('pdf-created', callback),
    switchHtml: (page) => ipcRenderer.send('switch-html', page),
    switchHtmlWithData: (page, data) => ipcRenderer.send('switch-html-with-data', page, data),
    onPageData: (callback) => ipcRenderer.once('page-data', (event, data) => callback(data)),
    saveXML: (xmlString) => ipcRenderer.invoke('save-xml', xmlString),
    loadXML: () => ipcRenderer.invoke('load-xml'),
    saveSession: (sessionFilePath, sessionXMLString) => ipcRenderer.invoke('save-session', sessionFilePath, sessionXMLString),
    loadSession: (sessionFilePath) => ipcRenderer.invoke('load-session', sessionFilePath),
    deleteSessionFile: (sessionFilePath) => ipcRenderer.invoke('delete-session-file', sessionFilePath),
    //@02d  showMeetingIdPrompt: () => ipcRenderer.invoke('show-meeting-id-prompt')    //@01a
    getSpeechService: () => ipcRenderer.invoke('get-speech-service'),                   //@04a
    onSpeechRecognitionStatus: (callback) => {                                          //@04a
        ipcRenderer.on('speech-recognition-status', (event, data) => callback(data));   //@04a
    }                                                                                   //@04a
});