//------
// transcript-processor.js
// GPTとのデータのやり取りに関する文字列処理やボタンを押したときの反応の処理など
//------
// 途中：製品版ではgpt.mjsに接続する際に、トークンも送って認証を行う
//
//#region サーバーに送る情報
// model: GPTのモデル quality か speed で指定（GOT-4oなどの指定ではない）
// mode: 'summary' セッション中に使う要約を生成するプロンプト
//       'solution' 解決策を提示するプロンプト
//       'aspect' コーチが持つべきほかの視点を提示するプロンプト
//       'uplift' 気持ちを軽くする方法を提示するプロンプト
//       'questionNow' ユーザーの求めに応じて質問を提案するプロンプト
//       'continuousQuestion' 継続的に質問を出力する際のプロンプト
//       'freeAdvise' ユーザーの質問に答えるプロンプト
//       'rivision' セッション全体のまとめ（要約）を出力するプロンプト
//       'feedback' コーチに対するフィードバックを生成するプロンプト
// userName: コーチの名前
// userProfile: コーチのプロフィール ごく端的に（例：国際コーチング連盟のコーチ）
// clientName: クライアントの名前
// clientProfile: クライアントの背景　簡単に
// currentSummary: 現時点までの要約 （input token limitに達さず、APIコストが高くなければ不要）
// transcription: 文字起こしデータ
// adviceRequirement: ユーザー自由入力欄の入力文字列（AICAへの相談）
// conversation_history: これまでのAICAとの対話 JSON 
// 　　　　　　　　　　　　　[
// 　　　　　　　　　　　　　    {"role": "user", "content": "今日の天気はどうですか？"},
// 　　　　　　　　　　　　　    {"role": "assistant", "content": "今日は晴れです。"},
// 　　　　　　　　　　　　　    {"role": "user", "content": "それに合わせた服装を教えてください。"}
// 　　　　　　　　　　　　　]
//#endregion

// トランスクリプション、チャット、サマリーのループ制御に関する変数
let iChat = 0;
let iExampleQuestions = 0;
let sendInterval;
let summaryIntervalId = null;
let iMainMessage = 0;
let lengthLastMessage = 0;

// 原文文字列の送信長さ制限  < (max token - 1500) / 1.5
const limitLength = 84300; // GPT4,GPT4o-mini 128k
const limitLengthFeedback = (128000 - 2000) / 1.5 // 128k model gpt-4-0125-preview

// プロンプトへ入れる文字列に関連する変数　初期化必要
let iNewest = 0;
var lengthNotSummarized = 0;
var lengthSummarized = 0;
let userInputHistory = [];
let responseHistory = [];

// REST API での PHPとの情報のやり取りに使う変数
var token = "";
var lastPostData_ChatArea; //再生成ボタン用の情報
var postData;
var writingSuccess;
var iIteration = 0; // PHPへのリクエストが成功した回数

// where to post
const post_url = "https://ep.robo-aica.com/gpt/";

// データのやり取りに使うグローバル変数
window.AICAData = window.AICAData || {};

window.AICAData.xmlData = window.AICAData.xmlData || "";
window.AICAData.selectedClient = window.AICAData.selectedClient || "";  // グローバル変数として保持
window.AICAData.clientInfo = window.AICAData.clientInfo || {};
window.AICAData.clientInfo = {
    email: window.AICAData.clientInfo.email||"",
    name: window.AICAData.clientInfo.name||"",
    profile: window.AICAData.clientInfo.profile||"",
    password: window.AICAData.clientInfo.password||"",
    sessionFilePath: window.AICAData.clientInfo.sessionFilePath||"",
    sessionDateTime:window.AICAData.clientInfo.sessionDateTime||"",
    sessionSummary:  window.AICAData.clientInfo.sessionSummary||"",
};
window.AICAData.selectedSession = window.AICAData.selectedSession || ""; // グローバル変数として保持
window.AICAData.sessionDataXML = window.AICAData.sessionDataXML || "";       // 選択されたセッションのXMLデータ
window.AICAData.userName = window.AICAData.userName || "";
window.AICAData.userEmail = window.AICAData.userEmail || "";
window.AICAData.userProfile = window.AICAData.userProfile || "";
window.AICAData.allTranscription = window.AICAData.allTranscription || "";
window.AICAData.mainTranscription = window.AICAData.mainTranscription || "";
window.AICAData.conversation_history = window.AICAData.conversation_history || [];
//window.AICAData.currentSummary = window.AICAData.currentSummary || "";// currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正


