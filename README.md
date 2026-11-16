# 帝皇禁軍軍表

雲端軍表目前未開放註冊。在「軍表 → 雲端軍表」使用已授權的 Google 帳號登入，選取本機軍表後按「儲存到雲端」。在另一台裝置登入同一帳號，按「載入到本機」即可繼續編輯。每份軍表有一個雲端存檔，重新儲存會更新該存檔。遊玩進度、分數覆寫和偏好設定保存在各裝置上。

也可在軍表編輯頁按「立即上傳」。「自動備份這份軍表」會記住這台裝置和登入帳號的選擇。加入第一個單位後，每次停止編輯約一秒就會備份；離線期間的變更會在重新連線後補傳。若雲端已被另一台裝置修改，畫面會提示你選擇要保留的版本。

## 本機測試

從專案根目錄執行下列指令啟動網站。

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

在另一個終端機啟動 Firebase Authentication 和 Firestore 模擬器（需要 Firebase CLI 和 Java 21 以上）。

```sh
firebase emulators:start --only auth,firestore --project demo-wh-ac
```

開啟 [本機雲端軍表](http://127.0.0.1:8000/?emulators#/cloud)。模擬器使用獨立的測試帳號。要驗證跨裝置載入，兩個瀏覽器須登入同一個已驗證的 Google 測試帳號，並由模擬器管理端授予該帳號 `rosterOwner: true` 自訂宣告。

## 正式環境

網站由 GitHub Pages 提供。Firebase 專案為 `wh-ac-rosters-1121`，網頁應用程式設定位於 `js/firebase-config.js`。軍表存放在 Firestore 的 `users/{uid}/rosters/{listId}`。Firebase Authentication 已關閉使用者自行註冊（`client.permissions.disabledUserSignup`）。Firestore 會檢查 Google 登入、已驗證的電子郵件、由後端授予的 `rosterOwner: true` 自訂宣告，以及軍表路徑的 UID。更新 `firestore.rules` 後，在專案根目錄部署規則。

```sh
firebase deploy --only firestore:rules --project wh-ac-rosters-1121
```

若更換網站網域，請將新網域加入 Firebase Authentication 的「設定 → 授權網域」。
