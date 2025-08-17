// main.js
// @01. 細かな修正 on 2024.10.28 traettal.systems
// @02. GPU無効化（試行) on 2025Jul31 traettal.systems
// @03. @02に伴い、zoom Meeting IDの廃止 2025.07.31 traettal.systems
// @04. 音声認識アプリのタスクトレイ化に伴う対応　2025.08.03 traettal.systems

const { app, BrowserWindow, ipcMain, dialog } = require('electron');    //@01m
app.disableHardwareAcceleration();                          //@02a
app.commandLine.appendSwitch('disable-gpu');                //@02a
app.commandLine.appendSwitch('disable-gpu-compositing');    //@02a
app.commandLine.appendSwitch('enable-software-rasterizer'); //@02a
app.commandLine.appendSwitch('no-sandbox');                 //@02a
const { spawn } = require('child_process'); //@04a
let speechRecognitionProcess = null;        //@04a
let mainWindow = null;                      //@04a

const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const axios = require('axios'); // サーバーへの送信用にaxiosを使用
const FormData = require('form-data'); // FormDataを使用
const fontkit = require('@pdf-lib/fontkit'); // fontkitをインポート
const userDataPath = app.getPath('userData');
const xmlFilePath = path.join(userDataPath, 'user_client_data.xml');

const logPath = path.join(app.getPath('userData'), 'app.log');
const logStream = fs.createWriteStream(logPath, { flags: 'a' });
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
logStream.write(`${new Date().toISOString()} - ${xmlFilePath}\n`);

//@03d  let inputWindow;    //@01a. 入力ウィンドウを保持

//const qpdf = require('node-qpdf');

const isDevTools = process.argv.includes('--devtools')
//@04a. 配布パッケージ後も正しい参照パスを指すようにする
const basePath = app.isPackaged
  ? process.resourcesPath
  : __dirname

//@04a.start 音声認識サービスの決定
function getSpeechService() {
    // コマンドライン引数から取得 (npm start Azure の場合)
    const args = process.argv.slice(2);
    if (args.length > 0 && ['Azure', 'AWS', 'AmiVoice'].includes(args[0])) {
        return args[0];
    }
    
    // 環境変数から取得
    if (process.env.SPEECH_SERVICE) {
        return process.env.SPEECH_SERVICE;
    }
    
    return 'Azure'; // デフォルト
}

// 音声認識アプリを起動する関数
function startSpeechRecognition() {
    if (speechRecognitionProcess) {
        console.log('Speech recognition is already running');
        return;
    }

    const service = getSpeechService();
    const exeName = `LiveTranscriptApp_${service}.exe`;
    const exePath = path.join(basePath, 'speech-recognition', exeName);
    
    // ファイルの存在確認
    if (!fs.existsSync(exePath)) {
        console.error(`Speech recognition executable not found: ${exePath}`);
        dialog.showErrorBox('Error', `音声認識アプリが見つかりません: ${exeName}`);
        return;
    }
    
    // デバッグモードかどうかの判定
    const args = process.env.NODE_ENV === 'development' ? ['--debug'] : [];
    
    try {
        speechRecognitionProcess = spawn(exePath, args, {
            detached: false,
            stdio: 'pipe',
            cwd: path.join(basePath, 'speech-recognition') // 作業ディレクトリを設定
        });

        speechRecognitionProcess.stdout.on('data', (data) => {
            console.log(`[${service}] ${data}`);
        });

        speechRecognitionProcess.stderr.on('data', (data) => {
            console.error(`[${service} Error] ${data}`);
        });

        speechRecognitionProcess.on('close', (code) => {
            console.log(`[${service}] Process exited with code ${code}`);
            speechRecognitionProcess = null;
            
            // メインウィンドウにプロセス終了を通知
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('speech-recognition-status', {
                    status: 'stopped',
                    service: service
                });
            }
        });

        console.log(`Speech recognition (${service}) started successfully`);
        
        // メインウィンドウにプロセス開始を通知
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('speech-recognition-status', {
                status: 'started',
                service: service
            });
        }
    } catch (error) {
        console.error(`Failed to start speech recognition (${service}):`, error);
        dialog.showErrorBox('Error', `音声認識アプリの起動に失敗しました: ${error.message}`);
    }
}   //@04a.finish

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 565,
        height: 1000,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,  // これを追加
            enableRemoteModule: false, // 安全な設定として追加
            nodeIntegration: false,    // セキュリティのために無効にしておく
            sandbox: false
        }
    });

    mainWindow.loadFile('ui-smpl.html');
    //@04a.開発時のみレンダラープロセスでDevToolsを開くようにする
    if (isDevTools) {
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    
    // ウィンドウタイトルにサービス名を表示
    const service = getSpeechService();
    //mainWindow.setTitle(`AICA - ${service}`);
    mainWindow.setTitle(`AICA`);
}