// ボタン
const freeInputButton = document.getElementById('freeInputButton');
const regenerateButton = document.getElementById('regeberatetButton');
const topicResetButton = document.getElementById('topicResetButton');
var promptUserInput;
const feedbackButton = document.getElementById('feedback');

// 事前情報★★★★★★★★★★★★★テスト用
//#region 
//@01d const userName = "藤田"; // ★★★★★★★★★★★★★
//@01d const userProfile = "国際コーチング連盟のコーチ"; // ★★★★★★★★★★★★★
//@01d const clientName = "山下さん"; // ★★★★★★★★★★★★★
//@01d const clientProfile = "社長"; // ★★★★★★★★★★★★★
//@01d 
//@01d let messages = {};
//@01d messages[1] = {
    //@01d userName: "藤田",
    //@01d content: "こんにちは。どんな相談ですか？"
//@01d };
//@01d messages[2] = {
    //@01d userName: "山下",
    //@01d content: "こんにちは。最近従業員の顔を見るとお腹が痛くなるんです。"
//@01d };
//#endregion

//----------------------
// 定期的に　要約作成
// isRunningがTrueの間ずっと
// gpt.mjs対応
//----------------------

summaryIntervalId = setInterval(function () {
    if (window.isRunning) {
        requireSummaryData(false);
    }
}, 30 * 1000);

//----------------------
// ボタン押下時　要約作成
// gpt.mjs対応
//----------------------
var summaryButton = document.getElementById('summary');
if (summaryButton) {
    summaryButton.onclick = function () {
        requireSummaryData(true);
        console.log("requireSummaryData() called");
    }
}

//----------------------
// Summary （main topicの文字列のみ） 
// gpt.mjs対応
//----------------------

function requireSummaryData(immediateQ) {

    const mainTranscription = getTranscription("main"); // ここから本題ボタンを押してからの文字起こし
    // const currentSummary = document.getElementById("summaryArea").value; // currentSummaryを使うときだけ
    if (mainTranscription.length < 4000) { // 4000文字以上でサマリーを作成する。
        console.log("too short transcription for summary");
        return;
    }

    lengthNotSummarized = mainTranscription.length - lengthSummarized; // まだ要約に反映されていない最新の文字列の長さ

    if (lengthNotSummarized > 500 || immediateQ) { // まだ要約に反映されていない最新の文字列の長さが500文字以上、またはボタンが押されたとき（immediateQ = true）に要約をする

        if (mainTranscription.length < limitLength) {
            console.log("# of charactor < limitLength");
            transcriptionToSend = mainTranscription;
        } else {
            console.log("# of charactor >= limitLength");
            transcriptionToSend = mainTranscription.slice(-limitLength); //ここが発動する場合は、currentSummary を使うようにこのスクリプトとgpt.mjsを更新
        }
        lengthSummarized = mainTranscription.length;
        console.log("transcriptionToSummarize.length: " + transcriptionToSummarize.length);
        console.log("transcriptionToSummarize: " + transcriptionToSummarize);

        const postData = JSON.stringify({
            model: "speed",  // モデル指定
            mode: "summary",  // モード指定
            userName: window.AICAData.userName,  // ユーザー名
            userProfile: window.AICAData.userProfile,  // プロフィール
            // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
            clientName: window.AICAData.clientInfo.name,  // クライアント名
            clientProfile: window.AICAData.clientInfo.profile,  // クライアントプロフィール
            transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
            adviceRequirement: null,  // 相談内容(promptはgpt.mjsに記述)
            conversation_history: []  // GPTとの会話履歴
        })
        sendGPTRequest(postData);

        console.log("summary requested");
    } else {
        console.log("summary wasn't requested, # of charactor < 500");
    }
}

