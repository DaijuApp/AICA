window.AICAData = window.AICAData || {};

window.AICAData.xmlData = window.AICAData.xmlData || "";
window.AICAData.selectedClient = window.AICAData.selectedClient || "";  // グローバル変数として保持
window.AICAData.clientInfo = window.AICAData.clientInfo || {};
window.AICAData.clientInfo = {
    email: window.AICAData.clientInfo.email || "",
    name: window.AICAData.clientInfo.name || "",
    profile: window.AICAData.clientInfo.profile || "",
    password: window.AICAData.clientInfo.password || "",
    sessionFilePath: window.AICAData.clientInfo.sessionFilePath || "",
    sessionDateTime: window.AICAData.clientInfo.sessionDateTime || "",
    sessionSummary: window.AICAData.clientInfo.sessionSummary || "",
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


// 特殊文字をエンコードする関数
function encodeFileName(str) {
    return str.replace(/[@]/g, '_at_')
        .replace(/[+]/g, '_plus_')
        .replace(/[.]/g, '_dot_')
        .replace(/[:]/g, '-')
        .replace(/[/\\?%*:|"<>]/g, '_');
}

// Markdown文字列をHTMLに変換して表示する
function updateMarkdownPreview(textId, previewId) {
    if (typeof marked === 'undefined') return;
    const textarea = document.getElementById(textId);
    const preview = document.getElementById(previewId);
    if (!textarea || !preview) return;
    preview.innerHTML = marked.parse(textarea.value);
}

//#region 全体的なデータの準備
// 画面遷移時にデータを取得
window.electronAPI.onPageData((data) => {
    console.log('Received data:', data);
    window.AICAData = data;
});

// XMLデータをロード
function loadXMLData(callback = () => { }) {
    window.electronAPI.loadXML()
        .then(result => {
            if (result.status === 'success') {
                const parser = new DOMParser();
                window.AICAData.xmlData = parser.parseFromString(result.data, 'application/xml');
                console.log(AICAData.xmlData); // デバッグ用にXMLを出力
                // ユーザー情報はこの時点で取得
                AICAData.userName = AICAData.xmlData.getElementsByTagName('userName')[0].textContent;
                AICAData.userEmail = AICAData.xmlData.getElementsByTagName('userEmail')[0].textContent;
                AICAData.userProfile = AICAData.xmlData.getElementsByTagName('userProfile')[0].textContent;

                callback();

            } else {
                console.error('XMLデータの読み込みに失敗しました(1):', result.message);
                alert('XMLデータの読み込みに失敗しました。');
            }
        })
        .catch(error => {
            console.error('XMLデータの読み込みに失敗しました(2):', error);
            alert('XMLデータの読み込みに失敗しました。');
        });
}

// XMLデータを保存
function saveXMLData() {
    const serializer = new XMLSerializer();
    const xmlString = serializer.serializeToString(AICAData.xmlData);

    if (window.electronAPI && typeof window.electronAPI.saveXML === 'function') {
        window.electronAPI.saveXML(xmlString)
            .then(result => {
                if (result.status === 'success') {
                    console.log('データが正常に保存されました。');
                } else {
                    alert('データの保存中にエラーが発生しました。');
                }
            })
            .catch(err => {
                console.error('データの保存に失敗しました:', err);
                alert('データの保存中にエラーが発生しました。');
            });
    } else {
        console.error('electronAPI.saveXML が定義されていません。');
    }
}

//グローバル変数 AICADataの処理（HTMLファイル移動前に使用）
function serializeAICAData(data) {
    let serializableData = { ...data };
    if (serializableData.xmlData) {
        const serializer = new XMLSerializer();
        serializableData.xmlDataString = serializer.serializeToString(serializableData.xmlData);
        delete serializableData.xmlData;
    }
    if (serializableData.sessionDataXML) {
        const serializer = new XMLSerializer();
        serializableData.sessionDataXMLString = serializer.serializeToString(serializableData.sessionDataXML);
        delete serializableData.sessionDataXML;
    }
    return serializableData;
}
//グローバル変数 AICADataの処理（HTMLファイル移動後に使用）
function deserializeAICAData(data) {
    // xmlDataString が存在する場合はパースして xmlData に設定
    if (data.xmlDataString) {
        const parser = new DOMParser();
        data.xmlData = parser.parseFromString(data.xmlDataString, 'application/xml');
        delete data.xmlDataString; // 文字列プロパティを削除
    } else {
        data.xmlData = null;
    }

    // sessionDataXMLString が存在する場合
    if (data.sessionDataXMLString) {
        const parser = new DOMParser();
        data.sessionDataXML = parser.parseFromString(data.sessionDataXMLString, 'application/xml');
        delete data.sessionDataXMLString; // 文字列プロパティを削除
    } else {
        data.sessionDataXML = null;
    }

    return data;
}
//#endregion 全体的なデータの準備

//#region ユーザー（コーチ）のデータ
/**
 * @function updateUserName
 * @description <User>内の<userName>を更新し、XMLを保存する
 * @param {string} newName - ユーザー名
 */
function updateUserName(newName) {
    // XMLデータがまだ読み込まれていなければロードする (例: loadXMLData())
    if (!AICAData.xmlData) {
        console.error("XMLデータが未ロードです。先にloadXMLData()してください。");
        return { status: 'error', message: 'XML data not loaded' };
    }

    // <User>要素を取得
    const userElements = AICAData.xmlData.getElementsByTagName("User");
    if (userElements.length === 0) {
        console.error("XML内に<User>が存在しません。");
        return { status: 'error', message: 'No <User> element found in XML' };
    }

    // <userName>要素を探す。なければ新規作成
    let userNameElem = userElements[0].getElementsByTagName("userName")[0];
    if (!userNameElem) {
        userNameElem = AICAData.xmlData.createElement("userName");
        userElements[0].appendChild(userNameElem);
    }

    // テキスト内容を更新
    userNameElem.textContent = newName;

    // AICAData.userName も更新しておく
    AICAData.userName = newName;

    // 変更をファイルに反映
    saveXMLData();

    return { status: 'success' };
}

/**
 * @function updateUserEmail
 * @description <User>内の<userEmail>を更新し、XMLを保存する
 * @param {string} newEmail - ユーザーの新しいメールアドレス
 */
function updateUserEmail(newEmail) {
    if (!AICAData.xmlData) {
        console.error("XMLデータが未ロードです。");
        return { status: 'error', message: 'XML data not loaded' };
    }

    const userElements = AICAData.xmlData.getElementsByTagName("User");
    if (userElements.length === 0) {
        console.error("XML内に<User>が存在しません。");
        return { status: 'error', message: 'No <User> element found in XML' };
    }

    let userEmailElem = userElements[0].getElementsByTagName("userEmail")[0];
    if (!userEmailElem) {
        userEmailElem = AICAData.xmlData.createElement("userEmail");
        userElements[0].appendChild(userEmailElem);
    }

    userEmailElem.textContent = newEmail;
    AICAData.userEmail = newEmail;

    saveXMLData();

    return { status: 'success' };
}

/**
 * @function updateUserProfile
 * @description <User>内の<userProfile>を更新し、XMLを保存する
 * @param {string} newProfile - ユーザーの新しいプロフィール
 */
function updateUserProfile(newProfile) {
    if (!AICAData.xmlData) {
        console.error("XMLデータが未ロードです。");
        return { status: 'error', message: 'XML data not loaded' };
    }

    const userElements = AICAData.xmlData.getElementsByTagName("User");
    if (userElements.length === 0) {
        console.error("XML内に<User>が存在しません。");
        return { status: 'error', message: 'No <User> element found in XML' };
    }

    let userProfileElem = userElements[0].getElementsByTagName("userProfile")[0];
    if (!userProfileElem) {
        userProfileElem = AICAData.xmlData.createElement("userProfile");
        userElements[0].appendChild(userProfileElem);
    }

    userProfileElem.textContent = newProfile;
    AICAData.userProfile = newProfile;

    saveXMLData();

    return { status: 'success' };
}
//#endregion

//#region クライアントのデータ
// セッションデータをロードする関数
function fetchSessionData(filePath) {
    window.electronAPI.loadSession(filePath)
        .then(result => {
            if (result.status === 'success') {
                const parser = new DOMParser();
                const sessionXML = parser.parseFromString(result.data, 'application/xml');
                window.AICAData.sessionDataXML = sessionXML; // グローバル変数に保存
                if (window.currentHtml == "finish") {
                    document.getElementById("conversationData").value = sessionXML.getElementsByTagName("ConversationData")[0].textContent;
                    document.getElementById("summaryData").value = sessionXML.getElementsByTagName("Summary")[0].textContent;
                    document.getElementById("feedbackData").value = sessionXML.getElementsByTagName("CoachingFeedback")[0].textContent;
                }
            } else {
                alert('セッションデータの読み込み中にエラーが発生しました。');
            }
        })
        .catch(error => {
            console.error('セッションデータの読み込みに失敗しました:', error);
            alert('セッションデータの読み込みに失敗しました。');
        });
}
// クライアントドロップダウンを設定
function populateClientDropdown() {
    if (document.getElementById("clientDropdown")) {
        const clientDropdown = document.getElementById("clientDropdown");
        const clients = AICAData.xmlData.getElementsByTagName("Client");

        // クライアント名をプルダウンに追加
        for (let i = 0; i < clients.length; i++) {
            let option = document.createElement("option");
            option.value = i;
            option.text = clients[i].getElementsByTagName("ClientName")[0].textContent;
            clientDropdown.appendChild(option);
        }
    }
}
// 新しいクライアントを追加
function addNewClient() {
    // ダイアログを表示
    document.getElementById('newClientModal').style.display = 'flex';
}
function saveNewClient() {
    const newClientName = document.getElementById("newClientNameInput").value;
    const newClientEmail = document.getElementById("newClientEmailInput").value;
    const newClientPassword = document.getElementById("newClientPasswordInput").value;
    if (newClientName) {
        const newClient = AICAData.xmlData.createElement("Client");
        const newClientNameElem = AICAData.xmlData.createElement("ClientName");
        const newClientEmailElem = AICAData.xmlData.createElement("ClientEmail");
        const newClientPasswordElem = AICAData.xmlData.createElement("PDF_Password");
        const newClientProfileElem = AICAData.xmlData.createElement("ClientProfile");
        const newSessionsElem = AICAData.xmlData.createElement("Sessions");

        newClientNameElem.textContent = newClientName;
        newClientEmailElem.textContent = newClientEmail;
        newClientPasswordElem.textContent = newClientPassword;
        newClientProfileElem.textContent = "";
        newClient.appendChild(newClientNameElem);
        newClient.appendChild(newClientEmailElem);
        newClient.appendChild(newClientPasswordElem);
        newClient.appendChild(newClientProfileElem);
        newClient.appendChild(newSessionsElem);
        AICAData.xmlData.getElementsByTagName("Clients")[0].appendChild(newClient);

        const clientDropdown = document.getElementById("clientDropdown");

        // 新しいクライアントをドロップダウンに追加
        let option = document.createElement("option");
        const newIndex = AICAData.xmlData.getElementsByTagName("Client").length - 1;
        option.value = newIndex;
        option.text = newClientName;
        clientDropdown.appendChild(option);

        // 新規追加したクライアントを選択状態にする
        clientDropdown.value = newIndex;

        // クライアントプロフィールを表示
        displayClientProfile();

        // ダイアログを閉じる
        closeNewClientDialog();

        // XMLデータを保存
        saveXMLData();
    }
}
function closeNewClientDialog() {
    // ダイアログを非表示にして、入力フィールドをクリア
    document.getElementById('newClientModal').style.display = 'none';
    document.getElementById("newClientNameInput").value = "";
    document.getElementById("newClientEmailInput").value = "";
    document.getElementById("newClientPasswordInput").value = "";
}

// クライアントのプロフィールを表示
function displayClientProfile() {
    setSelectedClient();
    const profileBox = document.getElementById("clientProfile");
    const memoBox = document.getElementById("clientMemo");  // メモ用のテキストエリア
    const emailInput = document.getElementById("clientEmail");
    const passwordInput = document.getElementById("pdfPassword");
    const sessionDropdown = document.getElementById("sessionDropdown");
    const clients = AICAData.xmlData.getElementsByTagName("Client");
    const clientInfoSection = document.getElementById("clientInfoSection");
    const sessionDetails = document.getElementById("sessionDetails");  // タブと内容を非表示にするため

    // 「クライアントを選択して下さい」の場合は情報をクリアして非表示に
    if (AICAData.selectedClient === "") {
        profileBox.value = "";
        memoBox.value = "";
        emailInput.value = "";
        passwordInput.value = "";
        sessionDropdown.innerHTML = '<option value="">セッションを選択してください</option>';
        document.getElementById("conversationData").value = "";
        document.getElementById("summaryData").value = "";
        document.getElementById("feedbackData").value = "";

        // プロフィールとセッション部分を非表示
        clientInfoSection.style.display = "none";
        sessionDetails.style.display = "none";  // タブと内容も非表示
        return;
    }

    // クライアントが選択された場合は情報を表示
    const client = clients[AICAData.selectedClient];
    profileBox.value = client.getElementsByTagName("ClientProfile")[0].textContent;

    // メモの表示
    const memoElem = client.getElementsByTagName("memo")[0];
    memoBox.value = memoElem ? memoElem.textContent : "";  // メモが存在すれば表示、なければ空

    // EmailとPDFパスワードの表示
    const emailElem = client.getElementsByTagName("ClientEmail")[0];
    emailInput.value = emailElem ? emailElem.textContent : "";

    const passwordElem = client.getElementsByTagName("PDF_Password")[0];
    passwordInput.value = passwordElem ? passwordElem.textContent : "";

    populateSessionDropdown();

    // プロフィールとセッション部分を表示
    clientInfoSection.style.display = "block";

    // セッション日時をリセットし、タブと内容を非表示に
    sessionDetails.style.display = "none";  // タブと内容を非表示
}

// クライアントEmailとPDFパスワードを保存
function saveClientEmailAndPassword() {
    if (AICAData.selectedClient !== "") {
        const emailInput = document.getElementById("clientEmail");
        const passwordInput = document.getElementById("pdfPassword");
        const clients = AICAData.xmlData.getElementsByTagName("Client");
        const client = clients[AICAData.selectedClient];

        let emailElem = client.getElementsByTagName("ClientEmail")[0];
        if (!emailElem) {
            emailElem = AICAData.xmlData.createElement("ClientEmail");
            client.appendChild(emailElem);
        }
        emailElem.textContent = emailInput.value;

        let passwordElem = client.getElementsByTagName("PDF_Password")[0];
        if (!passwordElem) {
            passwordElem = AICAData.xmlData.createElement("PDF_Password");
            client.appendChild(passwordElem);
        }
        passwordElem.textContent = passwordInput.value;

        saveXMLData();
    }
}

// クライアントプロフィールを保存
function saveClientProfile() {
    if (AICAData.selectedClient !== "") {
        const profileBox = document.getElementById("clientProfile");
        const clients = AICAData.xmlData.getElementsByTagName("Client");
        clients[AICAData.selectedClient].getElementsByTagName("ClientProfile")[0].textContent = profileBox.value;
        window.AICAData.clientProfile = profileBox.value;

        saveXMLData();
    }
}

// メモを保存
function saveClientMemo() {
    if (AICAData.selectedClient !== "") {
        const memoBox = document.getElementById("clientMemo");
        const clients = AICAData.xmlData.getElementsByTagName("Client");

        let memoElem = clients[AICAData.selectedClient].getElementsByTagName("memo")[0];
        if (!memoElem) {
            // メモが存在しない場合は新たに作成
            memoElem = AICAData.xmlData.createElement("memo");
            clients[AICAData.selectedClient].appendChild(memoElem);
        }
        memoElem.textContent = memoBox.value;  // メモの内容を更新
        saveXMLData();  // 保存
    }
}

function addNewSession() {
    // Access the selected client
    const clientElem = AICAData.xmlData.getElementsByTagName("Client")[AICAData.selectedClient];
    const sessionsElem = clientElem.getElementsByTagName("Sessions")[0];

    // Create a new Session element
    const newSessionElem = AICAData.xmlData.createElement("Session");

    // Create DateTime element
    const dateTimeElem = AICAData.xmlData.createElement("DateTime");
    const now = new Date();
    const dateTimeStr = now.toISOString().slice(0, 16); // Format: YYYY-MM-DDTHH:MM
    dateTimeElem.textContent = dateTimeStr;

    // Create FilePath element
    const filePathElem = AICAData.xmlData.createElement("FilePath");

    // Get client email and convert it to a directory name
    const clientEmailElem = clientElem.getElementsByTagName("ClientEmail")[0];
    const clientEmail = clientEmailElem ? clientEmailElem.textContent : "unknown_email";

    const dirName = encodeFileName(clientEmail);

    // Create file path
    const fileNameDateTimeStr = dateTimeStr.replace(/:/g, "-");
    const filePath = `${dirName}/${fileNameDateTimeStr}.xml`;

    filePathElem.textContent = filePath;

    // Append DateTime and FilePath to the new Session element
    newSessionElem.appendChild(dateTimeElem);
    newSessionElem.appendChild(filePathElem);

    // Append the new Session to the Sessions element
    sessionsElem.appendChild(newSessionElem);

    // Update AICAData.selectedSession to the new session index
    const sessions = sessionsElem.getElementsByTagName("Session");
    AICAData.selectedSession = sessions.length - 1;

    // Initialize AICAData.sessionDataXML for the new session
    AICAData.sessionDataXML = document.implementation.createDocument(null, "Session");

    // DateTime element in the session XML
    const sessionDateTimeElem = AICAData.sessionDataXML.createElement("DateTime");
    sessionDateTimeElem.textContent = dateTimeStr;
    AICAData.sessionDataXML.documentElement.appendChild(sessionDateTimeElem);

    // Empty ConversationData
    const conversationDataElem = AICAData.sessionDataXML.createElement("ConversationData");
    conversationDataElem.textContent = "";
    AICAData.sessionDataXML.documentElement.appendChild(conversationDataElem);

    // Empty Summary
    const summaryElem = AICAData.sessionDataXML.createElement("Summary");
    summaryElem.textContent = "";
    AICAData.sessionDataXML.documentElement.appendChild(summaryElem);

    // Empty CoachingFeedback
    const coachingFeedbackElem = AICAData.sessionDataXML.createElement("CoachingFeedback");
    coachingFeedbackElem.textContent = "";
    AICAData.sessionDataXML.documentElement.appendChild(coachingFeedbackElem);

    // Now use the provided save functions
    saveXMLData();      // Save the main XML data
    saveSessionDataXML();  // Save the session data
    console.log("new session added");
}

// セッションの振り返り情報を保存する。
function saveSessionRevision(generatedRevision) {
    // Update the <Summary> element in AICAData.sessionDataXML
    AICAData.sessionDataXML.getElementsByTagName("Summary")[0].textContent = generatedRevision;

    // Save the session data using the existing function
    saveSessionDataXML();
}

// コーチに対するフィードバックを保存する。
function saveCoachingFeedback(generatedFeedback) {
    // Update the <Summary> element in AICAData.sessionDataXML
    AICAData.sessionDataXML.getElementsByTagName("CoachingFeedback")[0].textContent = generatedFeedback;

    // Save the session data using the existing function
    saveSessionDataXML();
}

// クライアントの選択
function setSelectedClient() {
    const clientDropdown = document.getElementById("clientDropdown");
    AICAData.selectedClient = clientDropdown.value;  // グローバル変数に設定

    // 新しいメールアドレスに更新
    console.log(AICAData.selectedClient + "を選択");
    updateSelectedClientEmail();
}

// 選択されたクライアントの識別のためのEmail記録欄を後進
function updateSelectedClientEmail() {
    // 全てのClientタグを取得
    if (AICAData.xmlData) {
        console.log(AICAData.xmlData);
        console.log(new XMLSerializer().serializeToString(AICAData.xmlData));
    } else {
        loadXMLData(() => {
            console.log("loadXMLData executed!");
        });
    }

    const clients = AICAData.xmlData.getElementsByTagName("Client");
    console.log(clients);
    for (let i = 0; i < clients.length; i++) {
        const client = clients[i];
        console.log("Client:", client);

        const clientName = client.getElementsByTagName("ClientName")[0];
        console.log("ClientName:", clientName ? clientName.textContent : "null");

        const clientProfile = client.getElementsByTagName("ClientProfile")[0];
        console.log("ClientProfile:", clientProfile ? clientProfile.textContent : "null");

        const clientEmail = client.getElementsByTagName("ClientEmail")[0];
        console.log("ClientEmail:", clientEmail ? clientEmail.textContent : "null");
    }
    const client = clients[AICAData.selectedClient];
    let newEmail = null;

    const clientName = client.getElementsByTagName("ClientName")[0].textContent;

    newEmail = client.getElementsByTagName("ClientEmail")[0].textContent;

    // もし該当するClientが見つかり、Emailが設定されている場合のみ更新
    if (newEmail) {
        const selectedClientEmailElement = AICAData.xmlData.getElementsByTagName("SelectedClientEmail")[0];
        selectedClientEmailElement.textContent = newEmail;

        // 更新後のXMLデータを保存（必要に応じて）
        saveXMLData();
    } else {
        console.log("該当するクライアントが見つからないか、Emailが設定されていません。");
    }
}

// セッション日付情報を一覧表示
function populateSessionDropdown() {
    const sessionDropdown = document.getElementById("sessionDropdown");
    sessionDropdown.innerHTML = '<option value="">セッションを選択してください</option>'; // 既存のセッションをクリア
    const clients = AICAData.xmlData.getElementsByTagName("Client");

    // クライアントが選択されているか確認
    if (AICAData.selectedClient === "" || !clients[AICAData.selectedClient]) {
        console.error("選択されたクライアントが存在しません");
        return;
    }

    const sessions = clients[AICAData.selectedClient].getElementsByTagName("Session");

    // セッションをドロップダウンに追加
    for (let i = 0; i < sessions.length; i++) {
        let option = document.createElement("option");
        option.value = i;
        option.text = sessions[i].getElementsByTagName("DateTime")[0].textContent;
        sessionDropdown.appendChild(option);
    }
}

// セッションデータを表示
function displaySessionData() {
    AICAData.selectedSession = document.getElementById("sessionDropdown").value;
    const sessions = AICAData.xmlData.getElementsByTagName("Client")[AICAData.selectedClient].getElementsByTagName("Session");
    const sessionDetails = document.getElementById("sessionDetails");

    // セッションが選択されていない場合はタブと内容を非表示に
    if (AICAData.selectedSession === "") {
        sessionDetails.style.display = "none";
        document.getElementById("conversationData").value = "";
        document.getElementById("summaryData").value = "";
        document.getElementById("feedbackData").value = "";
        updateMarkdownPreview('summaryData','summaryDataPreview');
        updateMarkdownPreview('feedbackData','feedbackDataPreview');
        return;
    }

    // セッションが選択された場合はタブと内容を表示
    sessionDetails.style.display = "block";

    const filePathElem = sessions[AICAData.selectedSession].getElementsByTagName("FilePath")[0];
    if (filePathElem) {
        const filePath = filePathElem.textContent;

        // セッションデータを読み込む
        window.electronAPI.loadSession(filePath)
        .then(result => {
            if(result.status === 'success') {
                const parser = new DOMParser();
                // result.data に実際のXML文字列が格納されているので、これを渡す
                AICAData.sessionDataXML = parser.parseFromString(result.data, 'application/xml');
                let tmpConversationData = AICAData.sessionDataXML.getElementsByTagName("ConversationData")[0];
                console.log(tmpConversationData);
                document.getElementById("conversationData").value = tmpConversationData ? tmpConversationData.textContent : "";
                let tmpSummaryData = AICAData.sessionDataXML.getElementsByTagName("Summary")[0];
                document.getElementById("summaryData").value = tmpSummaryData ? tmpSummaryData.textContent : "";
                updateMarkdownPreview('summaryData','summaryDataPreview');
                let tmpFeedbackData = AICAData.sessionDataXML.getElementsByTagName("CoachingFeedback")[0];
                document.getElementById("feedbackData").value = tmpFeedbackData ? tmpFeedbackData.textContent : "";
                updateMarkdownPreview('feedbackData','feedbackDataPreview');
            } else {
                console.error('セッションデータの読み込みに失敗しました:', result.message);
                alert('セッションデータの読み込みに失敗しました。');
            }});
    } else {
        console.error('FilePathが見つかりません。');
    }
}

// セッションデータを保存 renew_clientData.html
function saveSessionData() {

    if (window.currentHtml == "finish") {
        // セッションデータを更新
        AICAData.sessionDataXML.getElementsByTagName("ConversationData")[0].textContent = document.getElementById("conversationData").value;
        AICAData.sessionDataXML.getElementsByTagName("Summary")[0].textContent = document.getElementById("summaryData").value;
        AICAData.sessionDataXML.getElementsByTagName("CoachingFeedback")[0].textContent = document.getElementById("feedbackData").value;
    }
    saveSessionDataXML();



}
// ユーザーの情報を表示
function displayUserData() {
    console.log("displayUserData");
    console.log("ユーザー名：" + AICAData.userName);
    console.log("ユーザーEmail：" + AICAData.userEmail);
    console.log("ユーザープロフィール：" + AICAData.userProfile);
    document.getElementById('userName').value = AICAData.userName;
    document.getElementById('userEmail').value = AICAData.userEmail;
    document.getElementById('userProfile').value = AICAData.userProfile;
}

function saveSessionDataXML() {
    if (AICAData.selectedSession !== "") {
        const sessions = AICAData.xmlData.getElementsByTagName("Client")[AICAData.selectedClient].getElementsByTagName("Session");

        const filePathElem = sessions[AICAData.selectedSession].getElementsByTagName("FilePath")[0];
        if (filePathElem) {
            const filePath = filePathElem.textContent;
            // セッションデータを保存
            const serializer = new XMLSerializer();
            const sessionXMLString = serializer.serializeToString(AICAData.sessionDataXML);

            if (window.electronAPI && typeof window.electronAPI.saveSession === 'function') {
                console.log("saving sessionXMLString: " + sessionXMLString);
                window.electronAPI.saveSession(filePath, sessionXMLString)
                    .then(result => {
                        if (result.status === 'success') {
                            console.log('セッションデータが正常に保存されました。');
                        } else {
                            alert('セッションデータの保存中にエラーが発生しました。');
                        }
                    })
                    .catch(err => {
                        console.error('セッションデータの保存に失敗しました:', err);
                        alert('セッションデータの保存中にエラーが発生しました。');
                    });
            } else {
                console.error('electronAPI.saveSession が定義されていません。');
            }
        } else {
            console.error('FilePathが見つかりません。');
        }
    }
}


//#endregion クライアントのデータ

//////////////////////////////////////////////////////////////
//#region 最新クライアントについてのデータ
async function findLatestSessionClientData(callback = () => { }) {

    // メモ　データの取り出し方
    // findLatestSessionClientData(() => {
    //     console.log(clientInfo.profile); // `clientInfo.profile` を直接利用
    // });
    if (AICAData.xmlData) {
    } else {
        loadXMLData();
    }
    // xmlDataから <SelectedClientEmail> タグを取得
    const selectedClientEmailElement = window.AICAData.xmlData.getElementsByTagName('SelectedClientEmail')[0];

    // タグが存在し、かつテキストがある場合はその値を使い、
    // それ以外の場合は空文字列を代入する
    AICAData.selectedClientEmail = selectedClientEmailElement
        ? (selectedClientEmailElement.textContent || '').trim()
        : '';    // クライアントを特定

    const clients = window.AICAData.xmlData.getElementsByTagName('Client');
    let client = null;
    for (let i = 0; i < clients.length; i++) {
        const emailElem = clients[i].getElementsByTagName('ClientEmail')[0];
        if (emailElem && emailElem.textContent === window.AICAData.selectedClientEmail) {
            client = clients[i];
            break;
        }
    }

    if (client) {
        // クライアント名を表示
        const clientName = client.getElementsByTagName('ClientName')[0].textContent;
        const clientProfile = client.getElementsByTagName('ClientProfile')[0].textContent;

        console.log(clientName);
        // 最新のセッションを取得
        const sessions = client.getElementsByTagName('Session');
        if (sessions.length > 0) {
            const lastSession = sessions[sessions.length - 1];
            const filePath = lastSession.getElementsByTagName('FilePath')[0].textContent;

            const dateTime = lastSession.getElementsByTagName('DateTime')[0].textContent;
            const parser = new DOMParser();
            // セッションデータをロード
            const sessionResult = await window.electronAPI.loadSession(filePath);
            if (sessionResult.status === 'success') {
                console.log("セッションデータ読み込み成功");
                const sessionXML = parser.parseFromString(sessionResult.data, 'application/xml');
                window.AICAData.sessionDataXML = sessionXML;
                const summary = sessionXML.getElementsByTagName('Summary')[0].textContent;

                // クライアント情報を保持
                window.AICAData.clientInfo = {
                    email: AICAData.selectedClientEmail,
                    name: clientName,
                    profile: clientProfile,
                    password: client.getElementsByTagName('PDF_Password')[0].textContent,
                    sessionFilePath: filePath,
                    sessionDateTime: dateTime,
                    sessionSummary: summary,
                };

                console.log("clientInfo: " + window.AICAData.clientInfo);

                callback();
            } else {
                console.log('セッションデータの読み込みに失敗しました。');
            }
        } else {
            console.log('セッションが存在しません。');
        }
    } else {
        console.log('クライアントが見つかりませんでした。');
    }
}

// 最新クライアントの情報を表示 id="clientName", id="summaryTextArea"
function displayLastSelectedUserData() {
    console.log(window.AICAData.clientInfo);
    document.getElementById("clientName").textContent = window.AICAData.clientInfo.name;
    if (document.getElementById("summaryTextArea") && window.AICAData.clientInfo.sessionSummary) {
        document.getElementById("summaryTextArea").value = window.AICAData.clientInfo.sessionSummary;
    }
}

// 文字起こしを定期的に保存する
function constantSaveTranscription() {
    // Check if isRunning is true
    if (!isRunning) return;

    // Function to save transcription every 5 seconds
    function saveLoop() {
        if (!isRunning) return;

        // Get the latest transcription
        const latestTranscription = getTranscription("all");

        // Update the <ConversationData> element
        AICAData.sessionDataXML.getElementsByTagName("ConversationData")[0].textContent = latestTranscription;

        // Save the session data
        saveSessionDataXML();

        // Call saveLoop again after 5 seconds
        setTimeout(saveLoop, 5000);
    }

    // Start the loop
    saveLoop();
}

// 空のセッションデータ（文字起こし10文字以下）を消す
async function deleteEmptySession() {
    const clients = AICAData.xmlData.getElementsByTagName("Client");
    if (AICAData.selectedClient === "" || !clients[AICAData.selectedClient]) {
        console.error("No selected client");
        return;
    }

    const sessions = clients[AICAData.selectedClient].getElementsByTagName("Session");
    if (sessions.length === 0) {
        console.log("No sessions to delete");
        return;
    }

    const lastSessionIndex = sessions.length - 1;
    const lastSession = sessions[lastSessionIndex];

    const filePathElem = lastSession.getElementsByTagName("FilePath")[0];
    if (!filePathElem) {
        console.error("No file path in last session");
        return;
    }

    const filePath = filePathElem.textContent;

    // Load the session data
    const result = await window.electronAPI.loadSession(filePath);
    if (result.status !== 'success') {
        console.error('Failed to load session data:', result.message);
        return;
    }

    const parser = new DOMParser();
    const sessionXML = parser.parseFromString(result.data, 'application/xml');

    const conversationData = sessionXML.getElementsByTagName("ConversationData")[0];
    const transcription = conversationData ? conversationData.textContent : '';

    if (transcription.length < 10) {
        // Delete the session from AICAData.xmlData
        sessions[lastSessionIndex].parentNode.removeChild(sessions[lastSessionIndex]);

        // Save the updated xmlData
        saveXMLData();

        // Delete the session file
        const deleteResult = await window.electronAPI.deleteSessionFile(filePath);
        if (deleteResult.status === 'success') {
            console.log('Deleted empty session file:', filePath);
        } else {
            console.error('Failed to delete session file:', deleteResult.message);
        }
    } else {
        console.log('Session is not empty, not deleting');
    }
}

//#endregion 最新クライアントについてのデータ