// 音声認識アプリを終了する関数
function stopSpeechRecognition() {
    if (!speechRecognitionProcess) {
        console.log('Speech recognition is not running');
        return;
    }

    try {
        speechRecognitionProcess.kill();
    } catch (error) {
        console.error('Failed to stop speech recognition:', error);
    }
}

app.whenReady().then(() => {

    try {
        // Check if XML file exists
        if (!fs.existsSync(xmlFilePath)) {
            // Create directory if it doesn't exist
            const userDataDir = path.dirname(xmlFilePath);
            if (!fs.existsSync(userDataDir)) {
                fs.mkdirSync(userDataDir, { recursive: true });
            }

            // Create initial XML file
            createInitialXMLFile();
        }
    } catch (parseError) {
        console.error('Error parsing existing XML file:', parseError);
    }


    createWindow();



    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

//@04a.start アプリ終了時に音声認識プロセスも終了
app.on('before-quit', () => {
    stopSpeechRecognition();
});

// IPCハンドラー（音声認識の状態を取得）
ipcMain.handle('get-speech-service', () => {
    return {
        service: getSpeechService(),
        isRunning: speechRecognitionProcess !== null
    };
});

ipcMain.handle('start-speech-recognition', () => {
    startSpeechRecognition();
    return { status: speechRecognitionProcess ? 'started' : 'error' };
});

ipcMain.handle('stop-speech-recognition', () => {
    stopSpeechRecognition();
    return { status: 'stopped' };
});
//@04a.finish

/////////////////////////////
//#region ↓↓↓↓　xml操作　↓↓↓↓
function createInitialXMLFile() {
    const initialXMLContent = `<?xml version="1.0" encoding="UTF-8"?><data>
    <parsererror xmlns="http://www.w3.org/1999/xhtml" style="display: block; white-space: pre; border: 2px solid #c77; padding: 0 1em 0 1em; margin: 1em; background-color: #fdd; color: black">
        <h3>This page contains the following errors:</h3>
    </parsererror>
    <User>
        <userName></userName>
        <userEmail></userEmail>
        <userPassword></userPassword>
        <userProfile></userProfile>
    </User>
    <Clients>
        <SelectedClientEmail></SelectedClientEmail>
        <Client>
            <ClientName></ClientName>
            <ClientProfile></ClientProfile>
            <ClientEmail></ClientEmail>
            <PDF_Password></PDF_Password>
            <memo></memo>
            <Sessions>
            </Sessions>
        </Client>
    </Clients>
</data>`;

    fs.writeFileSync(xmlFilePath, initialXMLContent, 'utf8');
}


ipcMain.handle('save-xml', (event, xmlString) => {

    try {
        fs.writeFileSync(xmlFilePath, xmlString, 'utf8');
        return { status: 'success' };
    } catch (error) {
        console.error('XMLファイルの保存中にエラーが発生しました:', error);
        return { status: 'error', message: error.message };
    }
});
// 新しく 'load-xml' ハンドラーを追加
ipcMain.handle('load-xml', (event) => {

    try {
        const data = fs.readFileSync(xmlFilePath, 'utf8');
        return { status: 'success', data: data };
    } catch (error) {
        console.error('XMLファイルの読み込み中にエラーが発生しました:', error);
        return { status: 'error', message: error.message };
    }
});

// 新しく 'save-session' ハンドラーを追加
ipcMain.handle('save-session', (event, sessionFilePath, sessionXMLString) => {
    const fullPath = path.join(userDataPath, 'clientdata', sessionFilePath);

    // ディレクトリが存在しない場合は作成
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    try {
        fs.writeFileSync(fullPath, sessionXMLString, 'utf8');
        return { status: 'success' };
    } catch (error) {
        console.error('セッションファイルの保存中にエラーが発生しました:', error);
        return { status: 'error', message: error.message };
    }
});

// 新しく 'load-session' ハンドラーを追加（セッションデータを読み込むため）
ipcMain.handle('load-session', (event, sessionFilePath) => {
    const fullPath = path.join(userDataPath, 'clientdata', sessionFilePath);

    try {
        const data = fs.readFileSync(fullPath, 'utf8');
        return { status: 'success', data: data };
    } catch (error) {
        console.error('セッションファイルの読み込み中にエラーが発生しました:', error);
        return { status: 'error', message: error.message };
    }
});

// 削除
ipcMain.handle('delete-session-file', async (event, sessionFilePath) => {
    const fullPath = path.join(userDataPath, 'clientdata', sessionFilePath);

    try {
        fs.unlinkSync(fullPath);
        return { status: 'success' };
    } catch (error) {
        console.error('Error deleting session file:', error);
        return { status: 'error', message: error.message };
    }
});

//#endregion　↑↑↑↑　xml操作　↑↑↑↑
ipcMain.on('switch-html', (event, page) => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        window.loadFile(page);
    }
});