//----------------------
// 定期的に　質問例生成
// isRunningがTrueの間ずっと
// gpt.mjs対応
//----------------------
exQuestionIntervalId = setInterval(function () {

    if (window.isRunning) {
        console.log("runnning");
        if (lengthLastMessage < getTranscription("main").length ) { // 前回からmessageの数が増えてなければスルー
            iExampleQuestions++;
            lengthLastMessage = getTranscription("main").length ; // 最後にこのmessageまで質問生成に使った

            // const currentSummary = document.getElementById("summaryArea").value; // currentSummaryを使うときだけ
            const mainTranscription = getTranscription("main");
            const transcriptionToSend = mainTranscription.slice(-limitLength);

            const postData = JSON.stringify({
                model: "speed",  // モデル指定
                mode: "continuousQuestions",  // モード指定
                userName: window.AICAData.userName,  // ユーザー名
                userProfile: window.AICAData.userProfile,  // プロフィール
                // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
                clientName: window.AICAData.clientInfo.name,  // クライアント名
                clientProfile: window.AICAData.clientInfo.profile,  // クライアントプロフィール
                transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
                adviceRequirement: null,  // 相談内容
                conversation_history: []  // GPTとの会話履歴
            })
            sendGPTRequest(postData);

            console.log("");
        }
    }

}, 30 * 1000);


//----------------------
// Advice - Button
//----------------------
//#region 
// ボタンのIDリスト
const buttonIDs = ["solution", "aspect", "uplift", "questionNow"];

// それぞれのボタンにイベントを設定
buttonIDs.forEach(buttonId => {
    const button = document.getElementById(buttonId);
    if (button) {
        button.addEventListener("click", function () {
            requireAdviceData(buttonId);
        });
    }
});
function requireAdviceData(buttonId) {
    var currentSummary = document.getElementById("summaryArea").value;
    var mode = buttonId; // htmlのボタンのIDと、gpt.mjsの受け取るmodeは一致させる
    // 途中：ボタンのID,ボタンの内容,mode（solution aspect　uplift　questionNow）　の対応
    iChat++;
    UserUpdateChatArea(document.getElementById(buttonId).textContent);
    const mainTranscription = getTranscription("main");

    let transcriptionToSend = mainTranscription.slice(-limitLength);
    if (mainTranscription.length < limitLength) {
        console.log("# of charactor < limitLength");
        transcriptionToSend = mainTranscription;
    } else {
        console.log("# of charactor >= limitLength");
        transcriptionToSend = mainTranscription.slice(-limitLength); //ここが発動する場合は、currentSummary を使うようにこのスクリプトとgpt.mjsを更新
    }

    const postData = JSON.stringify({
        model: "quality",  // モデル指定
        mode: mode,  // モード指定
        userName: window.AICAData.userName,  // ユーザー名
        userProfile: window.AICAData.userProfile,  // プロフィール
        // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
        clientName: window.AICAData.clientInfo.name,  // クライアント名
        clientProfile: window.AICAData.clientInfo.profile,  // クライアントプロフィール
        transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
        adviceRequirement: null,  // 相談内容(promptはgpt.mjsに記述)
        conversation_history: getConversationHistory()  // GPTとの会話履歴
    })
    sendGPTRequest(postData,"chatArea",iChat);
    lastPostData_ChatArea = postData;
    console.log("mainTranscription to send: " + mainTranscription);

    console.log("advice requested");
}
//#endregion

