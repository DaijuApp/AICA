let prompt0Array;
let promptHeadArray = [];
let dummyConversation;
let promptHead;
let promptFootArray = [];
let promptHead6CL = [];
let promptOutputFormat;
let promptFootFree = [];
let dropdown_CL = document.getElementById('dropdownMenuCL');
let dropdown_UserRole = document.getElementById('dropdownMenuUserRole');
let clients = [];
let userRoles = [];
let userRoleNames = [];


document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('https://rankinglist.sakura.ne.jp/project/aic1/ServerSide/prompt0_reader.php');
        const allSheets = await response.json();
        prompt0Array = allSheets[0];
        //console.log(prompt0Array);
        for (let i = 0; i < prompt0Array.length; i++) {
            //console.log(prompt0Array[i]);

            if (prompt0Array[i][0] == "forDebug") {
                dummyConversation = prompt0Array[i][2];
            } else if (prompt0Array[i][0] == "promptHead6CL") {
                //console.log(prompt0Array[i][0]);
                promptHead6CL[promptHead6CL.length] = prompt0Array[i];
            } else if (prompt0Array[i][0] == "promptFootFree") {
                //console.log(prompt0Array[i][0]);
                promptFootFree = prompt0Array[i];
            } else if(prompt0Array[i][0] == "userRole"){
                userRoles[userRoles.length] = prompt0Array[i];
            }else {
                for (let j = 0; j <= 20; j++) {

                    if (prompt0Array[i][0] == "promptHead" + j) {
                        promptHeadArray[j] = prompt0Array[i];
                    } else if (prompt0Array[i][0] == "promptFoot" + j) {
                        promptFootArray[j] = prompt0Array[i];
                    }


                }
            }
        }
        // -------------
        // clientsのドロップダウンメニュー
        // -------------
        clients = promptHead6CL.map(function (element) {
            return element[1];  // 2番目の要素（インデックスは1）を取得
        });

        clients.forEach(function (option) {
            let newOption = document.createElement('option');  // 新しいoption要素を作成
            newOption.text = option;  // optionのテキストを設定
            newOption.value = option;  // optionの値を設定
            dropdown_CL.add(newOption);  // optionをプルダウンメニューに追加
        });

        // -------------
        // userRoleのドロップダウンメニュー
        // -------------
        userRoleNames = userRoles.map(function (element) {
            return element[1];  // 2番目の要素（インデックスは1）を取得
        });

        userRoleNames.forEach(function (option) {
            let newOption = document.createElement('option');  // 新しいoption要素を作成
            newOption.text = option;  // optionのテキストを設定
            newOption.value = option;  // optionの値を設定
            dropdown_UserRole.add(newOption);  // optionをプルダウンメニューに追加
        });
        
        confirmCL_Role();

    } catch (error) {
        console.error(error);
    }
});

var clientButton = document.getElementById('confirmCL_Role');
clientButton.onclick = function () {
    confirmCL_Role();
}


function confirmCL_Role(){

    // promptHead6(クライアント情報)を選択
    var currentClient = dropdown_CL.value;
    filteredArrays = promptHead6CL.filter(function (element) {
        return element[1] == currentClient;
    });
    promptHeadArray[6] = filteredArrays[0];

    // promptHeadを結合
    promptHead = promptHeadArray.map(function (element) {
        return element[2];  // 2番目の要素（インデックスは1）を取得
    }).join('');
    //console.log(promptHead);

    // userRoleの説明部分を選択
    var currentUserRole = dropdown_UserRole.value;
    filteredArrays = userRoles.filter(function (element) {
        return element[1] == currentUserRole;
    });
    var currentUserRoleDescription = filteredArrays[0][2];

    // ボタンを押したときの命令文を設定
    for (var i = 0; i < numButtonRow; i++) {    // numButtonRowはui.html ui-smpl.htmlで定義されている
        for (var j = 0; j < 2; j++) {
            var index = i * 2 + j;
            // 各ボタン上の入力欄設定
            var inputField0Id = "input" + index + "-" + 0;
            var inputField1Id = "input" + index + "-" + 1;
            var inputField2Id = "input" + index + "-" + 2;
            promptSet(promptHead, inputField0Id, currentUserRoleDescription);
            promptSet(promptFootArray[index][2], inputField1Id, currentUserRoleDescription);
            promptSet(promptFootArray[index][3], inputField2Id, currentUserRoleDescription);

            // ボタン表示設定
            var sendButtonId = "button" + index;
            var sendButton = document.getElementById(sendButtonId);
            sendButton.textContent = promptFootArray[index][1];
        }
    }
    
    // 要約設定

    promptFootSummaryArray = prompt0Array.filter(function (element) {
        return element[0] == "promptFootSummary";
    })[0];

    promptSet(promptHead, "summaryPromptHead", currentUserRoleDescription);
    promptSet(promptFootSummaryArray[2], "summaryPromptFoot", currentUserRoleDescription);
    promptSet(promptFootSummaryArray[3], "summaryPromptFormat", currentUserRoleDescription);

    // 自由入力欄設定
    promptSet(promptHead, "inputFI-0", currentUserRoleDescription);
    promptSet(promptFootFree[2], "inputFI-1", currentUserRoleDescription);
    promptSet(promptFootFree[3], "inputFI-2", currentUserRoleDescription);

    //デバッグ用ダミー会話文字列
    promptSet(dummyConversation, "dummyConversation", "");

};

function findElement(arrays, target) {
    for (let i = 0; i < arrays.length; i++) {
        if (arrays[i][0] === target) {
            return arrays[i];  // 配列を返す
        }
    }
    return null;  // 該当する要素が見つからなかった場合はnullを返す
}

function promptSet(textData, targetElementID, userRoleDescription) {
    // targetElementID（文字列で指定）のvalueをtextArraysにする。
    // その際、userRoleを置き換える
    targetElement = document.getElementById(targetElementID);
    targetElement.value = textData.replace(/\[#userRole\]/g, userRoleDescription) ; 
    return null;  
}

    // メモ 以前のアウトプットフォーマットの設定
    // promptOutputFormat = prompt0Array.filter(function (element) {
    //     return element[0] == promptFootFree[3];
    // });