ipcMain.on('switch-html-with-data', (event, page, data) => {
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
        window.loadFile(page).then(() => {
            // ページがロードされた後にデータを送信
            window.webContents.send('page-data', data);
        });
    }
});

////////////////////////////
//#region ↓↓↓↓　PDF操作　↓↓↓↓　
ipcMain.handle('create-and-send-pdf', async (event, pdfContent, date, password, recipientEmail, senderName, recipientName) => {
    const userName = recipientName;
    const folderPath = path.join(userDataPath, 'clientdata', encodeFileName(recipientEmail)); // PDFを保存するフォルダ

    // PDFを作成
    const filePath = await createPasswordProtectedPDF(pdfContent, password, userName, date, folderPath);


    // PDFをサーバーに送信
    const success = await sendPDFToServer(filePath, recipientEmail, senderName, recipientName, password);

    return success ? { status: 'success' } : { status: 'error' };
});

async function loadQPDF() {
    const { encrypt } = await import('node-qpdf2');
    return encrypt;
}
// qpdf.encrypt()を使用している箇所で、loadQPDF関数を呼び出し、qpdfモジュールを動的にロードします。

async function createPasswordProtectedPDF(pdfContent, password, userName, date, folderPath) {
    const pdfDoc = await PDFDocument.create();

    // Register fontkit
    pdfDoc.registerFontkit(fontkit);

    // Load Japanese font
    const fontBytes = fs.readFileSync(path.join(__dirname, 'fonts', 'NotoSansJP-Regular.ttf'));
    const customFont = await pdfDoc.embedFont(fontBytes);

    const fontSize = 12;
    const lineHeight = fontSize + 4;
    const margin = 50;
    const pageWidth = 595.28;
    const pageHeight = 841.89;

    // Define wrapText function
    function wrapText(text, font, fontSize, maxWidth) {
        const paragraphs = text.split('\n');
        let lines = [];

        paragraphs.forEach(paragraph => {
            let currentLine = '';
            const words = paragraph.split('');

            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                const lineWithWord = currentLine + word;
                const width = font.widthOfTextAtSize(lineWithWord, fontSize);

                if (width > maxWidth && currentLine !== '') {
                    lines.push(currentLine);
                    currentLine = word;
                } else {
                    currentLine = lineWithWord;
                }
            }

            if (currentLine !== '') {
                lines.push(currentLine);
            }

            // Add empty line between paragraphs
            lines.push('');
        });

        return lines;
    }

    // Split text into lines
    const maxWidth = pageWidth - margin * 2;
    const lines = wrapText(pdfContent, customFont, fontSize, maxWidth);

    let yPosition = pageHeight - margin;
    let page = pdfDoc.addPage([pageWidth, pageHeight]);

    // Draw text lines
    lines.forEach(line => {
        if (yPosition - lineHeight < margin) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            yPosition = pageHeight - margin;
        }

        if (line === '') {
            yPosition -= lineHeight;
        } else {
            page.drawText(line, {
                x: margin,
                y: yPosition - fontSize,
                size: fontSize,
                font: customFont,
                color: rgb(0, 0, 0),
            });
            yPosition -= lineHeight;
        }
    });

    // Add footer with logo and text on the last page
    const imagePath = path.join(basePath, 'robo-aica.png');
    if (fs.existsSync(imagePath)) {
        const imageBytes = fs.readFileSync(imagePath);
        const pngImage = await pdfDoc.embedPng(imageBytes);
        const pngDims = pngImage.scale(0.1);

        const footerFontSize = 12;
        const text = 'generated by AICA';

        // フォントのメトリクスから文字列の幅を計算
        const textWidth = customFont.widthOfTextAtSize(text, footerFontSize);

        // 画像と文字列の間のスペース
        const spaceBetweenImageAndText = 10;

        // 画像と文字列の合計幅
        const totalWidth = pngDims.width + spaceBetweenImageAndText + textWidth;

        // ページの幅を取得
        const pageWidth = page.getWidth();

        // フッター全体を中央揃えにするためのX座標を計算
        const footerXPosition = (pageWidth - totalWidth) / 2;

        const footerMargin = 50;
        const footerYPosition = footerMargin;

        // 画像の描画
        page.drawImage(pngImage, {
            x: footerXPosition,
            y: footerYPosition,
            width: pngDims.width,
            height: pngDims.height,
        });

        // 文字列の描画
        page.drawText(text, {
            x: footerXPosition + pngDims.width + spaceBetweenImageAndText,
            y: footerYPosition + (pngDims.height / 2) - (footerFontSize / 2),
            size: footerFontSize,
            font: customFont,
            color: rgb(0, 0, 0),
        });
    }

    // Save the PDF to a byte array
    const pdfBytes = await pdfDoc.save();

    // Temporary file paths
    const tempFileName = `${userName}_${date}_temp.pdf`;
    const tempFilePath = path.join(folderPath, tempFileName);

    // Encrypted file paths
    const fileName = `${userName}_${date}.pdf`;
    const filePath = path.join(folderPath, fileName);

    // Write the temporary PDF file
    fs.writeFileSync(tempFilePath, pdfBytes);

    console.log(`PDF created at: ${tempFilePath}`);

    // qpdfモジュールを動的にロード
    const encrypt = await loadQPDF();

    // Encrypt the PDF using qpdf2
    const options = {
        input: tempFilePath,
        output: filePath,
        password: password,
        keyLength: 256,  // You can adjust keyLength (256 is the default)
        restrictions: {
            print: 'low',
            useAes: 'y',
        }
    };

    await encrypt(options);

    // 一時ファイルを削除
    fs.unlink(tempFilePath, (err) => {
        if (err) {
            console.error('Error deleting temporary file:', err);
            // 一時ファイルの削除に失敗しても処理を続行
        } else {
            console.log(`Temporary file deleted: ${tempFilePath}`);
        }
    });
    console.log(`Password-protected PDF created at: ${filePath}`);

    return filePath;
}