//----------------------
// Advice - Free
//----------------------
if (freeInputButton) {
    freeInputButton.onclick = function () {
        iChat++;
        const currentSummary = document.getElementById("summaryArea").value;
        const userInput = document.getElementById("inputFIFoot").value;
        UserUpdateChatArea(userInput);
        const mainTranscription = getTranscription("main");


        // ★★★★★★★★★★
        // ↓このif文はデバッグ用　製品版では削除
        //@01d if (mainTranscription == "") {
        //@01d     mainTranscription = document.getElementById('dummyConversation').value;

        //@01d }

        let transcriptionToSend = mainTranscription.slice(-limitLength);
        if (mainTranscription.length < limitLength) {
            console.log("# of charactor < limitLength");
            transcriptionToSend = mainTranscription;
        } else {
            console.log("# of charactor >= limitLength");
            transcriptionToSend = mainTranscription.slice(-limitLength); //ここが発動する場合は、currentSummary を使うようにこのスクリプトとgpt.mjsを更新
        }

        const postData = JSON.stringify({
            model: "quality",  // モデル指定
            mode: "freeAdvise",  // モード指定
            userName: window.AICAData.userName,  // ユーザー名
            userProfile: window.AICAData.userProfile,  // プロフィール
            // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
            clientName: window.AICAData.clientInfo.name,  // クライアント名
            clientProfile: window.AICAData.clientInfo.profile,  // クライアントプロフィール
            transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
            adviceRequirement: userInput,  // 相談内容(promptはgpt.mjsに記述)
            conversation_history: getConversationHistory()  // GPTとの会話履歴
        })
        sendGPTRequest(postData,"chatArea",iChat);
        lastPostData_ChatArea = postData;
        console.log("advice requested");
    }
}
//----------------------
// topicResetButton - ここから本題
// gpt.mjs対応
//----------------------
if (topicResetButton) {
    topicResetButton.onclick = function () {
        const messagesArray = Object.values(messages);
        iMainMessage = messagesArray.length; // iMainMessage 以降のmessagesが本題
    }
}
//----------------------
// 会話文字列が記録されたdivから文字列を取得
// mode:
//  all 全文字列
//  main /メイントピックの文字列のみ
// gpt.mjs対応
//----------------------

function getTranscription(mode) {
    const messagesArray = Object.values(messages);
    let transcription = "";
    if (mode == "all") { //  all 全文字列
        transcription = messagesArray.map(message => `${message.userName}: ${message.content}`).join('\n');
    } else if (mode == "main") { //  main /メイントピックの文字列のみ
        transcription = messagesArray.slice(iMainMessage).map(message => `${message.userName}: ${message.content}`).join('\n');
    }
    console.log("getTranscription: " + transcription);
    return transcription;
}



//----------------------
// Advice - 再生成
// gpt.mjs対応
//----------------------
if (regenerateButton) {
    regenerateButton.onclick = function () {
        sendGPTRequest(lastPostData_ChatArea,"chatArea",iChat);
        console.log("regenerate");
    }
}

//----------------------
// 振り返りの実施
// gpt.mjs対応
//----------------------

//#region 
// ui-smpl上でフィードバックを表示する場合
// if(feedbackButton){
// feedbackButton.onclick = function () {
//     const mainTranscription = getTranscription("main");
//     const transcriptionToSend = mainTranscription.slice(-limitLengthFeedback);

//     const postData = JSON.stringify({
//         model: "quality",  // モデル指定
//         mode: "feedback",  // モード指定
//         userName: window.AICAData.userName,  // ユーザー名
//         userProfile: window.AICAData.userProfile,  // プロフィール
//         // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
//         clientName: window.AICAData.clientInfo.name,  // クライアント名
//         clientProfile: clientProfile,  // クライアントプロフィール
//         transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
//         adviceRequirement: null,  // 相談内容(promptはgpt.mjsに記述)
//         conversation_history: conversation_history  // GPTとの会話履歴
//     })

//     UserUpdateChatArea("コーチングセッションのフィードバックをしてください。");
//     conversation_history = conversation_history.push({ "role": "user", "content": "コーチングセッションのフィードバックをしてください。" })
//     lastPostData_ChatArea = postData;
//     sendGPTRequest(postData);
//     console.log("feedback button");
// }
// }
//#endregion

// 終了処理ページでフィードバックを受け取る
function getFeedback() {
    console.log("getFeedback() has been called");
    const mainTranscription = window.AICAData.mainTranscription;
    const transcriptionToSend = mainTranscription.slice(-limitLengthFeedback);

    const postData = JSON.stringify({
        model: "quality",  // モデル指定
        mode: "feedback",  // モード指定
        userName: window.AICAData.userName,  // ユーザー名
        userProfile: window.AICAData.userProfile,  // プロフィール
        // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
        clientName: window.AICAData.clientInfo.name,  // クライアント名
        clientProfile: window.AICAData.clientInfo.profile,  // クライアントプロフィール
        transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
        adviceRequirement: null,  // 相談内容(promptはgpt.mjsに記述)
        conversation_history: window.AICAData.conversation_history,  // GPTとの会話履歴
    })
    window.AICAData.conversation_history = window.AICAData.conversation_history.push({ "role": "user", "content": "コーチングセッションのフィードバックをしてください。" })
    lastPostData_ChatArea = postData;
    sendGPTRequest(postData);
}

function getUserRevision() {
    console.log("getUserRevision() has been called");
    const mainTranscription = window.AICAData.mainTranscription;
    const transcriptionToSend = mainTranscription.slice(-limitLengthFeedback);
    findLatestSessionClientData(() => {});
    const postData = JSON.stringify({
        model: "quality",  // モデル指定
        mode: "rivision",  // モード指定
        userName: window.AICAData.userName,  // ユーザー名
        userProfile: window.AICAData.userProfile,  // プロフィール
        // currentSummary: document.getElementById("summaryArea").value, // currentSummaryが必要になったらここをコメントアウト gpt.mjsも修正
        clientName: window.AICAData.clientInfo.name,  // クライアント名
        clientProfile: window.AICAData.clientInfo.profile,  // クライアントプロフィール
        transcription: transcriptionToSend,  // プロンプトを文字起こしデータ
        adviceRequirement: null,  // 相談内容(promptはgpt.mjsに記述)
        conversation_history: window.AICAData.conversation_history,  // GPTとの会話履歴
    })

    lastPostData_ChatArea = postData;
    sendGPTRequest(postData);
}
//#region 返答の文字列を追加
// 返答の文字列を追加する。 セパレーターあり
function addDisplayData(displayAreaId, responseData) {
    var textarea = document.getElementById(displayAreaId);
    if (textarea.value !== "") {
        textarea.value += strSeparator; // 既存のテキストがある場合、区切り文字を追加
    }
    textarea.value += responseData.trim(); // 逐次データを追加
    textarea.scrollTop = textarea.scrollHeight; // スクロールを最下部に移動
    updateMarkdownPreview(displayAreaId, displayAreaId + 'Preview');
}

// 返答の文字列を追加する。 セパレーターなし
function addDisplayDataNoSeperator(displayAreaId, responseData) {
    var textarea = document.getElementById(displayAreaId);
    textarea.value += responseData.trim(); // 逐次データを追加
    textarea.scrollTop = textarea.scrollHeight; // スクロールを最下部に移動
    updateMarkdownPreview(displayAreaId, displayAreaId + 'Preview');
}
//#endregion

//#region  テキスト表示欄の高さ調整
// gpt.mjs対応
function adjustTextareaHeight(textarea) {
    console.log("Initial textarea height:", textarea.style.height);
    console.log("Textarea value:", textarea.value);
    console.log("Textarea scrollHeight before adjustment:", textarea.scrollHeight);

    textarea.style.height = 'auto';
    if (textarea.scrollHeight > 0) {
        textarea.style.height = textarea.scrollHeight + 'px';
        console.log("Textarea height after adjustment:", textarea.style.height);
    } else {
        console.warn("Textarea scrollHeight is 0. This may cause issues.");
    }
}
//#endregion