async function sendPDFToServer(filePath, recipientEmail, senderName, recipientName, password) {
    const serverUrl = 'https://ep.robo-aica.com/send_email.php'; // Replace with your actual server URL

    // Read the file from disk
    const pdfFile = fs.readFileSync(filePath);  // filePath is the location of the PDF file on disk
    const filename = path.basename(filePath);
    const formData = new FormData();
    formData.append('recipient_email', recipientEmail);
    formData.append('sender_name', senderName);
    formData.append('recipient_name', recipientName);
    formData.append('password', password);

    // Append the PDF file directly
    formData.append('pdf_file', pdfFile, {
        filename: filename,
        contentType: 'application/pdf',
    });

    try {
        const response = await axios.post(serverUrl, formData, {
            headers: formData.getHeaders(),
        });

        if (response.status === 200) {
            // サーバーからのJSONレスポンスをコンソールに表示
            console.log('PDF successfully sent to the server.');
            console.log('Response from server:', response.data);
            return true;
        } else {
            console.error('Failed to send PDF to the server.');
            return false;
        }
    } catch (error) {
        console.error('Error occurred while sending PDF to the server:', error);
        return false;
    }
}

//#endregion ↑↑↑↑　PDF操作　↑↑↑↑

//#region ↓↓↓↓　その他操作　↓↓↓↓

// 特殊文字をエンコードする関数
function encodeFileName(str) {
    return str.replace(/[@]/g, '_at_')
        .replace(/[+]/g, '_plus_')
        .replace(/[.]/g, '_dot_')
        .replace(/[:]/g, '-')
        .replace(/[/\\?%*:|"<>]/g, '_');
}

//#endregion ↑↑↑↑　その他操作　↑↑↑↑