// GPTとの会話欄をアップデートする - User
// gpt.mjs対応
function UserUpdateChatArea(message) {
    chatArea = document.getElementById("chatArea");
    let textarea = document.createElement('textarea');
    textarea.readOnly = true;
    textarea.value = message;
    textarea.setAttribute('rows', '1'); // デフォルトの行数1に設定
    chatArea.appendChild(textarea);
    adjustTextareaHeight(textarea);
    textarea.classList.add("User", iChat);
}
// GPTとの会話欄をアップデートする
// function updateMessage(sender, chatIndex, message, isStreaming = false, displayElementID) {
//     console.log("Updating message:", message, "isStreaming:", isStreaming);

//     // If the message is empty, return immediately.
//     if (!message.trim()) {
//         console.warn("Received an empty message. Skipping...");
//         return;
//     }
//     console.log("dusplayElementID: ", displayElementID)
//     const displayElement = document.getElementById(displayElementID);


//     // Check if chatArea is visible

//     if (isStreaming &&
//         displayElement.lastChild &&
//         displayElement.lastChild.classList?.contains(sender) &&
//         displayElement.lastChild.classList?.contains(chatIndex)) {
//         let lastTextarea = displayElement.lastChild;
//         lastTextarea.value = message;
//         adjustTextareaHeight(lastTextarea);
//     } else {
//         let textarea = document.createElement('textarea');
//         textarea.readOnly = true;
//         textarea.value = message;
//         textarea.setAttribute('rows', '1'); // デフォルトの行数1に設定
//         displayElement.appendChild(textarea);
//         adjustTextareaHeight(textarea);
//         textarea.classList.add(sender, chatIndex);
//     }

//     displayElement.style.height = 'auto';
//     if (displayElement.scrollHeight > 400) {
//         displayElement.style.height = '400px';
//     } else {
//         displayElement.style.height = displayElement.scrollHeight + 'px';
//     }
//     displayElement.style.height = displayElement.scrollHeight + 'px';

//     displayElement.scrollTop = displayElement.scrollHeight;
// }

//------
// ChatAreaの内容からconversation_historyを作る
// gpt.mjs対応
//------
function getConversationHistory() {
    // すべての textarea 要素を取得
    const textareas = document.querySelectorAll('#chatArea textarea');

    // 配列を作成
    const conversation_history = Array.from(textareas)
        .map(textarea => {
            // ROLEを定義し、クラス名に応じて値を設定
            let ROLE;
            if (textarea.classList.contains('User')) {
                ROLE = 'user';
            } else if (textarea.classList.contains('AI')) {
                ROLE = 'assistant';
            } else {
                return null; // 不要なエントリを避けるため、null を返す
            }

            // textarea 内の文字列を content として取得
            const CONTENT = textarea.value;

            // オブジェクト形式で返す
            return { role: ROLE, content: CONTENT };
        })
        .filter(item => item !== null); // null を除外

    // 結果の配列をコンソールに出力
    console.log(conversation_history);

    //グローバル変数に格納
    window.AICAData.conversation_history = conversation_history;

    return conversation_history;
}
//--------
// サーバーに対して、GPTに処理させたい情報を送り、返答を受け取る。
// gpt.mjs対応
//--------
const requestQueue = [];
function sendGPTRequest(postData, resultElementID = null,iChat = null) {
    requestQueue.push(() => processGPTRequest(postData, resultElementID, iChat));
    if (requestQueue.length === 1) {
        processQueue();
    }
}

async function processQueue() {
    while (requestQueue.length > 0) {
        const requestFunc = requestQueue[0];
        await requestFunc();
        requestQueue.shift();
    }
}

async function processGPTRequest(postData, resultElementID = null,iChat = null) {
    console.log("processGPTRequest() has been called");
    console.log("postData: "+postData);
    let elementID;
    if (resultElementID == null) {
        const mode = JSON.parse(postData).mode;
        if (mode === 'summary') { // セッション中に使う要約を生成する
            elementID = "summaryArea";
        } else if (mode === 'solution') {// 解決策を提示する
            elementID = "chatArea";
        } else if (mode === 'aspect') {// コーチが持つべきほかの視点を提示する
            elementID = "chatArea";
        } else if (mode === 'uplift') {// 気持ちを軽くする方法を提示する
            elementID = "chatArea";
        } else if (mode === 'questionNow') {// ユーザーの求めに応じて質問を提案する
            elementID = "chatArea";
        } else if (mode === 'continuousQuestions') {// 継続的に質問を出力する
            elementID = "exampleQuestions";
        } else if (mode === 'freeAdvise') { // ユーザーの質問に答える
            elementID = "chatArea";
        } else if (mode === 'rivision') { // セッション全体のまとめ（要約）を出力する
            elementID = "clientRevisionTextArea";// 終了処理ページでフィードバックを表示させる
        } else if (mode === 'feedback') { // コーチに対するフィードバックを生成する
            // elementID = "chatArea"; // ui-smple上でフィードバックを表示させる場合
            elementID = "coachingFeedback"; // 終了処理ページでフィードバックを表示させる場合
        }
    } else {
        elementID = resultElementID;
    }
    const response = await fetch(post_url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: postData
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let done = false;
    let resultContainer = document.getElementById(elementID);

    if (elementID == "summaryArea") {
        resultContainer.textContent = '';  // Clear previous result
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            // Decode the chunk and append it to the result container
            const chunk = decoder.decode(value, { stream: !done });
            resultContainer.textContent += chunk;
        }

    } else if (elementID == "exampleQuestions") {
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            // Decode the chunk and append it to the result container
            const chunk = decoder.decode(value, { stream: !done });
            resultContainer.textContent += chunk;
            resultContainer.scrollTop = resultContainer.scrollHeight; // スクロールを最下部に移動 
        }

    } else if (elementID == "chatArea") {
        let textarea;
        if (resultContainer.lastChild &&
            resultContainer.lastChild.classList?.contains("AI") &&
            resultContainer.lastChild.classList?.contains(iChat)) {
            textarea = resultContainer.lastChild;
        } else {
            textarea = document.createElement('textarea');
            textarea.readOnly = true;
            resultContainer.appendChild(textarea);
            textarea.classList.add("AI", iChat);
        }
        textarea.setAttribute('rows', '1'); // デフォルトの行数1に設定。 rows 属性は style.height よりも優先度が低い。
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;

            // Decode the chunk and append it to the result container
            const chunk = decoder.decode(value, { stream: !done });
            textarea.textContent += chunk;
            textarea.style.height = textarea.scrollHeight + 'px';
            resultContainer.scrollTop = resultContainer.scrollHeight; // スクロールを最下部に移動 
        }
    } else if (elementID == "coachingFeedback") {
        resultContainer.textContent = '';  // Clear previous result
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            // Decode the chunk and append it to the result container
            const chunk = decoder.decode(value, { stream: !done });
            resultContainer.textContent += chunk;
            updateMarkdownPreview(elementID, elementID + 'Preview');
        }
        saveCoachingFeedback(resultContainer.textContent);
        updateMarkdownPreview(elementID, elementID + 'Preview');
    }else if (elementID == "clientRevisionTextArea") {
        resultContainer.textContent = '';  // Clear previous result
        while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            // Decode the chunk and append it to the result container
            const chunk = decoder.decode(value, { stream: !done });
            resultContainer.textContent += chunk;
            updateMarkdownPreview(elementID, elementID + 'Preview');
        }
        saveSessionRevision(resultContainer.textContent);
        updateMarkdownPreview(elementID, elementID + 'Preview');
    }
}

// JSON.stringify({
//     model: model,  // モデル指定
//     mode: mode,  // モード指定
//     userName: window.AICAData.userName,  // ユーザー名
//     userProfile: window.AICAData.userProfile,  // プロフィール
//     clientName: window.AICAData.clientInfo.name,  // クライアント名
//     clientProfile: clientProfile,  // クライアントプロフィール
//     transcription: transcription,  // プロンプトを文字起こしデータ
//     adviceRequirement: adviceRequirement,  // 相談内容
//     conversation_history: conversation_history  // 会話履歴
// })
//model,mode,userProfile,userName,clientName,clientProfile,transcription,adviceRequirement,conversation_history